import type { MentorProposalDiagnostic, MentorProposalHistoryProjection, MentorProposalResponse } from "./mentor-proposal.contracts";
import type { StoredMentorProposal } from "./mentor-proposal-store";

export const STALE_PROPOSAL_DIAGNOSTIC: MentorProposalDiagnostic = {
  code: "STALE_PROPOSAL",
  severity: "error",
  message: "El modelo cambió desde que se generó la propuesta; ya no puede aplicarse.",
};

// Builds the public DTO only from persisted snapshots (operation, summary, diagnostics): nothing is recomputed from
// the current UML. Fields are copied explicitly, so command, author, instruction, project and resolver never leak.
//
// Preview semantics: every persisted proposal had a valid preview when it was created. A PENDING proposal whose
// baseRevision differs from the current project revision is stale: valid = false plus STALE_PROPOSAL. Terminal
// proposals (APPLIED, REJECTED) keep their stored preview as created; later project revisions do not make them stale.
// currentRevision is only consulted for PENDING proposals.
export function toMentorProposalResponse(proposal: StoredMentorProposal, currentRevision?: number): MentorProposalResponse {
  const stale = proposal.status === "PENDING" && currentRevision !== undefined && currentRevision !== proposal.baseRevision;
  return {
    id: proposal.id,
    status: proposal.status,
    baseRevision: proposal.baseRevision,
    operation: proposal.operation,
    preview: {
      valid: !stale,
      diff: proposal.summary,
      diagnostics: stale ? [...proposal.diagnostics, STALE_PROPOSAL_DIAGNOSTIC] : proposal.diagnostics,
    },
    createdAt: proposal.createdAt.toISOString(),
    ...(proposal.status !== "PENDING" ? { resolvedAt: proposal.resolvedAt.toISOString() } : {}),
    ...(proposal.status === "APPLIED" ? { resultingRevision: proposal.resultingRevision } : {}),
  };
}

// CU-2P-07 read projection, built field by field from the persisted public snapshots (operation, summary): command,
// author, resolver, instruction and diagnostics never leak. resultingRevision only exists for APPLIED.
export function toMentorProposalHistoryProjection(proposal: StoredMentorProposal): MentorProposalHistoryProjection {
  return {
    proposalId: proposal.id,
    status: proposal.status,
    operation: proposal.operation,
    summary: proposal.summary,
    baseRevision: proposal.baseRevision,
    createdAt: proposal.createdAt.toISOString(),
    ...(proposal.status !== "PENDING" ? { resolvedAt: proposal.resolvedAt.toISOString() } : {}),
    ...(proposal.status === "APPLIED" ? { resultingRevision: proposal.resultingRevision } : {}),
  };
}
