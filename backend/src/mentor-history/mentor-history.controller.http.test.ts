import { NotFoundException, ValidationPipe } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { ASSISTANT_LOCAL_MODEL } from "../assistant/assistant.module";
import { PrismaModule } from "../prisma/prisma.module";
import { PrismaService } from "../prisma/prisma.service";
import { ProjectAccessService } from "../projects/project-access.service";
import { MentorHistoryModule } from "./mentor-history.module";
import { MentorHistoryService } from "./mentor-history.service";

// CU-2P-07, fase 4: GET /projects/:id/mentor/history over a real Nest + Fastify application without a database.
// Real: JwtModule/JwtService (test secret), JwtAuthGuard, AuthService, ParseUUIDPipe, the global ValidationPipe of
// createApp, MentorHistoryController, MentorHistoryService, PrismaMentorHistoryReader and the DTO assembly.
// Doubles: PrismaService (in memory; its rows deliberately carry every MentorInteraction column, ignoring `select`, so
// a leak would show) and ProjectAccessService (same 404 policy as the real one). The PostgreSQL version with the real
// ProjectAccessService and real users is mentor-history.controller.integration.test.ts.

const uuid = (tail: string) => `d7035000-0000-4000-8000-${tail.padStart(12, "0")}`;
const USER = { OWNER: uuid("e1"), VIEWER: uuid("e2"), OUTSIDER: uuid("e3"), OTHER_OWNER: uuid("e4") } as const;
const EMAIL: Record<string, string> = { [USER.OWNER]: "cu07-http-owner@example.test", [USER.VIEWER]: "cu07-http-viewer@example.test", [USER.OUTSIDER]: "cu07-http-outsider@example.test", [USER.OTHER_OWNER]: "cu07-http-other@example.test" };
const PROJECT = { A: uuid("f1"), B: uuid("f2"), EMPTY: uuid("f3") } as const;
const MISSING_PROJECT = uuid("dead");
const MEMBERS: Record<string, Record<string, string>> = {
  [PROJECT.A]: { [USER.OWNER]: "OWNER", [USER.VIEWER]: "VIEWER" },
  [PROJECT.B]: { [USER.OTHER_OWNER]: "OWNER", [USER.OUTSIDER]: "VIEWER" },
  [PROJECT.EMPTY]: { [USER.OWNER]: "OWNER" },
};

// Full MentorInteraction rows, including the columns that must never reach HTTP.
const row = (id: string, projectId: string, userId: string, minute: number, question: string) => ({
  id,
  projectId,
  userId,
  authorEmail: EMAIL[userId]!,
  accessRole: MEMBERS[projectId]![userId]!,
  occurredAt: new Date(Date.UTC(2026, 10, 10, 9, minute)),
  createdAt: new Date(Date.UTC(2026, 10, 10, 9, minute, 1)),
  projectRevision: 3,
  question,
  answer: `Respuesta a ${question}`,
  grounded: true,
  systemPrompt: "PROMPT-INTERNO",
  userPrompt: "PROMPT-USUARIO",
});
const ROWS = [
  row(uuid("c1"), PROJECT.A, USER.OWNER, 0, "Q1 del propietario"),
  row(uuid("c2"), PROJECT.A, USER.VIEWER, 5, "Q2 del lector"),
  row(uuid("c3"), PROJECT.A, USER.OWNER, 10, "Q3 sobre uml"),
  row(uuid("c9"), PROJECT.B, USER.OTHER_OWNER, 15, "SECRET-B"),
];

type FindManyArgs = { where: { projectId: string }; take: number };
const findMany = vi.fn(async ({ where, take }: FindManyArgs) =>
  ROWS.filter((candidate) => candidate.projectId === where.projectId)
    .sort((left, right) => right.occurredAt.getTime() - left.occurredAt.getTime() || right.id.localeCompare(left.id))
    .slice(0, take));
const findUnique = vi.fn(async ({ where }: { where: { id: string } }) => (EMAIL[where.id] ? { id: where.id, email: EMAIL[where.id] } : null));
const fakePrisma = { mentorInteraction: { findMany }, user: { findUnique } };

const requireView = vi.fn(async (projectId: string, userId: string) => {
  const role = MEMBERS[projectId]?.[userId];
  if (!role) throw new NotFoundException();
  return role;
});

