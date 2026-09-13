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
