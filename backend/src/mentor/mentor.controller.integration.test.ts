import { INestApplication, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { FastifyAdapter, NestFastifyApplication } from "@nestjs/platform-fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { MentorInteractionIdentityResolver } from "../mentor-identity/mentor-interaction-identity.resolver";
import { ProjectAccessService } from "../projects/project-access.service";
import { ProjectsPersistenceService } from "../projects/projects-persistence.service";
import { MentorController } from "./mentor.controller";
import { MentorContextBuilder } from "./mentor-context.builder";
import { MENTOR_AI_PROVIDER, MENTOR_INTERACTION_MEMORY, MENTOR_INTERACTION_RECORDER } from "./mentor.contracts";
import { MentorService } from "./mentor.service";
import { createProjectDocument, primitiveType } from "@examen-sw1/uml-core";

describe("POST /projects/:id/mentor/query", () => {
  let app: INestApplication;
  const projectId = "11111111-1111-4111-8111-111111111111";
  const access = { requireView: vi.fn().mockResolvedValue("VIEWER") };
  const provider = { ask: vi.fn().mockResolvedValue("Cliente tiene un nombre."), recommend: vi.fn().mockResolvedValue({ problem: "Separación", alternatives: ["Mantener límites"], rationale: "Next.js y NestJS están separados.", limitations: "No evalúa proveedores externos.", confidence: 0.8, requiresUmlChange: false }) };
  const recorder = { record: vi.fn().mockResolvedValue(undefined) };
  const users = {
    "Bearer user-a": { id: "user-a", email: "alice@example.test" },
    "Bearer user-b": { id: "user-b", email: "bob@example.test" },
  } as const;

  beforeEach(async () => {
    vi.clearAllMocks();
    access.requireView.mockResolvedValue("VIEWER");
    const document = createProjectDocument({ id: "22222222-2222-4222-8222-222222222222" });
    document.uml.classes.push({ id: "33333333-3333-4333-8333-333333333333", name: "Cliente", visibility: "public", attributes: [{ id: "44444444-4444-4444-8444-444444444444", name: "nombre", visibility: "public", type: primitiveType("string") }], operations: [] });
    const projects = { findProject: vi.fn().mockResolvedValue({ id: projectId, name: "CRM", revision: 5, document }) };
    const module = await Test.createTestingModule({
      controllers: [MentorController],
      providers: [MentorService, MentorContextBuilder, MentorInteractionIdentityResolver, { provide: ProjectAccessService, useValue: access }, { provide: ProjectsPersistenceService, useValue: projects }, { provide: MENTOR_AI_PROVIDER, useValue: provider }, { provide: MENTOR_INTERACTION_RECORDER, useValue: recorder }, { provide: MENTOR_INTERACTION_MEMORY, useValue: { recent: vi.fn().mockResolvedValue([]) } }],
    }).overrideGuard(JwtAuthGuard).useValue({ canActivate(context: { switchToHttp(): { getRequest(): { headers: { authorization?: string }; authenticatedUser?: { id: string; email: string } } } }) {
      const request = context.switchToHttp().getRequest();
      request.authenticatedUser = users[request.headers.authorization as keyof typeof users] ?? users["Bearer user-a"];
      return true;
    } }).compile();
    app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterEach(async () => app.close());

  it("returns a contextual provider response through the authenticated HTTP route", async () => {
    const response = await request(app.getHttpServer()).post(`/projects/${projectId}/mentor/query`).set("Authorization", "Bearer user-a").send({ question: "Describe Cliente" }).expect(201);

    expect(response.body).toEqual({ answer: "Cliente tiene un nombre.", grounded: true, projectRevision: 5 });
    expect(provider.ask).toHaveBeenCalledWith(expect.objectContaining({ projectName: "CRM", elementNames: ["Cliente"] }), "Describe Cliente", []);
    expect(JSON.stringify(provider.ask.mock.calls)).not.toMatch(/user-a|alice@example\.test|VIEWER/);
    expect(recorder.record).toHaveBeenCalledWith(expect.objectContaining({ projectId, userId: "user-a", author: { email: "alice@example.test" }, accessRole: "VIEWER", occurredAt: expect.any(Date) }));
  });

  it("rejects an invalid question", async () => {
    await request(app.getHttpServer()).post(`/projects/${projectId}/mentor/query`).set("Authorization", "Bearer user-a").send({ question: "" }).expect(400);
  });

  it("oculta detalles internos si falla el proveedor", async () => {
    provider.ask.mockRejectedValueOnce(new Error("detalle interno del proveedor"));

    const response = await request(app.getHttpServer()).post(`/projects/${projectId}/mentor/query`).set("Authorization", "Bearer user-a").send({ question: "Describe Cliente" }).expect(503);

    expect(response.body).toEqual({ statusCode: 503, error: "Service Unavailable", message: "El Mentor IA no está disponible en este momento." });
    expect(JSON.stringify(response.body)).not.toContain("detalle interno");
  });

  it("rechaza campos de suplantación y usa solo la identidad autenticada", async () => {
    await request(app.getHttpServer()).post(`/projects/${projectId}/mentor/query`).set("Authorization", "Bearer user-a").send({ question: "Describe Cliente", userId: "user-b", email: "mallory@example.test", author: { email: "mallory@example.test" }, accessRole: "OWNER" }).expect(400);
    expect(recorder.record).not.toHaveBeenCalled();

    await request(app.getHttpServer()).post(`/projects/${projectId}/mentor/query`).set("Authorization", "Bearer user-a").send({ question: "Describe Cliente" }).expect(201);

    expect(access.requireView).toHaveBeenCalledWith(projectId, "user-a");
    expect(recorder.record).toHaveBeenCalledWith(expect.objectContaining({ userId: "user-a", author: { email: "alice@example.test" }, accessRole: "VIEWER" }));
  });

  it("expone recomendaciones de solo lectura y conserva la consulta libre", async () => {
    const response = await request(app.getHttpServer()).post(`/projects/${projectId}/mentor/recommendations`).set("Authorization", "Bearer user-a").send({ question: "¿Cómo separar frontend y backend?" }).expect(201);
    expect(response.body).toMatchObject({ status: "READ_ONLY", needsClarification: false, requiresUmlChange: false, projectRevision: 5 });
    expect(provider.recommend).toHaveBeenCalledWith(expect.objectContaining({ projectName: "CRM" }), expect.objectContaining({ architecture: expect.any(Array), springExport: expect.any(Array) }), "¿Cómo separar frontend y backend?", []);
    await request(app.getHttpServer()).post(`/projects/${projectId}/mentor/query`).set("Authorization", "Bearer user-a").send({ question: "Describe Cliente" }).expect(201);
    expect(provider.ask).toHaveBeenCalled();
  });

  it("resuelve generación Spring verificable antes de Qwen y conserva la consulta libre", async () => {
    const response = await request(app.getHttpServer()).post(`/projects/${projectId}/mentor/recommendations`).set("Authorization", "Bearer user-a").send({ question: "¿Qué debo tener en cuenta para generar el backend Spring Boot?" }).expect(201);
    expect(response.body).toMatchObject({ status: "READ_ONLY", needsClarification: false, requiresUmlChange: false, confidence: 1, projectRevision: 5 });
    expect(response.body.problem).toMatch(/UML canónico válido y exportable/);
    expect(JSON.stringify(response.body)).not.toMatch(/React|Node\.js|microservicios|Django|Laravel/i);
    expect(provider.recommend).not.toHaveBeenCalled();
    await request(app.getHttpServer()).post(`/projects/${projectId}/mentor/query`).set("Authorization", "Bearer user-a").send({ question: "Describe Cliente" }).expect(201);
    expect(provider.ask).toHaveBeenCalledOnce();
  });

  it("mantiene identidades separadas para dos usuarios y rechaza al no autorizado antes de cargar el proyecto", async () => {
    await request(app.getHttpServer()).post(`/projects/${projectId}/mentor/query`).set("Authorization", "Bearer user-a").send({ question: "Describe Cliente" }).expect(201);
    await request(app.getHttpServer()).post(`/projects/${projectId}/mentor/query`).set("Authorization", "Bearer user-b").send({ question: "Describe Cliente" }).expect(201);
    expect(recorder.record).toHaveBeenNthCalledWith(1, expect.objectContaining({ userId: "user-a", author: { email: "alice@example.test" } }));
    expect(recorder.record).toHaveBeenNthCalledWith(2, expect.objectContaining({ userId: "user-b", author: { email: "bob@example.test" } }));

    access.requireView.mockRejectedValueOnce(new NotFoundException());
    await request(app.getHttpServer()).post(`/projects/${projectId}/mentor/query`).set("Authorization", "Bearer user-b").send({ question: "Describe Cliente" }).expect(404);
  });
});
