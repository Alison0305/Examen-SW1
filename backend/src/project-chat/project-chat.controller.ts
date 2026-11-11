import { BadRequestException, Body, Controller, Get, Inject, NotFoundException, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { AuthenticatedRequest, AuthenticatedUser } from "../auth/auth.types";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import type { ProjectChatError, ProjectChatPage, ProjectChatPublicMessage } from "./project-chat.contracts";
import { ProjectChatService } from "./project-chat.service";

// CU-2P-08 HTTP entry point. Identity only from the JWT; the body is parsed strictly by the service (only `body`).
// Without access or for a missing project, requireView answers 404 before anything is read or written.
@Controller("projects")
@UseGuards(JwtAuthGuard)
export class ProjectChatController {
  constructor(@Inject(ProjectChatService) private readonly chat: ProjectChatService) {}

  // 201 with the persisted human message. A Mentor answer, when mentioned, arrives later through the project room.
  @Post(":id/chat/messages")
  async post(@Req() request: AuthenticatedRequest, @Param("id", new ParseUUIDPipe()) projectId: string, @Body() rawBody: unknown): Promise<ProjectChatPublicMessage> {
    const result = await this.chat.post(projectId, authenticated(request), rawBody);
    if (!result.ok) throw badRequest(result.error);
    return result.message;
  }

  // Explicit Mentor actions (RECOMMENDATION for every member, PROPOSAL for OWNER and EDITOR). 201 with the human message;
  // the result (answer, proposal card or notice) is published by the server in the project room.
  @Post(":id/chat/actions")
  async action(@Req() request: AuthenticatedRequest, @Param("id", new ParseUUIDPipe()) projectId: string, @Body() rawBody: unknown): Promise<ProjectChatPublicMessage> {
    const result = await this.chat.postAction(projectId, authenticated(request), rawBody);
    if (!result.ok) throw badRequest(result.error);
    return result.message;
  }

  @Get(":id/chat/messages")
  async list(@Req() request: AuthenticatedRequest, @Param("id", new ParseUUIDPipe()) projectId: string, @Query() rawQuery: unknown): Promise<ProjectChatPage> {
    const result = await this.chat.list(projectId, authenticated(request), rawQuery);
    if (!result.ok) throw badRequest(result.error);
    return result.page;
  }
}

// Same 400 body as the CU-2P-07 history: { statusCode, error, code, message }.
function badRequest(error: ProjectChatError): BadRequestException {
  return new BadRequestException({ statusCode: 400, error: "Bad Request", code: error.code, message: error.message });
}

function authenticated(request: AuthenticatedRequest): AuthenticatedUser {
  if (!request.authenticatedUser) throw new NotFoundException();
  return request.authenticatedUser;
}
