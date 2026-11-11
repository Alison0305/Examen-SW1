import { createProjectDocument, primitiveType, type ProjectDocument } from "@examen-sw1/uml-core";
import type { MentorProposal as MentorProposalRow } from "@prisma/client";
import { describe, expect, it } from "vitest";
import type { PrismaService } from "../prisma/prisma.service";
import { previewMentorProposal } from "./mentor-proposal-preview";
import { resolveMentorProposal } from "./mentor-proposal-resolver";
import { MentorProposalDataError } from "./mentor-proposal-stored-json";
import { buildNewMentorProposal, type NewMentorProposal } from "./mentor-proposal-store";
import { PrismaMentorProposalStore, toStoredMentorProposal } from "./prisma-mentor-proposal.store";

const PROJECT_ID = "00000000-0000-4000-8000-0000000000f1";
const OTHER_PROJECT_ID = "00000000-0000-4000-8000-0000000000f2";
const AUTHOR_ID = "00000000-0000-4000-8000-0000000000b1";
const RESOLVER_ID = "00000000-0000-4000-8000-0000000000b2";
const PROPOSAL_ID = "00000000-0000-4000-8000-0000000000c1";
const CLIENTE_ID = "00000000-0000-4000-8000-000000000010";
const ATTRIBUTE_ID = "00000000-0000-4000-8000-0000000000a1";
const CREATED_AT = new Date("2026-11-10T12:00:00.000Z");
const RESOLVED_AT = new Date("2026-11-10T12:05:00.000Z");

function documentFixture(): ProjectDocument {
  const document = createProjectDocument({ id: "00000000-0000-4000-8000-000000000001", now: new Date("2026-11-10T00:00:00.000Z") });
  document.revision = 10;
  document.uml.classes.push({ id: CLIENTE_ID, name: "Cliente", visibility: "public", attributes: [{ id: "00000000-0000-4000-8000-000000000011", name: "nombre", visibility: "private", type: primitiveType("string") }], operations: [] });
  document.layout.elements.push({ elementId: CLIENTE_ID, x: 0, y: 0 });
  return document;
}

function buildFromPreview(document = documentFixture(), instruction = "  Agrega el atributo teléfono de tipo String a Cliente  ") {
  const resolved = resolveMentorProposal(document, { operation: "ADD_ATTRIBUTE", className: "Cliente", attributeName: "teléfono", attributeType: "String" }, { uuidFactory: () => ATTRIBUTE_ID });
  if (!resolved.ok) throw new Error("se esperaba una resolución correcta");
  const preview = previewMentorProposal(document, resolved.command);
  const built = buildNewMentorProposal({ projectId: PROJECT_ID, author: { userId: AUTHOR_ID, email: "autora@example.test" }, instruction, command: resolved.command, operation: resolved.operation, preview }, { uuidFactory: () => PROPOSAL_ID, nowFactory: () => CREATED_AT });
  return { resolved, preview, built };
}

function newProposal(): NewMentorProposal {
  const { built } = buildFromPreview();
  if (!built.ok) throw new Error("se esperaba una propuesta");
  return built.proposal;
}

