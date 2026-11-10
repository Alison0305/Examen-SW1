import { createUuid } from "@examen-sw1/uml-core";
import {
  MENTOR_PROPOSAL_INSTRUCTION_MAX_LENGTH,
  type MentorProposalCommand,
  type MentorProposalDiffLine,
  type MentorProposalError,
} from "./mentor-proposal.contracts";
import type { MentorProposalPreviewResult } from "./mentor-proposal-preview";

export const MENTOR_PROPOSAL_STORE = Symbol("MENTOR_PROPOSAL_STORE");

// Internal domain record (not the HTTP DTO). The status union carries the resolution invariant in the type:
// PENDING has no resolution, REJECTED has who/when, APPLIED also has the resulting project revision.
type StoredMentorProposalBase = Readonly<{
  id: string;
  projectId: string;
  authorUserId: string;
  authorEmail: string;
  instruction: string;
  baseRevision: number;
  command: MentorProposalCommand;
  summary: readonly MentorProposalDiffLine[];
  createdAt: Date;
}>;

export type StoredMentorProposal = StoredMentorProposalBase & (
  | Readonly<{ status: "PENDING" }>
  | Readonly<{ status: "REJECTED"; resolvedAt: Date; resolvedByUserId: string }>
  | Readonly<{ status: "APPLIED"; resolvedAt: Date; resolvedByUserId: string; resultingRevision: number }>
);

// Creation input: no status and no resolution fields; the store always creates PENDING.
export type NewMentorProposal = StoredMentorProposalBase;

export type RejectMentorProposalInput = Readonly<{ projectId: string; proposalId: string; resolvedByUserId: string; resolvedAt: Date }>;
export type MarkMentorProposalAppliedInput = RejectMentorProposalInput & Readonly<{ resultingRevision: number }>;

// Typed outcome of a conditional PENDING transition. Terminal states are never re-entered or swapped.
export type MentorProposalTransitionResult =
  | Readonly<{ ok: true; proposal: StoredMentorProposal }>
  | Readonly<{ ok: false; reason: "NOT_FOUND" | "PROPOSAL_ALREADY_APPLIED" | "PROPOSAL_REJECTED" }>;

export interface MentorProposalStore {
  create(proposal: NewMentorProposal): Promise<StoredMentorProposal>;
  // Always filtered by project and id together; a proposal of another project is simply not found.
  findByProjectAndId(projectId: string, proposalId: string): Promise<StoredMentorProposal | undefined>;
  reject(input: RejectMentorProposalInput): Promise<MentorProposalTransitionResult>;
  // Persists only the result of a real application performed elsewhere (ProjectOperationService, phase 5).
  markApplied(input: MarkMentorProposalAppliedInput): Promise<MentorProposalTransitionResult>;
}

export type BuildNewMentorProposalInput = Readonly<{
  projectId: string;
  author: Readonly<{ userId: string; email: string }>;
  instruction: string;
  command: MentorProposalCommand;
  preview: MentorProposalPreviewResult;
}>;

export type BuildNewMentorProposalOptions = Readonly<{ uuidFactory?: () => string; nowFactory?: () => Date }>;

export type BuildNewMentorProposalResult =
  | Readonly<{ ok: true; proposal: NewMentorProposal }>
  | Readonly<{ ok: false; error: MentorProposalError }>;

// Turns a resolved command and its valid preview into the persistible record. An invalid preview never becomes a
// proposal. baseRevision is the authoritative revision (never the candidate's) and summary is the diff exactly as
// computed by the preview. The author comes from the already authorized identity, never from the client.
export function buildNewMentorProposal(input: BuildNewMentorProposalInput, options: BuildNewMentorProposalOptions = {}): BuildNewMentorProposalResult {
  const { preview } = input;
  if (!preview.ok) return { ok: false, error: preview.error };
  if (preview.diff.length === 0) return { ok: false, error: { code: "INVALID_PROPOSAL", message: "La propuesta no produce ningún cambio en el modelo UML.", diagnostics: [] } };

  const instruction = input.instruction.trim();
  if (!instruction || instruction.length > MENTOR_PROPOSAL_INSTRUCTION_MAX_LENGTH) {
    return { ok: false, error: { code: "INVALID_PROPOSAL", message: "La instrucción debe contener entre 1 y 500 caracteres.", diagnostics: [] } };
  }

  return {
    ok: true,
    proposal: {
      id: (options.uuidFactory ?? createUuid)(),
      projectId: input.projectId,
      authorUserId: input.author.userId,
      authorEmail: input.author.email,
      instruction,
      baseRevision: preview.baseRevision,
      command: input.command,
      summary: preview.diff,
      createdAt: (options.nowFactory ?? (() => new Date()))(),
    },
  };
}
