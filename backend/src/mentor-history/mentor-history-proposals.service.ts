import { Inject, Injectable } from "@nestjs/common";
import { MentorProposalHistoryService } from "../mentor-proposals/mentor-proposal-history.service";
import { ProjectAccessService } from "../projects/project-access.service";
import type { MentorProposalHistoryListResult } from "./mentor-history.contracts";
import { parseMentorProposalHistoryQuery } from "./mentor-history-query";
import type { MentorHistoryProjectAccess } from "./mentor-history.service";

// CU-2P-07, task 8.1: the project's UML proposals in the shared history. Thin orchestration over CU-2P-06's read entry
// point: MentorProposalHistoryService authorizes (requireView), reads the project's proposals newest first and maps
// them to MentorProposalHistoryProjection. This service only parses the HTTP query and returns that projection as is:
// no Prisma, no store, no projection of its own, no ordering, no local model.
@Injectable()
export class MentorHistoryProposalsService {
  constructor(
    @Inject(ProjectAccessService) private readonly access: MentorHistoryProjectAccess,
    @Inject(MentorProposalHistoryService) private readonly proposals: Pick<MentorProposalHistoryService, "list">,
  ) {}

  /**
   * Valid query: `MentorProposalHistoryService.list(projectId, userId, limit)`, which checks access before reading.
   * Invalid query: `requireView` first, so a user without access (or a missing project) still gets the existing 404
   * and nothing tells whether the project exists; only then the query error, which the controller maps to 400.
   * Either way access is checked exactly once and nothing is read before it. Errors propagate untouched.
   */
  async list(projectId: string, userId: string, rawQuery: unknown): Promise<MentorProposalHistoryListResult> {
    const parsed = parseMentorProposalHistoryQuery(rawQuery);
    if (!parsed.ok) {
      await this.access.requireView(projectId, userId);
      return { ok: false, error: parsed.error };
    }
    const items = await this.proposals.list(projectId, userId, parsed.limit);
    return { ok: true, list: { items } };
  }
}
