import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ASSISTANT_LOCAL_MODEL } from "../assistant/assistant.module";
import { createApp } from "../create-app";
import { PrismaService } from "../prisma/prisma.service";

// CU-2P-07, fase 4: GET /projects/:id/mentor/history through createApp() (the real AppModule, global pipes, Fastify),
// real JWT obtained from /auth/register + /auth/login, the real ProjectAccessService and the development PostgreSQL.
// Same convention as projects.controller.integration.test.ts. Projects, memberships and interactions are direct
// fixtures (the full MentorService.query → recorder → GET flow is fase 5). Fixtures use their own e-mails and ids
// (prefix d7035…f) and are removed by owner/e-mail only. ASSISTANT_MODEL_PATH is blanked: no local model is involved.

const password = "password-123";
const EMAIL = { OWNER: "cu07-http-pg-owner@example.test", VIEWER: "cu07-http-pg-viewer@example.test", OUTSIDER: "cu07-http-pg-outsider@example.test" } as const;
const uuid = (tail: string) => `d7035000-0000-4000-8000-f${tail.padStart(11, "0")}`;
const PROJECT = { A: uuid("a"), B: uuid("b"), EMPTY: uuid("e") } as const;
const MISSING_PROJECT = uuid("dead");
const INTERACTION = { Q1: uuid("1"), Q2: uuid("2"), Q3: uuid("3"), SECRET_B: uuid("9") } as const;

const PUBLIC_ITEM_KEYS = ["answer", "author", "id", "occurredAt", "question"];
const FORBIDDEN_FIELDS = ["userId", "projectId", "accessRole", "projectRevision", "grounded", "createdAt", "systemPrompt", "userPrompt"];

