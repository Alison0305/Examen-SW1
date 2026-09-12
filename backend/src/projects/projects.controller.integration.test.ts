import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createProjectDocument } from "@examen-sw1/uml-core";
import { createApp } from "../create-app";
import { PrismaService } from "../prisma/prisma.service";

const ownerEmail = "cu03-project-owner@example.test";
const foreignEmail = "cu03-project-foreign@example.test";
const viewerEmail = "cu04-project-viewer@example.test";
const password = "password-123";

describe("ProjectsController PostgreSQL", () => {
  let app: Awaited<ReturnType<typeof createApp>>;
  let prisma: PrismaService;
  let ownerId: string;
  let foreignId: string;
  let viewerId: string;
  let ownerToken: string;
  let foreignToken: string;
  let viewerToken: string;

  const cleanupUsers = async () => {
    const users = await prisma.user.findMany({
      where: { email: { in: [ownerEmail, foreignEmail, viewerEmail] } },
      select: { id: true },
    });
    const ownerIds = users.map((user) => user.id);

    if (ownerIds.length > 0) {
      await prisma.project.deleteMany({ where: { ownerId: { in: ownerIds } } });
      await prisma.user.deleteMany({ where: { id: { in: ownerIds } } });
    }
  };

  const document = () => createProjectDocument();
  const authorization = (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    process.loadEnvFile(".env");
    process.env.JWT_SECRET = "projects-integration-test-secret-that-is-long-enough";
    process.env.JWT_EXPIRES_IN = "1h";
    app = await createApp();
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    prisma = app.get(PrismaService);
    await cleanupUsers();

    const ownerRegistration = await request(app.getHttpServer()).post("/auth/register").send({ email: ownerEmail, password }).expect(201);
    const foreignRegistration = await request(app.getHttpServer()).post("/auth/register").send({ email: foreignEmail, password }).expect(201);
    const viewerRegistration = await request(app.getHttpServer()).post("/auth/register").send({ email: viewerEmail, password }).expect(201);
    ownerId = ownerRegistration.body.id;
    foreignId = foreignRegistration.body.id;
    viewerId = viewerRegistration.body.id;

    const ownerLogin = await request(app.getHttpServer()).post("/auth/login").send({ email: ownerEmail, password }).expect(201);
    const foreignLogin = await request(app.getHttpServer()).post("/auth/login").send({ email: foreignEmail, password }).expect(201);
    const viewerLogin = await request(app.getHttpServer()).post("/auth/login").send({ email: viewerEmail, password }).expect(201);
    ownerToken = ownerLogin.body.accessToken;
    foreignToken = foreignLogin.body.accessToken;
    viewerToken = viewerLogin.body.accessToken;
  });

  afterAll(async () => {
    await cleanupUsers();
    await app.close();
  });

  it("protege, valida ownership y aplica revisión optimista sin sobrescrituras", async () => {
    const initialDocument = document();
    const missingProjectId = "c1111111-1111-4111-8111-111111111111";

    await request(app.getHttpServer()).post("/projects").send({ name: "Proyecto CU03", document: initialDocument }).expect(401);
    await request(app.getHttpServer()).get(`/projects/${initialDocument.id}`).expect(401);
    await request(app.getHttpServer()).put(`/projects/${initialDocument.id}`).send({ document: initialDocument, expectedRevision: 1 }).expect(401);

    await request(app.getHttpServer())
      .post("/projects")
      .set(authorization(ownerToken))
      .send({ name: "Proyecto CU03", document: initialDocument, ownerId: foreignId })
      .expect(400);
    expect(await prisma.project.count({ where: { ownerId } })).toBe(0);

    await request(app.getHttpServer())
      .post("/projects")
      .set(authorization(ownerToken))
      .send({ name: "Proyecto CU03", document: { ...initialDocument, uml: { ...initialDocument.uml, classes: {} } } })
      .expect(400);
    expect(await prisma.project.count({ where: { ownerId } })).toBe(0);

    const created = await request(app.getHttpServer()).post("/projects").set(authorization(ownerToken)).send({ name: "  Proyecto CU03  ", document: initialDocument }).expect(201);
    const projectId = created.body.id;
    expect(created.body).toMatchObject({ id: expect.any(String), name: "Proyecto CU03", document: initialDocument, revision: 1, accessRole: "OWNER" });
    expect(created.body).not.toHaveProperty("ownerId");
    expect((await prisma.project.findUniqueOrThrow({ where: { id: projectId } })).ownerId).toBe(ownerId);

    const ownProject = await request(app.getHttpServer()).get(`/projects/${projectId}`).set(authorization(ownerToken)).expect(200);
    expect(ownProject.body).toMatchObject({ id: projectId, name: "Proyecto CU03", document: initialDocument, revision: 1, accessRole: "OWNER" });
    await request(app.getHttpServer()).get(`/projects/${projectId}`).set(authorization(foreignToken)).expect(404);
    await request(app.getHttpServer()).get(`/projects/${missingProjectId}`).set(authorization(ownerToken)).expect(404);
    await request(app.getHttpServer()).get("/projects/not-a-uuid").set(authorization(ownerToken)).expect(400);

    const updatedDocument = document();
    const updated = await request(app.getHttpServer())
      .put(`/projects/${projectId}`)
      .set(authorization(ownerToken))
      .send({ document: updatedDocument, expectedRevision: 1 })
      .expect(200);
    expect(updated.body).toMatchObject({ id: projectId, name: "Proyecto CU03", document: updatedDocument, revision: 2, accessRole: "OWNER" });
    expect((await request(app.getHttpServer()).get(`/projects/${projectId}`).set(authorization(ownerToken)).expect(200)).body).toMatchObject({ document: updatedDocument, revision: 2 });
    expect(await prisma.project.findUniqueOrThrow({ where: { id: projectId } })).toMatchObject({ document: updatedDocument, revision: 2 });

    await request(app.getHttpServer())
      .put(`/projects/${projectId}`)
      .set(authorization(ownerToken))
      .send({ document: updatedDocument, expectedRevision: 2, ownerId: foreignId })
      .expect(400);
    await request(app.getHttpServer())
      .put(`/projects/${projectId}`)
      .set(authorization(ownerToken))
      .send({ document: updatedDocument, expectedRevision: 2, revision: 99 })
      .expect(400);
    await request(app.getHttpServer())
      .put(`/projects/${projectId}`)
      .set(authorization(ownerToken))
      .send({ document: updatedDocument, expectedRevision: "2" })
      .expect(400);

    await request(app.getHttpServer()).put(`/projects/${projectId}`).set(authorization(foreignToken)).send({ document: document(), expectedRevision: 2 }).expect(404);
    await request(app.getHttpServer()).put(`/projects/${projectId}`).set(authorization(foreignToken)).send({ document: document(), expectedRevision: 1 }).expect(404);

    const beforeStale = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
    await request(app.getHttpServer()).put(`/projects/${projectId}`).set(authorization(ownerToken)).send({ document: document(), expectedRevision: 1 }).expect(409);
    expect(await prisma.project.findUniqueOrThrow({ where: { id: projectId } })).toMatchObject({ document: beforeStale.document, revision: beforeStale.revision });

    const invalidUpdate = { ...updatedDocument, layout: { elements: {} } };
    await request(app.getHttpServer()).put(`/projects/${projectId}`).set(authorization(ownerToken)).send({ document: invalidUpdate, expectedRevision: 2 }).expect(400);
    expect(await prisma.project.findUniqueOrThrow({ where: { id: projectId } })).toMatchObject({ document: beforeStale.document, revision: beforeStale.revision });

    const firstConcurrentDocument = document();
    const secondConcurrentDocument = document();
    const concurrent = await Promise.all([
      request(app.getHttpServer()).put(`/projects/${projectId}`).set(authorization(ownerToken)).send({ document: firstConcurrentDocument, expectedRevision: 2 }),
      request(app.getHttpServer()).put(`/projects/${projectId}`).set(authorization(ownerToken)).send({ document: secondConcurrentDocument, expectedRevision: 2 }),
    ]);
    expect(concurrent.map((response) => response.status).sort()).toEqual([200, 409]);

    const finalProject = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
    const successfulDocument = concurrent.find((response) => response.status === 200)!.body.document;
    expect(finalProject).toMatchObject({ revision: 3, document: successfulDocument });
    expect(successfulDocument).toEqual(expect.objectContaining({ id: expect.any(String) }));
  });

  it("gestiona nombres, summaries y eliminación sin exponer ownership", async () => {
    const first = await request(app.getHttpServer()).post("/projects").set(authorization(ownerToken)).send({ name: "  Mi proyecto  ", document: document() }).expect(201);
    const second = await request(app.getHttpServer()).post("/projects").set(authorization(ownerToken)).send({ name: "Proyecto reciente", document: document() }).expect(201);
    const foreign = await request(app.getHttpServer()).post("/projects").set(authorization(foreignToken)).send({ name: "Proyecto ajeno", document: document() }).expect(201);

    expect(first.body).toMatchObject({ name: "Mi proyecto", accessRole: "OWNER", revision: 1 });
    expect((await prisma.project.findUniqueOrThrow({ where: { id: first.body.id } })).name).toBe("Mi proyecto");

    for (const name of ["", "   ", "x".repeat(101), 123, null, undefined]) {
      const payload = name === undefined ? { document: document() } : { name, document: document() };
      await request(app.getHttpServer()).post("/projects").set(authorization(ownerToken)).send(payload).expect(400);
    }
    for (const field of ["ownerId", "revision", "id", "createdAt", "updatedAt", "accessRole"]) {
      await request(app.getHttpServer()).post("/projects").set(authorization(ownerToken)).send({ name: "Inválido", document: document(), [field]: "forbidden" }).expect(400);
    }

    const summary = await request(app.getHttpServer()).get("/projects").set(authorization(ownerToken)).expect(200);
    expect(summary.body.map((project: { id: string }) => project.id)).toContain(first.body.id);
    expect(summary.body.map((project: { id: string }) => project.id)).toContain(second.body.id);
    expect(summary.body.map((project: { id: string }) => project.id)).not.toContain(foreign.body.id);
    expect(summary.body[0]).toMatchObject({ id: expect.any(String), name: expect.any(String), revision: expect.any(Number), accessRole: "OWNER", createdAt: expect.any(String), updatedAt: expect.any(String) });
    expect(summary.body[0]).not.toHaveProperty("document");
    expect(summary.body[0]).not.toHaveProperty("ownerId");

    const beforeRename = await prisma.project.findUniqueOrThrow({ where: { id: first.body.id } });
    const renamed = await request(app.getHttpServer()).patch(`/projects/${first.body.id}`).set(authorization(ownerToken)).send({ name: "  Proyecto renombrado  " }).expect(200);
    expect(renamed.body).toMatchObject({ name: "Proyecto renombrado", revision: beforeRename.revision, accessRole: "OWNER" });
    expect(await prisma.project.findUniqueOrThrow({ where: { id: first.body.id } })).toMatchObject({ name: "Proyecto renombrado", revision: beforeRename.revision });
    for (const name of ["", "   ", "x".repeat(101), 123, null, undefined]) {
      const payload = name === undefined ? {} : { name };
      await request(app.getHttpServer()).patch(`/projects/${first.body.id}`).set(authorization(ownerToken)).send(payload).expect(400);
    }
    for (const field of ["ownerId", "revision", "document", "id", "accessRole"]) {
      await request(app.getHttpServer()).patch(`/projects/${first.body.id}`).set(authorization(ownerToken)).send({ name: "No cambia", [field]: "forbidden" }).expect(400);
    }
    await request(app.getHttpServer()).patch(`/projects/${first.body.id}`).set(authorization(foreignToken)).send({ name: "Ajeno" }).expect(404);
    await request(app.getHttpServer()).patch("/projects/not-a-uuid").set(authorization(ownerToken)).send({ name: "Inválido" }).expect(400);

    await request(app.getHttpServer()).delete(`/projects/${second.body.id}`).set(authorization(ownerToken)).expect(204);
    expect(await prisma.project.findUnique({ where: { id: second.body.id } })).toBeNull();
    expect(await prisma.user.findUnique({ where: { id: ownerId } })).not.toBeNull();
    await request(app.getHttpServer()).delete(`/projects/${foreign.body.id}`).set(authorization(ownerToken)).expect(404);
    await request(app.getHttpServer()).delete("/projects/not-a-uuid").set(authorization(ownerToken)).expect(400);
  });

  it("aplica roles, membresías y concurrencia sin crear membresía OWNER", async () => {
    const created = await request(app.getHttpServer()).post("/projects").set(authorization(ownerToken)).send({ name: "Proyecto compartido", document: document() }).expect(201);
    const projectId = created.body.id;

    await request(app.getHttpServer()).patch(`/projects/${projectId}/members/${ownerId}`).set(authorization(ownerToken)).send({ role: "EDITOR" }).expect(400);
    expect(await prisma.projectMembership.findUnique({ where: { projectId_userId: { projectId, userId: ownerId } } })).toBeNull();
    await request(app.getHttpServer()).patch(`/projects/${projectId}/members/${foreignId}`).set(authorization(ownerToken)).send({ role: "EDITOR" }).expect(200);
    await request(app.getHttpServer()).patch(`/projects/${projectId}/members/${viewerId}`).set(authorization(ownerToken)).send({ role: "VIEWER" }).expect(200);
    await request(app.getHttpServer()).patch(`/projects/${projectId}/members/${viewerId}`).set(authorization(ownerToken)).send({ role: "OWNER" }).expect(400);

    const members = await request(app.getHttpServer()).get(`/projects/${projectId}/members`).set(authorization(ownerToken)).expect(200);
    expect(members.body).toEqual(expect.arrayContaining([
      expect.objectContaining({ userId: foreignId, email: foreignEmail, role: "EDITOR" }),
      expect.objectContaining({ userId: viewerId, email: viewerEmail, role: "VIEWER" }),
    ]));
    await request(app.getHttpServer()).get(`/projects/${projectId}/members`).set(authorization(foreignToken)).expect(403);
    await request(app.getHttpServer()).get(`/projects/${projectId}/members`).set(authorization(viewerToken)).expect(403);

    expect((await request(app.getHttpServer()).get(`/projects/${projectId}`).set(authorization(foreignToken)).expect(200)).body.accessRole).toBe("EDITOR");
    expect((await request(app.getHttpServer()).get(`/projects/${projectId}`).set(authorization(viewerToken)).expect(200)).body.accessRole).toBe("VIEWER");
    const editorList = await request(app.getHttpServer()).get("/projects").set(authorization(foreignToken)).expect(200);
    expect(editorList.body.filter((project: { id: string }) => project.id === projectId)).toHaveLength(1);
    expect(editorList.body.find((project: { id: string }) => project.id === projectId)).toMatchObject({ accessRole: "EDITOR" });

    const initial = await request(app.getHttpServer()).get(`/projects/${projectId}`).set(authorization(ownerToken)).expect(200);
    const [first, second] = await Promise.all([
      request(app.getHttpServer()).put(`/projects/${projectId}`).set(authorization(ownerToken)).send({ document: document(), expectedRevision: initial.body.revision }),
      request(app.getHttpServer()).put(`/projects/${projectId}`).set(authorization(foreignToken)).send({ document: document(), expectedRevision: initial.body.revision }),
    ]);
    expect([first.status, second.status].sort()).toEqual([200, 409]);
    await request(app.getHttpServer()).put(`/projects/${projectId}`).set(authorization(viewerToken)).send({ document: document(), expectedRevision: initial.body.revision + 1 }).expect(403);
    await request(app.getHttpServer()).patch(`/projects/${projectId}`).set(authorization(foreignToken)).send({ name: "No permitido" }).expect(403);
    await request(app.getHttpServer()).delete(`/projects/${projectId}`).set(authorization(viewerToken)).expect(403);

    await request(app.getHttpServer()).delete(`/projects/${projectId}/members/${viewerId}`).set(authorization(ownerToken)).expect(204);
    await request(app.getHttpServer()).get(`/projects/${projectId}`).set(authorization(viewerToken)).expect(404);
    await request(app.getHttpServer()).delete(`/projects/${projectId}`).set(authorization(ownerToken)).expect(204);
    expect(await prisma.projectMembership.count({ where: { projectId } })).toBe(0);
  });
});
