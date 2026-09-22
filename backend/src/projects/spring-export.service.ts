import { BadRequestException, Inject, Injectable, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import { strToU8, zipSync } from "fflate";
import { mapToRelationalModel } from "@examen-sw1/relational-core";
import { defaultSpringGeneratorConfig, generateSpringBackend, type GeneratedFile } from "@examen-sw1/spring-generator";
import { validateCanonicalUmlModel } from "@examen-sw1/uml-core";
import { ProjectAccessService } from "./project-access.service";
import { InvalidProjectDocumentError, ProjectsPersistenceService } from "./projects-persistence.service";

const basePackage = /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)*$/;

export class SpringExportError extends Error {}

export function zipGeneratedFiles(files: readonly GeneratedFile[]): Buffer {
  const entries: Record<string, Uint8Array> = {};
  for (const file of files) {
    if (!file.path || file.path.includes("\0") || file.path.includes("\\") || /^(?:[a-z]:|\/)/i.test(file.path) || file.path.split("/").some((part) => !part || part === "." || part === "..")) {
      throw new SpringExportError("El generador produjo una ruta no segura.");
    }
    entries[file.path] = strToU8(file.content);
  }
  return Buffer.from(zipSync(entries));
}

@Injectable()
export class SpringExportService {
  constructor(@Inject(ProjectsPersistenceService) private readonly projects: ProjectsPersistenceService, @Inject(ProjectAccessService) private readonly access: ProjectAccessService) {}

  async exportProject(projectId: string, userId: string, requestedBasePackage?: string): Promise<{ zip: Buffer }> {
    await this.access.requireView(projectId, userId);
    let project;
    try {
      project = await this.projects.findProject(projectId);
    } catch (error) {
      if (error instanceof InvalidProjectDocumentError) throw new UnprocessableEntityException("El modelo del proyecto no es válido para generar el backend.");
      throw error;
    }
    if (!project) throw new NotFoundException();

    const canonical = project.document?.uml;
    if (!canonical) throw new UnprocessableEntityException("El modelo UML no es válido para generar el backend.");
    let validation;
    try {
      validation = validateCanonicalUmlModel(canonical);
    } catch {
      throw new UnprocessableEntityException("El modelo UML no es válido para generar el backend.");
    }
    if (validation.hasErrors) throw new UnprocessableEntityException("El modelo UML no es válido para generar el backend.");

    let relational;
    try {
      relational = mapToRelationalModel(canonical);
    } catch {
      throw new UnprocessableEntityException("No fue posible generar el backend Spring.");
    }
    if (!relational.success || relational.tables.length === 0) throw new UnprocessableEntityException("El modelo UML no contiene entidades exportables.");

    const base = requestedBasePackage?.trim() || defaultSpringGeneratorConfig.basePackage;
    if (!basePackage.test(base)) throw new BadRequestException("El paquete base no es válido.");
    try {
      return { zip: zipGeneratedFiles(generateSpringBackend(relational, { ...defaultSpringGeneratorConfig, basePackage: base })) };
    } catch {
      throw new UnprocessableEntityException("No fue posible generar el backend Spring.");
    }
  }
}
