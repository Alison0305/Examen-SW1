import { Inject, Injectable, Optional } from "@nestjs/common";
import type { AuthenticatedUser } from "../auth/auth.types";
import { ProjectAccessService } from "../projects/project-access.service";
import { ProjectOperationService, type AcceptedProjectOperation } from "../realtime/project-operation.service";
import { MENTOR_PROPOSAL_CLOCK } from "./mentor-proposal-application.service";
import { MENTOR_PROPOSAL_STORE, type MentorProposalStore, type StoredMentorProposal } from "./mentor-proposal-store";

export type RejectedMentorProposal = Extract<StoredMentorProposal, { status: "REJECTED" }>;

export type RejectMentorProposalFailureCode = "NOT_FOUND" | "PROPOSAL_ALREADY_APPLIED" | "PROPOSAL_REJECTED";

export type RejectMentorProposalResult =
  | Readonly<{ ok: true; proposal: RejectedMentorProposal }>
  | Readonly<{ ok: false; code: RejectMentorProposalFailureCode }>;

// Explicit rejection: PENDING → REJECTED without touching UML. An accepted ProjectOperationReceipt for the proposal
// is authoritative and wins over a rejection: it is checked before rejecting and again right after, and in both
// cases the proposal is reconciled to APPLIED. A receipt that appears after the second check is corrected by the
// application service when its markApplied finds REJECTED, so receipt ACCEPTED ⇒ APPLIED eventually holds.
@Injectable()
export class MentorProposalRejectionService {
  private readonly now: () => Date;

  constructor(
    @Inject(ProjectAccessService) private readonly access: Pick<ProjectAccessService, "requireEdit">,
    @Inject(MENTOR_PROPOSAL_STORE) private readonly store: MentorProposalStore,
    @Inject(ProjectOperationService) private readonly operations: Pick<ProjectOperationService, "findAcceptedOperation">,
    @Optional() @Inject(MENTOR_PROPOSAL_CLOCK) clock?: () => Date,
  ) {
    this.now = clock ?? (() => new Date());
  }

  async reject(projectId: string, proposalId: string, user: AuthenticatedUser): Promise<RejectMentorProposalResult> {
    await this.access.requireEdit(projectId, user.id);
    const proposal = await this.store.findByProjectAndId(projectId, proposalId);
    if (!proposal) return { ok: false, code: "NOT_FOUND" };
    if (proposal.status === "APPLIED") return { ok: false, code: "PROPOSAL_ALREADY_APPLIED" };
    if (proposal.status === "REJECTED") return { ok: false, code: "PROPOSAL_REJECTED" };

    const before = await this.operations.findAcceptedOperation(projectId, proposal.id);
    if (before) return this.reconcile(proposal, before);

    const rejected = await this.store.reject({ projectId, proposalId: proposal.id, resolvedByUserId: user.id, resolvedAt: this.now() });
    if (!rejected.ok) return { ok: false, code: rejected.reason };

    const after = await this.operations.findAcceptedOperation(projectId, proposal.id);
    if (after) return this.reconcile(proposal, after);

    if (rejected.proposal.status !== "REJECTED") return { ok: false, code: "PROPOSAL_ALREADY_APPLIED" };
    return { ok: true, proposal: rejected.proposal };
  }

  private async reconcile(proposal: StoredMentorProposal, accepted: AcceptedProjectOperation): Promise<RejectMentorProposalResult> {
    const result = await this.store.reconcileAcceptedOperation({ projectId: proposal.projectId, proposalId: proposal.id, acceptedByUserId: accepted.actorUserId, acceptedAt: accepted.acceptedAt, resultingRevision: accepted.resultingRevision });
    return { ok: false, code: result.ok ? "PROPOSAL_ALREADY_APPLIED" : "NOT_FOUND" };
  }
}
