import { NotFoundException, ServiceUnavailableException, UnauthorizedException, UnprocessableEntityException } from "@nestjs/common";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { mapToRelationalModel } from "@examen-sw1/relational-core";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthenticatedRequest } from "../auth/auth.types";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { buildUmlAnalysisContext } from "./uml-analysis-context";
import { buildUmlAnalysisPrompt } from "./uml-analysis-prompt";
import { UmlAnalysisController } from "./uml-analysis.controller";
import { toUmlAnalysisFocus, type UmlAnalysisDto } from "./dto/uml-analysis.dto";
import { UmlAnalysisService, type UmlAnalysisResponse } from "./uml-analysis.service";

// Wrapped engines: the controller must never reach them (the service is a double here).
vi.mock("@examen-sw1/relational-core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@examen-sw1/relational-core")>();
  return { ...actual, mapToRelationalModel: vi.fn(actual.mapToRelationalModel) };
});
vi.mock("./uml-analysis-context", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./uml-analysis-context")>();
  return { ...actual, buildUmlAnalysisContext: vi.fn(actual.buildUmlAnalysisContext) };
});
vi.mock("./uml-analysis-prompt", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./uml-analysis-prompt")>();
  return { ...actual, buildUmlAnalysisPrompt: vi.fn(actual.buildUmlAnalysisPrompt) };
});

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const CLASS_ID = "550e8400-e29b-41d4-a716-446655440000";
const RELATIONSHIP_ID = "550e8400-e29b-41d4-a716-446655440001";

// A response object as the service returns it; the controller must hand back this very object.
const SERVICE_RESPONSE: UmlAnalysisResponse = {
  projectRevision: 7,
  focus: { kind: "class", id: CLASS_ID, name: "Cliente" },
  analysis: null,
  explanation: null,
  diagnostic: "ELEMENT_NOT_FOUND",
};

function fakeService(response: UmlAnalysisResponse | Error = SERVICE_RESPONSE) {
  const analyze = vi.fn(async (...args: Parameters<UmlAnalysisService["analyze"]>) => {
    void args;
    if (response instanceof Error) throw response;
    return response;
  });
  return { analyze };
}

const authenticated = (id = USER_ID) => ({ authenticatedUser: { id, email: "viewer@example.com" } }) as unknown as AuthenticatedRequest;
const dto = (focus: UmlAnalysisDto["focus"]) => ({ focus }) as UmlAnalysisDto;

beforeEach(() => vi.clearAllMocks());

describe("UmlAnalysisController (unitario)", () => {
  it("T-01: con una clase llama al servicio con projectId, el usuario autenticado y el foco", async () => {
    const service = fakeService();
    await new UmlAnalysisController(service as never).analyze(authenticated(), PROJECT_ID, dto({ kind: "class", id: CLASS_ID }));

    expect(service.analyze).toHaveBeenCalledWith(PROJECT_ID, USER_ID, { kind: "class", id: CLASS_ID });
  });

  it("T-02: con una relación pasa su foco", async () => {
    const service = fakeService();
    await new UmlAnalysisController(service as never).analyze(authenticated(), PROJECT_ID, dto({ kind: "relationship", id: RELATIONSHIP_ID }));

    expect(service.analyze).toHaveBeenCalledWith(PROJECT_ID, USER_ID, { kind: "relationship", id: RELATIONSHIP_ID });
  });

  it("T-03: con el modelo completo pasa un foco sin id", async () => {
    const service = fakeService();
    await new UmlAnalysisController(service as never).analyze(authenticated(), PROJECT_ID, dto({ kind: "model" }));

    expect(service.analyze).toHaveBeenCalledWith(PROJECT_ID, USER_ID, { kind: "model" });
    expect(service.analyze.mock.calls[0]![2]).not.toHaveProperty("id");
  });

  it("T-04 y T-05: devuelve exactamente el objeto del servicio y lo llama una sola vez", async () => {
    const service = fakeService();
    const response = await new UmlAnalysisController(service as never).analyze(authenticated(), PROJECT_ID, dto({ kind: "class", id: CLASS_ID }));

    expect(response).toBe(SERVICE_RESPONSE);
    expect(service.analyze).toHaveBeenCalledTimes(1);
  });

  it("T-06: sin usuario autenticado responde 404 sin llamar al servicio", async () => {
    const service = fakeService();
    const controller = new UmlAnalysisController(service as never);

    expect(() => controller.analyze({} as AuthenticatedRequest, PROJECT_ID, dto({ kind: "model" }))).toThrow(NotFoundException);
    expect(service.analyze).not.toHaveBeenCalled();
  });

  it("T-11: no ejecuta mapper, contexto, prompt ni proveedor", async () => {
    await new UmlAnalysisController(fakeService() as never).analyze(authenticated(), PROJECT_ID, dto({ kind: "relationship", id: RELATIONSHIP_ID }));

    for (const engine of [mapToRelationalModel, buildUmlAnalysisContext, buildUmlAnalysisPrompt]) expect(engine).not.toHaveBeenCalled();
  });

  it("toUmlAnalysisFocus no devuelve propiedades ajenas al foco", () => {
    expect(toUmlAnalysisFocus(dto({ kind: "class", id: CLASS_ID }))).toEqual({ kind: "class", id: CLASS_ID });
    expect(toUmlAnalysisFocus(dto({ kind: "model" }))).toEqual({ kind: "model" });
  });
});

