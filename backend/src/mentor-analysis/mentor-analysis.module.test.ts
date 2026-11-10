import { NotFoundException, UnauthorizedException } from "@nestjs/common";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test, type TestingModule } from "@nestjs/testing";
import { createProjectDocument, type CanonicalUmlModel, type ProjectDocument } from "@examen-sw1/uml-core";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppModule } from "../app.module";
import { AssistantInterpreterService } from "../assistant/assistant-interpreter.service";
import { AssistantModule, ASSISTANT_LOCAL_MODEL } from "../assistant/assistant.module";
import type { TextGenerationRequest } from "../assistant/local-text-model";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { MENTOR_AI_PROVIDER, type MentorAiProvider } from "../mentor/mentor.contracts";
import { MentorModule } from "../mentor/mentor.module";
import { MentorService } from "../mentor/mentor.service";
import { PrismaModule } from "../prisma/prisma.module";
import { PrismaService } from "../prisma/prisma.service";
import { ProjectAccessService } from "../projects/project-access.service";
import { InvalidProjectDocumentError, ProjectsPersistenceService } from "../projects/projects-persistence.service";
import { VisionModule } from "../vision/vision.module";
import { LocalQwenUmlAnalysisProvider } from "./local-qwen-uml-analysis.provider";
import { MentorAnalysisModule } from "./mentor-analysis.module";
import { UML_ANALYSIS_AI_PROVIDER, type UmlAnalysisAiProvider } from "./uml-analysis-ai.contracts";
import { UML_ANALYSIS_SYSTEM_PROMPT } from "./uml-analysis-prompt";
import { UmlAnalysisController } from "./uml-analysis.controller";
import { UmlAnalysisService } from "./uml-analysis.service";

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

// Stand-in for the shared QueuedLocalTextModel: no GGUF is loaded, every call is recorded.
class FakeLocalModel {
  readonly generateText = vi.fn(async (request: TextGenerationRequest) => {
    void request;
    return "Resumen: cada Cliente realiza 0..* Pedido.";
  });
  readonly generateStructured = vi.fn(async () => ({ commands: [] }));
  readonly warmup = vi.fn(async () => undefined);
  readonly dispose = vi.fn(async () => undefined);
}

const clientePedido = (): CanonicalUmlModel => ({
  classes: [
    { id: id(1), name: "Cliente", visibility: "public", attributes: [{ id: id(100), name: "id", visibility: "private", type: { kind: "primitive", name: "integer" } }], operations: [] },
    { id: id(2), name: "Pedido", visibility: "public", attributes: [{ id: id(200), name: "id", visibility: "private", type: { kind: "primitive", name: "integer" } }], operations: [] },
  ],
  enumerations: [],
  packages: [],
  relationships: [{ id: id(40), type: "Association", name: "realiza", sourceId: id(1), targetId: id(2), sourceMultiplicity: { lower: 1, upper: 1 }, targetMultiplicity: { lower: 0, upper: "unbounded" } }],
});

function documentOf(uml: CanonicalUmlModel): ProjectDocument {
  return { ...createProjectDocument({ id: id(900), now: new Date("2026-11-09T00:00:00.000Z") }), revision: 7, uml };
}

type Setup = Readonly<{ uml?: CanonicalUmlModel; localModel?: FakeLocalModel | undefined; imports?: unknown[] }>;

// Real MentorAnalysisModule (and its real imports); only the edges are replaced: database, project access and
// persistence, the JWT guard and the local model.
async function compile(options: Setup = {}) {
  const localModel = "localModel" in options ? options.localModel : new FakeLocalModel();
  let localModelsCreated = 0;
  const access = { requireView: vi.fn(async () => "VIEWER") };
  const projects = { findProject: vi.fn(async () => ({ id: PROJECT_ID, name: "CRM", revision: 7, document: documentOf(options.uml ?? clientePedido()) })), updateEditableProject: vi.fn() };
  const module = await Test.createTestingModule({ imports: [PrismaModule, ...((options.imports as never[]) ?? []), MentorAnalysisModule] })
    .overrideProvider(PrismaService).useValue({})
    .overrideProvider(ProjectAccessService).useValue(access)
    .overrideProvider(ProjectsPersistenceService).useValue(projects)
    .overrideProvider(ASSISTANT_LOCAL_MODEL).useFactory({ factory: () => {
      localModelsCreated += 1;
      return localModel;
    } })
    .overrideGuard(JwtAuthGuard).useValue({
      canActivate(context: { switchToHttp(): { getRequest(): { headers: { authorization?: string }; authenticatedUser?: { id: string } } } }) {
        const incoming = context.switchToHttp().getRequest();
        if (incoming.headers.authorization !== "Bearer valid") throw new UnauthorizedException();
        incoming.authenticatedUser = { id: USER_ID };
        return true;
      },
    })
    .compile();
  return { module, localModel, access, projects, localModelsCreated: () => localModelsCreated };
}

