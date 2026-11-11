import { ValidationPipe } from "@nestjs/common";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { AppModule } from "../app.module";
import { ASSISTANT_LOCAL_MODEL } from "../assistant/assistant.module";
import { createApp } from "../create-app";
import { MentorProposalHistoryService } from "../mentor-proposals/mentor-proposal-history.service";
import { MENTOR_PROPOSAL_STORE, type MentorProposalStore, type NewMentorProposal } from "../mentor-proposals/mentor-proposal-store";
import { PrismaService } from "../prisma/prisma.service";

// CU-2P-07, task 8.1 (backend): GET /projects/:id/mentor/history/proposals against the development PostgreSQL, with
// real users (register + login → JWT), the real ProjectAccessService, CU-2P-06's real MentorProposalHistoryService and
// Prisma store. Proposals are fixtures written through CU-2P-06's own store (create, reject, markApplied): this suite
// tests the read side, not the Qwen creation flow. Two applications share the database:
//  - `noModel`: createApp() with ASSISTANT_MODEL_PATH blank, exactly as production without a model (PROP-HIST-13);
//  - `app`: the full AppModule with a local-model double that fails on any inference, to count calls (PROP-HIST-14).
// Fixtures use their own ids (prefix d708a…) and e-mails (cu07-prop-hist-*) and are removed by id/e-mail only.

const password = "password-123";
const EMAIL = {
  OWNER: "cu07-prop-hist-owner@example.test",
  EDITOR: "cu07-prop-hist-editor@example.test",
  VIEWER: "cu07-prop-hist-viewer@example.test",
  OUTSIDER: "cu07-prop-hist-outsider@example.test",
} as const;
type Role = keyof typeof EMAIL;
const uuid = (tail: string) => `d708a000-0000-4000-8000-${tail.padStart(12, "0")}`;
const PROJECT = { A: uuid("a"), B: uuid("b"), EMPTY: uuid("e") } as const;
const MISSING_PROJECT = uuid("dead");
const PROPOSAL = { APPLIED: uuid("d1"), REJECTED: uuid("d2"), PENDING: uuid("d3"), SECRET_B: uuid("d9") } as const;
const CLASS_ID = uuid("c1");
const ATTRIBUTE_ID = { APPLIED: uuid("f1"), REJECTED: uuid("f2"), PENDING: uuid("f3"), SECRET_B: uuid("f9") } as const;
const at = (hour: number, minute: number) => new Date(Date.UTC(2026, 10, 10, hour, minute));
const INSTRUCTION_MARKER = "INSTRUCCION-INTERNA-CU07";

// The only keys MentorProposalHistoryProjection may carry, per status (CU-2P-06 contract).
const KEYS = {
  PENDING: ["baseRevision", "createdAt", "operation", "proposalId", "status", "summary"],
  REJECTED: ["baseRevision", "createdAt", "operation", "proposalId", "resolvedAt", "status", "summary"],
  APPLIED: ["baseRevision", "createdAt", "operation", "proposalId", "resolvedAt", "resultingRevision", "status", "summary"],
} as const;
const FORBIDDEN_FIELDS = ["command", "authorUserId", "authorEmail", "resolvedByUserId", "instruction", "diagnostics", "projectId", "classId", "attributeId", "receipt", "fingerprint", "prompt", "nextCursor"];

