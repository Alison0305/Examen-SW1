import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { createProjectDocument, primitiveType, type ProjectDocument } from "@examen-sw1/uml-core";
import type { MentorProposal as MentorProposalRow, ProjectOperationReceipt } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../prisma/prisma.service";
import { ProjectOperationService } from "../realtime/project-operation.service";
import type { ProjectOperationAck } from "../realtime/realtime.contracts";
import { MentorProposalApplicationService } from "./mentor-proposal-application.service";
import { previewMentorProposal } from "./mentor-proposal-preview";
import { resolveMentorProposal } from "./mentor-proposal-resolver";
import { buildNewMentorProposal, type MentorProposalStore } from "./mentor-proposal-store";
import { PrismaMentorProposalStore } from "./prisma-mentor-proposal.store";

const PROJECT_ID = "00000000-0000-4000-8000-0000000000f1";
const OTHER_PROJECT_ID = "00000000-0000-4000-8000-0000000000f2";
const FORBIDDEN_PROJECT_ID = "00000000-0000-4000-8000-0000000000f3";
const AUTHOR = { id: "00000000-0000-4000-8000-0000000000b1", email: "autora@example.test" };
const EDITOR_B = { id: "00000000-0000-4000-8000-0000000000b2", email: "editor@example.test" };
const VIEWER = { id: "00000000-0000-4000-8000-0000000000b3", email: "viewer@example.test" };
const PROPOSAL_ID = "00000000-0000-4000-8000-0000000000c1";
const CLIENTE_ID = "00000000-0000-4000-8000-000000000010";
const ATTRIBUTE_ID = "00000000-0000-4000-8000-0000000000a1";
const CREATED_AT = new Date("2026-11-10T12:00:00.000Z");
const APPLIED_AT = new Date("2026-11-10T12:05:00.000Z");
const RECEIPT_AT = new Date("2026-11-10T12:04:00.000Z");

function projectDocument(): ProjectDocument {
  const document = createProjectDocument({ id: "00000000-0000-4000-8000-000000000001", now: new Date("2026-11-10T00:00:00.000Z") });
  document.revision = 10;
  document.uml.classes.push({ id: CLIENTE_ID, name: "Cliente", visibility: "public", attributes: [{ id: "00000000-0000-4000-8000-000000000011", name: "nombre", visibility: "private", type: primitiveType("string") }], operations: [] });
  document.layout.elements.push({ elementId: CLIENTE_ID, x: 0, y: 0 });
  return document;
}

// In-memory stand-in for the Prisma delegates used by the real ProjectOperationService and PrismaMentorProposalStore.
// updateMany honours its where clause (conditional SQL UPDATE); receipts are only written by an accepted operation.
function memoryDatabase() {
  const project = { id: PROJECT_ID, revision: 10, document: JSON.parse(JSON.stringify(projectDocument())) as Record<string, unknown> };
  const receipts: ProjectOperationReceipt[] = [];
  const proposals: MentorProposalRow[] = [];
  const matches = (row: Record<string, unknown>, where: Record<string, unknown>) => Object.entries(where).every(([key, value]) => row[key] === value);
  const receiptFor = (where: { projectId_operationId: { projectId: string; operationId: string } }) => receipts.find((entry) => entry.projectId === where.projectId_operationId.projectId && entry.operationId === where.projectId_operationId.operationId);
  const client = {
    project: {
      findUnique: async ({ where }: { where: { id: string } }) => (where.id === project.id ? structuredClone(project) : null),
      updateMany: async ({ where, data }: { where: { id: string; revision: number }; data: { document: Record<string, unknown>; revision: { increment: number } } }) => {
        if (where.id !== project.id || where.revision !== project.revision) return { count: 0 };
        project.document = structuredClone(data.document);
        project.revision += data.revision.increment;
        return { count: 1 };
      },
    },
    projectOperationReceipt: {
      findUnique: async ({ where }: { where: { projectId_operationId: { projectId: string; operationId: string } } }) => structuredClone(receiptFor(where) ?? null),
      deleteMany: async () => ({ count: 0 }),
      create: async ({ data }: { data: Omit<ProjectOperationReceipt, "id" | "createdAt"> }) => {
        const row = { id: `receipt-${receipts.length + 1}`, createdAt: RECEIPT_AT, ...structuredClone(data) } as ProjectOperationReceipt;
        receipts.push(row);
        return row;
      },
    },
    mentorProposal: {
      create: async ({ data }: { data: Omit<MentorProposalRow, "resolvedAt" | "resolvedByUserId" | "resultingRevision"> }) => {
        const row = { resolvedAt: null, resolvedByUserId: null, resultingRevision: null, ...structuredClone(data) } as MentorProposalRow;
        proposals.push(row);
        return structuredClone(row);
      },
      findFirst: async ({ where }: { where: Record<string, unknown> }) => structuredClone(proposals.find((row) => matches(row, where)) ?? null),
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Partial<MentorProposalRow> }) => {
        const targets = proposals.filter((row) => matches(row, where));
        targets.forEach((row) => Object.assign(row, data));
        return { count: targets.length };
      },
    },
    $transaction: async <T>(operation: (tx: unknown) => Promise<T>) => operation(client),
  };
  const attributes = () => ((project.document.uml as ProjectDocument["uml"]).classes[0]?.attributes ?? []).map((attribute) => attribute.id);
  return { prisma: client as unknown as PrismaService, project, receipts, proposals, attributes };
}

