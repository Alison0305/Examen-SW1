import { ForbiddenException, NotFoundException } from "@nestjs/common";
import type { LocalTextModelRequest } from "@examen-sw1/assistant-core";
import { createProjectDocument, primitiveType, serializeProjectDocument, type ProjectDocument } from "@examen-sw1/uml-core";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaService } from "../prisma/prisma.service";
import { ProjectAccessService } from "../projects/project-access.service";
import { ProjectsPersistenceService } from "../projects/projects-persistence.service";
import { ProjectOperationService } from "../realtime/project-operation.service";
import { LocalQwenMentorProposalIntentProvider } from "./local-qwen-mentor-proposal-intent.provider";
import { MentorProposalApplicationService } from "./mentor-proposal-application.service";
import { MentorProposalCreationService } from "./mentor-proposal-creation.service";
import { PrismaMentorProposalStore } from "./prisma-mentor-proposal.store";

// CU-2P-06, phase 7, against the development PostgreSQL: instruction → (stand-in for Qwen) intent → resolver → preview
// → PrismaMentorProposalStore → PENDING, with the real ProjectAccessService and ProjectsPersistenceService. Only the
// local model is replaced by a deterministic object; no GGUF is loaded. Fixtures use their own ids (d7c06…) and are
// removed by id only (the project cascades to its proposals, memberships and receipts).

const id = (tail: string) => `d7c06a00-0000-4000-8000-${tail.padStart(12, "0")}`;
const USERS = {
  OWNER: { id: id("b0"), email: "cu06-create-owner@example.test" },
  EDITOR: { id: id("b1"), email: "cu06-create-editor@example.test" },
  VIEWER: { id: id("b2"), email: "cu06-create-viewer@example.test" },
  OUTSIDER: { id: id("b3"), email: "cu06-create-outsider@example.test" },
} as const;
const PROJECT_ID = id("f1");
const MISSING_PROJECT_ID = id("dead");
const CLIENTE_ID = id("10");
const NOMBRE_ID = id("11");
const INSTRUCTION = "Agrega el atributo teléfono de tipo String a Cliente";
const INTENT = { operation: "ADD_ATTRIBUTE", className: "Cliente", attributeName: "teléfono", attributeType: "String" };

function projectDocument(): ProjectDocument {
  const document = createProjectDocument({ id: id("d1"), now: new Date("2026-11-10T00:00:00.000Z") });
  document.revision = 10;
  document.uml.classes.push({ id: CLIENTE_ID, name: "Cliente", visibility: "public", attributes: [{ id: NOMBRE_ID, name: "nombre", visibility: "private", type: primitiveType("string") }], operations: [] });
  document.layout.elements.push({ elementId: CLIENTE_ID, x: 0, y: 0 });
  return document;
}

