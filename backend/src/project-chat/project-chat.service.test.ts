import { BadRequestException, ForbiddenException, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { ProjectChatBroadcaster, ProjectChatMentorState, ProjectChatPublicMessage } from "../realtime/project-chat-broadcaster";
import { MentorProposalGenerationUnavailableError } from "../mentor-proposals/local-qwen-mentor-proposal-intent.provider";
import { PROJECT_CHAT_NOTICES, type ProjectChatCursor, type ProjectChatMentor, type ProjectChatProposalResult, type ProjectChatProposals, type ProjectChatStore, type StoredProjectChatMessage } from "./project-chat.contracts";
import { ProjectChatService } from "./project-chat.service";

const PROJECT = "00000000-0000-4000-8000-0000000000f1";
const OTHER_PROJECT = "00000000-0000-4000-8000-0000000000f2";
const ANA = { id: "00000000-0000-4000-8000-0000000000b1", email: "ana@example.test" };
const VIEWER = { id: "00000000-0000-4000-8000-0000000000b3", email: "viewer@example.test" };
const OUTSIDER = { id: "00000000-0000-4000-8000-0000000000b4", email: "outsider@example.test" };
const PROPOSAL_ID = "00000000-0000-4000-8000-0000000000d1";
const PUBLIC_KEYS =["author", "body", "createdAt", "id", "kind", "proposalId", "replyToId"];

// In-memory store with the same keyset semantics as PrismaProjectChatStore.
function memoryStore() {
  const rows: StoredProjectChatMessage[] = [];
  const compare = (a: StoredProjectChatMessage, b: StoredProjectChatMessage) => b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);
  const after = (row: StoredProjectChatMessage, cursor?: ProjectChatCursor) => !cursor || row.createdAt < cursor.createdAt || (row.createdAt.getTime() === cursor.createdAt.getTime() && row.id < cursor.id);
  const store: ProjectChatStore & { failNextCreate?: boolean } = {
    create: vi.fn(async (message: StoredProjectChatMessage) => {
      if (store.failNextCreate) { store.failNextCreate = false; throw new Error("fallo de base de datos"); }
      rows.push({ ...message });
      return { ...message };
    }),
    list: vi.fn(async (projectId: string, take: number, cursor?: ProjectChatCursor) => rows.filter((row) => row.projectId === projectId && after(row, cursor)).sort(compare).slice(0, take)),
  };
  return { store, rows };
}

type Event = Readonly<{ type: "message"; projectId: string; message: ProjectChatPublicMessage }> | Readonly<{ type: "mentor"; projectId: string; replyToId: string; state: ProjectChatMentorState }>;

function setup(mentorBehaviour: (question: string) => Promise<{ answer: string }> = async () => ({ answer: "Cliente 1 — 0..* Pedido." })) {
  const { store, rows } = memoryStore();
  const events: Event[] = [];
  const broadcaster: ProjectChatBroadcaster = {
    broadcastChatMessage: (projectId, message) => events.push({ type: "message", projectId, message }),
    broadcastChatMentorState: (projectId, replyToId, state) => events.push({ type: "mentor", projectId, replyToId, state }),
  };
  const access = {
    requireView: vi.fn(async (projectId: string, userId: string) => {
      if (userId === OUTSIDER.id || (projectId !== PROJECT && projectId !== OTHER_PROJECT)) throw new NotFoundException();
      return userId === VIEWER.id ? ("VIEWER" as const) : ("EDITOR" as const);
    }),
  };
  (access as Record<string, unknown>).requireEdit = vi.fn(async (projectId: string, userId: string) => {
    const role = await access.requireView(projectId, userId);
    if (role === "VIEWER") throw new ForbiddenException();
    return role;
  });
  const mentor = {
    query: vi.fn((_projectId: string, _user: unknown, question: string) => mentorBehaviour(question)),
    recommend: vi.fn(async () => ({ problem: "Cliente no tiene contacto.", alternatives: ["Agregar teléfono a Cliente."], rationale: "Cliente existe.", limitations: "No valida formato.", needsClarification: false, requiresUmlChange: true })),
  } satisfies ProjectChatMentor;
  const proposals = {
    create: vi.fn(async (): Promise<ProjectChatProposalResult> => ({ ok: true, proposal: { id: PROPOSAL_ID, summary: [{ kind: "added", label: "Cliente.ID: integer" }] } })),
  } satisfies ProjectChatProposals;
  let tick = 0;
  const clock = () => new Date(Date.UTC(2026, 10, 11, 12, 0, tick++));
  let id = 0;
  const ids = () => `00000000-0000-4000-8000-${String(++id).padStart(12, "0")}`;
  const service = new ProjectChatService(access as never, store, broadcaster, mentor, proposals, clock, ids);
  return { service, store, rows, events, access: access as typeof access & { requireEdit: ReturnType<typeof vi.fn> }, mentor, proposals };
}