describe("POST /projects/:id/mentor/analysis (HTTP)", () => {
  let app: NestFastifyApplication | undefined;

  async function createApp(service: ReturnType<typeof fakeService>) {
    const module = await Test.createTestingModule({ controllers: [UmlAnalysisController], providers: [{ provide: UmlAnalysisService, useValue: service }] })
      .overrideGuard(JwtAuthGuard).useValue({
        canActivate(context: { switchToHttp(): { getRequest(): { headers: { authorization?: string }; authenticatedUser?: { id: string } } } }) {
          const incoming = context.switchToHttp().getRequest();
          if (incoming.headers.authorization !== "Bearer valid") throw new UnauthorizedException();
          incoming.authenticatedUser = { id: USER_ID };
          return true;
        },
      }).compile();
    app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    return app;
  }
  const post = (server: NestFastifyApplication, body: unknown, projectId = PROJECT_ID, token: string | null = "valid") => {
    const call = request(server.getHttpServer()).post(`/projects/${projectId}/mentor/analysis`);
    return (token ? call.set("Authorization", `Bearer ${token}`) : call).send(body as object);
  };

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("T-01/T-04: responde 200 con el cuerpo del servicio y le pasa el usuario del token", async () => {
    const service = fakeService();
    const response = await post(await createApp(service), { focus: { kind: "class", id: CLASS_ID } }).expect(200);

    expect(response.body).toEqual(SERVICE_RESPONSE);
    expect(service.analyze).toHaveBeenCalledWith(PROJECT_ID, USER_ID, { kind: "class", id: CLASS_ID });
  });

  it("T-03: acepta el modelo completo y devuelve los diagnósticos deterministas con 200", async () => {
    const emptyModel: UmlAnalysisResponse = { projectRevision: 3, focus: { kind: "model" }, analysis: null, explanation: null, diagnostic: "EMPTY_MODEL" };
    const service = fakeService(emptyModel);

    expect((await post(await createApp(service), { focus: { kind: "model" } }).expect(200)).body).toEqual(emptyModel);
  });

  it("T-06: un userId hostil en el body se rechaza con 400 y el servicio nunca lo recibe", async () => {
    const service = fakeService();
    const server = await createApp(service);

    await post(server, { focus: { kind: "class", id: CLASS_ID }, userId: "33333333-3333-4333-8333-333333333333" }).expect(400);
    await post(server, { focus: { kind: "class", id: CLASS_ID, userId: "33333333-3333-4333-8333-333333333333" } }).expect(400);
    expect(service.analyze).not.toHaveBeenCalled();
  });

  it("T-07: el projectId sale de la ruta y un projectId inválido responde 400", async () => {
    const service = fakeService();
    const server = await createApp(service);
    const otherProject = "44444444-4444-4444-8444-444444444444";

    await post(server, { focus: { kind: "model" }, projectId: PROJECT_ID }, otherProject).expect(400);
    await post(server, { focus: { kind: "model" } }, otherProject).expect(200);
    expect(service.analyze).toHaveBeenLastCalledWith(otherProject, USER_ID, { kind: "model" });
    await post(server, { focus: { kind: "model" } }, "no-es-un-uuid").expect(400);
    expect(service.analyze).toHaveBeenCalledTimes(1);
  });

  it("rechaza con 400 los cuerpos inválidos sin llamar al servicio", async () => {
    const service = fakeService();
    const server = await createApp(service);

    for (const body of [{}, { focus: { kind: "enumeration", id: CLASS_ID } }, { focus: { kind: "class" } }, { focus: { kind: "relationship", id: "x" } }, { focus: { kind: "model", id: CLASS_ID } }, { focus: { kind: "model" }, question: "¿Qué es?" }]) {
      await post(server, body).expect(400);
    }
    expect(service.analyze).not.toHaveBeenCalled();
  });

  it("un POST sin cuerpo, con cuerpo null o con JSON vacío responde 400 y no 500", async () => {
    const service = fakeService();
    const server = await createApp(service);
    const call = () => request(server.getHttpServer()).post(`/projects/${PROJECT_ID}/mentor/analysis`).set("Authorization", "Bearer valid");

    await call().expect(400);
    await call().set("Content-Type", "application/json").send("null").expect(400);
    await call().set("Content-Type", "application/json").send("").expect(400);
    expect(service.analyze).not.toHaveBeenCalled();
  });

  it("sin token responde 401 sin llamar al servicio", async () => {
    const service = fakeService();
    await post(await createApp(service), { focus: { kind: "model" } }, PROJECT_ID, null).expect(401);
    expect(service.analyze).not.toHaveBeenCalled();
  });

  it("T-08: el 503 del servicio se propaga con el mismo cuerpo que CU-2P-01", async () => {
    const unavailable = new ServiceUnavailableException("El Mentor IA no está disponible en este momento.", { cause: new Error("C:/modelos/qwen3.gguf"), description: "Service Unavailable" });
    const response = await post(await createApp(fakeService(unavailable)), { focus: { kind: "class", id: CLASS_ID } }).expect(503);

    expect(response.body).toEqual({ statusCode: 503, error: "Service Unavailable", message: "El Mentor IA no está disponible en este momento." });
    expect(JSON.stringify(response.body)).not.toContain("gguf");
  });

  it("T-09: el 404 del servicio (sin acceso o proyecto inexistente) se propaga", async () => {
    await post(await createApp(fakeService(new NotFoundException())), { focus: { kind: "model" } }).expect(404);
  });

  it("T-10: el 422 del servicio (documento inválido) se propaga", async () => {
    await post(await createApp(fakeService(new UnprocessableEntityException("El modelo del proyecto no es válido para analizarlo."))), { focus: { kind: "model" } }).expect(422);
  });

  it("T-12: la respuesta es JSON serializable y llega sin pérdida", async () => {
    const response = await post(await createApp(fakeService()), { focus: { kind: "class", id: CLASS_ID } }).expect(200);

    expect(response.headers["content-type"]).toMatch(/application\/json/);
    expect(response.body).toEqual(JSON.parse(JSON.stringify(SERVICE_RESPONSE)));
  });
});