// In-memory double of the Prisma delegate. updateMany honours every where field, like the conditional SQL UPDATE.
function fakePrisma() {
  const rows: MentorProposalRow[] = [];
  const calls: { method: string; args: unknown }[] = [];
  const matches = (row: MentorProposalRow, where: Record<string, unknown>) => Object.entries(where).every(([key, value]) => {
    if (value && typeof value === "object" && "in" in value) return (value as { in: unknown[] }).in.includes(row[key as keyof MentorProposalRow]);
    return row[key as keyof MentorProposalRow] === value;
  });
  const delegate = {
    create: async (args: { data: Omit<MentorProposalRow, "resolvedAt" | "resolvedByUserId" | "resultingRevision"> }) => {
      calls.push({ method: "create", args });
      const row = { resolvedAt: null, resolvedByUserId: null, resultingRevision: null, ...structuredClone(args.data) } as MentorProposalRow;
      rows.push(row);
      return structuredClone(row);
    },
    findFirst: async (args: { where: Record<string, unknown> }) => {
      calls.push({ method: "findFirst", args });
      const row = rows.find((entry) => matches(entry, args.where));
      return row ? structuredClone(row) : null;
    },
    updateMany: async (args: { where: Record<string, unknown>; data: Partial<MentorProposalRow> }) => {
      calls.push({ method: "updateMany", args });
      const targets = rows.filter((entry) => matches(entry, args.where));
      targets.forEach((entry) => Object.assign(entry, args.data));
      return { count: targets.length };
    },
  };
  return { prisma: { mentorProposal: delegate } as unknown as PrismaService, rows, calls };
}

describe("buildNewMentorProposal", () => {
  it("persiste baseRevision del documento autoritativo (10), no la del candidato (11)", () => {
    const { preview, built } = buildFromPreview();
    expect(preview.ok && preview.candidate.revision).toBe(11);
    expect(built.ok && built.proposal.baseRevision).toBe(10);
  });

  it("persiste como summary exactamente el diff calculado por el preview", () => {
    const { preview, built } = buildFromPreview();
    if (!preview.ok || !built.ok) throw new Error("se esperaba una propuesta");
    expect(built.proposal.summary).toBe(preview.diff);
    expect(built.proposal.summary).toEqual([{ kind: "added", element: "attribute", label: "Cliente.teléfono: string" }]);
  });

  it("construye el registro con el comando resuelto, la identidad interna y la instrucción normalizada", () => {
    const { resolved, built } = buildFromPreview();
    expect(built).toEqual({
      ok: true,
      proposal: {
        id: PROPOSAL_ID,
        projectId: PROJECT_ID,
        authorUserId: AUTHOR_ID,
        authorEmail: "autora@example.test",
        instruction: "Agrega el atributo teléfono de tipo String a Cliente",
        baseRevision: 10,
        command: resolved.ok && resolved.command,
        operation: { kind: "ADD_ATTRIBUTE", target: { className: "Cliente" }, change: { attributeName: "teléfono", attributeType: "string" } },
        summary: [{ kind: "added", element: "attribute", label: "Cliente.teléfono: string" }],
        diagnostics: [],
        createdAt: CREATED_AT,
      },
    });
    expect(built.ok && built.proposal).not.toHaveProperty("status");
  });

  it("persiste exactamente operation, diff y diagnostics de la resolución y el preview", () => {
    const { resolved, preview, built } = buildFromPreview();
    if (!resolved.ok || !preview.ok || !built.ok) throw new Error("se esperaba una propuesta");
    expect(built.proposal.operation).toEqual(resolved.operation);
    expect(built.proposal.summary).toEqual(preview.diff);
    expect(built.proposal.diagnostics).toEqual(preview.diagnostics);
  });

  it("un preview inválido no produce ninguna propuesta", () => {
    const document = documentFixture();
    document.uml.classes[0]!.attributes.push({ id: "00000000-0000-4000-8000-000000000012", name: "teléfono", visibility: "private", type: primitiveType("string") });
    const { built } = buildFromPreview(document);
    expect(built).toEqual({ ok: false, error: expect.objectContaining({ code: "INVALID_PROPOSAL" }) });
  });

  it("rechaza instrucciones vacías o de más de 500 caracteres", () => {
    expect(buildFromPreview(documentFixture(), "   ").built.ok).toBe(false);
    expect(buildFromPreview(documentFixture(), "a".repeat(501)).built.ok).toBe(false);
    expect(buildFromPreview(documentFixture(), "a".repeat(500)).built.ok).toBe(true);
  });
});