describe("ProjectChatService.post", () => {
  it("publica un mensaje normal con el autor del JWT, lo difunde una vez y no invoca al Mentor", async () => {
    const { service, events, mentor, rows } = setup();

    const result = await service.post(PROJECT, ANA, { body: "  Hola equipo  " });

    expect(result).toEqual({ ok: true, message: { id: expect.any(String), kind: "USER", author: { email: ANA.email }, body: "Hola equipo", replyToId: null, proposalId: null, createdAt: "2026-11-11T12:00:00.000Z" } });
    expect(result.ok && Object.keys(result.message).sort()).toEqual(PUBLIC_KEYS);
    expect(result.ok && result.mentorReply).toBeUndefined();
    expect(events).toEqual([{ type: "message", projectId: PROJECT, message: result.ok && result.message }]);
    expect(mentor.query).not.toHaveBeenCalled();
    expect(rows).toEqual([expect.objectContaining({ kind: "USER", authorUserId: ANA.id, authorEmail: ANA.email, mentionsMentor: false, projectId: PROJECT })]);
  });

  it("un VIEWER también escribe", async () => {
    const { service } = setup();
    expect(await service.post(PROJECT, VIEWER, { body: "Leo el modelo" })).toMatchObject({ ok: true, message: { author: { email: VIEWER.email } } });
  });

  it("autoriza antes de validar o escribir: sin acceso 404 y nada se persiste ni se difunde", async () => {
    const { service, store, events } = setup();
    await expect(service.post(PROJECT, OUTSIDER, { body: "hola" })).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.post("00000000-0000-4000-8000-0000000000f9", ANA, null)).rejects.toBeInstanceOf(NotFoundException);
    expect(store.create).not.toHaveBeenCalled();
    expect(events).toEqual([]);
  });

  it("un cuerpo inválido no se persiste ni se difunde", async () => {
    const { service, store, events } = setup();
    for (const raw of [null, {}, { body: "" }, { body: "a".repeat(2001) }, { body: "hola", kind: "MENTOR" }, { body: "hola", authorUserId: OUTSIDER.id }]) {
      expect(await service.post(PROJECT, ANA, raw)).toMatchObject({ ok: false, error: { code: "INVALID_BODY" } });
    }
    expect(store.create).not.toHaveBeenCalled();
    expect(events).toEqual([]);
  });

  it("una mención responde de forma asíncrona: mensaje humano, THINKING, respuesta MENTOR enlazada e IDLE, en ese orden", async () => {
    const { service, events, mentor } = setup();

    const result = await service.post(PROJECT, ANA, { body: "@mentor ¿cómo relaciono Cliente y Pedido?" });
    if (!result.ok || !result.mentorReply) throw new Error("se esperaba una respuesta del Mentor en curso");
    await result.mentorReply;

    expect(mentor.query).toHaveBeenCalledExactlyOnceWith(PROJECT, ANA, "¿cómo relaciono Cliente y Pedido?");
    expect(events.map((event) => (event.type === "message" ? `message:${event.message.kind}` : `mentor:${event.state}`))).toEqual(["message:USER", "mentor:THINKING", "message:MENTOR", "mentor:IDLE"]);
    const reply = events[2]!.type === "message" ? events[2]!.message : undefined;
    expect(reply).toEqual({ id: expect.any(String), kind: "MENTOR", author: null, body: "Cliente 1 — 0..* Pedido.", replyToId: result.message.id, proposalId: null, createdAt: expect.any(String) });
    expect(events.filter((event) => event.type === "mentor").every((event) => event.type === "mentor" && event.replyToId === result.message.id)).toBe(true);
  });

  it("devuelve el mensaje humano sin esperar a la IA", async () => {
    let release!: (value: { answer: string }) => void;
    const { service, events } = setup(() => new Promise((resolve) => { release = resolve; }));

    const result = await service.post(PROJECT, ANA, { body: "@mentor explica Pedido" });

    expect(result.ok).toBe(true);
    expect(events.map((event) => event.type === "message" ? event.message.kind : event.state)).toEqual(["USER", "THINKING"]);
    release({ answer: "Pedido pertenece a Cliente." });
    if (result.ok) await result.mentorReply;
    expect(events.map((event) => event.type === "message" ? event.message.kind : event.state)).toEqual(["USER", "THINKING", "MENTOR", "IDLE"]);
  });

  it("una mención sin pregunta o con más de 500 caracteres responde con un aviso, sin invocar al modelo", async () => {
    for (const body of ["@mentor", `@mentor ${"a".repeat(501)}`]) {
      const { service, events, mentor } = setup();
      const result = await service.post(PROJECT, ANA, { body });
      if (result.ok) await result.mentorReply;
      expect(mentor.query).not.toHaveBeenCalled();
      expect(events.map((event) => event.type === "message" ? event.message.kind : event.state)).toEqual(["USER", "NOTICE"]);
      expect(events[1]).toMatchObject({ message: { body: PROJECT_CHAT_NOTICES.INVALID_QUESTION, author: null } });
    }
  });

  it.each([
    ["no disponible, ocupado o tiempo agotado", new ServiceUnavailableException("El Mentor IA no está disponible en este momento."), PROJECT_CHAT_NOTICES.MENTOR_UNAVAILABLE],
    ["pregunta inválida para el Mentor", new BadRequestException(), PROJECT_CHAT_NOTICES.INVALID_QUESTION],
    ["error inesperado", new Error("ruta interna /models/qwen.gguf y traza"), PROJECT_CHAT_NOTICES.MENTOR_FAILED],
  ])("si el Mentor falla (%s) publica un aviso seguro enlazado y vuelve a IDLE", async (_label, error, notice) => {
    const { service, events } = setup(async () => { throw error; });

    const result = await service.post(PROJECT, ANA, { body: "@mentor explica Pedido" });
    if (result.ok) await result.mentorReply;

    expect(events.map((event) => event.type === "message" ? event.message.kind : event.state)).toEqual(["USER", "THINKING", "NOTICE", "IDLE"]);
    expect(events[2]).toMatchObject({ message: { kind: "NOTICE", body: notice, author: null, replyToId: result.ok && result.message.id } });
    expect(JSON.stringify(events)).not.toMatch(/models|qwen|traza/);
  });

  it("si el autor perdió el acceso mientras el Mentor respondía, no se publica nada más", async () => {
    const { service, events } = setup(async () => { throw new NotFoundException(); });
    const result = await service.post(PROJECT, ANA, { body: "@mentor hola" });
    if (result.ok) await result.mentorReply;
    expect(events.map((event) => event.type === "message" ? event.message.kind : event.state)).toEqual(["USER", "THINKING", "IDLE"]);
  });

  it("un fallo al guardar la respuesta no rompe la tarea asíncrona", async () => {
    let release!: (value: { answer: string }) => void;
    const { service, store, events, rows } = setup(() => new Promise((resolve) => { release = resolve; }));
    const result = await service.post(PROJECT, ANA, { body: "@mentor hola" });
    (store as { failNextCreate?: boolean }).failNextCreate = true;
    release({ answer: "respuesta" });

    if (result.ok) await expect(result.mentorReply).resolves.toBeUndefined();

    expect(rows.map((row) => row.kind)).toEqual(["USER"]);
    expect(events.map((event) => event.type === "message" ? event.message.kind : event.state)).toEqual(["USER", "THINKING", "IDLE"]);
  });

  it("una ForbiddenException del acceso se propaga sin escribir", async () => {
    const { service, access, store } = setup();
    access.requireView.mockRejectedValueOnce(new ForbiddenException());
    await expect(service.post(PROJECT, ANA, { body: "hola" })).rejects.toBeInstanceOf(ForbiddenException);
    expect(store.create).not.toHaveBeenCalled();
  });
});

