import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaService } from "../prisma/prisma.service";
import type { NewMentorProposal } from "./mentor-proposal-store";
import { PrismaMentorProposalStore } from "./prisma-mentor-proposal.store";

const AUTHOR_ID = "d6111111-1111-4111-8111-111111111111";
const RESOLVER_ID = "d6111111-1111-4111-8111-222222222222";
const PROJECT_ID = "d6222222-2222-4222-8222-111111111111";
const OTHER_PROJECT_ID = "d6222222-2222-4222-8222-222222222222";
const PROPOSAL_ID = "d6333333-3333-4333-8333-111111111111";
const CLASS_ID = "d6444444-4444-4444-8444-111111111111";
const ATTRIBUTE_ID = "d6444444-4444-4444-8444-222222222222";
const CREATED_AT = new Date("2026-11-10T12:00:00.000Z");
const RESOLVED_AT = new Date("2026-11-10T12:05:00.000Z");

const proposal = (overrides: Partial<NewMentorProposal> = {}): NewMentorProposal => ({
  id: PROPOSAL_ID,
  projectId: PROJECT_ID,
  authorUserId: AUTHOR_ID,
  authorEmail: "proposal-author@example.test",
  instruction: "Agrega el atributo teléfono de tipo String a Cliente",
  baseRevision: 10,
  command: { type: "AddAttribute", classId: CLASS_ID, attributeId: ATTRIBUTE_ID, name: "teléfono", attributeType: { kind: "primitive", name: "string" }, multiplicity: { lower: 0, upper: "unbounded" } },
  summary: [{ kind: "added", element: "attribute", label: "Cliente.teléfono: string [0..*]" }],
  createdAt: CREATED_AT,
  ...overrides,
});

