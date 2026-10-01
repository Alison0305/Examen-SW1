import { Inject, Injectable, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import { generateStandaloneCrudFrontend } from "@examen-sw1/frontend-generator";
import { mapToRelationalModel } from "@examen-sw1/relational-core";
import { generateDomainManifest } from "@examen-sw1/spring-generator";
import { validateCanonicalUmlModel } from "@examen-sw1/uml-core";
import { ProjectAccessService } from "./project-access.service";
import { InvalidProjectDocumentError, ProjectsPersistenceService } from "./projects-persistence.service";
import { zipGeneratedFiles } from "./spring-export.service";

@Injectable()
export class FrontendExportService {
  constructor(@Inject(ProjectsPersistenceService) private readonly projects: ProjectsPersistenceService, @Inject(ProjectAccessService) private readonly access: ProjectAccessService) {}
  async exportProject(projectId: string, userId: string): Promise<{ zip: Buffer }> {
    await this.access.requireView(projectId, userId);
    let project; try { project = await this.projects.findProject(projectId); } catch (error) { if (error instanceof InvalidProjectDocumentError) throw new UnprocessableEntityException("El modelo del proyecto no es válido para generar la interfaz."); throw error; }
    if (!project) throw new NotFoundException(); const uml = project.document?.uml;
    if (!uml || validateCanonicalUmlModel(uml).hasErrors) throw new UnprocessableEntityException("El modelo UML no es válido para generar la interfaz.");
    const relational = mapToRelationalModel(uml); if (!relational.success || relational.tables.length === 0) throw new UnprocessableEntityException("El modelo UML no contiene entidades exportables.");
    try { return { zip: zipGeneratedFiles(generateStandaloneCrudFrontend({ relationalModel: relational, domainManifest: JSON.parse(generateDomainManifest(relational)) })) }; } catch { throw new UnprocessableEntityException("No fue posible generar la interfaz."); }
  }
}