describe("GET /projects/:id/mentor/history/proposals con PostgreSQL, JWT real y MentorProposalHistoryService de CU-2P-06", () => {
  let app: NestFastifyApplication;
  let noModel: Awaited<ReturnType<typeof createApp>>;
  let prisma: PrismaService;
  let listSpy: MockInstance<MentorProposalHistoryService["list"]>;
  const id: Record<Role, string> = { OWNER: "", EDITOR: "", VIEWER: "", OUTSIDER: "" };
  const token: Record<Role, string> = { OWNER: "", EDITOR: "", VIEWER: "", OUTSIDER: "" };
  const failInference = () => Promise.reject(new Error("Leer propuestas del historial no debe invocar el modelo local."));
  const localModel = { generateText: vi.fn(failInference), generateStructured: vi.fn(failInference), warmup: vi.fn(async () => undefined), dispose: vi.fn(async () => undefined) };
  const originalModelPath = process.env.ASSISTANT_MODEL_PATH;

  const proposalsOf = (projectId: string, query = "") => `/projects/${projectId}/mentor/history/proposals${query}`;
  const get = (target: { getHttpServer(): unknown }, path: string, bearer?: string) => {
    const pending = request(target.getHttpServer() as Parameters<typeof request>[0]).get(path);
    return bearer ? pending.set("Authorization", `Bearer ${bearer}`) : pending;
  };

  const proposal = (proposalId: string, projectId: string, author: Role, attributeId: string, className: string, attributeName: string, createdAt: Date, baseRevision: number): NewMentorProposal => ({
    id: proposalId,
    projectId,
    authorUserId: id[author],
    authorEmail: EMAIL[author],
    instruction: `${INSTRUCTION_MARKER}: agrega ${attributeName} a ${className}`,
    baseRevision,
    command: { type: "AddAttribute", classId: CLASS_ID, attributeId, name: attributeName, attributeType: { kind: "primitive", name: "string" }, multiplicity: { lower: 1, upper: 1 } },
    operation: { kind: "ADD_ATTRIBUTE", target: { className }, change: { attributeName, attributeType: "string" } },
    summary: [{ kind: "added", element: "attribute", label: `${className}.${attributeName}: string` }],
    diagnostics: [{ code: "DIAGNOSTICO-INTERNO", severity: "warning", message: "no debe salir" }],
    createdAt,
  });

  async function cleanup(): Promise<void> {
    const users = await prisma.user.findMany({ where: { email: { in: Object.values(EMAIL) } }, select: { id: true } });
    const ids = users.map((user) => user.id);
    // Cascades to the fixture projects' memberships and proposals; users go last (proposals restrict their deletion).
    await prisma.project.deleteMany({ where: { OR: [{ id: { in: Object.values(PROJECT) } }, { ownerId: { in: ids } }] } });
    if (ids.length > 0) await prisma.user.deleteMany({ where: { id: { in: ids } } });
  }

  beforeAll(async () => {
    process.loadEnvFile(".env");
    process.env.JWT_SECRET = "mentor-history-proposals-integration-secret-long-enough";
    process.env.JWT_EXPIRES_IN = "1h";
    // Empty rather than deleted: getAssistantConfig() treats "" as not configured and no .env reload overrides it.
    process.env.ASSISTANT_MODEL_PATH = "";

    noModel = await createApp();
    await noModel.init();
    await noModel.getHttpAdapter().getInstance().ready();

    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ASSISTANT_LOCAL_MODEL).useFactory({ factory: () => localModel })
      .compile();
    app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    prisma = app.get(PrismaService);
    listSpy = vi.spyOn(app.get(MentorProposalHistoryService), "list");
    await cleanup();

    for (const role of Object.keys(EMAIL) as Role[]) {
      const registered = await request(app.getHttpServer()).post("/auth/register").send({ email: EMAIL[role], password }).expect(201);
      id[role] = registered.body.id;
      token[role] = (await request(app.getHttpServer()).post("/auth/login").send({ email: EMAIL[role], password }).expect(201)).body.accessToken;
    }
    await prisma.project.createMany({ data: [
      { id: PROJECT.A, ownerId: id.OWNER, name: "CU-2P-07 propuestas A", document: {}, revision: 5 },
      { id: PROJECT.B, ownerId: id.OUTSIDER, name: "CU-2P-07 propuestas B", document: {}, revision: 2 },
      { id: PROJECT.EMPTY, ownerId: id.OWNER, name: "CU-2P-07 propuestas vacío", document: {}, revision: 1 },
    ] });
    await prisma.projectMembership.createMany({ data: [
      { projectId: PROJECT.A, userId: id.EDITOR, role: "EDITOR" },
      { projectId: PROJECT.A, userId: id.VIEWER, role: "VIEWER" },
    ] });

    // Fixtures through CU-2P-06's own store: three real states in A (oldest first) and one proposal in B.
    const store = app.get<MentorProposalStore>(MENTOR_PROPOSAL_STORE);
    await store.create(proposal(PROPOSAL.APPLIED, PROJECT.A, "EDITOR", ATTRIBUTE_ID.APPLIED, "Cliente", "teléfono", at(9, 0), 4));
    await store.create(proposal(PROPOSAL.REJECTED, PROJECT.A, "OWNER", ATTRIBUTE_ID.REJECTED, "Pedido", "total", at(9, 10), 5));
    await store.create(proposal(PROPOSAL.PENDING, PROJECT.A, "EDITOR", ATTRIBUTE_ID.PENDING, "Cliente", "email", at(9, 20), 5));
    await store.create(proposal(PROPOSAL.SECRET_B, PROJECT.B, "OUTSIDER", ATTRIBUTE_ID.SECRET_B, "SecretoB", "clave", at(9, 30), 2));
    expect(await store.markApplied({ projectId: PROJECT.A, proposalId: PROPOSAL.APPLIED, resolvedByUserId: id.OWNER, resolvedAt: at(9, 5), resultingRevision: 5 })).toMatchObject({ ok: true });
    expect(await store.reject({ projectId: PROJECT.A, proposalId: PROPOSAL.REJECTED, resolvedByUserId: id.EDITOR, resolvedAt: at(9, 15) })).toMatchObject({ ok: true });
  });

  afterAll(async () => {
    if (originalModelPath === undefined) delete process.env.ASSISTANT_MODEL_PATH;
    else process.env.ASSISTANT_MODEL_PATH = originalModelPath;
    if (prisma) {
      await cleanup();
      expect(await prisma.user.count({ where: { email: { in: Object.values(EMAIL) } } })).toBe(0);
      expect(await prisma.project.count({ where: { id: { in: Object.values(PROJECT) } } })).toBe(0);
      expect(await prisma.mentorProposal.count({ where: { id: { in: Object.values(PROPOSAL) } } })).toBe(0);
    }
    await app?.close();
    await noModel?.close();
  });

  // Block body on purpose: a function returned from beforeEach is run by Vitest as a teardown.
  beforeEach(() => {
    listSpy.mockClear();
  });

  const expected = {
    PENDING: { proposalId: PROPOSAL.PENDING, status: "PENDING", operation: { kind: "ADD_ATTRIBUTE", target: { className: "Cliente" }, change: { attributeName: "email", attributeType: "string" } }, summary: [{ kind: "added", element: "attribute", label: "Cliente.email: string" }], baseRevision: 5, createdAt: "2026-11-10T09:20:00.000Z" },
    REJECTED: { proposalId: PROPOSAL.REJECTED, status: "REJECTED", operation: { kind: "ADD_ATTRIBUTE", target: { className: "Pedido" }, change: { attributeName: "total", attributeType: "string" } }, summary: [{ kind: "added", element: "attribute", label: "Pedido.total: string" }], baseRevision: 5, createdAt: "2026-11-10T09:10:00.000Z", resolvedAt: "2026-11-10T09:15:00.000Z" },
    APPLIED: { proposalId: PROPOSAL.APPLIED, status: "APPLIED", operation: { kind: "ADD_ATTRIBUTE", target: { className: "Cliente" }, change: { attributeName: "teléfono", attributeType: "string" } }, summary: [{ kind: "added", element: "attribute", label: "Cliente.teléfono: string" }], baseRevision: 4, createdAt: "2026-11-10T09:00:00.000Z", resolvedAt: "2026-11-10T09:05:00.000Z", resultingRevision: 5 },
  } as const;

  // ------------------------------------------------------------------ permisos

  it.each(["OWNER", "EDITOR", "VIEWER"] as const)("PROP-HIST-01/02/03: %s ve las propuestas del proyecto (200) a través de MentorProposalHistoryService", async (role) => {
    const response = await get(app, proposalsOf(PROJECT.A), token[role]).expect(200);

    expect(response.body).toEqual({ items: [expected.PENDING, expected.REJECTED, expected.APPLIED] });
    expect(listSpy).toHaveBeenCalledExactlyOnceWith(PROJECT.A, id[role], 20);
  });

  it("PROP-HIST-04/05: usuario externo y proyecto inexistente reciben el mismo 404, también con una query inválida", async () => {
    const outsider = await get(app, proposalsOf(PROJECT.A), token.OUTSIDER).expect(404);
    const missing = await get(app, proposalsOf(MISSING_PROJECT), token.OWNER).expect(404);
    const outsiderInvalid = await get(app, proposalsOf(PROJECT.A, "?limit=0"), token.OUTSIDER).expect(404);
    const missingInvalid = await get(app, proposalsOf(MISSING_PROJECT, "?cursor=x"), token.OWNER).expect(404);

    expect(outsider.body).toEqual(missing.body);
    expect(outsiderInvalid.body).toEqual(missing.body);
    expect(missingInvalid.body).toEqual(missing.body);
    for (const response of [outsider, missing, outsiderInvalid, missingInvalid]) {
      expect(response.text).not.toContain("Cliente");
      expect(response.text).not.toContain(PROPOSAL.PENDING);
    }
  });

  it("aislamiento: las propuestas de B no aparecen en A y el dueño de B solo ve las suyas", async () => {
    const a = await get(app, proposalsOf(PROJECT.A, "?limit=50"), token.OWNER).expect(200);
    const b = await get(app, proposalsOf(PROJECT.B), token.OUTSIDER).expect(200);

    expect(a.text).not.toContain("SecretoB");
    expect(a.text).not.toContain(PROPOSAL.SECRET_B);
    expect(b.body.items.map((item: { proposalId: string }) => item.proposalId)).toEqual([PROPOSAL.SECRET_B]);
  });

  it("401 sin JWT y 400 con un UUID de proyecto inválido", async () => {
    await get(app, proposalsOf(PROJECT.A)).expect(401);
    await get(app, "/projects/no-es-un-uuid/mentor/history/proposals", token.OWNER).expect(400);
    expect(listSpy).not.toHaveBeenCalled();
  });

  // ------------------------------------------------------------------ contenido

  it("PROP-HIST-06: un proyecto sin propuestas responde 200 con { items: [] }", async () => {
    const response = await get(app, proposalsOf(PROJECT.EMPTY), token.OWNER).expect(200);

    expect(response.body).toEqual({ items: [] });
  });

  it("PROP-HIST-07/08/09: PENDING sin resolución, APPLIED con resolvedAt y resultingRevision, REJECTED con resolvedAt y sin resultingRevision", async () => {
    const { items } = (await get(app, proposalsOf(PROJECT.A), token.VIEWER).expect(200)).body as { items: Array<Record<string, unknown>> };
    const byStatus = Object.fromEntries(items.map((item) => [item.status, item]));

    expect(byStatus.PENDING).toEqual(expected.PENDING);
    expect(byStatus.PENDING).not.toHaveProperty("resolvedAt");
    expect(byStatus.PENDING).not.toHaveProperty("resultingRevision");
    expect(byStatus.APPLIED).toEqual(expected.APPLIED);
    expect(byStatus.REJECTED).toEqual(expected.REJECTED);
    expect(byStatus.REJECTED).not.toHaveProperty("resultingRevision");
  });

  it("PROP-HIST-10: orden de CU-2P-06, más reciente primero, idéntico a lo que devuelve MentorProposalHistoryService", async () => {
    const response = await get(app, proposalsOf(PROJECT.A), token.EDITOR).expect(200);
    const direct = await app.get(MentorProposalHistoryService).list(PROJECT.A, id.EDITOR);

    expect(response.body.items.map((item: { proposalId: string }) => item.proposalId)).toEqual([PROPOSAL.PENDING, PROPOSAL.REJECTED, PROPOSAL.APPLIED]);
    // Served unchanged: same projection, same order (JSON round trip of CU-2P-06's own result).
    expect(response.body.items).toEqual(JSON.parse(JSON.stringify(direct)));
  });

  it.each([
    ["", 20, [PROPOSAL.PENDING, PROPOSAL.REJECTED, PROPOSAL.APPLIED]],
    ["?limit=1", 1, [PROPOSAL.PENDING]],
    ["?limit=2", 2, [PROPOSAL.PENDING, PROPOSAL.REJECTED]],
    ["?limit=50", 50, [PROPOSAL.PENDING, PROPOSAL.REJECTED, PROPOSAL.APPLIED]],
  ] as const)("PROP-HIST-11: limit %s → CU-2P-06 recibe %i, sin cursor", async (query, limit, ids) => {
    const response = await get(app, proposalsOf(PROJECT.A, query), token.OWNER).expect(200);

    expect(listSpy).toHaveBeenCalledExactlyOnceWith(PROJECT.A, id.OWNER, limit);
    expect(response.body.items.map((item: { proposalId: string }) => item.proposalId)).toEqual(ids);
    expect(Object.keys(response.body)).toEqual(["items"]);
  });

  it.each([
    ["limit=0", "INVALID_LIMIT"],
    ["limit=51", "INVALID_LIMIT"],
    ["limit=abc", "INVALID_LIMIT"],
    ["limit=1.5", "INVALID_LIMIT"],
    ["limit=10&limit=20", "INVALID_LIMIT"],
    ["cursor=x", "UNKNOWN_PARAMETER"],
    ["q=uml", "UNKNOWN_PARAMETER"],
    ["userId=x", "UNKNOWN_PARAMETER"],
  ])("PROP-HIST-11: ?%s → 400 %s con el formato de error del historial, sin leer propuestas", async (query, code) => {
    const response = await get(app, proposalsOf(PROJECT.A, `?${query}`), token.OWNER).expect(400);

    expect(response.body).toEqual({ statusCode: 400, error: "Bad Request", code, message: expect.any(String) });
    expect(listSpy).not.toHaveBeenCalled();
    expect(response.text).not.toMatch(/prisma|stack|Error:/i);
  });

  it("PROP-HIST-12: cada elemento tiene exactamente las claves públicas de su estado; nada interno sale en la respuesta", async () => {
    const response = await get(app, proposalsOf(PROJECT.A, "?limit=50"), token.VIEWER).expect(200);

    expect(Object.keys(response.body)).toEqual(["items"]);
    for (const item of response.body.items as Array<{ status: keyof typeof KEYS }>) expect(Object.keys(item).sort()).toEqual([...KEYS[item.status]]);
    for (const field of FORBIDDEN_FIELDS) expect(response.text).not.toContain(`"${field}"`);
    for (const secret of [INSTRUCTION_MARKER, "DIAGNOSTICO-INTERNO", "AddAttribute", CLASS_ID, ...Object.values(ATTRIBUTE_ID), ...Object.values(id), PROJECT.A, ...Object.values(EMAIL)]) {
      expect(response.text).not.toContain(secret);
    }
  });

  it("las propuestas no se mezclan con las interacciones: /mentor/history de A sigue vacío y con su propio cursor", async () => {
    const interactions = await get(app, `/projects/${PROJECT.A}/mentor/history`, token.OWNER).expect(200);

    expect(interactions.body).toEqual({ items: [], nextCursor: null });
    expect(listSpy).not.toHaveBeenCalled();
  });

  // ------------------------------------------------------------------ modelo local

  it("PROP-HIST-13: funciona sin modelo configurado (createApp con ASSISTANT_MODEL_PATH vacío: el modelo es undefined)", async () => {
    expect(process.env.ASSISTANT_MODEL_PATH).toBe("");
    expect(noModel.get(ASSISTANT_LOCAL_MODEL, { strict: false })).toBeUndefined();

    const response = await get(noModel, proposalsOf(PROJECT.A), token.VIEWER).expect(200);
    expect(response.body).toEqual({ items: [expected.PENDING, expected.REJECTED, expected.APPLIED] });
    await get(noModel, proposalsOf(PROJECT.EMPTY, "?limit=1"), token.OWNER).expect(200);
  });

  it("PROP-HIST-14: varias lecturas con distintos limit y roles producen 0 inferencias del modelo local", async () => {
    for (const [query, role] of [["", "OWNER"], ["?limit=1", "EDITOR"], ["?limit=50", "VIEWER"], ["?limit=0", "OWNER"], ["", "OUTSIDER"]] as const) {
      await get(app, proposalsOf(PROJECT.A, query), token[role]);
    }
    await get(app, proposalsOf(PROJECT.EMPTY), token.OWNER).expect(200);

    // Every valid query reaches CU-2P-06 (which rejects the outsider with requireView); limit=0 never does.
    expect(listSpy).toHaveBeenCalledTimes(5);
    expect(localModel.generateText).not.toHaveBeenCalled();
    expect(localModel.generateStructured).not.toHaveBeenCalled();
  });
});
