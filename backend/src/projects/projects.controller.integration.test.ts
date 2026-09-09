import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createProjectDocument } from "@examen-sw1/uml-core";
import { createApp } from "../create-app";
import { PrismaService } from "../prisma/prisma.service";

const ownerEmail = "cu03-project-owner@example.test";
const foreignEmail = "cu03-project-foreign@example.test";
const password = "password-123";

describe("ProjectsController PostgreSQL", () => {
  let app: Awaited<ReturnType<typeof createApp>>;
  let prisma: PrismaService;
  let ownerId: string;
  let foreignId: string;
  let ownerToken: string;
  let foreignToken: string;

  const cleanupUsers = async () => {
    const users = await prisma.user.findMany({
      where: { email: { in: [ownerEmail, foreignEmail] } },
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
    ownerId = ownerRegistration.body.id;
    foreignId = foreignRegistration.body.id;

    const ownerLogin = await request(app.getHttpServer()).post("/auth/login").send({ email: ownerEmail, password }).expect(201);
    const foreignLogin = await request(app.getHttpServer()).post("/auth/login").send({ email: foreignEmail, password }).expect(201);
    ownerToken = ownerLogin.body.accessToken;
    foreignToken = foreignLogin.body.accessToken;
  });

  afterAll(async () => {
    await cleanupUsers();
    await app.close();
  });

  it("protege, valida ownership y aplica revisión optimista sin sobrescrituras", async () => {
    const initialDocument = document();
    const missingProjectId = "c1111111-1111-4111-8111-111111111111";

    await request(app.getHttpServer()).post("/projects").send({ document: initialDocument }).expect(401);
    await request(app.getHttpServer()).get(`/projects/${initialDocument.id}`).expect(401);
    await request(app.getHttpServer()).put(`/projects/${initialDocument.id}`).send({ document: initialDocument, expectedRevision: 1 }).expect(401);

    await request(app.getHttpServer())
      .post("/projects")
      .set(authorization(ownerToken))
      .send({ document: initialDocument, ownerId: foreignId })
      .expect(400);
    expect(await prisma.project.count({ where: { ownerId } })).toBe(0);

    await request(app.getHttpServer())
      .post("/projects")
      .set(authorization(ownerToken))
      .send({ document: { ...initialDocument, uml: { ...initialDocument.uml, classes: {} } } })
      .expect(400);
    expect(await prisma.project.count({ where: { ownerId } })).toBe(0);

    const created = await request(app.getHttpServer()).post("/projects").set(authorization(ownerToken)).send({ document: initialDocument }).expect(201);
    const projectId = created.body.id;
    expect(created.body).toMatchObject({ id: expect.any(String), document: initialDocument, revision: 1 });
    expect(created.body).not.toHaveProperty("ownerId");
    expect((await prisma.project.findUniqueOrThrow({ where: { id: projectId } })).ownerId).toBe(ownerId);

    const ownProject = await request(app.getHttpServer()).get(`/projects/${projectId}`).set(authorization(ownerToken)).expect(200);
    expect(ownProject.body).toMatchObject({ id: projectId, document: initialDocument, revision: 1 });
    await request(app.getHttpServer()).get(`/projects/${projectId}`).set(authorization(foreignToken)).expect(404);
    await request(app.getHttpServer()).get(`/projects/${missingProjectId}`).set(authorization(ownerToken)).expect(404);
    await request(app.getHttpServer()).get("/projects/not-a-uuid").set(authorization(ownerToken)).expect(400);

    const updatedDocument = document();
    const updated = await request(app.getHttpServer())
      .put(`/projects/${projectId}`)
      .set(authorization(ownerToken))
      .send({ document: updatedDocument, expectedRevision: 1 })
      .expect(200);
    expect(updated.body).toMatchObject({ id: projectId, document: updatedDocument, revision: 2 });
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
});