let opened: Array<TestingModule | NestFastifyApplication> = [];
async function http(options: Setup = {}) {
  const compiled = await compile(options);
  const app = compiled.module.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  opened.push(app);
  const post = (body: unknown, token: string | null = "valid", projectId = PROJECT_ID) => {
    const call = request(app.getHttpServer()).post(`/projects/${projectId}/mentor/analysis`);
    return (token ? call.set("Authorization", `Bearer ${token}`) : call).send(body as object);
  };
  return { ...compiled, post };
}

beforeEach(() => {
  // AuthModule registers JwtModule from these variables; no real token is verified (the guard is replaced).
  vi.stubEnv("JWT_SECRET", "secreto-solo-para-pruebas");
  vi.stubEnv("JWT_EXPIRES_IN", "1h");
});

afterEach(async () => {
  for (const item of opened) await item.close();
  opened = [];
  vi.unstubAllEnvs();
});

describe("MentorAnalysisModule: wiring", () => {
  it("T-01 a T-05: compila y resuelve controlador, servicio y el proveedor sobre ASSISTANT_LOCAL_MODEL", async () => {
    const { module, localModel } = await compile();
    opened.push(module);

    expect(module.get(UmlAnalysisController)).toBeInstanceOf(UmlAnalysisController);
    expect(module.get(UmlAnalysisService)).toBeInstanceOf(UmlAnalysisService);
    const provider = module.get<UmlAnalysisAiProvider>(UML_ANALYSIS_AI_PROVIDER);
    expect(provider).toBeInstanceOf(LocalQwenUmlAnalysisProvider);

    // T-05: the provider talks to the object supplied as ASSISTANT_LOCAL_MODEL, with the prompts untouched.
    await expect(provider.explain({ systemPrompt: "S", userPrompt: "U" })).resolves.toEqual({ text: "Resumen: cada Cliente realiza 0..* Pedido." });
    expect(localModel!.generateText).toHaveBeenCalledWith({ systemPrompt: "S", userPrompt: "U" });
  });

  it("T-06, T-07 y T-08: CU-2P-01, CU-2P-04 y el intérprete comparten una sola instancia del modelo local", async () => {
    const { module, localModel, localModelsCreated } = await compile({ imports: [MentorModule] });
    opened.push(module);

    // T-08: MentorModule of CU-2P-01 still compiles next to MentorAnalysisModule.
    expect(module.get(MentorService, { strict: false })).toBeInstanceOf(MentorService);
    // T-06: one factory run for the whole application.
    expect(localModelsCreated()).toBe(1);
    // T-07: the token resolves to the same object everywhere.
    expect(module.get(ASSISTANT_LOCAL_MODEL, { strict: false })).toBe(localModel);
    expect(module.select(AssistantModule).get(ASSISTANT_LOCAL_MODEL)).toBe(localModel);

    // Identity seen from behaviour: each consumer reaches that very object.
    await module.get<UmlAnalysisAiProvider>(UML_ANALYSIS_AI_PROVIDER, { strict: false }).explain({ systemPrompt: "CU-04", userPrompt: "análisis" });
    await module.get<MentorAiProvider>(MENTOR_AI_PROVIDER, { strict: false }).ask({ projectName: "CRM", revision: 7, classes: [], enumerations: [], relationships: [], elementNames: [] }, "¿Qué hay?", []);
    await module.get(AssistantInterpreterService, { strict: false }).interpretUml("crear clase Cliente", []).catch(() => undefined);
    expect(localModel!.generateText.mock.calls.map(([sent]) => sent.systemPrompt)).toEqual(["CU-04", expect.stringContaining("Mentor IA de un proyecto UML")]);
    expect(localModel!.generateStructured).toHaveBeenCalledTimes(1);
  });

  it("T-09: AppModule conserva sus módulos y añade MentorAnalysisModule", () => {
    const imports = Reflect.getMetadata("imports", AppModule) as unknown[];

    for (const required of [AssistantModule, VisionModule, MentorModule, MentorAnalysisModule]) expect(imports).toContain(required);
    expect(imports.filter((entry) => entry === MentorAnalysisModule)).toHaveLength(1);
  });

  it("T-10: no introduce dependencias circulares y no importa MentorModule", async () => {
    const imports = Reflect.getMetadata("imports", MentorAnalysisModule) as unknown[];
    expect(imports).toEqual([AssistantModule, expect.anything(), expect.anything()]);
    expect(imports).not.toContain(MentorModule);
    // Nest rejects an unresolvable cycle at compile time; with every module the app uses, it compiles.
    const { module } = await compile({ imports: [MentorModule, VisionModule] });
    opened.push(module);
    expect(module.get(UmlAnalysisService, { strict: false })).toBeInstanceOf(UmlAnalysisService);
  });

  it("sin modelo configurado (ASSISTANT_LOCAL_MODEL undefined) no crea otro modelo y el proveedor falla de forma controlada", async () => {
    const { module, localModelsCreated } = await compile({ localModel: undefined });
    opened.push(module);

    expect(localModelsCreated()).toBe(1);
    await expect(module.get<UmlAnalysisAiProvider>(UML_ANALYSIS_AI_PROVIDER).explain({ systemPrompt: "S", userPrompt: "U" })).rejects.toMatchObject({ code: "GENERATION_FAILED" });
  });
});

