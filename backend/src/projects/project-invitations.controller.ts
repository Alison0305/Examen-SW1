import { Body, Controller, Delete, Get, HttpCode, Inject, Param, ParseUUIDPipe, Post, Req, UseGuards } from "@nestjs/common";
import type { AuthenticatedRequest } from "../auth/auth.types";
import { DtoValidationPipe } from "../auth/dto/dto-validation.pipe";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { ProjectAccessService } from "./project-access.service";
import { CreateProjectInvitationDto } from "./dto/create-project-invitation.dto";
import { ProjectInvitationsService } from "./project-invitations.service";

@Controller("projects")
@UseGuards(JwtAuthGuard)
export class ProjectInvitationsController {
  constructor(@Inject(ProjectAccessService) private readonly access: ProjectAccessService, @Inject(ProjectInvitationsService) private readonly invitations: ProjectInvitationsService) {}

  @Get(":id/invitations")
  async list(@Req() request: AuthenticatedRequest, @Param("id", new ParseUUIDPipe()) id: string) {
    await this.access.requireOwner(id, this.userId(request));
    return this.invitations.list(id);
  }

  @Post(":id/invitations")
  async create(@Req() request: AuthenticatedRequest, @Param("id", new ParseUUIDPipe()) id: string, @Body(new DtoValidationPipe(CreateProjectInvitationDto)) dto: CreateProjectInvitationDto) {
    const userId = this.userId(request);
    await this.access.requireOwner(id, userId);
    return this.invitations.create(id, userId, dto.email, dto.role);
  }

  @Delete(":id/invitations/:invitationId")
  @HttpCode(204)
  async revoke(@Req() request: AuthenticatedRequest, @Param("id", new ParseUUIDPipe()) id: string, @Param("invitationId", new ParseUUIDPipe()) invitationId: string) {
    await this.access.requireOwner(id, this.userId(request));
    await this.invitations.revoke(id, invitationId);
  }

  private userId(request: AuthenticatedRequest) {
    return request.authenticatedUser!.id;
  }
}