async function setup(options: { failMarkAppliedOnce?: boolean } = {}) {
  const db = memoryDatabase();
  const access = {
    requireEdit: vi.fn(async (projectId: string, userId: string) => {
      if (projectId === FORBIDDEN_PROJECT_ID) throw new NotFoundException();
      if (userId === VIEWER.id) throw new ForbiddenException();
      return "EDITOR" as const;
    }),
  };
  const operations = new ProjectOperationService(db.prisma, access as never);
  const applySpy = vi.spyOn(operations, "apply");
  const prismaStore = new PrismaMentorProposalStore(db.prisma);
  let failures = options.failMarkAppliedOnce ? 1 : 0;
  const store: MentorProposalStore = {
    create: (proposal) => prismaStore.create(proposal),
    findByProjectAndId: vi.fn((projectId: string, proposalId: string) => prismaStore.findByProjectAndId(projectId, proposalId)),
    reject: (input) => prismaStore.reject(input),
    markApplied: async (input) => {
      if (failures > 0) { failures -= 1; throw new Error("interrupción simulada"); }
      return prismaStore.markApplied(input);
    },
  };
  const broadcaster = { broadcastAccepted: vi.fn((ack: ProjectOperationAck) => void ack) };
  const service = new MentorProposalApplicationService(access as never, store, operations, broadcaster, () => APPLIED_AT);

  const document = projectDocument();
  const resolved = resolveMentorProposal(document, { operation: "ADD_ATTRIBUTE", className: "Cliente", attributeName: "teléfono", attributeType: "String" }, { uuidFactory: () => ATTRIBUTE_ID });
  if (!resolved.ok) throw new Error("se esperaba una resolución correcta");
  const built = buildNewMentorProposal({ projectId: PROJECT_ID, author: { userId: AUTHOR.id, email: AUTHOR.email }, instruction: "Agrega el atributo teléfono de tipo String a Cliente", command: resolved.command, preview: previewMentorProposal(document, resolved.command) }, { uuidFactory: () => PROPOSAL_ID, nowFactory: () => CREATED_AT });
  if (!built.ok) throw new Error("se esperaba una propuesta");
  const created = await prismaStore.create(built.proposal);

  return { db, access, operations, applySpy, store, broadcaster, service, created, command: resolved.command };
}

const expectedAck = (command: unknown): ProjectOperationAck => ({ operationId: PROPOSAL_ID, projectId: PROJECT_ID, revision: 11, command: command as ProjectOperationAck["command"] });

