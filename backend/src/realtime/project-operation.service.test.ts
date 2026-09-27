import { createProjectDocument, type UmlCommand } from "@examen-sw1/uml-core";
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { ProjectOperationService } from "./project-operation.service";

const actorId = "11111111-1111-4111-8111-111111111111";
const projectId = "22222222-2222-4222-8222-222222222222";
const operationId = "33333333-3333-4333-8333-333333333333";
const classId = "44444444-4444-4444-8444-444444444444";
const command: UmlCommand = { type: "CreateClass", classId, name: "Cliente", layout: { x: 0, y: 0 } };

function dto(overrides: Partial<{ operationId: string; baseRevision: number; command: UmlCommand }> = {}) {
  return { projectId, operationId, baseRevision: 1, command, ...overrides };
}

function receipt(ack: unknown, overrides: Record<string, unknown> = {}) {
  return {
    id: "55555555-5555-4555-8555-555555555555", projectId, operationId, actorUserId: actorId,
    baseRevision: 1, resultingRevision: 2, fingerprint: "fingerprint", ack, createdAt: new Date(), expiresAt: new Date(Date.now() + 60_000),
    ...overrides,
  };
}

function matchingFingerprint() {
  return createHash("sha256").update(JSON.stringify({
    actorUserId: actorId,
    baseRevision: 1,
    command: { classId, layout: { x: 0, y: 0 }, name: "Cliente", type: "CreateClass" },
    projectId,
  })).digest("hex");
}

