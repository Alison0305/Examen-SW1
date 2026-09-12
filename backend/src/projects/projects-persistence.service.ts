import { Inject, Injectable } from "@nestjs/common";
import { deserializeProjectDocument, serializeProjectDocument, validateProjectDocument, type ProjectDocument } from "@examen-sw1/uml-core";
import { ProjectMemberRole, type Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

export class InvalidProjectDocumentError extends Error {
  constructor() {
    super("ProjectDocument inválido");
  }
}
export class ProjectNotFoundError extends Error {}
export class StaleProjectRevisionError extends Error {}

@Injectable()
export class ProjectsPersistenceService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async createProject(ownerId: string, name: string, document: ProjectDocument) {
    const trusted = this.validate(document);
    const json = JSON.parse(serializeProjectDocument(trusted)) as Prisma.InputJsonValue;
    return this.prisma.project.create({ data: { ownerId, name: this.name(name), document: json } });
  }

  async listAccessibleProjects(userId: string) {
    return this.prisma.project.findMany({
      where: { OR: [{ ownerId: userId }, { memberships: { some: { userId } } }] },
      orderBy: { updatedAt: "desc" },
      select: { id: true, ownerId: true, name: true, revision: true, createdAt: true, updatedAt: true, memberships: { where: { userId }, select: { role: true } } },
    });
  }

  async renameOwnedProject(id: string, ownerId: string, name: string) {
    const result = await this.prisma.project.updateMany({ where: { id, ownerId }, data: { name: this.name(name) } });
    if (!result.count) throw new ProjectNotFoundError();
    return this.findOwnedProject(id, ownerId);
  }

  async deleteOwnedProject(id: string, ownerId: string) {
    const result = await this.prisma.project.deleteMany({ where: { id, ownerId } });
    if (!result.count) throw new ProjectNotFoundError();
  }

  async listMembers(projectId: string) {
    return this.prisma.projectMembership.findMany({
      where: { projectId },
      orderBy: { createdAt: "asc" },
      select: { userId: true, role: true, createdAt: true, updatedAt: true, user: { select: { email: true } } },
    });
  }

  async updateMember(projectId: string, userId: string, role: ProjectMemberRole) {
    const [project, user] = await Promise.all([
      this.prisma.project.findUnique({ where: { id: projectId }, select: { ownerId: true } }),
      this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } }),
    ]);
    if (!project) throw new ProjectNotFoundError();
    if (!user) throw new ProjectNotFoundError();
    if (project.ownerId === userId) throw new InvalidProjectDocumentError();
    return this.prisma.projectMembership.upsert({
      where: { projectId_userId: { projectId, userId } },
      create: { projectId, userId, role },
      update: { role },
      select: { userId: true, role: true, createdAt: true, updatedAt: true, user: { select: { email: true } } },
    });
  }

  async deleteMember(projectId: string, userId: string) {
    const result = await this.prisma.projectMembership.deleteMany({ where: { projectId, userId } });
    if (!result.count) throw new ProjectNotFoundError();
  }

  async findProject(id: string) {
    const project = await this.prisma.project.findUnique({ where: { id } });
    return project ? { ...project, document: this.deserialize(project.document) } : null;
  }

  async findOwnedProject(id: string, ownerId: string) {
    const project = await this.prisma.project.findFirst({ where: { id, ownerId } });
    return project ? { ...project, document: this.deserialize(project.document) } : null;
  }

  async updateEditableProject(id: string, userId: string, expectedRevision: number, document: ProjectDocument) {
    const trusted = this.validate(document);
    const json = JSON.parse(serializeProjectDocument(trusted)) as Prisma.InputJsonValue;
    const updated = await this.prisma.project.updateManyAndReturn({
      where: { id, revision: expectedRevision, OR: [{ ownerId: userId }, { memberships: { some: { userId, role: ProjectMemberRole.EDITOR } } }] },
      data: { document: json, revision: { increment: 1 } },
    });
    if (updated.length === 0) {
      throw new StaleProjectRevisionError();
    }
    return { ...updated[0]!, document: this.deserialize(updated[0]!.document) };
  }

  private deserialize(value: Prisma.JsonValue): ProjectDocument {
    try {
      return this.validate(deserializeProjectDocument(JSON.stringify(value)));
    } catch {
      throw new InvalidProjectDocumentError();
    }
  }

  private validate(document: ProjectDocument): ProjectDocument {
    if (!document?.uml || !document.layout || !Array.isArray(document.uml.classes) || !Array.isArray(document.uml.enumerations) || !Array.isArray(document.uml.relationships) || !Array.isArray(document.layout.elements) || validateProjectDocument(document).hasErrors) {
      throw new InvalidProjectDocumentError();
    }
    return document;
  }

  private name(value: string): string {
    const name = value.trim();
    if (name.length < 1 || name.length > 100) throw new InvalidProjectDocumentError();
    return name;
  }
}