describe("PrismaMentorProposalStore (doble en memoria)", () => {
  it("create escribe siempre PENDING y solo los campos de creación", async () => {
    const { prisma, calls } = fakePrisma();
    const forged = { ...newProposal(), status: "APPLIED", resolvedAt: RESOLVED_AT, resultingRevision: 99 } as unknown as NewMentorProposal;

    const stored = await new PrismaMentorProposalStore(prisma).create(forged);

    expect(stored.status).toBe("PENDING");
    const data = (calls[0]!.args as { data: Record<string, unknown> }).data;
    expect(Object.keys(data).sort()).toEqual(["authorEmail", "authorUserId", "baseRevision", "command", "createdAt", "diagnostics", "id", "instruction", "operation", "projectId", "status", "summary"]);
    expect(data.status).toBe("PENDING");
  });

  it("create rechaza un comando que no supera el parser estricto sin escribir", async () => {
    const { prisma, calls } = fakePrisma();
    const corrupted = { ...newProposal(), command: { ...newProposal().command, type: "DeleteClass" } } as unknown as NewMentorProposal;
    await expect(new PrismaMentorProposalStore(prisma).create(corrupted)).rejects.toBeInstanceOf(MentorProposalDataError);
    expect(calls).toEqual([]);
  });

  it("findByProjectAndId filtra por proyecto e id en la propia consulta", async () => {
    const { prisma, calls } = fakePrisma();
    const store = new PrismaMentorProposalStore(prisma);
    await store.create(newProposal());

    expect((await store.findByProjectAndId(PROJECT_ID, PROPOSAL_ID))?.id).toBe(PROPOSAL_ID);
    expect(await store.findByProjectAndId(OTHER_PROJECT_ID, PROPOSAL_ID)).toBeUndefined();
    expect(calls.filter((call) => call.method === "findFirst").map((call) => (call.args as { where: unknown }).where)).toEqual([{ id: PROPOSAL_ID, projectId: PROJECT_ID }, { id: PROPOSAL_ID, projectId: OTHER_PROJECT_ID }]);
    expect(await store.findByProjectAndId(PROJECT_ID, "no-es-uuid")).toBeUndefined();
  });

  it("reject usa una actualización condicional PENDING y solo escribe la resolución", async () => {
    const { prisma, calls } = fakePrisma();
    const store = new PrismaMentorProposalStore(prisma);
    const created = await store.create(newProposal());

    const result = await store.reject({ projectId: PROJECT_ID, proposalId: PROPOSAL_ID, resolvedByUserId: RESOLVER_ID, resolvedAt: RESOLVED_AT });

    expect(calls.find((call) => call.method === "updateMany")!.args).toEqual({ where: { id: PROPOSAL_ID, projectId: PROJECT_ID, status: "PENDING" }, data: { status: "REJECTED", resolvedAt: RESOLVED_AT, resolvedByUserId: RESOLVER_ID } });
    expect(result).toEqual({ ok: true, proposal: { ...created, status: "REJECTED", resolvedAt: RESOLVED_AT, resolvedByUserId: RESOLVER_ID } });
  });

  it("markApplied persiste resultingRevision sin tocar comando, summary, baseRevision, instrucción ni autor", async () => {
    const { prisma } = fakePrisma();
    const store = new PrismaMentorProposalStore(prisma);
    const created = await store.create(newProposal());

    const result = await store.markApplied({ projectId: PROJECT_ID, proposalId: PROPOSAL_ID, resolvedByUserId: RESOLVER_ID, resolvedAt: RESOLVED_AT, resultingRevision: 11 });

    expect(result).toEqual({ ok: true, proposal: { ...created, status: "APPLIED", resolvedAt: RESOLVED_AT, resolvedByUserId: RESOLVER_ID, resultingRevision: 11 } });
  });

  it("bloquea transiciones desde estados terminales", async () => {
    const { prisma } = fakePrisma();
    const store = new PrismaMentorProposalStore(prisma);
    await store.create(newProposal());
    const resolution = { projectId: PROJECT_ID, proposalId: PROPOSAL_ID, resolvedByUserId: RESOLVER_ID, resolvedAt: RESOLVED_AT };

    await store.reject(resolution);
    expect(await store.markApplied({ ...resolution, resultingRevision: 11 })).toEqual({ ok: false, reason: "PROPOSAL_REJECTED" });
    expect(await store.reject({ ...resolution, resolvedAt: new Date("2026-11-11T00:00:00.000Z") })).toEqual({ ok: false, reason: "PROPOSAL_REJECTED" });
    expect((await store.findByProjectAndId(PROJECT_ID, PROPOSAL_ID))).toMatchObject({ status: "REJECTED", resolvedAt: RESOLVED_AT });
  });

  it("una propuesta aplicada no se rechaza ni se vuelve a aplicar", async () => {
    const { prisma } = fakePrisma();
    const store = new PrismaMentorProposalStore(prisma);
    await store.create(newProposal());
    const resolution = { projectId: PROJECT_ID, proposalId: PROPOSAL_ID, resolvedByUserId: RESOLVER_ID, resolvedAt: RESOLVED_AT, resultingRevision: 11 };

    await store.markApplied(resolution);
    expect(await store.reject(resolution)).toEqual({ ok: false, reason: "PROPOSAL_ALREADY_APPLIED" });
    expect(await store.markApplied({ ...resolution, resultingRevision: 12 })).toEqual({ ok: false, reason: "PROPOSAL_ALREADY_APPLIED" });
    expect(await store.findByProjectAndId(PROJECT_ID, PROPOSAL_ID)).toMatchObject({ status: "APPLIED", resultingRevision: 11 });
  });

  it("reconcileAcceptedOperation lleva PENDING o REJECTED a APPLIED y es idempotente sobre APPLIED", async () => {
    const pending = fakePrisma();
    const pendingStore = new PrismaMentorProposalStore(pending.prisma);
    const created = await pendingStore.create(newProposal());
    const accepted = { projectId: PROJECT_ID, proposalId: PROPOSAL_ID, acceptedByUserId: RESOLVER_ID, acceptedAt: RESOLVED_AT, resultingRevision: 11 };

    expect(await pendingStore.reconcileAcceptedOperation(accepted)).toEqual({ ok: true, changed: true, proposal: { ...created, status: "APPLIED", resolvedAt: RESOLVED_AT, resolvedByUserId: RESOLVER_ID, resultingRevision: 11 } });
    const again = await pendingStore.reconcileAcceptedOperation({ ...accepted, resultingRevision: 99, acceptedByUserId: AUTHOR_ID });
    expect(again).toMatchObject({ ok: true, changed: false, proposal: { resultingRevision: 11, resolvedByUserId: RESOLVER_ID } });

    const rejected = fakePrisma();
    const rejectedStore = new PrismaMentorProposalStore(rejected.prisma);
    await rejectedStore.create(newProposal());
    await rejectedStore.reject({ projectId: PROJECT_ID, proposalId: PROPOSAL_ID, resolvedByUserId: AUTHOR_ID, resolvedAt: RESOLVED_AT });
    expect(await rejectedStore.reconcileAcceptedOperation(accepted)).toMatchObject({ ok: true, changed: true, proposal: { status: "APPLIED", resolvedByUserId: RESOLVER_ID, resultingRevision: 11 } });
    expect(rejected.calls.filter((call) => call.method === "updateMany").at(-1)!.args).toEqual({ where: { id: PROPOSAL_ID, projectId: PROJECT_ID, status: { in: ["PENDING", "REJECTED"] } }, data: { status: "APPLIED", resolvedAt: RESOLVED_AT, resolvedByUserId: RESOLVER_ID, resultingRevision: 11 } });
  });

  it("reconcileAcceptedOperation no encuentra propuestas de otro proyecto", async () => {
    const { prisma } = fakePrisma();
    const store = new PrismaMentorProposalStore(prisma);
    await store.create(newProposal());
    expect(await store.reconcileAcceptedOperation({ projectId: OTHER_PROJECT_ID, proposalId: PROPOSAL_ID, acceptedByUserId: RESOLVER_ID, acceptedAt: RESOLVED_AT, resultingRevision: 11 })).toEqual({ ok: false, reason: "NOT_FOUND" });
    expect((await store.findByProjectAndId(PROJECT_ID, PROPOSAL_ID))?.status).toBe("PENDING");
  });

  it("una transición sobre otro proyecto o un id inexistente es NOT_FOUND y no cambia nada", async () => {
    const { prisma, rows } = fakePrisma();
    const store = new PrismaMentorProposalStore(prisma);
    await store.create(newProposal());
    const before = structuredClone(rows);

    expect(await store.reject({ projectId: OTHER_PROJECT_ID, proposalId: PROPOSAL_ID, resolvedByUserId: RESOLVER_ID, resolvedAt: RESOLVED_AT })).toEqual({ ok: false, reason: "NOT_FOUND" });
    expect(await store.markApplied({ projectId: PROJECT_ID, proposalId: "00000000-0000-4000-8000-0000000000c9", resolvedByUserId: RESOLVER_ID, resolvedAt: RESOLVED_AT, resultingRevision: 11 })).toEqual({ ok: false, reason: "NOT_FOUND" });
    expect(rows).toEqual(before);
  });
});