function setup(existing: unknown = null, revision = 1) {
  const tx = {
    projectOperationReceipt: { findUnique: vi.fn().mockResolvedValue(existing), deleteMany: vi.fn(), create: vi.fn() },
    project: { findUnique: vi.fn().mockResolvedValue({ id: projectId, revision, document: JSON.parse(JSON.stringify(createProjectDocument())) }), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
  };
  const prisma = {
    projectOperationReceipt: { deleteMany: vi.fn(), findUnique: vi.fn() },
    $transaction: vi.fn((operation: (client: typeof tx) => Promise<unknown>) => operation(tx)),
  };
  const access = { requireEdit: vi.fn().mockResolvedValue("OWNER") };
  return { service: new ProjectOperationService(prisma as never, access as never), prisma, tx, access };
}

describe("ProjectOperationService", () => {
  it("persiste una association class con el ID del comando y acepta mover ese mismo elemento", async () => {
    const associationId = "66666666-6666-4666-8666-666666666666";
    const productId = "77777777-7777-4777-8777-777777777777";
    const associationClassId = "88888888-8888-4888-8888-888888888888";
    const document = createProjectDocument({ id: projectId });
    document.uml.classes.push({ id: classId, name: "Cliente", visibility: "public", attributes: [], operations: [] }, { id: productId, name: "Producto", visibility: "public", attributes: [], operations: [] });
    document.layout.elements.push({ elementId: classId, x: 0, y: 0 }, { elementId: productId, x: 400, y: 0 });
    document.uml.relationships.push({ id: associationId, type: "Association", sourceId: classId, targetId: productId, sourceMultiplicity: { lower: 1, upper: 1 }, targetMultiplicity: { lower: 0, upper: "unbounded" } });
    const first = setup();
    first.tx.project.findUnique.mockResolvedValue({ id: projectId, revision: 1, document });
    const conversion: UmlCommand = { type: "UpdateMultiplicity", relationshipId: associationId, end: "source", multiplicity: { lower: 0, upper: "unbounded" }, associationClassId };

    await expect(first.service.apply(actorId, dto({ command: conversion }))).resolves.toMatchObject({ revision: 2, command: conversion });
    const persisted = first.tx.project.updateMany.mock.calls[0][0].data.document as typeof document;
    expect(persisted.uml.classes.find((entry) => entry.id === associationClassId)).toMatchObject({ attributes: [] });
    expect(persisted.uml.relationships[0]).toMatchObject({ id: associationId, associationClassId, sourceMultiplicity: { lower: 0, upper: "unbounded" }, targetMultiplicity: { lower: 0, upper: "unbounded" } });
    expect(persisted.layout.elements.some((entry) => entry.elementId === associationClassId)).toBe(true);

    const second = setup(null, 2);
    second.tx.project.findUnique.mockResolvedValue({ id: projectId, revision: 2, document: persisted });
    await expect(second.service.apply(actorId, dto({ baseRevision: 2, operationId: "99999999-9999-4999-8999-999999999999", command: { type: "MoveElement", elementId: associationClassId, x: 220, y: 180 } }))).resolves.toMatchObject({ revision: 3 });
  });
  it("autoriza antes de consultar recibos", async () => {
    const { service, prisma, access } = setup();
    access.requireEdit.mockRejectedValueOnce(new Error("forbidden"));

    await expect(service.apply(actorId, dto())).rejects.toThrow("forbidden");
    expect(prisma.projectOperationReceipt.deleteMany).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("ejecuta el Command Bus, incrementa la revisión y persiste proyecto y recibo en la misma transacción", async () => {
    const { service, tx } = setup();

    await expect(service.apply(actorId, dto())).resolves.toMatchObject({ operationId, projectId, revision: 2, command });
    expect(tx.project.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: projectId, revision: 1 }, data: expect.objectContaining({ revision: { increment: 1 } }) }));
    expect(tx.projectOperationReceipt.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ actorUserId: actorId, baseRevision: 1, resultingRevision: 2, expiresAt: expect.any(Date) }) }));
  });

  it("reproduce el ack mínimo para la misma huella sin ejecutar ni incrementar", async () => {
    const ack = { operationId, projectId, revision: 2, command };
    const { service, tx } = setup(receipt(ack, { fingerprint: matchingFingerprint() }));
    const replay = await service.apply(actorId, dto());

    expect(replay).toEqual(ack);
    expect(tx.project.updateMany).not.toHaveBeenCalled();
    expect(tx.projectOperationReceipt.create).not.toHaveBeenCalled();
  });

  it("rechaza una colisión de operationId", async () => {
    const { service, tx } = setup(receipt({ operationId, projectId, revision: 2, command }));
    const result = await service.apply(actorId, dto({ command: { ...command, name: "Pedido" } }));

    expect(result).toMatchObject({ code: "INVALID_OPERATION" });
    expect(tx.project.updateMany).not.toHaveBeenCalled();
  });

  it("elimina un recibo vencido y devuelve conflicto para una revisión antigua", async () => {
    const { service, tx } = setup(receipt({}, { expiresAt: new Date(Date.now() - 1_000) }), 2);
    const result = await service.apply(actorId, dto());

    expect(tx.projectOperationReceipt.deleteMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: expect.any(String), expiresAt: expect.any(Object) }) }));
    expect(result).toEqual(expect.objectContaining({ code: "STALE_REVISION", revision: 2, requiresResync: true }));
    expect(tx.project.updateMany).not.toHaveBeenCalled();
  });

  it("resuelve stale antes del executor y rechazos UML sin revisión ni recibo", async () => {
    const stale = setup(null, 2);
    await expect(stale.service.apply(actorId, dto())).resolves.toMatchObject({ code: "STALE_REVISION", revision: 2 });
    expect(stale.tx.project.updateMany).not.toHaveBeenCalled();
    expect(stale.tx.projectOperationReceipt.create).not.toHaveBeenCalled();

    const invalid = setup();
    await expect(invalid.service.apply(actorId, dto({ command: { ...command, name: "" } }))).resolves.toMatchObject({ code: "INVALID_OPERATION" });
    expect(invalid.tx.project.updateMany).not.toHaveBeenCalled();
    expect(invalid.tx.projectOperationReceipt.create).not.toHaveBeenCalled();
  });
});
