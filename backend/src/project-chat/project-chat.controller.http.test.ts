import { ForbiddenException, NotFoundException, UnauthorizedException, ValidationPipe } from "@nestjs/common";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { MentorService } from "../mentor/mentor.service";
import { MentorProposalCreationService } from "../mentor-proposals/mentor-proposal-creation.service";
import { PrismaModule } from "../prisma/prisma.module";
import { PrismaService } from "../prisma/prisma.service";
import { ProjectAccessService } from "../projects/project-access.service";
import { PROJECT_CHAT_BROADCASTER } from "../realtime/project-chat-broadcaster";
import { ProjectRealtimeGateway } from "../realtime/project-realtime.gateway";
import { PROJECT_CHAT_MENTOR, PROJECT_CHAT_PROPOSALS, PROJECT_CHAT_STORE, type ProjectChatCursor, type StoredProjectChatMessage } from "./project-chat.contracts";
import { ProjectChatModule } from "./project-chat.module";
import { ProjectChatService } from "./project-chat.service";

const PROJECT = "00000000-0000-4000-8000-0000000000f1";
const OTHER_PROJECT = "00000000-0000-4000-8000-0000000000f2";
const USERS = {
  OWNER: { id: "00000000-0000-4000-8000-0000000000b0", email: "owner@example.test" },
  EDITOR: { id: "00000000-0000-4000-8000-0000000000b1", email: "editor@example.test" },
  VIEWER: { id: "00000000-0000-4000-8000-0000000000b3", email: "viewer@example.test" },
  OUTSIDER: { id: "00000000-0000-4000-8000-0000000000b4", email: "outsider@example.test" },
} as const;
const ROLES = new Map<string, string>([[USERS.OWNER.id, "OWNER"], [USERS.EDITOR.id, "EDITOR"], [USERS.VIEWER.id, "VIEWER"]]);
const messagesOf = (projectId: string) => `/projects/${projectId}/chat/messages`;
const auth = (user: { id: string }) => ({ Authorization: `Bearer ${user.id}` });

let app: NestFastifyApplication | undefined;

// Real ProjectChatModule (controller, service, module wiring, global ValidationPipe of createApp); only the edges are
// replaced: message store, membership roles, the socket gateway, the Mentor and the JWT guard.
async function setup() {
  const rows: StoredProjectChatMessage[] = [];
  const store = {
    create: vi.fn(async (message: StoredProjectChatMessage) => { rows.push(message); return message; }),
    list: vi.fn(async (projectId: string, take: number, cursor?: ProjectChatCursor) => rows
      .filter((row) => row.projectId === projectId && (!cursor || row.createdAt < cursor.createdAt || (row.createdAt.getTime() === cursor.createdAt.getTime() && row.id < cursor.id)))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : -1))
      .slice(0, take)),
  };
  const gateway = { broadcastChatMessage: vi.fn(), broadcastChatMentorState: vi.fn(), broadcastAccepted: vi.fn() };
  const mentor = { query: vi.fn(async () => ({ answer: "Respuesta del Mentor.", grounded: true, projectRevision: 1 })), recommend: vi.fn(async () => ({ problem: "P", alternatives: [], rationale: "R.", limitations: "L", needsClarification: false, requiresUmlChange: false })) };
  const proposals = { create: vi.fn(async () => ({ ok: true, proposal: { id: "00000000-0000-4000-8000-0000000000d1", summary: [{ kind: "added", label: "Cliente.ID: integer" }] } })) };
  const access = {
    requireEdit: vi.fn(async (projectId: string, userId: string) => {
      const role = ROLES.get(userId);
      if (!role || (projectId !== PROJECT && projectId !== OTHER_PROJECT)) throw new NotFoundException();
      if (role === "VIEWER") throw new ForbiddenException();
      return role;
    }),
    requireView: vi.fn(async (projectId: string, userId: string) => {
      const role = ROLES.get(userId);
      if (!role || (projectId !== PROJECT && projectId !== OTHER_PROJECT)) throw new NotFoundException();
      return role;
    }),
  };
  const module = await Test.createTestingModule({ imports: [PrismaModule, ProjectChatModule] })
    .overrideProvider(PrismaService).useValue({})
    .overrideProvider(PROJECT_CHAT_STORE).useValue(store)
    .overrideProvider(ProjectAccessService).useValue(access)
    .overrideProvider(ProjectRealtimeGateway).useValue(gateway)
    .overrideProvider(MentorService).useValue(mentor)
    .overrideProvider(MentorProposalCreationService).useValue(proposals)
    .overrideGuard(JwtAuthGuard).useValue({
      canActivate(context: { switchToHttp(): { getRequest(): { headers: { authorization?: string }; authenticatedUser?: unknown } } }) {
        const incoming = context.switchToHttp().getRequest();
        const user = Object.values(USERS).find((candidate) => incoming.headers.authorization === `Bearer ${candidate.id}`);
        if (!user) throw new UnauthorizedException();
        incoming.authenticatedUser = user;
        return true;
      },
    })
    .compile();
  app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter(), { logger: false });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return { http: request(app.getHttpServer()), rows, store, gateway, mentor, proposals, access, module };
}

