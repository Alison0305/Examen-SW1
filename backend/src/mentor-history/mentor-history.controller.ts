import { BadRequestException, Controller, Get, Inject, NotFoundException, Param, ParseUUIDPipe, Query, Req, UseGuards } from "@nestjs/common";
import type { AuthenticatedRequest } from "../auth/auth.types";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import type { MentorHistoryPage, MentorHistoryQueryError } from "./mentor-history.contracts";
import { MentorHistoryService } from "./mentor-history.service";

// CU-2P-07, fase 4: HTTP entry point of the shared Mentor history. Same conventions as MentorController (CU-2P-01) and
// UmlAnalysisController (CU-2P-04): JwtAuthGuard on the class, ParseUUIDPipe on :id, identity only from the request.
// The query is passed raw: `parseMentorHistoryQuery` (inside the service) is the single source of truth for limit,
// cursor, q, repeated parameters (Fastify delivers them as arrays) and unknown parameters such as `userId`.

/** Body of a 400 caused by an invalid history query: Nest's usual shape plus the stable contract code. */
export type MentorHistoryBadRequestBody = Readonly<{
  statusCode: 400;
  error: "Bad Request";
  code: MentorHistoryQueryError["code"];
  reason?: string;
  message: string;
}>;

export function toMentorHistoryBadRequest(error: MentorHistoryQueryError): BadRequestException {
  const body: MentorHistoryBadRequestBody = {
    statusCode: 400,
    error: "Bad Request",
    code: error.code,
    ...(error.code === "INVALID_CURSOR" ? { reason: error.reason } : {}),
    message: error.message,
  };
  return new BadRequestException(body);
}

@Controller("projects")
@UseGuards(JwtAuthGuard)
export class MentorHistoryController {
  constructor(@Inject(MentorHistoryService) private readonly history: MentorHistoryService) {}

  @Get(":id/mentor/history")
  async list(@Req() request: AuthenticatedRequest, @Param("id", new ParseUUIDPipe()) projectId: string, @Query() rawQuery: unknown): Promise<MentorHistoryPage> {
    const authenticatedUser = request.authenticatedUser;
    // JwtAuthGuard always sets it; same defensive 404 as MentorController.
    if (!authenticatedUser) throw new NotFoundException();
    // NotFoundException from requireView and any unexpected error propagate untouched (404 / 5xx).
    const result = await this.history.list(projectId, authenticatedUser.id, rawQuery);
    if (!result.ok) throw toMentorHistoryBadRequest(result.error);
    return result.page;
  }
}
