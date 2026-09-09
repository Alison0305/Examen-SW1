import { BadRequestException, Body, ConflictException, Controller, Get, Inject, NotFoundException, Param, ParseUUIDPipe, Post, Put, Req, UseGuards } from "@nestjs/common";
import type { AuthenticatedRequest } from "../auth/auth.types";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { DtoValidationPipe } from "../auth/dto/dto-validation.pipe";
import { CreateProjectDto } from "./dto/create-project.dto";
import { UpdateProjectDto } from "./dto/update-project.dto";
import { InvalidProjectDocumentError, ProjectNotFoundError, ProjectsPersistenceService, StaleProjectRevisionError } from "./projects-persistence.service";

@Controller("projects")
@UseGuards(JwtAuthGuard)
export class ProjectsController {
  constructor(@Inject(ProjectsPersistenceService) private readonly projects: ProjectsPersistenceService) {}

  @Post()
  async create(@Req() request: AuthenticatedRequest, @Body(new DtoValidationPipe(CreateProjectDto)) dto: CreateProjectDto) {
    try { return this.project(await this.projects.createProject(this.userId(request), dto.document)); }
    catch (error) { this.mapError(error); }
  }

  @Get(":id")
  async find(@Req() request: AuthenticatedRequest, @Param("id", new ParseUUIDPipe()) id: string) {
    const project = await this.projects.findOwnedProject(id, this.userId(request));
    if (!project) throw new NotFoundException();
    return this.project(project);
  }

  @Put(":id")
  async update(@Req() request: AuthenticatedRequest, @Param("id", new ParseUUIDPipe()) id: string, @Body(new DtoValidationPipe(UpdateProjectDto)) dto: UpdateProjectDto) {
    try { return this.project(await this.projects.updateOwnedProject(id, this.userId(request), dto.expectedRevision, dto.document)); }
    catch (error) { this.mapError(error); }
  }

  private userId(request: AuthenticatedRequest) {
    if (!request.authenticatedUser) throw new NotFoundException();
    return request.authenticatedUser.id;
  }

  private project(project: { id: string; document: unknown; revision: number; createdAt: Date; updatedAt: Date }) {
    return { id: project.id, document: project.document, revision: project.revision, createdAt: project.createdAt, updatedAt: project.updatedAt };
  }

  private mapError(error: unknown): never {
    if (error instanceof InvalidProjectDocumentError) throw new BadRequestException();
    if (error instanceof ProjectNotFoundError) throw new NotFoundException();
    if (error instanceof StaleProjectRevisionError) throw new ConflictException();
    throw error;
  }
}
