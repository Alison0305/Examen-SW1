import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createProjectDocument } from "@examen-sw1/uml-core";
import { createApp } from "../create-app";
import { PrismaService } from "../prisma/prisma.service";

const ownerEmail = "cu04-invitation-owner@example.test";
const editorEmail = "cu04-invitation-editor@example.test";
const recipientEmail = "cu04-invitation-recipient@example.test";
const rejectEmail = "cu04-invitation-reject@example.test";
const outsiderEmail = "cu04-invitation-outsider@example.test";
const password = "password-123";

describe("InvitationsController PostgreSQL", () => {
  let app: Awaited<ReturnType<typeof createApp>>;
  let prisma: PrismaService;
  let editorId: string;
  let recipientId: string;
  let ownerToken: string;
  let editorToken: string;
  let recipientToken: string;
  let rejectToken: string;
  let outsiderToken: string;

  const authorization = (token: string) => ({ Authorization: `Bearer ${token}` });
  const users = [ownerEmail, editorEmail, recipientEmail, rejectEmail, outsiderEmail];

  beforeAll(async () => {
    process.loadEnvFile(".env");
    process.env.JWT_SECRET = "invitations-integration-test-secret-that-is-long-enough";
    process.env.JWT_EXPIRES_IN = "1h";
    app = await createApp();
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    prisma = app.get(PrismaService);
    const existing = await prisma.user.findMany({ where: { email: { in: users } }, select: { id: true } });
    await prisma.project.deleteMany({ where: { ownerId: { in: existing.map((user) => user.id) } } });
    await prisma.user.deleteMany({ where: { email: { in: users } } });

    const registrations = await Promise.all(users.map((email) => request(app.getHttpServer()).post("/auth/register").send({ email, password }).expect(201)));
    [, editorId, recipientId] = registrations.map((response) => response.body.id);
    const logins = await Promise.all(users.map((email) => request(app.getHttpServer()).post("/auth/login").send({ email, password }).expect(201)));
    [ownerToken, editorToken, recipientToken, rejectToken, outsiderToken] = logins.map((response) => response.body.accessToken);
  });

  afterAll(async () => {
    const existing = await prisma.user.findMany({ where: { email: { in: users } }, select: { id: true } });
    await prisma.project.deleteMany({ where: { ownerId: { in: existing.map((user) => user.id) } } });
    await prisma.user.deleteMany({ where: { email: { in: users } } });
    await app.close();
  });

  it("protege invitaciones, normaliza email y nunca expone secretos", async () => {
    const project = await request(app.getHttpServer()).post("/projects").set(authorization(ownerToken)).send({ name: "Proyecto invitaciones", document: createProjectDocument() }).expect(201);
    const projectId = project.body.id;
    await request(app.getHttpServer()).patch(`/projects/${projectId}/members/${editorId}`).set(authorization(ownerToken)).send({ role: "EDITOR" }).expect(200);

    await request(app.getHttpServer()).get(`/projects/${projectId}/invitations`).expect(401);
    await request(app.getHttpServer()).get(`/projects/${projectId}/invitations`).set(authorization(outsiderToken)).expect(404);
    await request(app.getHttpServer()).get(`/projects/${projectId}/invitations`).set(authorization(editorToken)).expect(403);
    await request(app.getHttpServer()).post(`/projects/${projectId}/invitations`).set(authorization(ownerToken)).send({ email: recipientEmail, role: "OWNER" }).expect(400);
    await request(app.getHttpServer()).post(`/projects/${projectId}/invitations`).set(authorization(ownerToken)).send({ email: recipientEmail, role: "EDITOR", extra: true }).expect(400);
    await request(app.getHttpServer()).post(`/projects/${projectId}/invitations`).set(authorization(ownerToken)).send({ email: ownerEmail, role: "EDITOR" }).expect(409);
    await request(app.getHttpServer()).post(`/projects/${projectId}/invitations`).set(authorization(ownerToken)).send({ email: editorEmail, role: "VIEWER" }).expect(409);

    const created = await request(app.getHttpServer()).post(`/projects/${projectId}/invitations`).set(authorization(ownerToken)).send({ email: "  CU04-INVITATION-RECIPIENT@EXAMPLE.TEST  ", role: "EDITOR" }).expect(201);
    expect(created.body).toMatchObject({ projectId, email: recipientEmail, role: "EDITOR", status: "PENDING", token: expect.any(String) });
    expect(created.body).not.toHaveProperty("tokenHash");
    const firstToken = created.body.token;
    const invitationId = created.body.id;
    const stored = await prisma.projectInvitation.findUniqueOrThrow({ where: { id: invitationId } });
    expect(stored.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(stored.tokenHash).not.toBe(firstToken);
    expect(stored.email).toBe(recipientEmail);
    expect(stored.expiresAt.getTime() - stored.createdAt.getTime()).toBeGreaterThan(6 * 24 * 60 * 60 * 1000);

    await request(app.getHttpServer()).post(`/projects/${projectId}/invitations`).set(authorization(ownerToken)).send({ email: recipientEmail, role: "VIEWER" }).expect(409);
    const listed = await request(app.getHttpServer()).get(`/projects/${projectId}/invitations`).set(authorization(ownerToken)).expect(200);
    expect(listed.body).toEqual([expect.objectContaining({ id: invitationId, email: recipientEmail, role: "EDITOR" })]);
    expect(JSON.stringify(listed.body)).not.toContain(firstToken);
    expect(JSON.stringify(listed.body)).not.toContain(stored.tokenHash);

    await request(app.getHttpServer()).get(`/invitations/${firstToken}`).set(authorization(outsiderToken)).expect(404);
    await request(app.getHttpServer()).get("/invitations/not-a-valid-token").set(authorization(recipientToken)).expect(404);
    const viewed = await request(app.getHttpServer()).get(`/invitations/${firstToken}`).set(authorization(recipientToken)).expect(200);
    expect(viewed.body).toMatchObject({ id: invitationId, projectId, email: recipientEmail, role: "EDITOR", status: "PENDING" });
    expect(JSON.stringify(viewed.body)).not.toContain(firstToken);
    expect(JSON.stringify(viewed.body)).not.toContain(stored.tokenHash);

    await prisma.projectInvitation.update({ where: { id: invitationId }, data: { expiresAt: new Date(Date.now() - 1) } });
    await request(app.getHttpServer()).get(`/invitations/${firstToken}`).set(authorization(recipientToken)).expect(404);
    const reissued = await request(app.getHttpServer()).post(`/projects/${projectId}/invitations`).set(authorization(ownerToken)).send({ email: recipientEmail, role: "VIEWER" }).expect(201);
    expect(reissued.body).toMatchObject({ id: invitationId, email: recipientEmail, role: "VIEWER", status: "PENDING", resolvedAt: null });
    expect(reissued.body.token).not.toBe(firstToken);
    const reissuedStored = await prisma.projectInvitation.findUniqueOrThrow({ where: { id: invitationId } });
    expect(reissuedStored.tokenHash).not.toBe(stored.tokenHash);

    await request(app.getHttpServer()).delete(`/projects/${projectId}/invitations/${invitationId}`).set(authorization(ownerToken)).expect(204);
    await request(app.getHttpServer()).get(`/invitations/${reissued.body.token}`).set(authorization(recipientToken)).expect(404);
    await request(app.getHttpServer()).post(`/invitations/${reissued.body.token}/accept`).set(authorization(recipientToken)).expect(404);
  });

  it("acepta y rechaza una sola vez de forma transaccional", async () => {
    const project = await request(app.getHttpServer()).post("/projects").set(authorization(ownerToken)).send({ name: "Proyecto resolucion", document: createProjectDocument() }).expect(201);
    const projectId = project.body.id;
    const accepted = await request(app.getHttpServer()).post(`/projects/${projectId}/invitations`).set(authorization(ownerToken)).send({ email: recipientEmail, role: "VIEWER" }).expect(201);

    const resolutions = await Promise.all([
      request(app.getHttpServer()).post(`/invitations/${accepted.body.token}/accept`).set(authorization(recipientToken)),
      request(app.getHttpServer()).post(`/invitations/${accepted.body.token}/accept`).set(authorization(recipientToken)),
    ]);
    expect(resolutions.map((response) => response.status).sort()).toEqual([201, 404]);
    expect(await prisma.projectMembership.count({ where: { projectId, userId: recipientId } })).toBe(1);
    expect(await prisma.projectInvitation.findUniqueOrThrow({ where: { id: accepted.body.id } })).toMatchObject({ status: "ACCEPTED", resolvedAt: expect.any(Date) });
    await request(app.getHttpServer()).get(`/invitations/${accepted.body.token}`).set(authorization(recipientToken)).expect(404);
    await request(app.getHttpServer()).post(`/projects/${projectId}/invitations`).set(authorization(ownerToken)).send({ email: recipientEmail, role: "EDITOR" }).expect(409);

    const rejected = await request(app.getHttpServer()).post(`/projects/${projectId}/invitations`).set(authorization(ownerToken)).send({ email: rejectEmail, role: "EDITOR" }).expect(201);
    await request(app.getHttpServer()).post(`/invitations/${rejected.body.token}/reject`).set(authorization(rejectToken)).expect(201);
    expect(await prisma.projectMembership.count({ where: { projectId, user: { email: rejectEmail } } })).toBe(0);
    expect(await prisma.projectInvitation.findUniqueOrThrow({ where: { id: rejected.body.id } })).toMatchObject({ status: "REJECTED", resolvedAt: expect.any(Date) });
    await request(app.getHttpServer()).post(`/invitations/${rejected.body.token}/reject`).set(authorization(rejectToken)).expect(404);
  });

  it("lista y resuelve por id solo invitaciones propias activas sin exponer secretos", async () => {
    const project = await request(app.getHttpServer()).post("/projects").set(authorization(ownerToken)).send({ name: "Proyecto bandeja", document: createProjectDocument() }).expect(201);
    const projectId = project.body.id;
    const own = await request(app.getHttpServer()).post(`/projects/${projectId}/invitations`).set(authorization(ownerToken)).send({ email: "CU04-INVITATION-RECIPIENT@EXAMPLE.TEST", role: "EDITOR" }).expect(201);
    const foreign = await request(app.getHttpServer()).post(`/projects/${projectId}/invitations`).set(authorization(ownerToken)).send({ email: rejectEmail, role: "VIEWER" }).expect(201);

    const mine = await request(app.getHttpServer()).get("/invitations").set(authorization(recipientToken)).expect(200);
    expect(mine.body).toEqual([expect.objectContaining({ id: own.body.id, project: { id: projectId, name: "Proyecto bandeja" }, role: "EDITOR", status: "PENDING", invitedBy: { email: ownerEmail } })]);
    expect(JSON.stringify(mine.body)).not.toContain(own.body.token);
    expect(JSON.stringify(mine.body)).not.toContain("tokenHash");
    await request(app.getHttpServer()).get("/invitations").set(authorization(rejectToken)).expect(200).expect((response) => expect(response.body).toEqual([expect.objectContaining({ id: foreign.body.id })]));
    await request(app.getHttpServer()).post(`/invitations/by-id/${foreign.body.id}/accept`).set(authorization(recipientToken)).expect(404);

    await request(app.getHttpServer()).post(`/invitations/by-id/${own.body.id}/accept`).set(authorization(recipientToken)).expect(201);
    expect(await prisma.projectMembership.findUnique({ where: { projectId_userId: { projectId, userId: recipientId } } })).toMatchObject({ role: "EDITOR" });
    await request(app.getHttpServer()).get("/invitations").set(authorization(recipientToken)).expect(200).expect((response) => expect(response.body).toEqual([]));
    await request(app.getHttpServer()).post(`/invitations/by-id/${own.body.id}/accept`).set(authorization(recipientToken)).expect(404);

    await request(app.getHttpServer()).post(`/invitations/by-id/${foreign.body.id}/reject`).set(authorization(rejectToken)).expect(201);
    expect(await prisma.projectMembership.count({ where: { projectId, user: { email: rejectEmail } } })).toBe(0);
    await request(app.getHttpServer()).post(`/invitations/by-id/${foreign.body.id}/reject`).set(authorization(rejectToken)).expect(404);
  });
});
