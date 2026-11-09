import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { FastifyAdapter, NestFastifyApplication } from "@nestjs/platform-fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { ProjectAccessService } from "../projects/project-access.service";
import { ProjectsPersistenceService } from "../projects/projects-persistence.service";
import { MentorController } from "./mentor.controller";
import { MentorContextBuilder } from "./mentor-context.builder";
import { MENTOR_AI_PROVIDER, MENTOR_INTERACTION_RECORDER } from "./mentor.contracts";
import { MentorService } from "./mentor.service";
import { createProjectDocument, primitiveType } from "@examen-sw1/uml-core";

describe("POST /projects/:id/mentor/query", () => {
  let app: INestApplication;
  const projectId = "11111111-1111-4111-8111-111111111111";
  const access = { requireView: vi.fn().mockResolvedValue("VIEWER") };
  const provider = { ask: vi.fn().mockResolvedValue("Cliente tiene un nombre.") };

  beforeEach(async () => {
    const document = createProjectDocument({ id: "22222222-2222-4222-8222-222222222222" });
    document.uml.classes.push({ id: "33333333-3333-4333-8333-333333333333", name: "Cliente", visibility: "public", attributes: [{ id: "44444444-4444-4444-8444-444444444444", name: "nombre", visibility: "public", type: primitiveType("string") }], operations: [] });
    const projects = { findProject: vi.fn().mockResolvedValue({ id: projectId, name: "CRM", revision: 5, document }) };
    const module = await Test.createTestingModule({
      controllers: [MentorController],
      providers: [MentorService, MentorContextBuilder, { provide: ProjectAccessService, useValue: access }, { provide: ProjectsPersistenceService, useValue: projects }, { provide: MENTOR_AI_PROVIDER, useValue: provider }, { provide: MENTOR_INTERACTION_RECORDER, useValue: { record: vi.fn().mockResolvedValue(undefined) } }],
    }).overrideGuard(JwtAuthGuard).useValue({ canActivate(context: { switchToHttp(): { getRequest(): { authenticatedUser?: { id: string } } } }) { context.switchToHttp().getRequest().authenticatedUser = { id: "user-a" }; return true; } }).compile();
    app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterEach(async () => app.close());

  it("returns a contextual provider response through the authenticated HTTP route", async () => {
    const response = await request(app.getHttpServer()).post(`/projects/${projectId}/mentor/query`).send({ question: "Describe Cliente" }).expect(201);

    expect(response.body).toEqual({ answer: "Cliente tiene un nombre.", grounded: true, projectRevision: 5 });
    expect(provider.ask).toHaveBeenCalledWith(expect.objectContaining({ projectName: "CRM", elementNames: ["Cliente"] }), "Describe Cliente");
  });

  it("rejects an invalid question", async () => {
    await request(app.getHttpServer()).post(`/projects/${projectId}/mentor/query`).send({ question: "" }).expect(400);
  });

  it("oculta detalles internos si falla el proveedor", async () => {
    provider.ask.mockRejectedValueOnce(new Error("detalle interno del proveedor"));

    const response = await request(app.getHttpServer()).post(`/projects/${projectId}/mentor/query`).send({ question: "Describe Cliente" }).expect(503);

    expect(response.body).toEqual({ statusCode: 503, error: "Service Unavailable", message: "El Mentor IA no está disponible en este momento." });
    expect(JSON.stringify(response.body)).not.toContain("detalle interno");
  });
});
