import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaService } from "../prisma/prisma.service";
import type { StoredProjectChatMessage } from "./project-chat.contracts";
import { PrismaProjectChatStore } from "./prisma-project-chat.store";

// CU-2P-08 against real PostgreSQL (same convention as the other integrations: backend/.env, fixtures removed by id).
const USER = { id: "d8111111-1111-4111-8111-111111111111", email: "chat-member@example.test" };
const PROJECT = "d8222222-2222-4222-8222-111111111111";
const OTHER_PROJECT = "d8222222-2222-4222-8222-222222222222";
const id = (n: number) => `d8333333-3333-4333-8333-${String(n).padStart(12, "0")}`;
const at = (second: number) => new Date(Date.UTC(2026, 10, 11, 12, 0, second));

const userMessage = (n: number, second: number, projectId = PROJECT): StoredProjectChatMessage => ({
  id: id(n), projectId, kind: "USER", authorUserId: USER.id, authorEmail: USER.email, body: `mensaje ${n}`, mentionsMentor: false, replyToId: null, proposalId: null, createdAt: at(second),
});

describe("ProjectChatMessage PostgreSQL persistence", () => {
  let prisma: PrismaService;
  let store: PrismaProjectChatStore;

  async function cleanup() {
    await prisma.project.deleteMany({ where: { id: { in: [PROJECT, OTHER_PROJECT] } } });
    await prisma.user.deleteMany({ where: { id: USER.id } });
  }

  beforeAll(async () => {
    process.loadEnvFile(process.cwd().endsWith("backend") ? ".env" : "backend/.env");
    prisma = new PrismaService();
    await prisma.$connect();
    store = new PrismaProjectChatStore(prisma);
  });

  beforeEach(async () => {
    await cleanup();
    await prisma.user.create({ data: { id: USER.id, email: USER.email, passwordHash: "test-hash-not-a-real-password" } });
    await prisma.project.createMany({ data: [{ id: PROJECT, ownerId: USER.id, name: "Chat", document: {} }, { id: OTHER_PROJECT, ownerId: USER.id, name: "Otro", document: {} }] });
  });

  afterAll(async () => {
    if (prisma) { await cleanup(); await prisma.$disconnect(); }
  });

  it("CHAT-DB-01 pagina keyset más reciente primero, con empates de fecha resueltos por id y sin otros proyectos", async () => {
    for (const message of [userMessage(1, 1), userMessage(2, 2), userMessage(3, 2), userMessage(4, 3), userMessage(9, 4, OTHER_PROJECT)]) await store.create(message);

    const first = await store.list(PROJECT, 2);
    expect(first.map((message) => message.id)).toEqual([id(4), id(3)]);
    const last = first.at(-1)!;
    const second = await store.list(PROJECT, 5, { createdAt: last.createdAt, id: last.id });
    expect(second.map((message) => message.id)).toEqual([id(2), id(1)]);
  });

  it("CHAT-DB-02 respuesta del Mentor enlazada, y el CHECK impide autor en MENTOR o un USER sin autor", async () => {
    await store.create(userMessage(1, 1));
    const reply = await store.create({ ...userMessage(2, 2), kind: "MENTOR", authorUserId: null, authorEmail: null, replyToId: id(1), body: "respuesta" });
    expect(reply).toMatchObject({ kind: "MENTOR", authorUserId: null, replyToId: id(1) });

    await expect(store.create({ ...userMessage(3, 3), kind: "MENTOR" })).rejects.toThrow();
    await expect(store.create({ ...userMessage(4, 4), authorUserId: null, authorEmail: null })).rejects.toThrow();
  });

  it("CHAT-DB-03 borrar el proyecto elimina sus mensajes; borrar el mensaje original deja la respuesta sin enlace", async () => {
    await store.create(userMessage(1, 1));
    await store.create({ ...userMessage(2, 2), kind: "NOTICE", authorUserId: null, authorEmail: null, replyToId: id(1), body: "aviso" });
    await prisma.projectChatMessage.delete({ where: { id: id(1) } });
    expect((await prisma.projectChatMessage.findUniqueOrThrow({ where: { id: id(2) } })).replyToId).toBeNull();

    await prisma.project.delete({ where: { id: PROJECT } });
    expect(await prisma.projectChatMessage.count({ where: { projectId: PROJECT } })).toBe(0);
  });
});