describe("ProjectChatService.list", () => {
  it("lista más reciente primero con cursor keyset, sin duplicados ni mensajes de otro proyecto", async () => {
    const { service } = setup();
    for (let index = 1; index <= 5; index += 1) await service.post(PROJECT, ANA, { body: `mensaje ${index}` });
    await service.post(OTHER_PROJECT, ANA, { body: "de otro proyecto" });

    const first = await service.list(PROJECT, VIEWER, { limit: "2" });
    if (!first.ok) throw new Error("se esperaba una página");
    expect(first.page.items.map((item) => item.body)).toEqual(["mensaje 5", "mensaje 4"]);
    expect(first.page.nextCursor).toEqual(expect.any(String));

    const seen = [...first.page.items.map((item) => item.body)];
    let cursor = first.page.nextCursor;
    while (cursor) {
      const page = await service.list(PROJECT, VIEWER, { limit: "2", cursor });
      if (!page.ok) throw new Error("se esperaba una página");
      seen.push(...page.page.items.map((item) => item.body));
      cursor = page.page.nextCursor;
    }
    expect(seen).toEqual(["mensaje 5", "mensaje 4", "mensaje 3", "mensaje 2", "mensaje 1"]);
  });

  it("devuelve una página vacía sin cursor y rechaza queries inválidas", async () => {
    const { service } = setup();
    expect(await service.list(PROJECT, ANA, {})).toEqual({ ok: true, page: { items: [], nextCursor: null } });
    expect(await service.list(PROJECT, ANA, { limit: "0" })).toMatchObject({ ok: false, error: { code: "INVALID_LIMIT" } });
    expect(await service.list(PROJECT, ANA, { cursor: "x" })).toMatchObject({ ok: false, error: { code: "INVALID_CURSOR" } });
  });

  it("autoriza antes de leer", async () => {
    const { service, store } = setup();
    await expect(service.list(PROJECT, OUTSIDER, {})).rejects.toBeInstanceOf(NotFoundException);
    expect(store.list).not.toHaveBeenCalled();
  });
});

