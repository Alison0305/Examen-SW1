import { BadRequestException, Body, ConflictException, Controller, Delete, Get, HttpCode, Inject, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Put, Req, UseGuards } from "@nestjs/common";
import type { AuthenticatedRequest } from "../auth/auth.types";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { DtoValidationPipe } from "../auth/dto/dto-validation.pipe";
import { CreateProjectDto } from "./dto/create-project.dto";
import { UpdateProjectDto } from "./dto/update-project.dto";
import { RenameProjectDto } from "./dto/rename-project.dto";
import { UpdateProjectMemberDto } from "./dto/update-project-member.dto";
import { ProjectAccessService, type ProjectAccessRole } from "./project-access.service";
import { InvalidProjectDocumentError, ProjectNotFoundError, ProjectsPersistenceService, StaleProjectRevisionError } from "./projects-persistence.service";

@Controller("projects")
@UseGuards(JwtAuthGuard)
export class ProjectsController {
  constructor(@Inject(ProjectsPersistenceService) private readonly projects: ProjectsPersistenceService, @Inject(ProjectAccessService) private readonly access: ProjectAccessService) {}

  @Post()
  async create(@Req() request: AuthenticatedRequest, @Body(new DtoValidationPipe(CreateProjectDto)) dto: CreateProjectDto) {
    try { return this.project(await this.projects.createProject(this.userId(request), dto.name, dto.document)); }
    catch (error) { this.mapError(error); }
  }

  @Get()
  async list(@Req() request: AuthenticatedRequest) {
    const userId = this.userId(request);
    return (await this.projects.listAccessibleProjects(userId)).map((project) => this.summary(project, project.ownerId === userId ? "OWNER" : project.memberships[0]?.role ?? "NONE"));
  }

  @Get(":id")
  async find(@Req() request: AuthenticatedRequest, @Param("id", new ParseUUIDPipe()) id: string) {
    const role = await this.access.requireView(id, this.userId(request));
    const project = await this.projects.findProject(id);
    if (!project) throw new NotFoundException();
    return this.project(project, role);
  }

  @Put(":id")
  async update(@Req() request: AuthenticatedRequest, @Param("id", new ParseUUIDPipe()) id: string, @Body(new DtoValidationPipe(UpdateProjectDto)) dto: UpdateProjectDto) {
    const userId = this.userId(request);
    const role = await this.access.requireEdit(id, userId);
    try { return this.project(await this.projects.updateEditableProject(id, userId, dto.expectedRevision, dto.document), role); }
    catch (error) {
      if (error instanceof StaleProjectRevisionError) {
        await this.access.requireEdit(id, userId);
        throw new ConflictException();
      }
      this.mapError(error);
    }
  }

  @Patch(":id")
  async rename(@Req() request: AuthenticatedRequest, @Param("id", new ParseUUIDPipe()) id: string, @Body(new DtoValidationPipe(RenameProjectDto)) dto: RenameProjectDto) {
    const userId = this.userId(request);
    await this.access.requireOwner(id, userId);
    try { return this.project((await this.projects.renameOwnedProject(id, userId, dto.name))!, "OWNER"); }
    catch (error) { this.mapError(error); }
  }

  @Delete(":id")
  @HttpCode(204)
  async remove(@Req() request: AuthenticatedRequest, @Param("id", new ParseUUIDPipe()) id: string) {
    const userId = this.userId(request);
    await this.access.requireOwner(id, userId);
    try { await this.projects.deleteOwnedProject(id, userId); }
    catch (error) { this.mapError(error); }
  }

  @Get(":id/members")
  async members(@Req() request: AuthenticatedRequest, @Param("id", new ParseUUIDPipe()) id: string) {
    await this.access.requireOwner(id, this.userId(request));
    return (await this.projects.listMembers(id)).map((member) => ({ ...member, email: member.user.email, user: undefined }));
  }

  @Patch(":id/members/:userId")
  async updateMember(@Req() request: AuthenticatedRequest, @Param("id", new ParseUUIDPipe()) id: string, @Param("userId", new ParseUUIDPipe()) userId: string, @Body(new DtoValidationPipe(UpdateProjectMemberDto)) dto: UpdateProjectMemberDto) {
    await this.access.requireOwner(id, this.userId(request));
    try {
      const member = await this.projects.updateMember(id, userId, dto.role);
      return { ...member, email: member.user.email, user: undefined };
    } catch (error) { this.mapError(error); }
  }

  @Delete(":id/members/:userId")
  @HttpCode(204)
  async removeMember(@Req() request: AuthenticatedRequest, @Param("id", new ParseUUIDPipe()) id: string, @Param("userId", new ParseUUIDPipe()) userId: string) {
    await this.access.requireOwner(id, this.userId(request));
    try { await this.projects.deleteMember(id, userId); }
    catch (error) { this.mapError(error); }
  }

  private userId(request: AuthenticatedRequest) {
    if (!request.authenticatedUser) throw new NotFoundException();
    return request.authenticatedUser.id;
  }

  private project(project: { id: string; name: string; document: unknown; revision: number; createdAt: Date; updatedAt: Date }, accessRole: Exclude<ProjectAccessRole, "NONE"> = "OWNER") {
    return { ...this.summary(project, accessRole), document: project.document };
  }

  private summary(project: { id: string; name: string; revision: number; createdAt: Date; updatedAt: Date }, accessRole: Exclude<ProjectAccessRole, "NONE">) {
    return { id: project.id, name: project.name, revision: project.revision, createdAt: project.createdAt, updatedAt: project.updatedAt, accessRole };
  }

  private mapError(error: unknown): never {
    if (error instanceof InvalidProjectDocumentError) throw new BadRequestException();
    if (error instanceof ProjectNotFoundError) throw new NotFoundException();
    if (error instanceof StaleProjectRevisionError) throw new ConflictException();
    throw error;
  }
}
