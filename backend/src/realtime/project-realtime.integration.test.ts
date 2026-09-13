import type { AddressInfo } from "node:net";
import request from "supertest";
import { io, type Socket } from "socket.io-client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createProjectDocument, type UmlCommand } from "@examen-sw1/uml-core";
import { createApp } from "../create-app";
import { JwtService } from "@nestjs/jwt";
import { PrismaService } from "../prisma/prisma.service";
import { RealtimeEvent, type ApplyProjectOperationResult, type ProjectAccessChangedEvent, type ProjectOperationAck, type ProjectRealtimeState } from "./realtime.contracts";

const password = "password-123";
const emails = ["cu05-owner@example.test", "cu05-editor@example.test", "cu05-viewer@example.test", "cu05-none@example.test"];

describe("ProjectRealtimeGateway Socket.IO y PostgreSQL", () => {
  let app: Awaited<ReturnType<typeof createApp>>;
  let prisma: PrismaService;
  let baseUrl: string;
  let ownerId: string;
  let editorId: string;
  let viewerId: string;
  let ownerToken: string;
  let editorToken: string;
  let viewerToken: string;
  let noneToken: string;
  const sockets: Socket[] = [];

  const authorization = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function cleanup() {
    const users = await prisma.user.findMany({ where: { email: { in: emails } }, select: { id: true } });
    const userIds = users.map((user) => user.id);
    if (userIds.length) {
      await prisma.project.deleteMany({ where: { ownerId: { in: userIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
  }

  async function listen() {
    await app.listen(0, "127.0.0.1");
    const address = app.getHttpServer().address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  }

  function connect(token: string) {
    const socket = io(baseUrl, { auth: { token }, transports: ["websocket"], forceNew: true });
    sockets.push(socket);
    return socket;
  }

  function waitForConnection(socket: Socket) {
    return new Promise<void>((resolve, reject) => {
      socket.once("connect", () => resolve());
      socket.once("connect_error", reject);
    });
  }

  function waitForError(socket: Socket) {
    return new Promise<Error & { data?: { code?: string } }>((resolve) => socket.once("connect_error", (error) => resolve(error as Error & { data?: { code?: string } })));
  }

  async function emitAck<T>(socket: Socket, event: string, payload: unknown): Promise<T> {
    return socket.timeout(2_000).emitWithAck(event, payload) as Promise<T>;
  }

  function once<T>(socket: Socket, event: string): Promise<T> {
    return new Promise((resolve) => socket.once(event, resolve));
  }

  function command(name: string, classId: string): UmlCommand {
    return { type: "CreateClass", classId, name, layout: { x: 0, y: 0 } };
  }

  async function createProject(name: string) {
    const response = await request(baseUrl).post("/projects").set(authorization(ownerToken)).send({ name, document: createProjectDocument() }).expect(201);
    return response.body as { id: string; revision: number };
  }

  beforeAll(async () => {
    process.loadEnvFile(".env");
    process.env.JWT_SECRET = "cu05-realtime-integration-secret-that-is-long-enough";
    process.env.JWT_EXPIRES_IN = "1h";
    app = await createApp();
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    prisma = app.get(PrismaService);
    await cleanup();
    await listen();

    const registrations = await Promise.all(emails.map((email) => request(baseUrl).post("/auth/register").send({ email, password }).expect(201)));
    [ownerId, editorId, viewerId] = registrations.map((response) => response.body.id);
    const logins = await Promise.all(emails.map((email) => request(baseUrl).post("/auth/login").send({ email, password }).expect(201)));
    [ownerToken, editorToken, viewerToken, noneToken] = logins.map((response) => response.body.accessToken);
  });

  afterAll(async () => {
    for (const socket of sockets) socket.disconnect();
    await cleanup();
    await app.close();
  });

  it("autentica el handshake, aísla salas, aplica roles y persiste antes del ack y broadcast", async () => {
    const invalid = connect("invalid-token");
    await expect(waitForError(invalid)).resolves.toMatchObject({ data: { code: "UNAUTHORIZED" } });
    const expiredToken = await app.get(JwtService).signAsync({ sub: ownerId }, { secret: process.env.JWT_SECRET, expiresIn: -1 });
    const expired = connect(expiredToken);
    await expect(waitForError(expired)).resolves.toMatchObject({ data: { code: "UNAUTHORIZED" } });

    const project = await createProject("Realtime principal");
    const isolatedProject = await createProject("Realtime aislado");
    await prisma.projectMembership.createMany({ data: [
      { projectId: project.id, userId: editorId, role: "EDITOR" },
      { projectId: project.id, userId: viewerId, role: "VIEWER" },
    ] });

    const owner = connect(ownerToken);
    const editor = connect(editorToken);
    const viewer = connect(viewerToken);
    const none = connect(noneToken);
    const isolated = connect(ownerToken);
    await Promise.all([owner, editor, viewer, none, isolated].map(waitForConnection));

    await expect(emitAck<ProjectRealtimeState>(owner, RealtimeEvent.JOIN_PROJECT, { projectId: project.id })).resolves.toMatchObject({ projectId: project.id, revision: 1, accessRole: "OWNER" });
    await expect(emitAck<ProjectRealtimeState>(editor, RealtimeEvent.JOIN_PROJECT, { projectId: project.id })).resolves.toMatchObject({ projectId: project.id, revision: 1, accessRole: "EDITOR" });
    await expect(emitAck<ProjectRealtimeState>(viewer, RealtimeEvent.JOIN_PROJECT, { projectId: project.id })).resolves.toMatchObject({ projectId: project.id, revision: 1, accessRole: "VIEWER" });
    await expect(emitAck<{ code: string }>(none, RealtimeEvent.JOIN_PROJECT, { projectId: project.id })).resolves.toEqual({ code: "UNAUTHORIZED" });
    await expect(emitAck<ProjectRealtimeState>(isolated, RealtimeEvent.JOIN_PROJECT, { projectId: isolatedProject.id })).resolves.toMatchObject({ projectId: isolatedProject.id, revision: 1 });

    const first = { operationId: "b1000000-0000-4000-8000-000000000001", projectId: project.id, baseRevision: 1, command: command("Cliente", "b1000000-0000-4000-8000-000000000101") };
    const ownerBroadcast = once<ProjectOperationAck>(owner, RealtimeEvent.ACCEPTED);
    const editorBroadcast = once<ProjectOperationAck>(editor, RealtimeEvent.ACCEPTED);
    const viewerBroadcast = once<ProjectOperationAck>(viewer, RealtimeEvent.ACCEPTED);
    const accepted = await emitAck<ProjectOperationAck>(owner, RealtimeEvent.APPLY_OPERATION, first);
    expect(accepted).toEqual({ operationId: first.operationId, projectId: project.id, revision: 2, command: first.command });
    await expect(Promise.all([ownerBroadcast, editorBroadcast, viewerBroadcast])).resolves.toEqual([accepted, accepted, accepted]);

    const httpState = await request(baseUrl).get(`/projects/${project.id}`).set(authorization(ownerToken)).expect(200);
    expect(httpState.body).toMatchObject({ revision: 2, document: { uml: { classes: [expect.objectContaining({ name: "Cliente" })] } } });
    const receipt = await prisma.projectOperationReceipt.findUniqueOrThrow({ where: { projectId_operationId: { projectId: project.id, operationId: first.operationId } } });
    expect(receipt).toMatchObject({ actorUserId: ownerId, baseRevision: 1, resultingRevision: 2, projectId: project.id });
    expect(receipt.expiresAt.getTime() - receipt.createdAt.getTime()).toBeGreaterThan(23 * 60 * 60 * 1_000);

    const replay = await emitAck<ProjectOperationAck>(owner, RealtimeEvent.APPLY_OPERATION, first);
    expect(replay).toEqual(accepted);
    expect(await prisma.project.count({ where: { id: project.id, revision: 2 } })).toBe(1);
    expect(await prisma.projectOperationReceipt.count({ where: { projectId: project.id, operationId: first.operationId } })).toBe(1);

    const collision = await emitAck<ApplyProjectOperationResult>(owner, RealtimeEvent.APPLY_OPERATION, { ...first, command: command("Pedido", "b1000000-0000-4000-8000-000000000102") });
    expect(collision).toMatchObject({ code: "INVALID_OPERATION" });
    const viewerResult = await emitAck<ApplyProjectOperationResult>(viewer, RealtimeEvent.APPLY_OPERATION, { operationId: "b1000000-0000-4000-8000-000000000002", projectId: project.id, baseRevision: 2, command: command("NoPermitida", "b1000000-0000-4000-8000-000000000103") });
    expect(viewerResult).toMatchObject({ code: "FORBIDDEN" });

    const stale = await emitAck<ApplyProjectOperationResult>(editor, RealtimeEvent.APPLY_OPERATION, { operationId: "b1000000-0000-4000-8000-000000000003", projectId: project.id, baseRevision: 1, command: command("Stale", "b1000000-0000-4000-8000-000000000104") });
    expect(stale).toMatchObject({ code: "STALE_REVISION", revision: 2, requiresResync: true });
    await expect(emitAck<ProjectRealtimeState>(editor, RealtimeEvent.RESYNC, { projectId: project.id })).resolves.toMatchObject({ revision: 2, document: httpState.body.document });

    const second = { operationId: "b1000000-0000-4000-8000-000000000004", projectId: project.id, baseRevision: 2, command: command("Pedido", "b1000000-0000-4000-8000-000000000105") };
    const orderedOwner = once<ProjectOperationAck>(owner, RealtimeEvent.ACCEPTED);
    const orderedEditor = once<ProjectOperationAck>(editor, RealtimeEvent.ACCEPTED);
    expect(await emitAck<ProjectOperationAck>(editor, RealtimeEvent.APPLY_OPERATION, second)).toMatchObject({ revision: 3 });
    await expect(Promise.all([orderedOwner, orderedEditor])).resolves.toEqual([expect.objectContaining({ revision: 3 }), expect.objectContaining({ revision: 3 })]);

    const isolatedEvent = once<ProjectOperationAck>(isolated, RealtimeEvent.ACCEPTED);
    await expect(Promise.race([isolatedEvent, new Promise((resolve) => setTimeout(resolve, 150))])).resolves.toBeUndefined();
  });

  it("conserva replays tras reinicio, trata vencidos y limita una carrera a una revisión", async () => {
    const project = await createProject("Realtime reinicio");
    const owner = connect(ownerToken);
    await waitForConnection(owner);
    await emitAck(owner, RealtimeEvent.JOIN_PROJECT, { projectId: project.id });
    const operation = { operationId: "b2000000-0000-4000-8000-000000000001", projectId: project.id, baseRevision: 1, command: command("Persistida", "b2000000-0000-4000-8000-000000000201") };
    await expect(emitAck<ProjectOperationAck>(owner, RealtimeEvent.APPLY_OPERATION, operation)).resolves.toMatchObject({ revision: 2 });
    owner.disconnect();
    await app.close();

    app = await createApp();
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    prisma = app.get(PrismaService);
    await listen();
    const restarted = connect(ownerToken);
    await waitForConnection(restarted);
    await emitAck(restarted, RealtimeEvent.JOIN_PROJECT, { projectId: project.id });
    await expect(emitAck<ProjectOperationAck>(restarted, RealtimeEvent.APPLY_OPERATION, operation)).resolves.toMatchObject({ revision: 2 });
    expect(await prisma.project.count({ where: { id: project.id, revision: 2 } })).toBe(1);

    await prisma.projectOperationReceipt.update({ where: { projectId_operationId: { projectId: project.id, operationId: operation.operationId } }, data: { expiresAt: new Date(Date.now() - 1_000) } });
    await expect(emitAck<ApplyProjectOperationResult>(restarted, RealtimeEvent.APPLY_OPERATION, operation)).resolves.toMatchObject({ code: "STALE_REVISION", revision: 2, requiresResync: true });
    expect(await prisma.projectOperationReceipt.findUnique({ where: { projectId_operationId: { projectId: project.id, operationId: operation.operationId } } })).toBeNull();

    const concurrent = await createProject("Realtime carrera");
    const first = connect(ownerToken);
    const second = connect(ownerToken);
    await Promise.all([first, second].map(waitForConnection));
    await Promise.all([first, second].map((socket) => emitAck(socket, RealtimeEvent.JOIN_PROJECT, { projectId: concurrent.id })));
    const duplicate = { operationId: "b2000000-0000-4000-8000-000000000002", projectId: concurrent.id, baseRevision: 1, command: command("UnaVez", "b2000000-0000-4000-8000-000000000202") };
    const results = await Promise.all([emitAck<ProjectOperationAck>(first, RealtimeEvent.APPLY_OPERATION, duplicate), emitAck<ProjectOperationAck>(second, RealtimeEvent.APPLY_OPERATION, duplicate)]);
    expect(results).toEqual([expect.objectContaining({ revision: 2 }), expect.objectContaining({ revision: 2 })]);
    expect(await prisma.project.count({ where: { id: concurrent.id, revision: 2 } })).toBe(1);
    expect(await prisma.projectOperationReceipt.count({ where: { projectId: concurrent.id, operationId: duplicate.operationId } })).toBe(1);
  });

  it("invalida todas las salas autenticadas al degradar o eliminar una membresía", async () => {
    const project = await createProject("Realtime invalidación de acceso");
    await prisma.projectMembership.create({ data: { projectId: project.id, userId: editorId, role: "EDITOR" } });
    const owner = connect(ownerToken);
    const editorFirst = connect(editorToken);
    const editorSecond = connect(editorToken);
    await Promise.all([owner, editorFirst, editorSecond].map(waitForConnection));
    await Promise.all([owner, editorFirst, editorSecond].map((socket) => emitAck(socket, RealtimeEvent.JOIN_PROJECT, { projectId: project.id })));

    const downgraded = Promise.all([
      once<ProjectAccessChangedEvent>(editorFirst, RealtimeEvent.ACCESS_CHANGED),
      once<ProjectAccessChangedEvent>(editorSecond, RealtimeEvent.ACCESS_CHANGED),
    ]);
    await request(baseUrl).patch(`/projects/${project.id}/members/${editorId}`).set(authorization(ownerToken)).send({ role: "VIEWER" }).expect(200);
    await expect(downgraded).resolves.toEqual([
      { projectId: project.id, accessRole: "VIEWER" },
      { projectId: project.id, accessRole: "VIEWER" },
    ]);

    const visibleToViewer = once<ProjectOperationAck>(editorFirst, RealtimeEvent.ACCEPTED);
    const ownerOperation = { operationId: "b3000000-0000-4000-8000-000000000001", projectId: project.id, baseRevision: 1, command: command("Visible", "b3000000-0000-4000-8000-000000000301") };
    await emitAck<ProjectOperationAck>(owner, RealtimeEvent.APPLY_OPERATION, ownerOperation);
    await expect(visibleToViewer).resolves.toMatchObject({ revision: 2, command: ownerOperation.command });
    await expect(emitAck<ApplyProjectOperationResult>(editorFirst, RealtimeEvent.APPLY_OPERATION, { operationId: "b3000000-0000-4000-8000-000000000002", projectId: project.id, baseRevision: 2, command: command("Prohibida", "b3000000-0000-4000-8000-000000000302") })).resolves.toMatchObject({ code: "FORBIDDEN" });

    const removed = Promise.all([
      once<ProjectAccessChangedEvent>(editorFirst, RealtimeEvent.ACCESS_CHANGED),
      once<ProjectAccessChangedEvent>(editorSecond, RealtimeEvent.ACCESS_CHANGED),
    ]);
    await request(baseUrl).delete(`/projects/${project.id}/members/${editorId}`).set(authorization(ownerToken)).expect(204);
    await expect(removed).resolves.toEqual([
      { projectId: project.id, accessRole: "NONE" },
      { projectId: project.id, accessRole: "NONE" },
    ]);

    const noProtectedBroadcast = once<ProjectOperationAck>(editorFirst, RealtimeEvent.ACCEPTED);
    await emitAck<ProjectOperationAck>(owner, RealtimeEvent.APPLY_OPERATION, { operationId: "b3000000-0000-4000-8000-000000000003", projectId: project.id, baseRevision: 2, command: command("Privada", "b3000000-0000-4000-8000-000000000303") });
    await expect(Promise.race([noProtectedBroadcast, new Promise((resolve) => setTimeout(resolve, 150))])).resolves.toBeUndefined();
  });

  it("sincroniza dos clientes, presencia, resync, reconexión y revocación sin filtrar broadcasts", async () => {
    const project = await createProject("Realtime multi-cliente");
    await prisma.projectMembership.create({ data: { projectId: project.id, userId: editorId, role: "EDITOR" } });
    const owner = connect(ownerToken);
    const editor = connect(editorToken);
    await Promise.all([owner, editor].map(waitForConnection));

    await emitAck<ProjectRealtimeState>(owner, RealtimeEvent.JOIN_PROJECT, { projectId: project.id });
    const editorState = await emitAck<ProjectRealtimeState>(editor, RealtimeEvent.JOIN_PROJECT, { projectId: project.id });
    expect(editorState.presence.map((member) => member.userId)).toEqual(expect.arrayContaining([ownerId, editorId]));

    const remotePresence = once<{ presence: { userId: string; selectionId?: string; editingElementId?: string } }>(editor, RealtimeEvent.PRESENCE_UPDATED);
    await emitAck(owner, RealtimeEvent.PRESENCE, { projectId: project.id, selectionId: "owner-class", editingElementId: "owner-class" });
    await expect(remotePresence).resolves.toMatchObject({ presence: { userId: ownerId, selectionId: "owner-class", editingElementId: "owner-class" } });

    const ownerOperation = { operationId: "b4000000-0000-4000-8000-000000000001", projectId: project.id, baseRevision: 1, command: command("Cliente", "b4000000-0000-4000-8000-000000000401") };
    const receivedByEditor = once<ProjectOperationAck>(editor, RealtimeEvent.ACCEPTED);
    await expect(emitAck<ProjectOperationAck>(owner, RealtimeEvent.APPLY_OPERATION, ownerOperation)).resolves.toMatchObject({ revision: 2 });
    await expect(receivedByEditor).resolves.toMatchObject({ operationId: ownerOperation.operationId, revision: 2 });

    const stale = await emitAck<ApplyProjectOperationResult>(editor, RealtimeEvent.APPLY_OPERATION, { operationId: "b4000000-0000-4000-8000-000000000002", projectId: project.id, baseRevision: 1, command: command("Stale", "b4000000-0000-4000-8000-000000000402") });
    expect(stale).toMatchObject({ code: "STALE_REVISION", revision: 2, requiresResync: true });
    const resynced = await emitAck<ProjectRealtimeState>(editor, RealtimeEvent.RESYNC, { projectId: project.id });
    expect(resynced).toMatchObject({ revision: 2, document: { uml: { classes: [expect.objectContaining({ name: "Cliente" })] } } });

    editor.disconnect();
    const reconnectedEditor = connect(editorToken);
    await waitForConnection(reconnectedEditor);
    await expect(emitAck<ProjectRealtimeState>(reconnectedEditor, RealtimeEvent.JOIN_PROJECT, { projectId: project.id })).resolves.toMatchObject({ revision: 2 });

    const downgraded = once<ProjectAccessChangedEvent>(reconnectedEditor, RealtimeEvent.ACCESS_CHANGED);
    await request(baseUrl).patch(`/projects/${project.id}/members/${editorId}`).set(authorization(ownerToken)).send({ role: "VIEWER" }).expect(200);
    await expect(downgraded).resolves.toEqual({ projectId: project.id, accessRole: "VIEWER" });
    await expect(emitAck<ApplyProjectOperationResult>(reconnectedEditor, RealtimeEvent.APPLY_OPERATION, { operationId: "b4000000-0000-4000-8000-000000000003", projectId: project.id, baseRevision: 2, command: command("NoPermitida", "b4000000-0000-4000-8000-000000000403") })).resolves.toMatchObject({ code: "FORBIDDEN" });

    const removed = once<ProjectAccessChangedEvent>(reconnectedEditor, RealtimeEvent.ACCESS_CHANGED);
    await request(baseUrl).delete(`/projects/${project.id}/members/${editorId}`).set(authorization(ownerToken)).expect(204);
    await expect(removed).resolves.toEqual({ projectId: project.id, accessRole: "NONE" });
    const protectedBroadcast = once<ProjectOperationAck>(reconnectedEditor, RealtimeEvent.ACCEPTED);
    await emitAck(owner, RealtimeEvent.APPLY_OPERATION, { operationId: "b4000000-0000-4000-8000-000000000004", projectId: project.id, baseRevision: 2, command: command("SoloOwner", "b4000000-0000-4000-8000-000000000404") });
    await expect(Promise.race([protectedBroadcast, new Promise((resolve) => setTimeout(resolve, 150))])).resolves.toBeUndefined();
  });
});
