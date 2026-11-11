import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { ProjectDocument } from "@examen-sw1/uml-core";
import type { AuthenticatedUser } from "../auth/auth.types";
import { ProjectAccessService } from "../projects/project-access.service";
import { ProjectsPersistenceService } from "../projects/projects-persistence.service";
import { MENTOR_PROPOSAL_INSTRUCTION_MAX_LENGTH, type MentorProposalError } from "./mentor-proposal.contracts";
import { MENTOR_PROPOSAL_INTENT_GENERATOR, type MentorProposalIntentGenerator } from "./local-qwen-mentor-proposal-intent.provider";
import { previewMentorProposal } from "./mentor-proposal-preview";
import { resolveMentorProposal } from "./mentor-proposal-resolver";
import { buildNewMentorProposal, MENTOR_PROPOSAL_STORE, type MentorProposalStore, type StoredMentorProposal } from "./mentor-proposal-store";

export type CreateMentorProposalResult =
  | Readonly<{ ok: true; proposal: Extract<StoredMentorProposal, { status: "PENDING" }>; currentRevision: number }>
  | Readonly<{ ok: false; error: MentorProposalError }>;

type ProjectReader = Readonly<{ findProject(id: string): Promise<Readonly<{ revision: number; document: ProjectDocument }> | null> }>;

const failure = (error: MentorProposalError): CreateMentorProposalResult => ({ ok: false, error });

// CU-2P-06, phase 7: creates a PENDING proposal from a natural-language instruction. It only orchestrates the
// existing pieces and never writes the project: no ProjectOperationService, no receipt, no revision change.
//
// Order: requireEdit → instruction check → authoritative project → local model (intent) → strict validation (inside
// the generator) → resolveMentorProposal (classId from the document, attributeId from the server) → preview with the
// real executor → buildNewMentorProposal → store.create (the only write, always PENDING). Authorization happens before
// the model, so a VIEWER or a user without access never costs an inference. Any failure before store.create persists
// nothing.
@Injectable()
export class MentorProposalCreationService {
  constructor(
    @Inject(ProjectAccessService) private readonly access: Pick<ProjectAccessService, "requireEdit">,
    @Inject(ProjectsPersistenceService) private readonly projects: ProjectReader,
    @Inject(MENTOR_PROPOSAL_INTENT_GENERATOR) private readonly generator: MentorProposalIntentGenerator,
    @Inject(MENTOR_PROPOSAL_STORE) private readonly store: MentorProposalStore,
  ) {}

  async create(projectId: string, user: AuthenticatedUser, rawInstruction: string): Promise<CreateMentorProposalResult> {
    await this.access.requireEdit(projectId, user.id);
    // The DTO already enforces this; repeated so the service never sends an invalid instruction to the model.
    const instruction = rawInstruction.trim();
    if (!instruction || instruction.length > MENTOR_PROPOSAL_INSTRUCTION_MAX_LENGTH) {
      return failure({ code: "INVALID_PROPOSAL", message: "La instrucción debe contener entre 1 y 500 caracteres.", diagnostics: [] });
    }
    const project = await this.projects.findProject(projectId);
    if (!project) throw new NotFoundException();
    // The project row's revision is the one ProjectOperationService checks on apply, so it is the base revision.
    const document: ProjectDocument = { ...project.document, revision: project.revision };

    const generated = await this.generator.generate({ instruction, classNames: document.uml.classes.map((umlClass) => umlClass.name) });
    if (!generated.ok) return failure(generated.error);

    const resolved = resolveMentorProposal(document, generated.intent);
    if (!resolved.ok) return failure(resolved.error);

    const built = buildNewMentorProposal({
      projectId,
      author: { userId: user.id, email: user.email },
      instruction,
      command: resolved.command,
      operation: resolved.operation,
      preview: previewMentorProposal(document, resolved.command),
    });
    if (!built.ok) return failure(built.error);

    const stored = await this.store.create(built.proposal);
    if (stored.status !== "PENDING") throw new Error("A new mentor proposal must be PENDING.");
    return { ok: true, proposal: stored, currentRevision: project.revision };
  }
}