describe("GET /projects/:id/mentor/history con createApp, JWT real y PostgreSQL", () => {
  let app: Awaited<ReturnType<typeof createApp>>;
  let prisma: PrismaService;
  const id = { OWNER: "", VIEWER: "", OUTSIDER: "" };
  const token = { OWNER: "", VIEWER: "", OUTSIDER: "" };
  const originalModelPath = process.env.ASSISTANT_MODEL_PATH;

  const get = (path: string, bearer?: string) => {
    const pending = request(app.getHttpServer()).get(path);
    return bearer ? pending.set("Authorization", `Bearer ${bearer}`) : pending;
  };
  const historyOf = (projectId: string, query = "") => `/projects/${projectId}/mentor/history${query}`;

  async function cleanup(): Promise<void> {
    const users = await prisma.user.findMany({ where: { email: { in: Object.values(EMAIL) } }, select: { id: true } });
    const ids = users.map((user) => user.id);
    // Cascades to memberships and interactions of the fixture projects.
    await prisma.project.deleteMany({ where: { OR: [{ id: { in: Object.values(PROJECT) } }, { ownerId: { in: ids } }] } });
    if (ids.length > 0) await prisma.user.deleteMany({ where: { id: { in: ids } } });
  }

  beforeAll(async () => {
    process.loadEnvFile(".env");
    process.env.JWT_SECRET = "mentor-history-integration-test-secret-that-is-long-enough";
    process.env.JWT_EXPIRES_IN = "1h";
    // Empty rather than deleted: getAssistantConfig() treats "" as not configured, and no later .env reload (Prisma
    // Client loads .env on construction) overrides a variable that already exists.
    process.env.ASSISTANT_MODEL_PATH = "";
    app = await createApp();
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    prisma = app.get(PrismaService);
    await cleanup();

    for (const role of ["OWNER", "VIEWER", "OUTSIDER"] as const) {
      const registered = await request(app.getHttpServer()).post("/auth/register").send({ email: EMAIL[role], password }).expect(201);
      id[role] = registered.body.id;
      const login = await request(app.getHttpServer()).post("/auth/login").send({ email: EMAIL[role], password }).expect(201);
      token[role] = login.body.accessToken;
    }

    await prisma.project.createMany({ data: [
      { id: PROJECT.A, ownerId: id.OWNER, name: "CU-2P-07 HTTP A", document: {} },
      { id: PROJECT.B, ownerId: id.OUTSIDER, name: "CU-2P-07 HTTP B", document: {} },
      { id: PROJECT.EMPTY, ownerId: id.OWNER, name: "CU-2P-07 HTTP vacío", document: {} },
    ] });
    await prisma.projectMembership.create({ data: { projectId: PROJECT.A, userId: id.VIEWER, role: "VIEWER" } });
    const interaction = (interactionId: string, projectId: string, author: keyof typeof EMAIL, minute: number, question: string) => ({
      id: interactionId, projectId, userId: id[author], authorEmail: EMAIL[author], accessRole: author === "VIEWER" ? "VIEWER" : "OWNER",
      occurredAt: new Date(Date.UTC(2026, 10, 10, 9, minute)), projectRevision: 4, question, answer: `Respuesta a ${question}`, grounded: true,
    });
    await prisma.mentorInteraction.createMany({ data: [
      interaction(INTERACTION.Q1, PROJECT.A, "OWNER", 0, "Q1 del propietario sobre Cliente"),
      interaction(INTERACTION.Q2, PROJECT.A, "VIEWER", 5, "Q2 del lector sobre UML"),
      interaction(INTERACTION.Q3, PROJECT.A, "OWNER", 10, "Q3 del propietario sobre Pedido"),
      interaction(INTERACTION.SECRET_B, PROJECT.B, "OUTSIDER", 15, "SECRET-B dato privado"),
    ] });
  });

  afterAll(async () => {
    if (originalModelPath === undefined) delete process.env.ASSISTANT_MODEL_PATH;
    else process.env.ASSISTANT_MODEL_PATH = originalModelPath;
    if (prisma) await cleanup();
    await app?.close();
  });

  it("200 con historial vacío", async () => {
    const response = await get(historyOf(PROJECT.EMPTY), token.OWNER).expect(200);

    expect(response.body).toEqual({ items: [], nextCursor: null });
  });

  it("200 con elementos, más recientes primero y solo con los campos públicos", async () => {
    const response = await get(historyOf(PROJECT.A), token.OWNER).expect(200);

    expect(Object.keys(response.body).sort()).toEqual(["items", "nextCursor"]);
    expect(response.body.items.map((item: { id: string }) => item.id)).toEqual([INTERACTION.Q3, INTERACTION.Q2, INTERACTION.Q1]);
    for (const item of response.body.items) {
      expect(Object.keys(item).sort()).toEqual(PUBLIC_ITEM_KEYS);
      expect(Object.keys(item.author)).toEqual(["email"]);
    }
    expect(response.body.items[1]).toEqual({ id: INTERACTION.Q2, author: { email: EMAIL.VIEWER }, question: "Q2 del lector sobre UML", answer: "Respuesta a Q2 del lector sobre UML", occurredAt: "2026-11-10T09:05:00.000Z" });
    for (const field of FORBIDDEN_FIELDS) expect(response.text).not.toContain(`"${field}"`);
    expect(response.text).not.toContain(id.OWNER);
    expect(response.text).not.toContain(id.VIEWER);
  });

  it("200 con limit y cursor: recorre las tres interacciones en dos páginas sin duplicados", async () => {
    const first = await get(historyOf(PROJECT.A, "?limit=2"), token.VIEWER).expect(200);
    expect(first.body.items.map((item: { id: string }) => item.id)).toEqual([INTERACTION.Q3, INTERACTION.Q2]);
    expect(first.body.nextCursor).toEqual(expect.any(String));

    const second = await get(historyOf(PROJECT.A, `?limit=2&cursor=${encodeURIComponent(first.body.nextCursor)}`), token.VIEWER).expect(200);
    expect(second.body).toEqual({ items: [expect.objectContaining({ id: INTERACTION.Q1 })], nextCursor: null });
  });

  it("200 con búsqueda válida, sin distinguir mayúsculas y solo dentro del proyecto", async () => {
    const found = await get(historyOf(PROJECT.A, "?q=%20propietario%20"), token.OWNER).expect(200);
    const foreign = await get(historyOf(PROJECT.A, "?q=SECRET-B"), token.OWNER).expect(200);
    const upper = await get(historyOf(PROJECT.A, "?q=uml"), token.OWNER).expect(200);

    expect(found.body.items.map((item: { id: string }) => item.id)).toEqual([INTERACTION.Q3, INTERACTION.Q1]);
    expect(foreign.body).toEqual({ items: [], nextCursor: null });
    expect(upper.body.items.map((item: { id: string }) => item.id)).toEqual([INTERACTION.Q2]);
  });

  it("historial compartido: VIEWER ve las interacciones registradas por OWNER, con su autor", async () => {
    const response = await get(historyOf(PROJECT.A), token.VIEWER).expect(200);

    expect(response.body.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: INTERACTION.Q1, author: { email: EMAIL.OWNER } }),
      expect.objectContaining({ id: INTERACTION.Q3, author: { email: EMAIL.OWNER } }),
    ]));
  });

  it("400 con UUID de proyecto inválido", async () => {
    await get("/projects/no-es-un-uuid/mentor/history", token.OWNER).expect(400);
  });

  it.each([
    ["limit=0", "INVALID_LIMIT"],
    ["limit=51", "INVALID_LIMIT"],
    ["limit=1.5", "INVALID_LIMIT"],
    ["limit=10&limit=20", "INVALID_LIMIT"],
    ["q=", "INVALID_SEARCH"],
    [`q=${"a".repeat(201)}`, "INVALID_SEARCH"],
    ["q=uml&q=prisma", "INVALID_SEARCH"],
    ["cursor=no-es-un-cursor", "INVALID_CURSOR"],
    ["userId=x", "UNKNOWN_PARAMETER"],
  ])("400 con ?%s → %s a través del ValidationPipe global de createApp", async (query, code) => {
    const response = await get(historyOf(PROJECT.A, `?${query}`), token.OWNER).expect(400);

    expect(response.body).toEqual(expect.objectContaining({ statusCode: 400, error: "Bad Request", code }));
  });

  it("401 sin JWT", async () => {
    await get(historyOf(PROJECT.A)).expect(401);
  });

  it("404 para un usuario externo y para un proyecto inexistente, con el mismo cuerpo", async () => {
    const outsider = await get(historyOf(PROJECT.A), token.OUTSIDER).expect(404);
    const missing = await get(historyOf(MISSING_PROJECT), token.OWNER).expect(404);

    expect(outsider.body).toEqual(missing.body);
    expect(outsider.text).not.toContain("propietario");
  });

  it("aislamiento: el usuario de B recibe 404 en A, y su historial de B no contiene nada de A", async () => {
    await get(historyOf(PROJECT.A), token.OUTSIDER).expect(404);
    const own = await get(historyOf(PROJECT.B), token.OUTSIDER).expect(200);

    expect(own.body.items.map((item: { id: string }) => item.id)).toEqual([INTERACTION.SECRET_B]);
    expect(own.text).not.toContain("propietario");
  });

  it("funciona sin modelo local configurado (ASSISTANT_LOCAL_MODEL es undefined en la aplicación completa)", async () => {
    expect(process.env.ASSISTANT_MODEL_PATH).toBe("");
    expect(app.get(ASSISTANT_LOCAL_MODEL, { strict: false })).toBeUndefined();
    await get(historyOf(PROJECT.A), token.VIEWER).expect(200);
  });
});