beforeEach(() => {
  vi.stubEnv("JWT_SECRET", "secreto-solo-para-pruebas");
  vi.stubEnv("JWT_EXPIRES_IN", "1h");
  vi.stubEnv("ASSISTANT_MODEL_PATH", "");
});

afterEach(async () => {
  await app?.close();
  app = undefined;
  vi.unstubAllEnvs();
});

describe("POST /projects/:id/chat/messages", () => {
  it("OWNER, EDITOR y VIEWER publican: 201 con exactamente el mensaje público y el autor del JWT", async () => {
    const { http, gateway } = await setup();
    for (const user of [USERS.OWNER, USERS.EDITOR, USERS.VIEWER]) {
      const response = await http.post(messagesOf(PROJECT)).set(auth(user)).send({ body: "Hola equipo" }).expect(201);
      expect(response.body).toEqual({ id: expect.any(String), kind: "USER", author: { email: user.email }, body: "Hola equipo", replyToId: null, proposalId: null, createdAt: expect.any(String) });
      expect(JSON.stringify(response.body)).not.toContain(user.id);
    }
    expect(gateway.broadcastChatMessage).toHaveBeenCalledTimes(3);
    expect(gateway.broadcastChatMessage).toHaveBeenLastCalledWith(PROJECT, expect.objectContaining({ kind: "USER" }));
  });

  it("400 con cuerpo nulo, vacío, largo o con propiedades extra, sin escribir", async () => {
    const { http, store } = await setup();
    for (const body of [{}, { body: "" }, { body: "a".repeat(2001) }, { body: "hola", kind: "MENTOR" }, { body: "hola", authorUserId: USERS.OUTSIDER.id }]) {
      const response = await http.post(messagesOf(PROJECT)).set(auth(USERS.OWNER)).send(body).expect(400);
      expect(response.body).toEqual({ statusCode: 400, error: "Bad Request", code: "INVALID_BODY", message: expect.any(String) });
    }
    await http.post(messagesOf(PROJECT)).set(auth(USERS.OWNER)).set("Content-Type", "application/json").send("null").expect(400);
    expect(store.create).not.toHaveBeenCalled();
  });

  it("404 sin acceso o con proyecto inexistente, sin escribir; 401 sin JWT; 400 con id inválido", async () => {
    const { http, store } = await setup();
    await http.post(messagesOf(PROJECT)).set(auth(USERS.OUTSIDER)).send({ body: "hola" }).expect(404);
    await http.post(messagesOf("00000000-0000-4000-8000-0000000000f9")).set(auth(USERS.OWNER)).send({ body: "hola" }).expect(404);
    await http.post(messagesOf(PROJECT)).send({ body: "hola" }).expect(401);
    await http.post(messagesOf("no-uuid")).set(auth(USERS.OWNER)).send({ body: "hola" }).expect(400);
    expect(store.create).not.toHaveBeenCalled();
  });

  it("una mención responde 201 enseguida y la respuesta del Mentor llega por la sala", async () => {
    const { http, gateway, mentor, module } = await setup();
    const postSpy = vi.spyOn(module.get(ProjectChatService), "post");

    const response = await http.post(messagesOf(PROJECT)).set(auth(USERS.VIEWER)).send({ body: "@mentor ¿qué es Pedido?" }).expect(201);
    const result = await postSpy.mock.results[0]!.value;
    await result.mentorReply;

    expect(response.body).toMatchObject({ kind: "USER", body: "@mentor ¿qué es Pedido?" });
    expect(mentor.query).toHaveBeenCalledExactlyOnceWith(PROJECT, USERS.VIEWER, "¿qué es Pedido?");
    expect(gateway.broadcastChatMentorState.mock.calls).toEqual([[PROJECT, response.body.id, "THINKING"], [PROJECT, response.body.id, "IDLE"]]);
    expect(gateway.broadcastChatMessage).toHaveBeenLastCalledWith(PROJECT, expect.objectContaining({ kind: "MENTOR", author: null, body: "Respuesta del Mentor.", replyToId: response.body.id }));
  });
});

