import { describe, expect, it, vi } from "vitest";
import { createProjectDocument, UmlCommandBus, type ProjectDocument } from "@examen-sw1/uml-core";
import { InvalidProjectDocumentError, ProjectsPersistenceService, StaleProjectRevisionError } from "./projects-persistence.service";

const ownerId = "11111111-1111-4111-8111-111111111111";

describe("ProjectsPersistenceService", () => {
  it("recarga una Association recursiva con multiplicidades independientes", async () => {
    const relationshipId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const document = createProjectDocument({ id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", now: new Date("2026-09-27T00:00:00.000Z") });
    document.uml.classes.push({ id: ownerId, name: "Empleado", visibility: "public", attributes: [], operations: [] });
    document.uml.relationships.push({ id: relationshipId, type: "Association", sourceId: ownerId, targetId: ownerId, sourceMultiplicity: { lower: 0, upper: 1 }, targetMultiplicity: { lower: 0, upper: "unbounded" } });
    const service = new ProjectsPersistenceService({ project: { findUnique: vi.fn().mockResolvedValue({ id: document.id, document: JSON.parse(JSON.stringify(document)) }) } } as never);
    await expect(service.findProject(document.id)).resolves.toMatchObject({ document: { uml: { relationships: [expect.objectContaining({ id: relationshipId, sourceId: ownerId, targetId: ownerId, sourceMultiplicity: { lower: 0, upper: 1 }, targetMultiplicity: { lower: 0, upper: "unbounded" } })] } } });
  });
  it("recarga una association class y su posición movida desde el JSON serializado", async () => {
    const clientId = "44444444-4444-4444-8444-444444444444";
    const productId = "55555555-5555-4555-8555-555555555555";
    const relationshipId = "66666666-6666-4666-8666-666666666666";
    const associationClassId = "77777777-7777-4777-8777-777777777777";
    const initial = createProjectDocument({ id: "33333333-3333-4333-8333-333333333333", now: new Date("2026-09-08T00:00:00.000Z") });
    const bus = new UmlCommandBus(initial);
    bus.execute({ type: "CreateClass", classId: clientId, name: "Cliente", layout: { x: 0, y: 0 } });
    bus.execute({ type: "CreateClass", classId: productId, name: "Producto", layout: { x: 400, y: 0 } });
    bus.execute({ type: "CreateRelationship", relationshipId, relationshipType: "Association", sourceId: clientId, targetId: productId, sourceMultiplicity: { lower: 1, upper: 1 }, targetMultiplicity: { lower: 0, upper: "unbounded" } });
    bus.execute({ type: "UpdateMultiplicity", relationshipId, end: "source", multiplicity: { lower: 0, upper: "unbounded" }, associationClassId });
    bus.execute({ type: "MoveElement", elementId: associationClassId, x: 210, y: 240 });
    const stored = JSON.parse(JSON.stringify(bus.document));
    const findUnique = vi.fn().mockResolvedValue({ id: "project-id", document: stored });
    const service = new ProjectsPersistenceService({ project: { findUnique } } as never);

    const loaded = await service.findProject("project-id");
    expect(loaded?.document.uml.classes.find((entry) => entry.id === associationClassId)).toMatchObject({ name: "ClienteProducto", attributes: [] });
    expect(loaded?.document.uml.relationships).toEqual([expect.objectContaining({ id: relationshipId, associationClassId, sourceMultiplicity: { lower: 0, upper: "unbounded" }, targetMultiplicity: { lower: 0, upper: "unbounded" } })]);
    expect(loaded?.document.layout.elements.find((entry) => entry.elementId === associationClassId)).toMatchObject({ x: 210, y: 240 });
  });
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
