import { Inject, Injectable } from "@nestjs/common";
import { ProjectAccessService } from "../projects/project-access.service";
import { MENTOR_PROPOSAL_HISTORY_DEFAULT_LIMIT, MENTOR_PROPOSAL_HISTORY_MAX_LIMIT, type MentorProposalHistoryProjection } from "./mentor-proposal.contracts";
import { toMentorProposalHistoryProjection } from "./mentor-proposal-response";
import { MENTOR_PROPOSAL_HISTORY_STORE, type MentorProposalHistoryStore } from "./mentor-proposal-store";

// CU-2P-06, task 11.1: the read entry point prepared for CU-2P-07. Any member who can view the project (OWNER,
// EDITOR, VIEWER) may read the public projection, like the shared Mentor history; a user without access gets the
// existing 404 from requireView before anything is read. No HTTP route, cursor or UI here: CU-2P-07 owns those.
@Injectable()
export class MentorProposalHistoryService {
  constructor(
    @Inject(ProjectAccessService) private readonly access: Pick<ProjectAccessService, "requireView">,
    @Inject(MENTOR_PROPOSAL_HISTORY_STORE) private readonly store: MentorProposalHistoryStore,
  ) {}

  // Order: requireView → limit check → store (project only, newest first) → public projection.
  async list(projectId: string, userId: string, limit: number = MENTOR_PROPOSAL_HISTORY_DEFAULT_LIMIT): Promise<MentorProposalHistoryProjection[]> {
    await this.access.requireView(projectId, userId);
    if (!Number.isInteger(limit) || limit < 1 || limit > MENTOR_PROPOSAL_HISTORY_MAX_LIMIT) throw new RangeError(`limit must be an integer between 1 and ${MENTOR_PROPOSAL_HISTORY_MAX_LIMIT}`);
    const proposals = await this.store.listByProject(projectId, limit);
    return proposals.map(toMentorProposalHistoryProjection);
  }
}