const kinds = (events: readonly { type: string; message?: { kind: string }; state?: string }[]) => events.map((event) => (event.type === "message" ? event.message!.kind : event.state));

describe("ProjectChatService.postAction", () => {
  it("RECOMMENDATION: cualquier miembro, mensaje humano con prefijo y respuesta MENTOR legible sin campos internos", async () => {
    const { service, events, mentor } = setup();

    const result = await service.postAction(PROJECT, VIEWER, { action: "RECOMMENDATION", text: "¿Conviene agregar teléfono a Cliente?" });
    if (!result.ok) throw new Error("se esperaba una acción aceptada");
    await result.mentorReply;

    expect(result.message).toMatchObject({ kind: "USER", author: { email: VIEWER.email }, body: "Recomendación técnica: ¿Conviene agregar teléfono a Cliente?" });
    expect(mentor.recommend).toHaveBeenCalledExactlyOnceWith(PROJECT, VIEWER, { question: "¿Conviene agregar teléfono a Cliente?" });
    expect(kinds(events)).toEqual(["USER", "THINKING", "MENTOR", "IDLE"]);
    const reply = events[2]!.type === "message" ? events[2]!.message : undefined;
    expect(reply?.body).toBe("Problema:\nCliente no tiene contacto.\n\nAlternativas:\n- Agregar teléfono a Cliente.\n\nRazón:\nCliente existe.\n\nLimitaciones:\nNo valida formato.\n\nImplica un cambio UML: puedes pedir «Proponer cambio UML».");
    expect(reply?.body).not.toMatch(/confidence|projectRevision|READ_ONLY|\{/);
  });

  it("PROPOSAL: OWNER o EDITOR crean una propuesta PENDING que se publica como tarjeta PROPOSAL con el diff", async () => {
    const { service, events, proposals } = setup();

    const result = await service.postAction(PROJECT, ANA, { action: "PROPOSAL", text: "A la clase Cliente, agrégame un atributo ID de tipo integer" });
    if (!result.ok) throw new Error("se esperaba una acción aceptada");
    await result.mentorReply;

    expect(proposals.create).toHaveBeenCalledExactlyOnceWith(PROJECT, ANA, "A la clase Cliente, agrégame un atributo ID de tipo integer");
    expect(kinds(events)).toEqual(["USER", "THINKING", "PROPOSAL", "IDLE"]);
    expect(events[2]).toMatchObject({ message: { kind: "PROPOSAL", author: null, body: "+ Cliente.ID: integer", proposalId: PROPOSAL_ID, replyToId: result.message.id } });
  });

  it("PROPOSAL: un VIEWER recibe 403 antes de escribir nada", async () => {
    const { service, store, events, proposals } = setup();
    await expect(service.postAction(PROJECT, VIEWER, { action: "PROPOSAL", text: "agrega ID a Cliente" })).rejects.toBeInstanceOf(ForbiddenException);
    expect(store.create).not.toHaveBeenCalled();
    expect(events).toEqual([]);
    expect(proposals.create).not.toHaveBeenCalled();
  });

  it("PROPOSAL rechazada por CU-2P-06 o IA no disponible: aviso seguro, sin tarjeta", async () => {
    const rejected = setup();
    rejected.proposals.create.mockResolvedValueOnce({ ok: false, error: { code: "ELEMENT_NOT_FOUND", message: "La clase indicada no existe en el modelo UML vigente." } });
    const first = await rejected.service.postAction(PROJECT, ANA, { action: "PROPOSAL", text: "agrega ID a Proveedor" });
    if (first.ok) await first.mentorReply;
    expect(rejected.events[2]).toMatchObject({ message: { kind: "NOTICE", body: "No se pudo crear la propuesta UML: La clase indicada no existe en el modelo UML vigente.", proposalId: null } });

    const unavailable = setup();
    unavailable.proposals.create.mockRejectedValueOnce(new MentorProposalGenerationUnavailableError());
    const second = await unavailable.service.postAction(PROJECT, ANA, { action: "PROPOSAL", text: "agrega ID a Cliente" });
    if (second.ok) await second.mentorReply;
    expect(kinds(unavailable.events)).toEqual(["USER", "THINKING", "NOTICE", "IDLE"]);
    expect(unavailable.events[2]).toMatchObject({ message: { body: PROJECT_CHAT_NOTICES.MENTOR_UNAVAILABLE } });
  });

  it("valida estrictamente la acción y autoriza antes", async () => {
    const { service, store } = setup();
    for (const raw of [null, {}, { action: "QUERY", text: "hola" }, { action: "PROPOSAL" }, { action: "RECOMMENDATION", text: "" }, { action: "RECOMMENDATION", text: "a".repeat(501) }, { action: "RECOMMENDATION", text: "hola", proposalId: PROPOSAL_ID }]) {
      expect(await service.postAction(PROJECT, ANA, raw)).toMatchObject({ ok: false, error: { code: "INVALID_ACTION" } });
    }
    await expect(service.postAction(PROJECT, OUTSIDER, { action: "RECOMMENDATION", text: "hola" })).rejects.toBeInstanceOf(NotFoundException);
    expect(store.create).not.toHaveBeenCalled();
  });
});