describe("MentorProposal PostgreSQL persistence", () => {
  let prisma: PrismaService;
  let store: PrismaMentorProposalStore;

  async function cleanup() {
    await prisma.project.deleteMany({ where: { id: { in: [PROJECT_ID, OTHER_PROJECT_ID] } } });
    await prisma.user.deleteMany({ where: { id: { in: [AUTHOR_ID, RESOLVER_ID] } } });
  }

  beforeAll(async () => {
    process.loadEnvFile(process.cwd().endsWith("backend") ? ".env" : "backend/.env");
    prisma = new PrismaService();
    await prisma.$connect();
    store = new PrismaMentorProposalStore(prisma);
  });

  beforeEach(async () => {
    await cleanup();
    await prisma.user.createMany({ data: [
      { id: AUTHOR_ID, email: "proposal-author@example.test", passwordHash: "test-hash-not-a-real-password" },
      { id: RESOLVER_ID, email: "proposal-resolver@example.test", passwordHash: "test-hash-not-a-real-password" },
    ] });
    await prisma.project.createMany({ data: [
      { id: PROJECT_ID, ownerId: AUTHOR_ID, name: "Proposals", document: {}, revision: 10 },
      { id: OTHER_PROJECT_ID, ownerId: AUTHOR_ID, name: "Other", document: {}, revision: 1 },
    ] });
  });

  afterAll(async () => {
    if (prisma) { await cleanup(); await prisma.$disconnect(); }
  });

  it("DB-01 crea una propuesta PENDING sin resolución", async () => {
    const stored = await store.create(proposal());
    expect(stored).toEqual({ ...proposal(), status: "PENDING" });
    const row = await prisma.mentorProposal.findUniqueOrThrow({ where: { id: PROPOSAL_ID } });
    expect(row).toMatchObject({ status: "PENDING", resolvedAt: null, resolvedByUserId: null, resultingRevision: null });
  });

  it("DB-02 encuentra por projectId + id desde una nueva instancia", async () => {
    await store.create(proposal());
    const fresh = new PrismaService();
    await fresh.$connect();
    expect(await new PrismaMentorProposalStore(fresh).findByProjectAndId(PROJECT_ID, PROPOSAL_ID)).toEqual({ ...proposal(), status: "PENDING" });
    await fresh.$disconnect();
  });

  it("DB-03 el mismo id no es visible bajo otro projectId, ni para leer ni para transicionar", async () => {
    await store.create(proposal());
    expect(await store.findByProjectAndId(OTHER_PROJECT_ID, PROPOSAL_ID)).toBeUndefined();
    expect(await store.reject({ projectId: OTHER_PROJECT_ID, proposalId: PROPOSAL_ID, resolvedByUserId: RESOLVER_ID, resolvedAt: RESOLVED_AT })).toEqual({ ok: false, reason: "NOT_FOUND" });
    expect((await store.findByProjectAndId(PROJECT_ID, PROPOSAL_ID))?.status).toBe("PENDING");
  });

  it("DB-04 rechaza una propuesta PENDING", async () => {
    await store.create(proposal());
    const result = await store.reject({ projectId: PROJECT_ID, proposalId: PROPOSAL_ID, resolvedByUserId: RESOLVER_ID, resolvedAt: RESOLVED_AT });
    expect(result).toEqual({ ok: true, proposal: { ...proposal(), status: "REJECTED", resolvedAt: RESOLVED_AT, resolvedByUserId: RESOLVER_ID } });
  });

  it("DB-05 una propuesta rechazada no se marca aplicada", async () => {
    await store.create(proposal());
    await store.reject({ projectId: PROJECT_ID, proposalId: PROPOSAL_ID, resolvedByUserId: RESOLVER_ID, resolvedAt: RESOLVED_AT });
    expect(await store.markApplied({ projectId: PROJECT_ID, proposalId: PROPOSAL_ID, resolvedByUserId: RESOLVER_ID, resolvedAt: RESOLVED_AT, resultingRevision: 11 })).toEqual({ ok: false, reason: "PROPOSAL_REJECTED" });
  });

  it("DB-06 marca aplicada una propuesta PENDING", async () => {
    await store.create(proposal());
    const result = await store.markApplied({ projectId: PROJECT_ID, proposalId: PROPOSAL_ID, resolvedByUserId: RESOLVER_ID, resolvedAt: RESOLVED_AT, resultingRevision: 11 });
    expect(result).toEqual({ ok: true, proposal: { ...proposal(), status: "APPLIED", resolvedAt: RESOLVED_AT, resolvedByUserId: RESOLVER_ID, resultingRevision: 11 } });
  });

  it("DB-07 una propuesta aplicada no se rechaza", async () => {
    await store.create(proposal());
    await store.markApplied({ projectId: PROJECT_ID, proposalId: PROPOSAL_ID, resolvedByUserId: RESOLVER_ID, resolvedAt: RESOLVED_AT, resultingRevision: 11 });
    expect(await store.reject({ projectId: PROJECT_ID, proposalId: PROPOSAL_ID, resolvedByUserId: RESOLVER_ID, resolvedAt: RESOLVED_AT })).toEqual({ ok: false, reason: "PROPOSAL_ALREADY_APPLIED" });
  });

  it("DB-08 transiciones concurrentes: exactamente una gana", async () => {
    await store.create(proposal());
    const resolution = { projectId: PROJECT_ID, proposalId: PROPOSAL_ID, resolvedByUserId: RESOLVER_ID, resolvedAt: RESOLVED_AT };
    const results = await Promise.all([
      store.markApplied({ ...resolution, resultingRevision: 11 }),
      store.markApplied({ ...resolution, resultingRevision: 11 }),
      store.reject(resolution),
    ]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    const final = await store.findByProjectAndId(PROJECT_ID, PROPOSAL_ID);
    const winner = results.find((result) => result.ok);
    expect(winner?.ok && final?.status).toBe(winner?.ok && winner.proposal.status);
  });

  it("DB-09 y DB-10 command y summary hacen round-trip exacto", async () => {
    await store.create(proposal());
    const row = await prisma.mentorProposal.findUniqueOrThrow({ where: { id: PROPOSAL_ID } });
    expect(row.command).toEqual(proposal().command);
    expect(row.summary).toEqual(proposal().summary);
    const stored = await store.findByProjectAndId(PROJECT_ID, PROPOSAL_ID);
    expect(stored?.command).toEqual(proposal().command);
    expect(stored?.summary).toEqual(proposal().summary);
  });

  it("DB-11 conserva baseRevision aunque el proyecto avance", async () => {
    await store.create(proposal());
    await prisma.project.update({ where: { id: PROJECT_ID }, data: { revision: 15 } });
    expect((await store.findByProjectAndId(PROJECT_ID, PROPOSAL_ID))?.baseRevision).toBe(10);
  });

  it("DB-12 resultingRevision solo existe en APPLIED y la base rechaza estados incoherentes", async () => {
    await store.create(proposal());
    await expect(prisma.$executeRaw`UPDATE "MentorProposal" SET "resultingRevision" = 11 WHERE "id" = ${PROPOSAL_ID}::uuid`).rejects.toThrow();
    await expect(prisma.$executeRaw`UPDATE "MentorProposal" SET "status" = 'REJECTED' WHERE "id" = ${PROPOSAL_ID}::uuid`).rejects.toThrow();
    await store.reject({ projectId: PROJECT_ID, proposalId: PROPOSAL_ID, resolvedByUserId: RESOLVER_ID, resolvedAt: RESOLVED_AT });
    const row = await prisma.mentorProposal.findUniqueOrThrow({ where: { id: PROPOSAL_ID } });
    expect(row.resultingRevision).toBeNull();
  });

  it("DB-13 borrar el proyecto elimina sus propuestas; un usuario con propuestas no puede borrarse", async () => {
    await store.create(proposal());
    await store.reject({ projectId: PROJECT_ID, proposalId: PROPOSAL_ID, resolvedByUserId: RESOLVER_ID, resolvedAt: RESOLVED_AT });
    await expect(prisma.user.delete({ where: { id: RESOLVER_ID } })).rejects.toThrow();

    await prisma.project.delete({ where: { id: PROJECT_ID } });
    expect(await prisma.mentorProposal.count({ where: { id: PROPOSAL_ID } })).toBe(0);
  });
});
