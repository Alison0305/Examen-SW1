import { ForbiddenException, Inject, Injectable, Logger, Optional } from "@nestjs/common";
import type { AuthenticatedUser } from "../auth/auth.types";
import { ProjectAccessService } from "../projects/project-access.service";
import { PROJECT_OPERATION_BROADCASTER, type ProjectOperationBroadcaster } from "../realtime/project-operation-broadcaster";
import { ProjectOperationService, type AcceptedProjectOperation } from "../realtime/project-operation.service";
import type { ProjectOperationAck } from "../realtime/realtime.contracts";
import type { MentorProposalDiagnostic } from "./mentor-proposal.contracts";
import { toMentorProposalDiagnostic } from "./mentor-proposal-preview";
import { MentorProposalDataError } from "./mentor-proposal-stored-json";
import { MENTOR_PROPOSAL_STORE, type MentorProposalStore, type MentorProposalTransitionResult, type StoredMentorProposal } from "./mentor-proposal-store";

export const MENTOR_PROPOSAL_CLOCK = Symbol("MENTOR_PROPOSAL_CLOCK");

export type AppliedMentorProposal = Extract<StoredMentorProposal, { status: "APPLIED" }>;

export type ApplyMentorProposalFailureCode = "NOT_FOUND" | "PROPOSAL_ALREADY_APPLIED" | "PROPOSAL_REJECTED" | "STALE_PROPOSAL" | "INVALID_PROPOSAL";

// Expected domain outcomes are returned; authorization keeps the repository's HTTP exceptions (404/403).
export type ApplyMentorProposalResult =
  | Readonly<{ ok: true; proposal: AppliedMentorProposal; ack: ProjectOperationAck; reconciled: boolean }>
  | Readonly<{ ok: false; code: ApplyMentorProposalFailureCode; diagnostics: readonly MentorProposalDiagnostic[] }>;

const failure = (code: ApplyMentorProposalFailureCode, diagnostics: readonly MentorProposalDiagnostic[] = []): ApplyMentorProposalResult => ({ ok: false, code, diagnostics });

function applied(result: MentorProposalTransitionResult & { ok: true }): AppliedMentorProposal {
  if (result.proposal.status !== "APPLIED") throw new MentorProposalDataError("status");
  return result.proposal;
}

// Applies a confirmed proposal. The only UML write path is ProjectOperationService.apply with operationId = proposal.id,
// the persisted baseRevision and the persisted command; this service never writes the project document itself.
//
// Order: requireEdit → load (projectId, proposalId) → state check → receipt reconciliation → apply → broadcast →
// persist APPLIED. A proposal is read only after authorization, so its existence never leaks to unauthorized callers.
//
// Broadcast: exactly like the realtime gateway, every ACCEPTED result returned by apply() in this call is emitted once,
// immediately, so the room learns about the mutation even if persisting APPLIED fails afterwards. A replayed ACK (same
// actor, same operationId) is emitted again, as the gateway does for retries; clients deduplicate by operationId.
// Reconciliation never emits: no new mutation happens, and clients set their revision from the ACK, so replaying an
// old one could move a later client backwards. Clients that missed it resynchronize on their next STALE_REVISION.
@Injectable()
export class MentorProposalApplicationService {
  private readonly logger = new Logger(MentorProposalApplicationService.name);
  private readonly now: () => Date;

  constructor(
    @Inject(ProjectAccessService) private readonly access: Pick<ProjectAccessService, "requireEdit">,
    @Inject(MENTOR_PROPOSAL_STORE) private readonly store: MentorProposalStore,
    @Inject(ProjectOperationService) private readonly operations: Pick<ProjectOperationService, "apply" | "findAcceptedOperation">,
    @Inject(PROJECT_OPERATION_BROADCASTER) private readonly broadcaster: ProjectOperationBroadcaster,
    @Optional() @Inject(MENTOR_PROPOSAL_CLOCK) clock?: () => Date,
  ) {
    this.now = clock ?? (() => new Date());
  }

  async apply(projectId: string, proposalId: string, user: AuthenticatedUser): Promise<ApplyMentorProposalResult> {
    await this.access.requireEdit(projectId, user.id);
    const proposal = await this.store.findByProjectAndId(projectId, proposalId);
    if (!proposal) return failure("NOT_FOUND");
    if (proposal.status === "APPLIED") return failure("PROPOSAL_ALREADY_APPLIED");
    if (proposal.status === "REJECTED") return failure("PROPOSAL_REJECTED");

    // Recovery: a receipt for proposal.id proves the authoritative operation already happened (e.g. the process died
    // before persisting APPLIED). Persist it from the receipt and never re-execute; a different actor's retry would also
    // collide on the receipt fingerprint. Works within the receipt TTL; after it, a re-apply fails the revision check.
    const recorded = await this.operations.findAcceptedOperation(projectId, proposal.id);
    if (recorded) return this.reconcile(proposal, recorded);

    const result = await this.operations.apply(user.id, { operationId: proposal.id, projectId, baseRevision: proposal.baseRevision, command: proposal.command });
    if (!("code" in result)) {
      this.broadcaster.broadcastAccepted(result);
      return this.persistApplied(proposal, user.id, result);
    }
    if (result.code === "STALE_REVISION") return failure("STALE_PROPOSAL");
    if (result.code === "FORBIDDEN") throw new ForbiddenException();

    // INVALID_OPERATION: either the command was rejected, or a concurrent call by another actor applied the same
    // operationId first (fingerprint collision). The receipt tells them apart.
    const concurrent = await this.operations.findAcceptedOperation(projectId, proposal.id);
    if (concurrent) return this.reconcile(proposal, concurrent);
    return failure("INVALID_PROPOSAL", result.diagnostics.map(toMentorProposalDiagnostic));
  }

  // resultingRevision always comes from the authoritative ACK, never from baseRevision + 1.
  private async persistApplied(proposal: StoredMentorProposal, userId: string, ack: ProjectOperationAck): Promise<ApplyMentorProposalResult> {
    const marked = await this.store.markApplied({ projectId: proposal.projectId, proposalId: proposal.id, resolvedByUserId: userId, resolvedAt: this.now(), resultingRevision: ack.revision });
    if (marked.ok) return { ok: true, proposal: applied(marked), ack, reconciled: false };
    if (marked.reason === "PROPOSAL_REJECTED") {
      this.logger.warn(JSON.stringify({ stage: "mentor-proposal:apply", errorCode: "REJECTED_AFTER_APPLY", message: "The proposal was rejected concurrently after its operation was accepted." }));
    }
    return failure(marked.reason);
  }

  // The resolver recorded is the actor who actually applied the operation, as stored in the receipt.
  private async reconcile(proposal: StoredMentorProposal, recorded: AcceptedProjectOperation): Promise<ApplyMentorProposalResult> {
    const marked = await this.store.markApplied({ projectId: proposal.projectId, proposalId: proposal.id, resolvedByUserId: recorded.actorUserId, resolvedAt: recorded.acceptedAt, resultingRevision: recorded.resultingRevision });
    if (!marked.ok) return failure(marked.reason);
    return { ok: true, proposal: applied(marked), ack: recorded.ack, reconciled: true };
  }
}