describe("POST /projects/:id/chat/actions", () => {
  const actionsOf = (projectId: string) => `/projects/${projectId}/chat/actions`;

  it("RECOMMENDATION para cualquier miembro y PROPOSAL para OWNER y EDITOR: 201 con el mensaje humano", async () => {
    const { http, proposals } = await setup();
    const recommendation = await http.post(actionsOf(PROJECT)).set(auth(USERS.VIEWER)).send({ action: "RECOMMENDATION", text: "¿Conviene teléfono?" }).expect(201);
    expect(recommendation.body).toMatchObject({ kind: "USER", body: "Recomendación técnica: ¿Conviene teléfono?" });
    const proposal = await http.post(actionsOf(PROJECT)).set(auth(USERS.EDITOR)).send({ action: "PROPOSAL", text: "agrega ID a Cliente" }).expect(201);
    expect(proposal.body).toMatchObject({ kind: "USER", body: "Propuesta de cambio UML: agrega ID a Cliente" });
    await vi.waitFor(() => expect(proposals.create).toHaveBeenCalledTimes(1));
  });

  it("PROPOSAL de un VIEWER: 403 sin escribir; acción inválida: 400; sin acceso: 404", async () => {
    const { http, store, proposals } = await setup();
    await http.post(actionsOf(PROJECT)).set(auth(USERS.VIEWER)).send({ action: "PROPOSAL", text: "agrega ID" }).expect(403);
    expect((await http.post(actionsOf(PROJECT)).set(auth(USERS.OWNER)).send({ action: "DELETE", text: "x" }).expect(400)).body.code).toBe("INVALID_ACTION");
    await http.post(actionsOf(PROJECT)).set(auth(USERS.OUTSIDER)).send({ action: "RECOMMENDATION", text: "x" }).expect(404);
    expect(store.create).not.toHaveBeenCalled();
    expect(proposals.create).not.toHaveBeenCalled();
  });
});

describe("GET /projects/:id/chat/messages", () => {
  it("lista más reciente primero, sin mensajes de otro proyecto, y pagina con nextCursor", async () => {
    const { http } = await setup();
    for (const body of ["uno", "dos", "tres"]) await http.post(messagesOf(PROJECT)).set(auth(USERS.EDITOR)).send({ body }).expect(201);
    await http.post(messagesOf(OTHER_PROJECT)).set(auth(USERS.EDITOR)).send({ body: "ajeno" }).expect(201);

    const first = await http.get(`${messagesOf(PROJECT)}?limit=2`).set(auth(USERS.VIEWER)).expect(200);
    expect(Object.keys(first.body).sort()).toEqual(["items", "nextCursor"]);
    expect(first.body.items.map((item: { body: string }) => item.body)).toEqual(["tres", "dos"]);
    const second = await http.get(`${messagesOf(PROJECT)}?limit=2&cursor=${first.body.nextCursor}`).set(auth(USERS.VIEWER)).expect(200);
    expect(second.body).toEqual({ items: [expect.objectContaining({ body: "uno" })], nextCursor: null });
  });

  it("400 con query inválida, 404 sin acceso y 401 sin JWT", async () => {
    const { http } = await setup();
    expect((await http.get(`${messagesOf(PROJECT)}?limit=0`).set(auth(USERS.OWNER)).expect(400)).body.code).toBe("INVALID_LIMIT");
    expect((await http.get(`${messagesOf(PROJECT)}?cursor=x`).set(auth(USERS.OWNER)).expect(400)).body.code).toBe("INVALID_CURSOR");
    expect((await http.get(`${messagesOf(PROJECT)}?q=hola`).set(auth(USERS.OWNER)).expect(400)).body.code).toBe("UNKNOWN_PARAMETER");
    await http.get(messagesOf(PROJECT)).set(auth(USERS.OUTSIDER)).expect(404);
    await http.get(messagesOf(PROJECT)).expect(401);
  });
});

describe("ProjectChatModule (inyección de dependencias)", () => {
  it("usa el gateway existente como emisor y el MentorService de MentorModule, sin crear modelos", async () => {
    vi.stubEnv("JWT_SECRET", "secreto-solo-para-pruebas");
    vi.stubEnv("JWT_EXPIRES_IN", "1h");
    const module = await Test.createTestingModule({ imports: [PrismaModule, ProjectChatModule] }).overrideProvider(PrismaService).useValue({}).compile();

    expect(module.get(PROJECT_CHAT_BROADCASTER, { strict: false })).toBe(module.get(ProjectRealtimeGateway, { strict: false }));
    expect(module.get(PROJECT_CHAT_MENTOR, { strict: false })).toBe(module.get(MentorService, { strict: false }));
    expect(module.get(PROJECT_CHAT_PROPOSALS, { strict: false })).toBe(module.get(MentorProposalCreationService, { strict: false }));
    await module.close();
  });
});
