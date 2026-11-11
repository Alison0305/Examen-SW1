import { NotFoundException } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ASSISTANT_LOCAL_MODEL } from "../assistant/assistant.module";
import { PrismaModule } from "../prisma/prisma.module";
import { PrismaService } from "../prisma/prisma.service";
import { MENTOR_HISTORY_READER, type MentorHistoryPage, type MentorHistoryQuery } from "./mentor-history.contracts";
import { MentorHistoryModule } from "./mentor-history.module";
import { MentorHistoryService } from "./mentor-history.service";
import { PrismaMentorHistoryReader } from "./prisma-mentor-history.reader";

// CU-2P-07, fase 3: MentorHistoryService through the real MentorHistoryModule, the real ProjectAccessService and the
// development PostgreSQL. The only change to the graph is a pass-through around MENTOR_HISTORY_READER that records
// each call before running the real PrismaMentorHistoryReader, so "the reader was not called" is observable.
// Fixtures use their own ids (prefix d7035…) and e-mails, and are removed by id only. No local model is involved:
// ASSISTANT_MODEL_PATH is blank while the module is built and removed afterwards (Prisma Client reloads .env when it
// is constructed).

const uuid = (tail: string) => `d7035000-0000-4000-8000-${tail.padStart(12, "0")}`;
const USER = { OWNER: uuid("a1"), EDITOR: uuid("a2"), VIEWER: uuid("a3"), OUTSIDER: uuid("a4") } as const;
const EMAIL = { OWNER: "cu07-service-owner@example.test", EDITOR: "cu07-service-editor@example.test", VIEWER: "cu07-service-viewer@example.test", OUTSIDER: "cu07-service-outsider@example.test" } as const;
const PROJECT = { SHARED: uuid("b1"), OTHER: uuid("b2") } as const;
// Syntactically valid, never created.
const MISSING_PROJECT = uuid("dead");
const INTERACTION = { BY_OWNER: uuid("c1"), BY_EDITOR: uuid("c2"), OTHER: uuid("c3") } as const;