const PUBLIC_ITEM_KEYS = ["answer", "author", "id", "occurredAt", "question"];
const FORBIDDEN_FIELDS = ["userId", "projectId", "accessRole", "projectRevision", "grounded", "createdAt", "systemPrompt", "userPrompt"];

describe("GET /projects/:id/mentor/history (HTTP real, JWT real, sin base de datos)", () => {
  let app: NestFastifyApplication;
  let tokens: Record<keyof typeof USER, string>;
  let listSpy: MockInstance<MentorHistoryService["list"]>;
  const originalModelPath = process.env.ASSISTANT_MODEL_PATH;

  const get = (path: string, token?: string) => {
    const pending = request(app.getHttpServer()).get(path);
    return token ? pending.set("Authorization", `Bearer ${token}`) : pending;
  };
  const historyOf = (projectId: string, query = "") => `/projects/${projectId}/mentor/history${query}`;

  beforeAll(async () => {
    vi.stubEnv("JWT_SECRET", "cu07-history-http-test-secret-that-is-long-enough");
    vi.stubEnv("JWT_EXPIRES_IN", "1h");
    delete process.env.ASSISTANT_MODEL_PATH;

    const module = await Test.createTestingModule({ imports: [PrismaModule, MentorHistoryModule] })
      .overrideProvider(PrismaService).useValue(fakePrisma)
      .overrideProvider(ProjectAccessService).useValue({ requireView })
      .compile();
    // logger: false keeps the expected ExceptionsHandler log of the 500 case out of the test output.
    app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter(), { logger: false });
    // Same global pipe as createApp(): it must leave the raw @Query() object alone.
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    const jwt = app.get(JwtService);
    tokens = {
      OWNER: await jwt.signAsync({ sub: USER.OWNER }),
      VIEWER: await jwt.signAsync({ sub: USER.VIEWER }),
      OUTSIDER: await jwt.signAsync({ sub: USER.OUTSIDER }),
      OTHER_OWNER: await jwt.signAsync({ sub: USER.OTHER_OWNER }),
    };
    listSpy = vi.spyOn(app.get(MentorHistoryService), "list");
  });

  afterAll(async () => {
    await app?.close();
    vi.unstubAllEnvs();
    if (originalModelPath !== undefined) process.env.ASSISTANT_MODEL_PATH = originalModelPath;
  });

  beforeEach(() => {
    findMany.mockClear();
    requireView.mockClear();
    listSpy.mockClear();
  });

  // ------------------------------------------------------------------ 200

  it("200 con historial vacío: { items: [], nextCursor: null } y nada más", async () => {
    const response = await get(historyOf(PROJECT.EMPTY), tokens.OWNER).expect(200);

    expect(response.body).toEqual({ items: [], nextCursor: null });
  });

  it("200 con elementos: solo items y nextCursor; cada item solo id, author.email, question, answer y occurredAt", async () => {
    const response = await get(historyOf(PROJECT.A), tokens.OWNER).expect(200);

    expect(Object.keys(response.body).sort()).toEqual(["items", "nextCursor"]);
    expect(response.body.items.map((item: { id: string }) => item.id)).toEqual([uuid("c3"), uuid("c2"), uuid("c1")]);
    for (const item of response.body.items) {
      expect(Object.keys(item).sort()).toEqual(PUBLIC_ITEM_KEYS);
      expect(Object.keys(item.author)).toEqual(["email"]);
    }
    expect(response.body.items[0]).toEqual({ id: uuid("c3"), author: { email: EMAIL[USER.OWNER] }, question: "Q3 sobre uml", answer: "Respuesta a Q3 sobre uml", occurredAt: "2026-11-10T09:10:00.000Z" });
    expect(response.body).not.toHaveProperty("ok");
    expect(response.body).not.toHaveProperty("page");
  });

  it("no devuelve ningún campo prohibido aunque las filas los contengan", async () => {
    const response = await get(historyOf(PROJECT.A), tokens.OWNER).expect(200);
    const raw = response.text;

    for (const field of FORBIDDEN_FIELDS) expect(raw).not.toContain(`"${field}"`);
    expect(raw).not.toContain("PROMPT-INTERNO");
    expect(raw).not.toContain(USER.OWNER);
  });

  it("200 con limit válido: entrega limit elementos y un cursor opaco", async () => {
    const response = await get(historyOf(PROJECT.A, "?limit=2"), tokens.OWNER).expect(200);

    expect(response.body.items).toHaveLength(2);
    expect(response.body.nextCursor).toEqual(expect.any(String));
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 3 }));
  });

  it("200 con un cursor válido devuelto por la página anterior", async () => {
    const first = await get(historyOf(PROJECT.A, "?limit=2"), tokens.OWNER).expect(200);
    findMany.mockClear();
    const response = await get(historyOf(PROJECT.A, `?limit=2&cursor=${encodeURIComponent(first.body.nextCursor)}`), tokens.OWNER).expect(200);

    expect(Object.keys(response.body).sort()).toEqual(["items", "nextCursor"]);
    expect(listSpy).toHaveBeenLastCalledWith(PROJECT.A, USER.OWNER, { limit: "2", cursor: first.body.nextCursor });
    // The decoded keyset position (last delivered item, c2 at 09:05) reached the real reader's WHERE. The in-memory
    // double does not apply it; keyset semantics are covered against PostgreSQL.
    const where = JSON.stringify(findMany.mock.calls[0]![0].where);
    expect(where).toContain(uuid("c2"));
    expect(where).toContain("2026-11-10T09:05:00.000Z");
  });

  it("200 con búsqueda válida: la consulta normalizada llega al lector dentro del proyecto", async () => {
    await get(historyOf(PROJECT.A, "?q=%20%20UML%20%20"), tokens.OWNER).expect(200);

    expect(findMany).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(findMany.mock.calls[0]![0])).toContain('"UML"');
    expect(findMany.mock.calls[0]![0].where.projectId).toBe(PROJECT.A);
  });

  // ------------------------------------------------------------------ 400

  it("400 con UUID de proyecto inválido, antes del servicio", async () => {
    const response = await get("/projects/no-es-un-uuid/mentor/history", tokens.OWNER).expect(400);

    expect(response.body).toEqual(expect.objectContaining({ statusCode: 400, error: "Bad Request" }));
    expect(listSpy).not.toHaveBeenCalled();
  });

  it.each([
    ["limit=0", "INVALID_LIMIT"],
    ["limit=51", "INVALID_LIMIT"],
    ["limit=1.5", "INVALID_LIMIT"],
    ["limit=10&limit=20", "INVALID_LIMIT"],
    ["q=", "INVALID_SEARCH"],
    ["q=%20%20%20", "INVALID_SEARCH"],
    [`q=${"a".repeat(201)}`, "INVALID_SEARCH"],
    ["q=uml&q=prisma", "INVALID_SEARCH"],
    ["cursor=no-es-un-cursor", "INVALID_CURSOR"],
    ["userId=d7035000-0000-4000-8000-0000000000e2", "UNKNOWN_PARAMETER"],
    ["projectId=x", "UNKNOWN_PARAMETER"],
  ])("400 con ?%s → %s, sin leer el historial", async (query, code) => {
    const response = await get(historyOf(PROJECT.A, `?${query}`), tokens.OWNER).expect(400);

    expect(response.body).toEqual(expect.objectContaining({ statusCode: 400, error: "Bad Request", code, message: expect.any(String) }));
    expect(findMany).not.toHaveBeenCalled();
  });

  it("400 por cursor inválido conserva el motivo estable en reason y no expone detalles internos", async () => {
    const response = await get(historyOf(PROJECT.A, "?cursor=no-es-un-cursor"), tokens.OWNER).expect(400);

    expect(response.body).toEqual({ statusCode: 400, error: "Bad Request", code: "INVALID_CURSOR", reason: "MALFORMED_CURSOR", message: "El cursor del historial no es válido." });
  });

  it("400 por cursor con fecha inválida informa INVALID_CURSOR_DATE", async () => {
    const forged = Buffer.from(JSON.stringify({ v: 1, t: "no-es-fecha", i: uuid("c1") }), "utf8").toString("base64url");
    const response = await get(historyOf(PROJECT.A, `?cursor=${forged}`), tokens.OWNER).expect(400);

    expect(response.body).toEqual(expect.objectContaining({ code: "INVALID_CURSOR", reason: "INVALID_CURSOR_DATE" }));
  });

  // ------------------------------------------------------------------ 401

  it.each([
    ["sin cabecera Authorization", undefined],
    ["con un token falso", "token-falso"],
  ])("401 %s: JwtAuthGuard detiene la petición y MentorHistoryService.list no se ejecuta", async (_label, token) => {
    await get(historyOf(PROJECT.A), token).expect(401);

    expect(listSpy).not.toHaveBeenCalled();
    expect(requireView).not.toHaveBeenCalled();
    expect(findMany).not.toHaveBeenCalled();
  });

  it("401 con un token firmado para un usuario que ya no existe", async () => {
    const ghost = await app.get(JwtService).signAsync({ sub: uuid("0bad") });
    await get(historyOf(PROJECT.A), ghost).expect(401);

    expect(listSpy).not.toHaveBeenCalled();
  });

  // ------------------------------------------------------------------ 404 y aislamiento

  it("404 para un usuario sin acceso, con la identidad tomada del JWT, sin leer el historial", async () => {
    const response = await get(historyOf(PROJECT.A), tokens.OUTSIDER).expect(404);

    expect(requireView).toHaveBeenCalledWith(PROJECT.A, USER.OUTSIDER);
    expect(findMany).not.toHaveBeenCalled();
    expect(response.text).not.toContain("Q1 del propietario");
  });

  it("404 (no 400) para un usuario sin acceso aunque la consulta sea inválida", async () => {
    await get(historyOf(PROJECT.A, "?limit=0&userId=x"), tokens.OUTSIDER).expect(404);

    expect(findMany).not.toHaveBeenCalled();
  });

  it("404 para un proyecto inexistente con UUID válido, igual que sin acceso", async () => {
    const missing = await get(historyOf(MISSING_PROJECT), tokens.OWNER).expect(404);
    const foreign = await get(historyOf(PROJECT.B), tokens.OWNER).expect(404);

    expect(missing.body).toEqual(foreign.body);
  });

  it("?userId=<otro usuario> no cambia la identidad: responde UNKNOWN_PARAMETER con el usuario del token", async () => {
    await get(historyOf(PROJECT.A, `?userId=${USER.OTHER_OWNER}`), tokens.VIEWER).expect(400);

    expect(requireView).toHaveBeenCalledWith(PROJECT.A, USER.VIEWER);
  });

  it("aislamiento: el usuario de B no ve A y su propio historial no contiene nada de A", async () => {
    await get(historyOf(PROJECT.A), tokens.OTHER_OWNER).expect(404);
    const own = await get(historyOf(PROJECT.B), tokens.OTHER_OWNER).expect(200);

    expect(own.body.items.map((item: { id: string }) => item.id)).toEqual([uuid("c9")]);
    expect(own.text).not.toContain("propietario");
  });

  it("historial compartido: VIEWER ve las interacciones registradas por OWNER", async () => {
    const response = await get(historyOf(PROJECT.A), tokens.VIEWER).expect(200);

    expect(response.body.items).toEqual(expect.arrayContaining([expect.objectContaining({ id: uuid("c1"), author: { email: EMAIL[USER.OWNER] } })]));
  });

  // ------------------------------------------------------------------ sin Qwen

  it("funciona sin ASSISTANT_MODEL_PATH y sin el modelo local en el grafo", async () => {
    expect(process.env.ASSISTANT_MODEL_PATH).toBeUndefined();
    expect(() => app.get(ASSISTANT_LOCAL_MODEL, { strict: false })).toThrow();

    await get(historyOf(PROJECT.A), tokens.OWNER).expect(200);
  });

  // ------------------------------------------------------------------ errores inesperados

  it("un fallo inesperado del lector produce 500 genérico, ni 400 ni página vacía, sin detalles internos", async () => {
    findMany.mockRejectedValueOnce(new Error("PrismaClientKnownRequestError: detalle interno /ruta/secreta"));

    const response = await get(historyOf(PROJECT.A), tokens.OWNER).expect(500);

    expect(response.body).toEqual({ statusCode: 500, message: "Internal server error" });
    expect(response.text).not.toMatch(/Prisma|ruta|secreta|stack/);
  });

  it("no acepta POST: la ruta es solo GET", async () => {
    await request(app.getHttpServer()).post(historyOf(PROJECT.A)).set("Authorization", `Bearer ${tokens.OWNER}`).send({}).expect(404);
  });
});
