import { createUuid } from "@examen-sw1/uml-core";
import {
  MENTOR_PROPOSAL_INSTRUCTION_MAX_LENGTH,
  type MentorProposalCommand,
  type MentorProposalDiagnostic,
  type MentorProposalDiffLine,
  type MentorProposalError,
  type MentorProposalOperation,
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
  // Snapshots taken at creation and never recomputed: public operation, preview diff and public diagnostics.
  operation: MentorProposalOperation;
  summary: readonly MentorProposalDiffLine[];
  diagnostics: readonly MentorProposalDiagnostic[];
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

export type ReconcileAcceptedOperationInput = Readonly<{ projectId: string; proposalId: string; acceptedByUserId: string; acceptedAt: Date; resultingRevision: number }>;

// Typed outcome of a conditional PENDING transition. Terminal states are never re-entered or swapped by user actions.
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
  // Exceptional, internal recovery: only when an accepted ProjectOperationReceipt proves the UML change happened.
  // PENDING or REJECTED become APPLIED; an already APPLIED proposal is returned unchanged (idempotent, same revision).
  reconcileAcceptedOperation(input: ReconcileAcceptedOperationInput): Promise<MentorProposalReconciliationResult>;
}

export type MentorProposalReconciliationResult =
  | Readonly<{ ok: true; proposal: Extract<StoredMentorProposal, { status: "APPLIED" }>; changed: boolean }>
  | Readonly<{ ok: false; reason: "NOT_FOUND" }>;

export type BuildNewMentorProposalInput = Readonly<{
  projectId: string;
  author: Readonly<{ userId: string; email: string }>;
  instruction: string;
  command: MentorProposalCommand;
  operation: MentorProposalOperation;
  preview: MentorProposalPreviewResult;
}>;

export type BuildNewMentorProposalOptions = Readonly<{ uuidFactory?: () => string; nowFactory?: () => Date }>;

export type BuildNewMentorProposalResult =
  | Readonly<{ ok: true; proposal: NewMentorProposal }>
  | Readonly<{ ok: false; error: MentorProposalError }>;

// Turns a resolved command and its valid preview into the persistible record. An invalid preview never becomes a
// proposal. baseRevision is the authoritative revision (never the candidate's) and summary is the diff exactly as
// computed by the preview; operation and diagnostics are the public snapshots exactly as resolved and previewed. The author comes from the already authorized identity, never from the client.
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
      operation: input.operation,
      summary: preview.diff,
      diagnostics: preview.diagnostics,
      createdAt: (options.nowFactory ?? (() => new Date()))(),
    },
  };
}
