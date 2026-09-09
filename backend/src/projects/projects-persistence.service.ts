import { Inject, Injectable } from "@nestjs/common";
import { deserializeProjectDocument, serializeProjectDocument, validateProjectDocument, type ProjectDocument } from "@examen-sw1/uml-core";
import type { Prisma } from "@prisma/client";
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

  async createProject(ownerId: string, document: ProjectDocument) {
    const trusted = this.validate(document);
    const json = JSON.parse(serializeProjectDocument(trusted)) as Prisma.InputJsonValue;
    return this.prisma.project.create({ data: { ownerId, document: json } });
  }

  async findProject(id: string) {
    const project = await this.prisma.project.findUnique({ where: { id } });
    return project ? { ...project, document: this.deserialize(project.document) } : null;
  }

  async findOwnedProject(id: string, ownerId: string) {
    const project = await this.prisma.project.findFirst({ where: { id, ownerId } });
    return project ? { ...project, document: this.deserialize(project.document) } : null;
  }

  async updateOwnedProject(id: string, ownerId: string, expectedRevision: number, document: ProjectDocument) {
    const trusted = this.validate(document);
    const json = JSON.parse(serializeProjectDocument(trusted)) as Prisma.InputJsonValue;
    const updated = await this.prisma.project.updateManyAndReturn({
      where: { id, ownerId, revision: expectedRevision },
      data: { document: json, revision: { increment: 1 } },
    });
    if (updated.length === 0) {
      if (!(await this.prisma.project.findFirst({ where: { id, ownerId }, select: { id: true } }))) throw new ProjectNotFoundError();
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
}