describe("Creación de MentorProposal con PostgreSQL", () => {
  let prisma: PrismaService;
  let output: unknown;
  const model = { generateStructured: vi.fn(async (request: LocalTextModelRequest) => { void request; return output; }) };

  async function cleanup() {
    await prisma.project.deleteMany({ where: { id: PROJECT_ID } });
    await prisma.user.deleteMany({ where: { id: { in: Object.values(USERS).map((user) => user.id) } } });
  }

  function services() {
    const access = new ProjectAccessService(prisma);
    const store = new PrismaMentorProposalStore(prisma);
    const creation = new MentorProposalCreationService(access, new ProjectsPersistenceService(prisma), new LocalQwenMentorProposalIntentProvider(model), store);
    const application = new MentorProposalApplicationService(access, store, new ProjectOperationService(prisma, access), { broadcastAccepted: vi.fn() });
    return { creation, application };
  }

  async function snapshot() {
    const project = await prisma.project.findUniqueOrThrow({ where: { id: PROJECT_ID }, select: { revision: true, document: true } });
    return {
      revision: project.revision,
      document: project.document,
      receipts: await prisma.projectOperationReceipt.count({ where: { projectId: PROJECT_ID } }),
      proposals: await prisma.mentorProposal.count({ where: { projectId: PROJECT_ID } }),
    };
  }

  beforeAll(async () => {
    process.loadEnvFile(process.cwd().endsWith("backend") ? ".env" : "backend/.env");
    prisma = new PrismaService();
    await prisma.$connect();
  });

  beforeEach(async () => {
    output = INTENT;
    model.generateStructured.mockClear();
    await cleanup();
    await prisma.user.createMany({ data: Object.values(USERS).map((user) => ({ ...user, passwordHash: "test-hash-not-a-real-password" })) });
    await prisma.project.create({ data: { id: PROJECT_ID, ownerId: USERS.OWNER.id, name: "CU-2P-06 creación", document: JSON.parse(serializeProjectDocument(projectDocument())), revision: 10 } });
    await prisma.projectMembership.createMany({ data: [{ projectId: PROJECT_ID, userId: USERS.EDITOR.id, role: "EDITOR" }, { projectId: PROJECT_ID, userId: USERS.VIEWER.id, role: "VIEWER" }] });
  });

  afterAll(async () => {
    if (prisma) { await cleanup(); await prisma.$disconnect(); }
  });

  it("OWNER y EDITOR persisten exactamente una propuesta PENDING cada uno; revisión, documento y recibos no cambian", async () => {
    const before = await snapshot();
    const { creation } = services();

    for (const user of [USERS.OWNER, USERS.EDITOR]) {
      const result = await creation.create(PROJECT_ID, user, INSTRUCTION);
      if (!result.ok) throw new Error(`se esperaba una propuesta: ${result.error.code}`);
      const row = await prisma.mentorProposal.findUniqueOrThrow({ where: { id: result.proposal.id } });
      expect(row).toMatchObject({ projectId: PROJECT_ID, status: "PENDING", baseRevision: 10, authorUserId: user.id, authorEmail: user.email, instruction: INSTRUCTION, resolvedAt: null, resultingRevision: null });
      expect(row.command).toMatchObject({ type: "AddAttribute", classId: CLIENTE_ID, name: "teléfono", attributeType: { kind: "primitive", name: "string" } });
      expect(row.summary).toEqual([{ kind: "added", element: "attribute", label: "Cliente.teléfono: string" }]);
    }

    const after = await snapshot();
    expect(after).toEqual({ ...before, proposals: 2 });
    expect(after.receipts).toBe(0);
  });

  it("aplicar la propuesta creada usa el UUID del servidor y produce una sola revisión nueva", async () => {
    const { creation, application } = services();
    const created = await creation.create(PROJECT_ID, USERS.EDITOR, INSTRUCTION);
    if (!created.ok) throw new Error("se esperaba una propuesta");
    const attributeId = created.proposal.command.attributeId;

    const applied = await application.apply(PROJECT_ID, created.proposal.id, USERS.OWNER);
    expect(applied).toMatchObject({ ok: true, proposal: { status: "APPLIED", resultingRevision: 11 } });
    const project = await prisma.project.findUniqueOrThrow({ where: { id: PROJECT_ID } });
    expect(project.revision).toBe(11);
    expect((project.document as unknown as ProjectDocument).uml.classes[0]!.attributes.map((attribute) => [attribute.id, attribute.name])).toEqual([[NOMBRE_ID, "nombre"], [attributeId, "teléfono"]]);
    expect(await prisma.projectOperationReceipt.count({ where: { projectId: PROJECT_ID, operationId: created.proposal.id } })).toBe(1);
  });

  it.each([
    ["clase inexistente", { ...INTENT, className: "Proveedor" }, "ELEMENT_NOT_FOUND"],
    ["tipo desconocido", { ...INTENT, attributeType: "Dinero" }, "UNKNOWN_TYPE"],
    ["atributo duplicado", { ...INTENT, attributeName: "nombre" }, "INVALID_PROPOSAL"],
    ["identificador de la IA", { ...INTENT, classId: CLIENTE_ID }, "INVALID_PROPOSAL"],
    ["operación no permitida", { operation: "UNSUPPORTED" }, "UNSUPPORTED_OPERATION"],
  ])("%s → %s sin filas nuevas ni cambios", async (_case, invalidOutput, code) => {
    output = invalidOutput;
    const before = await snapshot();
    // The instruction names exactly what the output names, so each case fails for its own reason (not literal names).
    const fields = invalidOutput as Record<string, unknown>;
    const instruction = typeof fields.className === "string" && typeof fields.attributeName === "string" ? `Agrega el atributo ${fields.attributeName} de tipo ${String(fields.attributeType)} a ${fields.className}` : INSTRUCTION;

    const result = await services().creation.create(PROJECT_ID, USERS.OWNER, instruction);
    expect(result).toMatchObject({ ok: false, error: { code } });
    // The duplicate is rejected by the canonical validation in the preview, with its public diagnostic.
    if (_case === "atributo duplicado") expect(result.ok ? [] : result.error.diagnostics).not.toHaveLength(0);
    expect(await snapshot()).toEqual(before);
  });

  it("VIEWER (403), usuario externo (404) y proyecto inexistente (404) no invocan el modelo ni escriben", async () => {
    const before = await snapshot();
    const { creation } = services();

    await expect(creation.create(PROJECT_ID, USERS.VIEWER, INSTRUCTION)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(creation.create(PROJECT_ID, USERS.OUTSIDER, INSTRUCTION)).rejects.toBeInstanceOf(NotFoundException);
    await expect(creation.create(MISSING_PROJECT_ID, USERS.OWNER, INSTRUCTION)).rejects.toBeInstanceOf(NotFoundException);
    expect(model.generateStructured).not.toHaveBeenCalled();
    expect(await snapshot()).toEqual(before);
  });
});
