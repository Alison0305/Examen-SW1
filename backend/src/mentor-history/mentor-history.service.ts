import { Inject, Injectable } from "@nestjs/common";
import { ProjectAccessService } from "../projects/project-access.service";
import { MENTOR_HISTORY_READER, type MentorHistoryListResult, type MentorHistoryReader } from "./mentor-history.contracts";
import { parseMentorHistoryQuery } from "./mentor-history-query";

// CU-2P-07, fase 3: application service of the shared Mentor history. It only orchestrates: the existing project
// access policy, the query parser of fase 1 and the reader port. No role logic, no HTTP mapping, no local model.

// The smallest surface the service needs; ProjectAccessService satisfies it structurally (same pattern as CU-2P-04).
export type MentorHistoryProjectAccess = Readonly<{
  requireView(projectId: string, userId: string): Promise<unknown>;
}>;

@Injectable()
export class MentorHistoryService {
  constructor(
    @Inject(ProjectAccessService) private readonly access: MentorHistoryProjectAccess,
    @Inject(MENTOR_HISTORY_READER) private readonly reader: MentorHistoryReader,
  ) {}

  /**
   * Orden: `requireView` → `parseMentorHistoryQuery` → `reader.page`.
   *
   * `projectId` and `userId` come from trusted sources (route parameter and JWT); `rawQuery` is the untrusted HTTP
   * query. Access is checked first, so a user without access gets the existing 404 policy (NotFoundException,
   * propagated untouched) even with a malformed query, and nothing of the history is read before authorization.
   * An invalid query never reaches the reader. Reader errors propagate: they are never turned into an empty page.
   */
  async list(projectId: string, userId: string, rawQuery: unknown): Promise<MentorHistoryListResult> {
    await this.access.requireView(projectId, userId);
    const parsed = parseMentorHistoryQuery(rawQuery);
    if (!parsed.ok) return { ok: false, error: parsed.error };
    const page = await this.reader.page(projectId, parsed.query);
    return { ok: true, page };
  }
}
