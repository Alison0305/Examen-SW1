import { Controller, Get, Inject, Param, ParseUUIDPipe, Post, Req, UseGuards } from "@nestjs/common";
import type { AuthenticatedRequest } from "../auth/auth.types";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { ProjectInvitationsService } from "./project-invitations.service";

@Controller("invitations")
@UseGuards(JwtAuthGuard)
export class InvitationsController {
  constructor(@Inject(ProjectInvitationsService) private readonly invitations: ProjectInvitationsService) {}

  @Get()
  async listMine(@Req() request: AuthenticatedRequest) {
    return this.invitations.listMine(request.authenticatedUser!.email);
  }

  @Get(":token")
  async get(@Req() request: AuthenticatedRequest, @Param("token") token: string) {
    return this.invitations.get(token, request.authenticatedUser!.email);
  }

  @Post(":token/accept")
  async accept(@Req() request: AuthenticatedRequest, @Param("token") token: string) {
    const user = request.authenticatedUser!;
    return this.invitations.accept(token, user.id, user.email);
  }

  @Post(":token/reject")
  async reject(@Req() request: AuthenticatedRequest, @Param("token") token: string) {
    const user = request.authenticatedUser!;
    return this.invitations.reject(token, user.id, user.email);
  }

  @Post("by-id/:id/accept")
  async acceptById(@Req() request: AuthenticatedRequest, @Param("id", new ParseUUIDPipe()) id: string) {
    const user = request.authenticatedUser!;
    return this.invitations.acceptById(id, user.id, user.email);
  }

  @Post("by-id/:id/reject")
  async rejectById(@Req() request: AuthenticatedRequest, @Param("id", new ParseUUIDPipe()) id: string) {
    const user = request.authenticatedUser!;
    return this.invitations.rejectById(id, user.id, user.email);
  }
}