describe("MentorProposalApplicationService", () => {
  it("A-01/A-06/A-07/A-08/A-10 aplica con el comando, la revisión base y operationId persistidos y guarda la revisión del ACK", async () => {
    const { db, applySpy, service, command, created } = await setup();

    const result = await service.apply(PROJECT_ID, PROPOSAL_ID, AUTHOR);

    expect(applySpy).toHaveBeenCalledTimes(1);
    expect(applySpy).toHaveBeenCalledWith(AUTHOR.id, { operationId: PROPOSAL_ID, projectId: PROJECT_ID, baseRevision: 10, command });
    expect(applySpy.mock.calls[0]![1].command).toEqual(created.command);
    expect(result).toEqual({ ok: true, reconciled: false, ack: expectedAck(command), proposal: { ...created, status: "APPLIED", resolvedAt: APPLIED_AT, resolvedByUserId: AUTHOR.id, resultingRevision: 11 } });
    expect(db.project.revision).toBe(11);
    expect(db.attributes()).toEqual(["00000000-0000-4000-8000-000000000011", ATTRIBUTE_ID]);
    expect(db.receipts.map((receipt) => receipt.operationId)).toEqual([PROPOSAL_ID]);
  });

  it("A-10 resultingRevision proviene del ACK y no de baseRevision + 1", async () => {
    const { service, operations } = await setup();
    vi.spyOn(operations, "apply").mockResolvedValueOnce({ operationId: PROPOSAL_ID, projectId: PROJECT_ID, revision: 42, command: { type: "AddAttribute", classId: CLIENTE_ID, attributeId: ATTRIBUTE_ID, name: "teléfono", attributeType: primitiveType("string") } });

    const result = await service.apply(PROJECT_ID, PROPOSAL_ID, AUTHOR);
    expect(result.ok && result.proposal.resultingRevision).toBe(42);
  });

  it("A-02 una revisión distinta devuelve STALE_PROPOSAL, sin modificar UML y la propuesta sigue PENDING", async () => {
    const { db, service, broadcaster } = await setup();
    db.project.revision = 11;
    const document = structuredClone(db.project.document);

    expect(await service.apply(PROJECT_ID, PROPOSAL_ID, AUTHOR)).toEqual({ ok: false, code: "STALE_PROPOSAL", diagnostics: [] });
    expect(db.project.document).toEqual(document);
    expect(db.proposals[0]).toMatchObject({ status: "PENDING", resolvedAt: null, resolvedByUserId: null, resultingRevision: null });
    expect(db.receipts).toEqual([]);
    expect(broadcaster.broadcastAccepted).not.toHaveBeenCalled();
  });

  it("A-03 una propuesta APPLIED no vuelve a llamar a ProjectOperationService", async () => {
    const { service, applySpy, store } = await setup();
    await store.markApplied({ projectId: PROJECT_ID, proposalId: PROPOSAL_ID, resolvedByUserId: AUTHOR.id, resolvedAt: APPLIED_AT, resultingRevision: 11 });

    expect(await service.apply(PROJECT_ID, PROPOSAL_ID, EDITOR_B)).toEqual({ ok: false, code: "PROPOSAL_ALREADY_APPLIED", diagnostics: [] });
    expect(applySpy).not.toHaveBeenCalled();
  });

  it("A-04 una propuesta REJECTED no vuelve a llamar a ProjectOperationService", async () => {
    const { service, applySpy, store, db } = await setup();
    await store.reject({ projectId: PROJECT_ID, proposalId: PROPOSAL_ID, resolvedByUserId: EDITOR_B.id, resolvedAt: APPLIED_AT });

    expect(await service.apply(PROJECT_ID, PROPOSAL_ID, AUTHOR)).toEqual({ ok: false, code: "PROPOSAL_REJECTED", diagnostics: [] });
    expect(applySpy).not.toHaveBeenCalled();
    expect(db.project.revision).toBe(10);
  });

  it("A-05 una propuesta de otro proyecto es NOT_FOUND sin aplicar nada", async () => {
    const { service, applySpy, db } = await setup();
    expect(await service.apply(OTHER_PROJECT_ID, PROPOSAL_ID, AUTHOR)).toEqual({ ok: false, code: "NOT_FOUND", diagnostics: [] });
    expect(await service.apply(PROJECT_ID, "00000000-0000-4000-8000-0000000000c9", AUTHOR)).toEqual({ ok: false, code: "NOT_FOUND", diagnostics: [] });
    expect(applySpy).not.toHaveBeenCalled();
    expect(db.project.revision).toBe(10);
  });

  it("autoriza antes de leer la propuesta: sin acceso 404 y VIEWER 403, sin consultar el store", async () => {
    const { service, store, applySpy } = await setup();
    await expect(service.apply(FORBIDDEN_PROJECT_ID, PROPOSAL_ID, AUTHOR)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.apply(PROJECT_ID, PROPOSAL_ID, VIEWER)).rejects.toBeInstanceOf(ForbiddenException);
    expect(store.findByProjectAndId).not.toHaveBeenCalled();
    expect(applySpy).not.toHaveBeenCalled();
  });

  it("A-09 otro editor puede aplicar: el autor se conserva y resolvedBy es quien aplica", async () => {
    const { service } = await setup();
    const result = await service.apply(PROJECT_ID, PROPOSAL_ID, EDITOR_B);
    expect(result.ok && result.proposal).toMatchObject({ authorUserId: AUTHOR.id, authorEmail: AUTHOR.email, resolvedByUserId: EDITOR_B.id, status: "APPLIED" });
  });

  it("un comando rechazado por el mecanismo autoritativo es INVALID_PROPOSAL, sin marcar APPLIED ni emitir", async () => {
    const { db, service, broadcaster } = await setup();
    (db.project.document.uml as ProjectDocument["uml"]).classes = [];
    (db.project.document.layout as ProjectDocument["layout"]).elements = [];

    const result = await service.apply(PROJECT_ID, PROPOSAL_ID, AUTHOR);

    expect(result).toEqual({ ok: false, code: "INVALID_PROPOSAL", diagnostics: [expect.objectContaining({ code: "UML_UNKNOWN_REFERENCE", severity: "error" })] });
    expect(result.ok || Object.keys(result.diagnostics[0]!).sort()).toEqual(["code", "message", "severity"]);
    expect(db.proposals[0]!.status).toBe("PENDING");
    expect(db.project.revision).toBe(10);
    expect(broadcaster.broadcastAccepted).not.toHaveBeenCalled();
  });

  it("A-11/A-12 si markApplied falla tras ACCEPTED, el retry reconcilia desde el recibo sin reejecutar UML ni reemitir", async () => {
    const { db, service, applySpy, broadcaster, command } = await setup({ failMarkAppliedOnce: true });

    await expect(service.apply(PROJECT_ID, PROPOSAL_ID, AUTHOR)).rejects.toThrow("interrupción simulada");
    expect(db.project.revision).toBe(11);
    expect(db.proposals[0]!.status).toBe("PENDING");
    expect(broadcaster.broadcastAccepted).toHaveBeenCalledTimes(1);

    const retry = await service.apply(PROJECT_ID, PROPOSAL_ID, AUTHOR);

    expect(applySpy).toHaveBeenCalledTimes(1);
    expect(broadcaster.broadcastAccepted).toHaveBeenCalledTimes(1);
    expect(retry).toMatchObject({ ok: true, reconciled: true, ack: expectedAck(command), proposal: { status: "APPLIED", resultingRevision: 11, resolvedByUserId: AUTHOR.id, resolvedAt: RECEIPT_AT } });
    expect(db.project.revision).toBe(11);
    expect(db.attributes().filter((id) => id === ATTRIBUTE_ID)).toHaveLength(1);
  });

  it("si otro editor reintenta tras la interrupción, se reconcilia con el actor real del recibo, sin colisión de fingerprint", async () => {
    const { service, applySpy } = await setup({ failMarkAppliedOnce: true });
    await expect(service.apply(PROJECT_ID, PROPOSAL_ID, AUTHOR)).rejects.toThrow();

    const retry = await service.apply(PROJECT_ID, PROPOSAL_ID, EDITOR_B);

    expect(applySpy).toHaveBeenCalledTimes(1);
    expect(retry).toMatchObject({ ok: true, reconciled: true, proposal: { resolvedByUserId: AUTHOR.id, authorUserId: AUTHOR.id } });
  });

  it("A-13 doble apply secuencial: el segundo devuelve PROPOSAL_ALREADY_APPLIED sin segundo cambio UML", async () => {
    const { db, service, applySpy, broadcaster } = await setup();
    await service.apply(PROJECT_ID, PROPOSAL_ID, AUTHOR);

    expect(await service.apply(PROJECT_ID, PROPOSAL_ID, AUTHOR)).toEqual({ ok: false, code: "PROPOSAL_ALREADY_APPLIED", diagnostics: [] });
    expect(applySpy).toHaveBeenCalledTimes(1);
    expect(broadcaster.broadcastAccepted).toHaveBeenCalledTimes(1);
    expect(db.project.revision).toBe(11);
  });

  it("A-14 doble apply concurrente del mismo editor: una sola mutación, un éxito y PROPOSAL_ALREADY_APPLIED", async () => {
    const { db, service, broadcaster, command } = await setup();

    const results = await Promise.all([service.apply(PROJECT_ID, PROPOSAL_ID, AUTHOR), service.apply(PROJECT_ID, PROPOSAL_ID, AUTHOR)]);

    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toEqual([{ ok: false, code: "PROPOSAL_ALREADY_APPLIED", diagnostics: [] }]);
    expect(db.project.revision).toBe(11);
    expect(db.receipts).toHaveLength(1);
    expect(db.attributes().filter((id) => id === ATTRIBUTE_ID)).toHaveLength(1);
    // Like the gateway, each ACCEPTED returned by apply() is emitted; a replay repeats the identical ACK.
    expect(broadcaster.broadcastAccepted.mock.calls.length).toBeGreaterThanOrEqual(1);
    for (const [ack] of broadcaster.broadcastAccepted.mock.calls) expect(ack).toEqual(expectedAck(command));
  });

  it("A-14 doble apply concurrente de editores distintos: la colisión de fingerprint se reconcilia sin segunda mutación ni segunda emisión", async () => {
    const { db, service, broadcaster } = await setup();

    const results = await Promise.all([service.apply(PROJECT_ID, PROPOSAL_ID, AUTHOR), service.apply(PROJECT_ID, PROPOSAL_ID, EDITOR_B)]);

    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(db.project.revision).toBe(11);
    expect(db.receipts).toHaveLength(1);
    expect(broadcaster.broadcastAccepted).toHaveBeenCalledTimes(1);
    expect(db.proposals[0]).toMatchObject({ status: "APPLIED", resolvedByUserId: db.receipts[0]!.actorUserId, resultingRevision: 11 });
  });

  it("A-15 ningún error de dominio produce emisión", async () => {
    const stale = await setup();
    stale.db.project.revision = 11;
    await stale.service.apply(PROJECT_ID, PROPOSAL_ID, AUTHOR);

    const rejected = await setup();
    await rejected.store.reject({ projectId: PROJECT_ID, proposalId: PROPOSAL_ID, resolvedByUserId: AUTHOR.id, resolvedAt: APPLIED_AT });
    await rejected.service.apply(PROJECT_ID, PROPOSAL_ID, AUTHOR);

    const missing = await setup();
    await missing.service.apply(OTHER_PROJECT_ID, PROPOSAL_ID, AUTHOR);

    const forbidden = await setup();
    await expect(forbidden.service.apply(PROJECT_ID, PROPOSAL_ID, VIEWER)).rejects.toBeInstanceOf(ForbiddenException);

    for (const run of [stale, rejected, missing, forbidden]) expect(run.broadcaster.broadcastAccepted).not.toHaveBeenCalled();
  });

  it("A-16 ACCEPTED produce exactamente una emisión con el ACK autoritativo como payload", async () => {
    const { service, broadcaster, command } = await setup();
    await service.apply(PROJECT_ID, PROPOSAL_ID, AUTHOR);
    expect(broadcaster.broadcastAccepted).toHaveBeenCalledTimes(1);
    expect(broadcaster.broadcastAccepted).toHaveBeenCalledWith(expectedAck(command));
  });

  it("un recibo previo se reconcilia sin emitir y sin llamar a apply", async () => {
    const { db, service, broadcaster, applySpy, command } = await setup();
    db.receipts.push({ id: "receipt-0", projectId: PROJECT_ID, operationId: PROPOSAL_ID, actorUserId: EDITOR_B.id, baseRevision: 10, resultingRevision: 11, fingerprint: "x", ack: expectedAck(command) as never, createdAt: RECEIPT_AT, expiresAt: new Date("2026-11-11T12:04:00.000Z") });

    const result = await service.apply(PROJECT_ID, PROPOSAL_ID, AUTHOR);

    expect(result).toMatchObject({ ok: true, reconciled: true, proposal: { resolvedByUserId: EDITOR_B.id, resultingRevision: 11 } });
    expect(applySpy).not.toHaveBeenCalled();
    expect(broadcaster.broadcastAccepted).not.toHaveBeenCalled();
  });

  it("si la propuesta se rechaza concurrentemente tras ACCEPTED, la mutación ya se emitió y se informa PROPOSAL_REJECTED", async () => {
    const { service, store, broadcaster, operations } = await setup();
    const original = operations.apply.bind(operations);
    vi.spyOn(operations, "apply").mockImplementationOnce(async (userId, dto) => {
      const ack = await original(userId, dto);
      await store.reject({ projectId: PROJECT_ID, proposalId: PROPOSAL_ID, resolvedByUserId: EDITOR_B.id, resolvedAt: APPLIED_AT });
      return ack;
    });

    expect(await service.apply(PROJECT_ID, PROPOSAL_ID, AUTHOR)).toEqual({ ok: false, code: "PROPOSAL_REJECTED", diagnostics: [] });
    expect(broadcaster.broadcastAccepted).toHaveBeenCalledTimes(1);
  });
});