describe("MentorHistoryService con ProjectAccessService y PostgreSQL reales", () => {
  let prisma: PrismaService;
  let module: TestingModule;
  let service: MentorHistoryService;
  const readerCalls: Array<{ projectId: string; query: MentorHistoryQuery }> = [];
  const originalModelPath = process.env.ASSISTANT_MODEL_PATH;

  async function removeFixtures(): Promise<void> {
    await prisma.project.deleteMany({ where: { id: { in: Object.values(PROJECT) } } });
    await prisma.user.deleteMany({ where: { id: { in: Object.values(USER) } } });
  }

  beforeAll(async () => {
    process.loadEnvFile(process.cwd().endsWith("backend") ? ".env" : "backend/.env");
    // Blank before compiling: since task 8.1 AssistantModule is reachable through MentorProposalsModule, so the graph
    // must be built without a configured model (Prisma's .env reload does not override an existing variable).
    process.env.ASSISTANT_MODEL_PATH = "";

    module = await Test.createTestingModule({ imports: [PrismaModule, MentorHistoryModule] })
      .overrideProvider(MENTOR_HISTORY_READER).useFactory({
        factory: (real: PrismaMentorHistoryReader) => ({
          page: (projectId: string, query: MentorHistoryQuery): Promise<MentorHistoryPage> => {
            readerCalls.push({ projectId, query });
            return real.page(projectId, query);
          },
        }),
        inject: [PrismaMentorHistoryReader],
      })
      .compile();
    prisma = module.get(PrismaService);
    service = module.get(MentorHistoryService, { strict: false });
    delete process.env.ASSISTANT_MODEL_PATH;

    await removeFixtures();
    await prisma.user.createMany({ data: (Object.keys(USER) as Array<keyof typeof USER>).map((key) => ({ id: USER[key], email: EMAIL[key], passwordHash: "test-hash-not-a-real-password" })) });
    await prisma.project.createMany({ data: [
      { id: PROJECT.SHARED, ownerId: USER.OWNER, name: "CU-2P-07 servicio compartido", document: {} },
      { id: PROJECT.OTHER, ownerId: USER.OUTSIDER, name: "CU-2P-07 servicio ajeno", document: {} },
    ] });
    await prisma.projectMembership.createMany({ data: [
      { projectId: PROJECT.SHARED, userId: USER.EDITOR, role: "EDITOR" },
      { projectId: PROJECT.SHARED, userId: USER.VIEWER, role: "VIEWER" },
    ] });
    await prisma.mentorInteraction.createMany({ data: [
      { id: INTERACTION.BY_OWNER, projectId: PROJECT.SHARED, userId: USER.OWNER, authorEmail: EMAIL.OWNER, accessRole: "OWNER", occurredAt: new Date("2026-11-10T09:00:00.000Z"), projectRevision: 1, question: "Q1 del propietario", answer: "R1", grounded: true },
      { id: INTERACTION.BY_EDITOR, projectId: PROJECT.SHARED, userId: USER.EDITOR, authorEmail: EMAIL.EDITOR, accessRole: "EDITOR", occurredAt: new Date("2026-11-10T09:05:00.000Z"), projectRevision: 1, question: "Q2 del editor", answer: "R2", grounded: true },
      { id: INTERACTION.OTHER, projectId: PROJECT.OTHER, userId: USER.OUTSIDER, authorEmail: EMAIL.OUTSIDER, accessRole: "OWNER", occurredAt: new Date("2026-11-10T09:10:00.000Z"), projectRevision: 1, question: "SECRET-OTHER", answer: "Privado", grounded: true },
    ] });
  });

  afterAll(async () => {
    if (originalModelPath === undefined) delete process.env.ASSISTANT_MODEL_PATH;
    else process.env.ASSISTANT_MODEL_PATH = originalModelPath;
    if (!prisma) return;
    await removeFixtures();
    await module.close();
  });

  beforeEach(() => {
    readerCalls.length = 0;
  });

  const sharedPage: MentorHistoryPage = {
    items: [
      { id: INTERACTION.BY_EDITOR, author: { email: EMAIL.EDITOR }, question: "Q2 del editor", answer: "R2", occurredAt: "2026-11-10T09:05:00.000Z" },
      { id: INTERACTION.BY_OWNER, author: { email: EMAIL.OWNER }, question: "Q1 del propietario", answer: "R1", occurredAt: "2026-11-10T09:00:00.000Z" },
    ],
    nextCursor: null,
  };

  it.each(["OWNER", "EDITOR", "VIEWER"] as const)("%s ve el historial compartido completo, con el autor de cada interacción", async (role) => {
    await expect(service.list(PROJECT.SHARED, USER[role], {})).resolves.toEqual({ ok: true, page: sharedPage });
    expect(readerCalls).toEqual([{ projectId: PROJECT.SHARED, query: { limit: 20 } }]);
  });

  it("VIEWER ve la interacción que registró OWNER y la que registró EDITOR (historial compartido, no individual)", async () => {
    const result = await service.list(PROJECT.SHARED, USER.VIEWER, { q: "propietario" });

    expect(result).toEqual({ ok: true, page: { items: [sharedPage.items[1]], nextCursor: null } });
  });

  it("un usuario externo recibe la NotFoundException de requireView y no se lee el historial", async () => {
    await expect(service.list(PROJECT.SHARED, USER.OUTSIDER, {})).rejects.toBeInstanceOf(NotFoundException);
    expect(readerCalls).toEqual([]);
  });

  it("un usuario externo con una consulta malformada también recibe 404, no el error de consulta", async () => {
    await expect(service.list(PROJECT.SHARED, USER.OUTSIDER, { limit: "abc", userId: USER.OWNER })).rejects.toBeInstanceOf(NotFoundException);
    expect(readerCalls).toEqual([]);
  });

  it("un proyecto inexistente con UUID válido responde con la misma NotFoundException, sin lectura", async () => {
    await expect(service.list(MISSING_PROJECT, USER.OWNER, {})).rejects.toBeInstanceOf(NotFoundException);
    expect(readerCalls).toEqual([]);
  });

  it("el usuario externo solo ve su propio proyecto, y el compartido nunca contiene sus interacciones", async () => {
    const own = await service.list(PROJECT.OTHER, USER.OUTSIDER, {});
    const shared = await service.list(PROJECT.SHARED, USER.OWNER, { q: "SECRET-OTHER" });

    expect(own.ok && own.page.items.map((item) => item.id)).toEqual([INTERACTION.OTHER]);
    expect(shared).toEqual({ ok: true, page: { items: [], nextCursor: null } });
  });

  it("con acceso y una consulta inválida devuelve el error tipado y no llama al reader", async () => {
    await expect(service.list(PROJECT.SHARED, USER.VIEWER, { limit: "0" })).resolves.toEqual({ ok: false, error: expect.objectContaining({ code: "INVALID_LIMIT" }) });
    expect(readerCalls).toEqual([]);
  });

  it("pagina con el cursor devuelto por el propio servicio", async () => {
    const first = await service.list(PROJECT.SHARED, USER.EDITOR, { limit: "1" });
    expect(first.ok && first.page.items.map((item) => item.id)).toEqual([INTERACTION.BY_EDITOR]);
    const cursor = first.ok ? first.page.nextCursor : null;
    expect(cursor).toEqual(expect.any(String));

    const second = await service.list(PROJECT.SHARED, USER.EDITOR, { limit: "1", cursor });
    expect(second).toEqual({ ok: true, page: { items: [sharedPage.items[1]], nextCursor: null } });
  });

  // Since task 8.1 AssistantModule is reachable through MentorProposalsModule; the reconciled requirement is that the
  // history works without a configured model and never creates or calls one.
  it("funciona sin ASSISTANT_MODEL_PATH: el modelo local no se crea (undefined)", async () => {
    expect(process.env.ASSISTANT_MODEL_PATH).toBeUndefined();
    expect(module.get(ASSISTANT_LOCAL_MODEL, { strict: false })).toBeUndefined();
    await expect(service.list(PROJECT.SHARED, USER.VIEWER, {})).resolves.toEqual({ ok: true, page: sharedPage });
    expect(process.env.ASSISTANT_MODEL_PATH).toBeUndefined();
  });
});
