import { ValidationPipe } from "@nestjs/common";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { createProjectDocument, primitiveType, serializeProjectDocument } from "@examen-sw1/uml-core";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { AppModule } from "../app.module";
import { ASSISTANT_LOCAL_MODEL } from "../assistant/assistant.module";
import { MENTOR_AI_PROVIDER, type MentorProjectContext } from "../mentor/mentor.contracts";
import { PrismaService } from "../prisma/prisma.service";
import { MENTOR_HISTORY_READER, type MentorHistoryPage, type MentorHistoryQuery } from "./mentor-history.contracts";
import { PrismaMentorHistoryReader } from "./prisma-mentor-history.reader";

// CU-2P-07, task 5.1: the shared history end to end against the development PostgreSQL.
//
//   POST /projects/:id/mentor/query (MentorService.query: identity, project, context, memory, recorder)
//   → MentorInteraction persisted by the real recorder
//   → GET /projects/:id/mentor/history (MentorHistoryService: requireView, parser, PrismaMentorHistoryReader)
//
// Real AppModule on Fastify with the global ValidationPipe of createApp(), real JWT from /auth/register + /auth/login,
// real ProjectAccessService, recorder, memory and reader. Only three edges are replaced:
// - MENTOR_AI_PROVIDER: a deterministic Mentor provider (the abstraction MentorService already depends on), so the
//   test needs no Qwen and no GGUF;
// - ASSISTANT_LOCAL_MODEL: a spy that throws on any inference, to prove that no history read reaches the local model;
// - MENTOR_HISTORY_READER: a pass-through that records each call before running the real Prisma reader.
// No MentorInteraction is inserted by hand. Fixtures use their own e-mails (cu07-e2e-*) and ids (d7e2e…) and are
// removed by id/e-mail only; deleting the projects cascades to memberships and interactions.

const password = "password-123";
const EMAIL = { A: "cu07-e2e-a@example.test", B: "cu07-e2e-b@example.test", C: "cu07-e2e-c@example.test" } as const;
const uuid = (tail: string) => `d7e2e000-0000-4000-8000-${tail.padStart(12, "0")}`;
const PROJECT = { A: uuid("a"), B: uuid("b") } as const;
const QUESTION_A = "¿Qué clases tiene este proyecto?";
const QUESTION_C = "SECRET-B ¿qué clases hay en el proyecto B?";
const PUBLIC_ITEM_KEYS = ["answer", "author", "id", "occurredAt", "question"];
const FORBIDDEN_FIELDS = ["projectRevision", "userId", "projectId", "accessRole", "grounded", "createdAt", "authorEmail", "systemPrompt", "userPrompt"];

// Deterministic Mentor answer built only from the context MentorService passes in.
const answerFor = (context: MentorProjectContext, question: string) => `Respuesta simulada para «${question}»: el proyecto ${context.projectName} tiene ${context.classes.map((umlClass) => umlClass.name).join(", ")}.`;

function documentWith(className: string, revision: number) {
  const document = createProjectDocument({ id: uuid(`d${className.length}`), now: new Date("2026-11-10T00:00:00.000Z") });
  document.revision = revision;
  const classId = uuid(`c${className.length}`);
  document.uml.classes.push({ id: classId, name: className, visibility: "public", attributes: [{ id: uuid(`f${className.length}`), name: "nombre", visibility: "private", type: primitiveType("string") }], operations: [] });
  document.layout.elements.push({ elementId: classId, x: 0, y: 0 });
  return JSON.parse(serializeProjectDocument(document)) as object;
}