describe("POST /projects/:id/mentor/analysis con el módulo real y el modelo local simulado", () => {
  it("recorre Controller → Service → LocalQwenUmlAnalysisProvider → generateText una sola vez", async () => {
    const { post, localModel, access, projects } = await http();
    const response = await post({ focus: { kind: "relationship", id: id(40) } }).expect(200);

    expect(access.requireView).toHaveBeenCalledWith(PROJECT_ID, USER_ID);
    expect(localModel!.generateText).toHaveBeenCalledTimes(1);
    const sent = localModel!.generateText.mock.calls[0]![0];
    expect(sent.systemPrompt).toBe(UML_ANALYSIS_SYSTEM_PROMPT);
    expect(sent.userPrompt).toContain("Relación (Asociación): Cliente — realiza — Pedido");
    expect(sent.userPrompt).toContain("Por cada Cliente: 0..* Pedido.");
    expect(response.body).toMatchObject({ projectRevision: 7, focus: { kind: "relationship", id: id(40), name: "realiza" }, explanation: { text: "Resumen: cada Cliente realiza 0..* Pedido.", contextTruncation: { truncated: false } } });
    expect(response.body.analysis.facts.relational.relationships[0].foreignKeys[0]).toMatchObject({ ownerTable: "pedido", column: "cliente_id" });
    expect(projects.updateEditableProject).not.toHaveBeenCalled();
  });

  it("un fallo de generateText responde 503 con el cuerpo seguro", async () => {
    const localModel = new FakeLocalModel();
    localModel.generateText.mockRejectedValueOnce(new Error("detalle interno: C:/modelos/qwen3.gguf"));
    const response = await (await http({ localModel })).post({ focus: { kind: "class", id: id(1) } }).expect(503);

    expect(response.body).toEqual({ statusCode: 503, error: "Service Unavailable", message: "El Mentor IA no está disponible en este momento." });
  });

  it("sin modelo configurado responde 503 con el mismo cuerpo", async () => {
    const response = await (await http({ localModel: undefined })).post({ focus: { kind: "class", id: id(1) } }).expect(503);
    expect(response.body).toEqual({ statusCode: 503, error: "Service Unavailable", message: "El Mentor IA no está disponible en este momento." });
  });

  it("CONTEXT_TOO_LARGE, EMPTY_MODEL y ELEMENT_NOT_FOUND no llegan al modelo local", async () => {
    const huge: CanonicalUmlModel = { ...clientePedido(), classes: [{ ...clientePedido().classes[0]!, attributes: Array.from({ length: 400 }, (_, i) => ({ id: id(10_000 + i), name: `atributoNumero${i}`, visibility: "private" as const, type: { kind: "primitive" as const, name: "string" } })) }], relationships: [] };
    const cases: Array<[CanonicalUmlModel, unknown, string]> = [
      [huge, { focus: { kind: "class", id: id(1) } }, "CONTEXT_TOO_LARGE"],
      [{ classes: [], enumerations: [], packages: [], relationships: [] }, { focus: { kind: "model" } }, "EMPTY_MODEL"],
      [clientePedido(), { focus: { kind: "relationship", id: id(45) } }, "ELEMENT_NOT_FOUND"],
    ];
    for (const [uml, body, diagnostic] of cases) {
      const { post, localModel } = await http({ uml });
      const response = await post(body).expect(200);
      expect(response.body).toMatchObject({ explanation: null, diagnostic });
      expect(localModel!.generateText).not.toHaveBeenCalled();
    }
  });

  it("mantiene 400, 401, 404 y 422 sin llegar al modelo local", async () => {
    const { post, localModel, access, projects } = await http();

    await post({ focus: { kind: "model", id: id(1) } }).expect(400);
    await post({ focus: { kind: "model" } }, null).expect(401);
    access.requireView.mockRejectedValueOnce(new NotFoundException());
    await post({ focus: { kind: "model" } }).expect(404);
    projects.findProject.mockRejectedValueOnce(new InvalidProjectDocumentError());
    expect((await post({ focus: { kind: "model" } }).expect(422)).body.message).toBe("El modelo del proyecto no es válido para analizarlo.");
    expect(localModel!.generateText).not.toHaveBeenCalled();
  });
});
