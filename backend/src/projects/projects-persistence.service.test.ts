import { describe, expect, it, vi } from "vitest";
import { createProjectDocument, type ProjectDocument } from "@examen-sw1/uml-core";
import { InvalidProjectDocumentError, ProjectsPersistenceService, StaleProjectRevisionError } from "./projects-persistence.service";

const ownerId = "11111111-1111-4111-8111-111111111111";

describe("ProjectsPersistenceService", () => {
  it("serializa un documento válido y deja que la base aplique la revisión inicial", async () => {
    const create = vi.fn().mockResolvedValue({ id: "22222222-2222-4222-8222-222222222222", revision: 1 });
    const service = new ProjectsPersistenceService({ project: { create, findUnique: vi.fn() } } as never);
    const document = createProjectDocument({ id: "33333333-3333-4333-8333-333333333333", now: new Date("2026-09-08T00:00:00.000Z") });

    await expect(service.createProject(ownerId, "  Proyecto CU03  ", document)).resolves.toMatchObject({ revision: 1 });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ ownerId, name: "Proyecto CU03", document: expect.objectContaining({ uml: document.uml, layout: document.layout }) }) }));
    expect(create.mock.calls[0]?.[0].data).not.toHaveProperty("revision");
  });

  it("rechaza documento inválido sin escribir", async () => {
    const create = vi.fn();
    const service = new ProjectsPersistenceService({ project: { create, findUnique: vi.fn() } } as never);
    const invalid: ProjectDocument = createProjectDocument();
    invalid.revision = 0;

    await expect(service.createProject(ownerId, "Proyecto CU03", invalid)).rejects.toBeInstanceOf(InvalidProjectDocumentError);
    expect(create).not.toHaveBeenCalled();
  });

  it("lista proyectos accesibles una sola vez mediante owner o membership", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const service = new ProjectsPersistenceService({ project: { findMany } } as never);
    await expect(service.listAccessibleProjects(ownerId)).resolves.toEqual([]);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { OR: [{ ownerId }, { memberships: { some: { userId: ownerId } } }] },
      orderBy: { updatedAt: "desc" },
    }));
  });

  it("actualiza atómicamente con editor o propietario y revisión esperada", async () => {
    const updateManyAndReturn = vi.fn().mockResolvedValue([{ id: "project-id", ownerId, revision: 2, document: { id: "33333333-3333-4333-8333-333333333333", revision: 1, createdAt: "2026-09-08T00:00:00.000Z", updatedAt: "2026-09-08T00:00:00.000Z", uml: { classes: [], enumerations: [], packages: [], relationships: [] }, layout: { elements: [] } }, createdAt: new Date(), updatedAt: new Date() }]);
    const service = new ProjectsPersistenceService({ project: { updateManyAndReturn } } as never);
    const document = createProjectDocument({ id: "33333333-3333-4333-8333-333333333333", now: new Date("2026-09-08T00:00:00.000Z") });
    await expect(service.updateEditableProject("project-id", ownerId, 1, document)).resolves.toMatchObject({ revision: 2, document });
    expect(updateManyAndReturn).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: "project-id", revision: 1, OR: [{ ownerId }, { memberships: { some: { userId: ownerId, role: "EDITOR" } } }] }), data: expect.objectContaining({ revision: { increment: 1 }, document: expect.any(Object) }) }));
  });

  it("no actualiza documento inválido", async () => {
    const updateManyAndReturn = vi.fn();
    const service = new ProjectsPersistenceService({ project: { updateManyAndReturn } } as never);
    const invalid = createProjectDocument();
    invalid.revision = 0;
    await expect(service.updateEditableProject("project-id", ownerId, 1, invalid)).rejects.toBeInstanceOf(InvalidProjectDocumentError);
    expect(updateManyAndReturn).not.toHaveBeenCalled();
  });

  it("distingue revisión stale de proyecto propio inexistente", async () => {
    const updateManyAndReturn = vi.fn().mockResolvedValue([]);
    const service = new ProjectsPersistenceService({ project: { updateManyAndReturn } } as never);
    const document = createProjectDocument();
    await expect(service.updateEditableProject("project-id", ownerId, 1, document)).rejects.toBeInstanceOf(StaleProjectRevisionError);
  });
});