describe("Historial compartido de extremo a extremo (MentorService.query → MentorInteraction → GET history)", () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;
  const id = { A: "", B: "", C: "" };
  const token = { A: "", B: "", C: "" };
  const provider = { ask: vi.fn(async (context: MentorProjectContext, question: string) => answerFor(context, question)), recommend: vi.fn() };
  const failInference = () => Promise.reject(new Error("La lectura del historial no debe invocar el modelo local."));
  const localModel = { generateText: vi.fn(failInference), generateStructured: vi.fn(failInference), warmup: vi.fn(async () => undefined), dispose: vi.fn(async () => undefined) };
  const readerCalls: Array<{ projectId: string; query: MentorHistoryQuery }> = [];
  const originalModelPath = process.env.ASSISTANT_MODEL_PATH;

  const http = () => request(app.getHttpServer());
  const history = (projectId: string, bearer: string) => http().get(`/projects/${projectId}/mentor/history`).set("Authorization", `Bearer ${bearer}`);
  const ask = (projectId: string, bearer: string, question: string) => http().post(`/projects/${projectId}/mentor/query`).set("Authorization", `Bearer ${bearer}`).send({ question });

  async function cleanup(): Promise<void> {
    const users = await prisma.user.findMany({ where: { email: { in: Object.values(EMAIL) } }, select: { id: true } });
    const ids = users.map((user) => user.id);
    await prisma.project.deleteMany({ where: { OR: [{ id: { in: Object.values(PROJECT) } }, { ownerId: { in: ids } }] } });
    if (ids.length > 0) await prisma.user.deleteMany({ where: { id: { in: ids } } });
  }

  beforeAll(async () => {
    process.loadEnvFile(".env");
    process.env.JWT_SECRET = "mentor-history-e2e-test-secret-that-is-long-enough";
    process.env.JWT_EXPIRES_IN = "1h";
    // Empty rather than deleted, as in the other CU-2P-07 integrations: no later .env reload overrides it.
    process.env.ASSISTANT_MODEL_PATH = "";

    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MENTOR_AI_PROVIDER).useValue(provider)
      .overrideProvider(ASSISTANT_LOCAL_MODEL).useFactory({ factory: () => localModel })
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
    app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    // Same global pipe as createApp().
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    prisma = app.get(PrismaService);
    await cleanup();

    for (const user of ["A", "B", "C"] as const) {
      const registered = await http().post("/auth/register").send({ email: EMAIL[user], password }).expect(201);
      id[user] = registered.body.id;
      token[user] = (await http().post("/auth/login").send({ email: EMAIL[user], password }).expect(201)).body.accessToken;
    }
    // A owns project A and B is an EDITOR of it; C owns project B and has no access to A.
    await prisma.project.createMany({ data: [
      { id: PROJECT.A, ownerId: id.A, name: "CU-2P-07 E2E proyecto A", document: documentWith("Cliente", 4), revision: 4 },
      { id: PROJECT.B, ownerId: id.C, name: "CU-2P-07 E2E proyecto B", document: documentWith("Proveedor", 2), revision: 2 },
    ] });
    await prisma.projectMembership.create({ data: { projectId: PROJECT.A, userId: id.B, role: "EDITOR" } });
  });

  afterAll(async () => {
    if (originalModelPath === undefined) delete process.env.ASSISTANT_MODEL_PATH;
    else process.env.ASSISTANT_MODEL_PATH = originalModelPath;
    if (prisma) {
      await cleanup();
      const left = {
        users: await prisma.user.count({ where: { email: { in: Object.values(EMAIL) } } }),
        projects: await prisma.project.count({ where: { id: { in: Object.values(PROJECT) } } }),
        interactions: await prisma.mentorInteraction.count({ where: { projectId: { in: Object.values(PROJECT) } } }),
      };
      expect(left).toEqual({ users: 0, projects: 0, interactions: 0 });
    }
    await app?.close();
  });

  it("E2E-01: A consulta al Mentor y el servicio real persiste exactamente una MentorInteraction suya en el proyecto A", async () => {
    const response = await ask(PROJECT.A, token.A, QUESTION_A).expect(201);

    expect(response.body).toEqual({ answer: answerFor({ projectName: "CU-2P-07 E2E proyecto A", classes: [{ name: "Cliente" }] } as unknown as MentorProjectContext, QUESTION_A), grounded: true, projectRevision: 4 });
    expect(provider.ask).toHaveBeenCalledOnce();
    const rows = await prisma.mentorInteraction.findMany({ where: { projectId: { in: Object.values(PROJECT) } } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ projectId: PROJECT.A, userId: id.A, authorEmail: EMAIL.A, accessRole: "OWNER", projectRevision: 4, question: QUESTION_A, answer: response.body.answer, grounded: true });
  });

  it("E2E-02 y E2E-06: B, EDITOR del mismo proyecto, ve la interacción de A con su autor, pregunta, respuesta y fecha, solo con el DTO público", async () => {
    const [row] = await prisma.mentorInteraction.findMany({ where: { projectId: PROJECT.A } });
    readerCalls.length = 0;
    const response = await history(PROJECT.A, token.B).expect(200);

    expect(response.body).toEqual({
      items: [{ id: row!.id, author: { email: EMAIL.A }, question: QUESTION_A, answer: row!.answer, occurredAt: row!.occurredAt.toISOString() }],
      nextCursor: null,
    });
    expect(readerCalls).toEqual([{ projectId: PROJECT.A, query: { limit: 20 } }]);
    // E2E-06: only the five public fields; nothing internal anywhere in the body.
    expect(Object.keys(response.body.items[0]).sort()).toEqual(PUBLIC_ITEM_KEYS);
    expect(Object.keys(response.body.items[0].author)).toEqual(["email"]);
    for (const field of FORBIDDEN_FIELDS) expect(response.text).not.toContain(`"${field}"`);
    for (const value of [id.A, id.B, PROJECT.A, "OWNER"]) expect(response.text).not.toContain(value);
  });

  it("orden: cuando B también consulta, ambos ven las dos interacciones más reciente primero, cada una con su autor", async () => {
    await ask(PROJECT.A, token.B, "¿Cómo se relaciona Cliente con otras clases?").expect(201);
    const fromB = await history(PROJECT.A, token.B).expect(200);
    const fromA = await history(PROJECT.A, token.A).expect(200);

    expect(fromB.body.items.map((item: { author: { email: string }; question: string }) => [item.author.email, item.question])).toEqual([[EMAIL.B, "¿Cómo se relaciona Cliente con otras clases?"], [EMAIL.A, QUESTION_A]]);
    expect(fromA.body).toEqual(fromB.body);
    const [newer, older] = fromB.body.items as Array<{ occurredAt: string }>;
    expect(Date.parse(newer!.occurredAt)).toBeGreaterThanOrEqual(Date.parse(older!.occurredAt));
  });

  it("E2E-03: C, ajeno al proyecto A, recibe el 404 estándar y el reader del historial no se ejecuta", async () => {
    readerCalls.length = 0;
    const response = await history(PROJECT.A, token.C).expect(404);
    const missing = await history(uuid("dead"), token.C).expect(404);

    expect(response.body).toEqual(missing.body);
    expect(response.text).not.toMatch(/CU-2P-07 E2E|Cliente|¿Qué clases/);
    expect(readerCalls).toEqual([]);
  });

  it("E2E-04: el historial del proyecto B no contiene nada del proyecto A, y A no puede leer el de B", async () => {
    await ask(PROJECT.B, token.C, QUESTION_C).expect(201);
    const fromC = await history(PROJECT.B, token.C).expect(200);

    expect(fromC.body.items.map((item: { author: { email: string }; question: string }) => [item.author.email, item.question])).toEqual([[EMAIL.C, QUESTION_C]]);
    expect(fromC.text).not.toContain(QUESTION_A);
    expect(fromC.text).not.toContain(EMAIL.A);
    await history(PROJECT.B, token.A).expect(404);
    expect((await history(PROJECT.A, token.A).expect(200)).text).not.toContain("SECRET-B");
  });

  it("E2E-05: ninguna lectura del historial invoca el modelo local ni el proveedor del Mentor", async () => {
    const askedBefore = provider.ask.mock.calls.length;
    await history(PROJECT.A, token.A).expect(200);
    await history(PROJECT.A, token.B).expect(200);
    await http().get(`/projects/${PROJECT.A}/mentor/history?q=clases&limit=1`).set("Authorization", `Bearer ${token.B}`).expect(200);
    await history(PROJECT.B, token.C).expect(200);
    await history(PROJECT.A, token.C).expect(404);

    expect(provider.ask).toHaveBeenCalledTimes(askedBefore);
    expect(localModel.generateText).not.toHaveBeenCalled();
    expect(localModel.generateStructured).not.toHaveBeenCalled();
    expect(process.env.ASSISTANT_MODEL_PATH).toBe("");
  });

  // REC-13 (task 9.1): recommendations recorded by the real MentorService.recommend (CU-2P-05) are read back through
  // CU-2P-07 as readable text. The stored row keeps the original JSON: the history never writes it back.
  const RECOMMENDATION_DRAFT = {
    problem: "Los datos de Cliente se guardan sin validar.",
    alternatives: ["Validar el nombre de Cliente en el DTO del backend.", "Rechazar nombres vacíos antes de guardar."],
    rationale: "Cliente existe en el modelo vigente y su nombre es obligatorio.",
    limitations: "No cubre validaciones de negocio externas.",
    confidence: 0.75,
    needsClarification: false,
    requiresUmlChange: false,
  };
  const HIDDEN_RECOMMENDATION_FIELDS = ["projectRevision", "confidence", "status", "READ_ONLY", "needsClarification", "requiresUmlChange", "0.75"];
  const recommend = (bearer: string, question: string) => http().post(`/projects/${PROJECT.A}/mentor/recommendations`).set("Authorization", `Bearer ${bearer}`).send({ question });

  it("REC-13 y REC-14: una recomendación del proveedor registrada por MentorService se lee desde PostgreSQL como texto legible, sin campos internos", async () => {
    provider.recommend.mockResolvedValueOnce(RECOMMENDATION_DRAFT);
    const question = "¿Cómo debería validar los datos de Cliente antes de guardarlos?";
    const created = await recommend(token.A, question).expect(201);
    expect(created.body).toMatchObject({ status: "READ_ONLY", projectRevision: 4, problem: RECOMMENDATION_DRAFT.problem });
    expect(provider.recommend).toHaveBeenCalledOnce();

    // The row is untouched: CU-2P-05 keeps storing its JSON.
    const row = await prisma.mentorInteraction.findFirstOrThrow({ where: { projectId: PROJECT.A, question } });
    expect(JSON.parse(row.answer)).toEqual({ status: "READ_ONLY", ...RECOMMENDATION_DRAFT, projectRevision: 4 });

    const response = await history(PROJECT.A, token.B).expect(200);
    const item = response.body.items[0];
    expect(item).toEqual({
      id: row.id,
      author: { email: EMAIL.A },
      question,
      answer: [
        "Problema:\nLos datos de Cliente se guardan sin validar.",
        "Alternativas:\n- Validar el nombre de Cliente en el DTO del backend.\n- Rechazar nombres vacíos antes de guardar.",
        "Razón:\nCliente existe en el modelo vigente y su nombre es obligatorio.",
        "Limitaciones:\nNo cubre validaciones de negocio externas.",
      ].join("\n\n"),
      occurredAt: row.occurredAt.toISOString(),
    });
    expect(Object.keys(item).sort()).toEqual(PUBLIC_ITEM_KEYS);
    for (const hidden of HIDDEN_RECOMMENDATION_FIELDS) expect(item.answer).not.toContain(hidden);
    expect(item.answer).not.toMatch(/[{}"]/);
    // The free queries recorded earlier keep their text answers unchanged.
    const freeQuery = response.body.items.find((entry: { question: string }) => entry.question === QUESTION_A);
    const freeRow = await prisma.mentorInteraction.findFirstOrThrow({ where: { projectId: PROJECT.A, question: QUESTION_A } });
    expect(freeQuery.answer).toBe(freeRow.answer);
  });

  it("REC-13: la recomendación determinista real de CU-2P-05 (atributo ausente) también se presenta legible, sin invocar el proveedor", async () => {
    const question = "¿Conviene agregar teléfono a Cliente?";
    await recommend(token.B, question).expect(201);
    expect(provider.recommend).toHaveBeenCalledOnce();

    const row = await prisma.mentorInteraction.findFirstOrThrow({ where: { projectId: PROJECT.A, question } });
    const stored = JSON.parse(row.answer) as { problem: string; alternatives: string[]; rationale: string; limitations: string; projectRevision: number };
    expect(stored.projectRevision).toBe(4);

    const item = (await history(PROJECT.A, token.A).expect(200)).body.items[0];
    expect(item).toMatchObject({ id: row.id, author: { email: EMAIL.B }, question });
    expect(item.answer).toBe(`Problema:\n${stored.problem}\n\nAlternativas:\n${stored.alternatives.map((alternative) => `- ${alternative}`).join("\n")}\n\nRazón:\n${stored.rationale}\n\nLimitaciones:\n${stored.limitations}`);
    expect(item.answer).toContain("teléfono");
    for (const hidden of HIDDEN_RECOMMENDATION_FIELDS) expect(item.answer).not.toContain(hidden);
    expect(localModel.generateText).not.toHaveBeenCalled();
    expect(localModel.generateStructured).not.toHaveBeenCalled();
  });
});