describe("toStoredMentorProposal", () => {
  const row = (overrides: Partial<MentorProposalRow> = {}): MentorProposalRow => {
    const proposal = newProposal();
    return { ...proposal, command: proposal.command as never, operation: proposal.operation as never, summary: proposal.summary as never, diagnostics: proposal.diagnostics as never, status: "PENDING", resolvedAt: null, resolvedByUserId: null, resultingRevision: null, ...overrides };
  };

  it("valida la invariante entre estado y campos de resolución", () => {
    expect(toStoredMentorProposal(row()).status).toBe("PENDING");
    expect(() => toStoredMentorProposal(row({ resolvedAt: RESOLVED_AT }))).toThrow(MentorProposalDataError);
    expect(() => toStoredMentorProposal(row({ status: "REJECTED" }))).toThrow(MentorProposalDataError);
    expect(() => toStoredMentorProposal(row({ status: "REJECTED", resolvedAt: RESOLVED_AT, resolvedByUserId: RESOLVER_ID, resultingRevision: 11 }))).toThrow(MentorProposalDataError);
    expect(() => toStoredMentorProposal(row({ status: "APPLIED", resolvedAt: RESOLVED_AT, resolvedByUserId: RESOLVER_ID }))).toThrow(MentorProposalDataError);
    expect(toStoredMentorProposal(row({ status: "APPLIED", resolvedAt: RESOLVED_AT, resolvedByUserId: RESOLVER_ID, resultingRevision: 11 }))).toMatchObject({ status: "APPLIED", resultingRevision: 11 });
  });

  it("falla de forma controlada ante operation o diagnostics corruptos en la base", () => {
    expect(() => toStoredMentorProposal(row({ operation: { kind: "DELETE_CLASS" } as never }))).toThrow(MentorProposalDataError);
    expect(() => toStoredMentorProposal(row({ diagnostics: [{ code: "X", severity: "fatal", message: "m" }] as never }))).toThrow(MentorProposalDataError);
  });

  it("falla de forma controlada ante command o summary corruptos en la base", () => {
    expect(() => toStoredMentorProposal(row({ command: { type: "DeleteClass" } as never }))).toThrow(MentorProposalDataError);
    expect(() => toStoredMentorProposal(row({ summary: [{ kind: "added" }] as never }))).toThrow(MentorProposalDataError);
  });
});
