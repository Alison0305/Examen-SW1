import { createProjectDocument, primitiveType, serializeProjectDocument, type ProjectDocument } from "@examen-sw1/uml-core";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaService } from "../prisma/prisma.service";
import { ProjectAccessService } from "../projects/project-access.service";
import { ProjectOperationService } from "../realtime/project-operation.service";
import { MentorProposalApplicationService } from "./mentor-proposal-application.service";
import { previewMentorProposal } from "./mentor-proposal-preview";
import { resolveMentorProposal } from "./mentor-proposal-resolver";
import { buildNewMentorProposal } from "./mentor-proposal-store";
import { PrismaMentorProposalStore } from "./prisma-mentor-proposal.store";

const OWNER = { id: "d7111111-1111-4111-8111-111111111111", email: "apply-owner@example.test" };
const PROJECT_ID = "d7222222-2222-4222-8222-111111111111";
const PROPOSAL_ID = "d7333333-3333-4333-8333-111111111111";
const CLIENTE_ID = "d7444444-4444-4444-8444-111111111111";
const ATTRIBUTE_ID = "d7444444-4444-4444-8444-222222222222";

function projectDocument(): ProjectDocument {
  const document = createProjectDocument({ id: "d7555555-5555-4555-8555-111111111111", now: new Date("2026-11-10T00:00:00.000Z") });
  document.revision = 10;
  document.uml.classes.push({ id: CLIENTE_ID, name: "Cliente", visibility: "public", attributes: [{ id: "d7444444-4444-4444-8444-333333333333", name: "nombre", visibility: "private", type: primitiveType("string") }], operations: [] });
  document.layout.elements.push({ elementId: CLIENTE_ID, x: 0, y: 0 });
  return document;
}

describe("MentorProposal application through ProjectOperationService (PostgreSQL)", () => {
  let prisma: PrismaService;

  async function cleanup() {
    await prisma.project.deleteMany({ where: { id: PROJECT_ID } });
    await prisma.user.deleteMany({ where: { id: OWNER.id } });
  }

  beforeAll(async () => {
    process.loadEnvFile(process.cwd().endsWith("backend") ? ".env" : "backend/.env");
    prisma = new PrismaService();
    await prisma.$connect();
  });

  beforeEach(async () => {
    await cleanup();
    await prisma.user.create({ data: { id: OWNER.id, email: OWNER.email, passwordHash: "test-hash-not-a-real-password" } });
    await prisma.project.create({ data: { id: PROJECT_ID, ownerId: OWNER.id, name: "Apply", document: JSON.parse(serializeProjectDocument(projectDocument())), revision: 10 } });
  });

  afterAll(async () => {
    if (prisma) { await cleanup(); await prisma.$disconnect(); }
  });

  async function setup() {
    const access = new ProjectAccessService(prisma);
    const operations = new ProjectOperationService(prisma, access);
    const store = new PrismaMentorProposalStore(prisma);
    const broadcaster = { broadcastAccepted: vi.fn() };
    const service = new MentorProposalApplicationService(access, store, operations, broadcaster);
    const document = projectDocument();
    const resolved = resolveMentorProposal(document, { operation: "ADD_ATTRIBUTE", className: "Cliente", attributeName: "teléfono", attributeType: "String" }, { uuidFactory: () => ATTRIBUTE_ID });
    if (!resolved.ok) throw new Error("se esperaba una resolución correcta");
    const built = buildNewMentorProposal({ projectId: PROJECT_ID, author: { userId: OWNER.id, email: OWNER.email }, instruction: "Agrega el atributo teléfono de tipo String a Cliente", command: resolved.command, preview: previewMentorProposal(document, resolved.command) }, { uuidFactory: () => PROPOSAL_ID });
    if (!built.ok) throw new Error("se esperaba una propuesta");
    await store.create(built.proposal);
    return { service, broadcaster };
  }

  it("aplica una vez, registra el recibo con operationId = proposal.id y marca APPLIED con la revisión resultante", async () => {
    const { service, broadcaster } = await setup();

    const result = await service.apply(PROJECT_ID, PROPOSAL_ID, OWNER);
    const again = await service.apply(PROJECT_ID, PROPOSAL_ID, OWNER);

    expect(result).toMatchObject({ ok: true, reconciled: false, proposal: { status: "APPLIED", resultingRevision: 11, resolvedByUserId: OWNER.id } });
    expect(again).toEqual({ ok: false, code: "PROPOSAL_ALREADY_APPLIED", diagnostics: [] });
    const project = await prisma.project.findUniqueOrThrow({ where: { id: PROJECT_ID } });
    expect(project.revision).toBe(11);
    expect((project.document as unknown as ProjectDocument).uml.classes[0]!.attributes.map((attribute) => attribute.id)).toContain(ATTRIBUTE_ID);
    expect(await prisma.projectOperationReceipt.count({ where: { projectId: PROJECT_ID, operationId: PROPOSAL_ID } })).toBe(1);
    expect(broadcaster.broadcastAccepted).toHaveBeenCalledTimes(1);
  });

  it("una propuesta obsoleta no modifica el proyecto ni crea recibo", async () => {
    const { service } = await setup();
    await prisma.project.update({ where: { id: PROJECT_ID }, data: { revision: 11 } });

    expect(await service.apply(PROJECT_ID, PROPOSAL_ID, OWNER)).toEqual({ ok: false, code: "STALE_PROPOSAL", diagnostics: [] });
    expect(await prisma.projectOperationReceipt.count({ where: { projectId: PROJECT_ID } })).toBe(0);
    expect((await prisma.mentorProposal.findUniqueOrThrow({ where: { id: PROPOSAL_ID } })).status).toBe("PENDING");
  });

  it("dos aplicaciones concurrentes producen una sola mutación", async () => {
    const { service } = await setup();
    const results = await Promise.all([service.apply(PROJECT_ID, PROPOSAL_ID, OWNER), service.apply(PROJECT_ID, PROPOSAL_ID, OWNER)]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect((await prisma.project.findUniqueOrThrow({ where: { id: PROJECT_ID } })).revision).toBe(11);
  });
});
