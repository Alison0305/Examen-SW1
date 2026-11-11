import { ForbiddenException, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import type { LocalTextModelRequest } from "@examen-sw1/assistant-core";
import type { ProjectDocument } from "@examen-sw1/uml-core";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ASSISTANT_LOCAL_MODEL } from "../assistant/assistant.module";
import { LocalModelError } from "../assistant/local-text-model";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PrismaModule } from "../prisma/prisma.module";
import { PrismaService } from "../prisma/prisma.service";
import { ProjectAccessService } from "../projects/project-access.service";
import { ProjectsPersistenceService } from "../projects/projects-persistence.service";
import { ProjectRealtimeGateway } from "../realtime/project-realtime.gateway";
import { AUTHOR, CLIENTE_ID, EDITOR_B, memoryDatabase, NOMBRE_ID, OUTSIDER, OWNER, PROJECT_ID, VIEWER, type MemoryDatabase } from "./mentor-proposal.test-support";
import { MentorProposalsModule } from "./mentor-proposals.module";

const USERS = new Map([OWNER, AUTHOR, EDITOR_B, VIEWER, OUTSIDER].map((user) => [user.id, user]));
const ROLES = new Map<string, "OWNER" | "EDITOR" | "VIEWER">([[OWNER.id, "OWNER"], [AUTHOR.id, "EDITOR"], [EDITOR_B.id, "EDITOR"], [VIEWER.id, "VIEWER"]]);
const INSTRUCTION = "Agrega el atributo teléfono de tipo String a Cliente";
const INTENT = { operation: "ADD_ATTRIBUTE", className: "Cliente", attributeName: "teléfono", attributeType: "String" };

// The instruction a user would have written for a given model output, so each table case fails for its own reason
// (unknown class, duplicate, type…) and not because the names are not literal substrings of the instruction.
const instructionFor = (output: unknown): string => {
  const fields = (typeof output === "object" && output !== null ? output : {}) as Record<string, unknown>;
  return typeof fields.className === "string" && typeof fields.attributeName === "string" ? `Agrega el atributo ${fields.attributeName} de tipo ${String(fields.attributeType)} a ${fields.className}` : INSTRUCTION;
};
const route = `/projects/${PROJECT_ID}/mentor/proposals`;
const auth = (user: { id: string }) => ({ Authorization: `Bearer ${user.id}` });

let app: NestFastifyApplication | undefined;

// Real MentorProposalsModule: controller, DTO pipe, creation service, Qwen provider, resolver, preview, Prisma store,
// and for the final apply the real ProjectOperationService. Only the edges are replaced: in-memory database, roles,
// project reader, socket gateway, JWT guard and ASSISTANT_LOCAL_MODEL (a deterministic stand-in, no GGUF).
async function setup(options: { output?: unknown | (() => unknown); model?: "none" } = {}) {
  const db: MemoryDatabase = memoryDatabase();
  const output = "output" in options ? options.output : INTENT;
  const model = {
    generateStructured: vi.fn(async (request: LocalTextModelRequest) => { void request; return typeof output === "function" ? (output as () => unknown)() : output; }),
    warmup: vi.fn(async () => undefined),
    dispose: vi.fn(async () => undefined),
  };
  const access = {
    requireEdit: vi.fn(async (projectId: string, userId: string) => {
      const role = ROLES.get(userId);
      if (!role || projectId !== PROJECT_ID) throw new NotFoundException();
      if (role === "VIEWER") throw new ForbiddenException();
      return role;
    }),
  };
  const projects = { findProject: vi.fn(async (id: string) => (id === db.project.id ? { revision: db.project.revision, document: structuredClone(db.project.document) as unknown as ProjectDocument } : null)) };
  const module = await Test.createTestingModule({ imports: [PrismaModule, MentorProposalsModule] })
    .overrideProvider(PrismaService).useValue(db.prisma)
    .overrideProvider(ProjectAccessService).useValue(access)
    .overrideProvider(ProjectsPersistenceService).useValue(projects)
    .overrideProvider(ProjectRealtimeGateway).useValue({ broadcastAccepted: vi.fn() })
    .overrideProvider(ASSISTANT_LOCAL_MODEL).useFactory({ factory: () => (options.model === "none" ? undefined : model) })
    .overrideGuard(JwtAuthGuard).useValue({
      canActivate(context: { switchToHttp(): { getRequest(): { headers: { authorization?: string }; authenticatedUser?: unknown } } }) {
        const incoming = context.switchToHttp().getRequest();
        const user = USERS.get(incoming.headers.authorization?.replace(/^Bearer /, "") ?? "");
        if (!user) throw new UnauthorizedException();
        incoming.authenticatedUser = user;
        return true;
      },
    })
    .compile();
  app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  const documentBefore = structuredClone(db.project.document);
  const untouched = () => {
    expect(db.project.document).toEqual(documentBefore);
    expect(db.project.revision).toBe(10);
    expect(db.receipts).toHaveLength(0);
  };
  return { http: request(app.getHttpServer()), db, model, untouched };
}

beforeEach(() => {
  vi.stubEnv("JWT_SECRET", "secreto-solo-para-pruebas");
  vi.stubEnv("JWT_EXPIRES_IN", "1h");
});

afterEach(async () => {
  await app?.close();
  app = undefined;
  vi.unstubAllEnvs();
});

describe("POST /projects/:projectId/mentor/proposals", () => {
  it("AI-01: OWNER y EDITOR reciben 201 con la propuesta PENDING pública, sin modificar el proyecto", async () => {
    for (const user of [OWNER, EDITOR_B]) {
      const { http, db, untouched } = await setup();
      const response = await http.post(route).set(auth(user)).send({ instruction: INSTRUCTION });

      expect(response.status).toBe(201);
      expect(response.body).toEqual({
        id: db.proposals[0]!.id,
        status: "PENDING",
        baseRevision: 10,
        operation: { kind: "ADD_ATTRIBUTE", target: { className: "Cliente" }, change: { attributeName: "teléfono", attributeType: "string" } },
        preview: { valid: true, diff: [{ kind: "added", element: "attribute", label: "Cliente.teléfono: string" }], diagnostics: [] },
        createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      });
      expect(db.proposals).toHaveLength(1);
      untouched();
    }
  });

  it("la respuesta no expone comando, identificadores internos, instrucción, autor, prompt ni salida del modelo", async () => {
    const { http, db } = await setup();
    const response = await http.post(route).set(auth(OWNER)).send({ instruction: INSTRUCTION }).expect(201);
    const body = JSON.stringify(response.body);
    const attributeId = (db.proposals[0]!.command as { attributeId: string }).attributeId;

    for (const hidden of [attributeId, CLIENTE_ID, NOMBRE_ID, "AddAttribute", "command", "classId", "attributeId", "instruction", INSTRUCTION, OWNER.email, OWNER.id, "authorUserId", "Eres un generador", "String\""]) {
      expect(body).not.toContain(hidden);
    }
  });

  it("flujo completo: crear no aplica; el detalle coincide; solo apply añade el atributo con el UUID generado por el servidor", async () => {
    const { http, db } = await setup();
    const created = await http.post(route).set(auth(OWNER)).send({ instruction: INSTRUCTION }).expect(201);
    const classes = () => (db.project.document.uml as ProjectDocument["uml"]).classes;
    expect(classes()[0]!.attributes.map((attribute) => attribute.name)).toEqual(["nombre"]);

    await expect(http.get(`${route}/${created.body.id}`).set(auth(EDITOR_B)).then((response) => response.body)).resolves.toEqual(created.body);
    const applied = await http.post(`${route}/${created.body.id}/apply`).set(auth(EDITOR_B)).expect(200);

    const attributeId = (db.proposals[0]!.command as { attributeId: string }).attributeId;
    expect(applied.body).toMatchObject({ id: created.body.id, status: "APPLIED", resultingRevision: 11 });
    expect(classes()[0]!.attributes.map((attribute) => [attribute.id, attribute.name])).toEqual([[NOMBRE_ID, "nombre"], [attributeId, "teléfono"]]);
    expect(db.receipts.map((receipt) => receipt.operationId)).toEqual([created.body.id]);
  });

  describe("permisos: el modelo no se invoca sin edición", () => {
    it("AI-09: VIEWER 403", async () => {
      const { http, model, db } = await setup();
      const response = await http.post(route).set(auth(VIEWER)).send({ instruction: INSTRUCTION });

      expect(response.status).toBe(403);
      expect(model.generateStructured).not.toHaveBeenCalled();
      expect(db.proposals).toHaveLength(0);
    });

    it("AI-10: sin acceso 404 con el cuerpo estándar; sin JWT 401", async () => {
      const { http, model, db } = await setup();

      const outsider = await http.post(route).set(auth(OUTSIDER)).send({ instruction: INSTRUCTION });
      expect(outsider.status).toBe(404);
      expect(outsider.body).toEqual({ statusCode: 404, message: "Not Found" });
      expect((await http.post(route).send({ instruction: INSTRUCTION })).status).toBe(401);
      expect(model.generateStructured).not.toHaveBeenCalled();
      expect(db.proposals).toHaveLength(0);
    });
  });

  describe("400: el cliente solo envía la instrucción", () => {
    it.each([
      ["command", { instruction: INSTRUCTION, command: { type: "AddAttribute", classId: CLIENTE_ID } }],
      ["operation", { instruction: INSTRUCTION, operation: "ADD_ATTRIBUTE" }],
      ["baseRevision", { instruction: INSTRUCTION, baseRevision: 10 }],
      ["attributeId", { instruction: INSTRUCTION, attributeId: CLIENTE_ID }],
      ["classId", { instruction: INSTRUCTION, classId: CLIENTE_ID }],
      ["projectRevision", { instruction: INSTRUCTION, projectRevision: 10 }],
      ["status", { instruction: INSTRUCTION, status: "APPLIED" }],
      ["sin instrucción", {}],
      ["instrucción en blanco", { instruction: "   " }],
      ["instrucción > 500", { instruction: "a".repeat(501) }],
      ["instrucción no textual", { instruction: 42 }],
    ])("%s", async (_case, body) => {
      const { http, model, db } = await setup();
      const response = await http.post(route).set(auth(OWNER)).send(body);

      expect(response.status).toBe(400);
      expect(model.generateStructured).not.toHaveBeenCalled();
      expect(db.proposals).toHaveLength(0);
    });

    it("projectId que no es UUID", async () => {
      const { http, model } = await setup();
      expect((await http.post("/projects/no-es-uuid/mentor/proposals").set(auth(OWNER)).send({ instruction: INSTRUCTION })).status).toBe(400);
      expect(model.generateStructured).not.toHaveBeenCalled();
    });

    it("500 caracteres tras recortar se aceptan", async () => {
      const { http } = await setup();
      const instruction = `${INSTRUCTION} ${"a".repeat(500 - INSTRUCTION.length - 1)}`;
      expect(instruction).toHaveLength(500);
      expect((await http.post(route).set(auth(OWNER)).send({ instruction: `  ${instruction}  ` })).status).toBe(201);
    });
  });

  describe("422: intención inválida, sin propuesta ni cambios", () => {
    it.each([
      ["AI-02 identificador", { ...INTENT, attributeId: CLIENTE_ID }, "INVALID_PROPOSAL", "La propuesta no supera la validación del modelo UML."],
      ["AI-03 operación fuera de la allow-list", { operation: "UNSUPPORTED" }, "UNSUPPORTED_OPERATION", "La operación propuesta no está soportada."],
      ["AI-04 JSON inválido", () => { throw new LocalModelError("INVALID_OUTPUT"); }, "INVALID_PROPOSAL", "La propuesta no supera la validación del modelo UML."],
      ["AI-05 falta className", { operation: "ADD_ATTRIBUTE", attributeName: "teléfono", attributeType: "String" }, "INVALID_PROPOSAL", "La propuesta no supera la validación del modelo UML."],
      ["AI-06 clase inexistente", { ...INTENT, className: "Proveedor" }, "ELEMENT_NOT_FOUND", "La clase indicada no existe o es ambigua en el modelo UML vigente."],
      ["AI-07 tipo desconocido", { ...INTENT, attributeType: "Dinero" }, "UNKNOWN_TYPE", "El tipo indicado no es un tipo UML soportado."],
      ["AI-15 campo adicional", { ...INTENT, reason: "x" }, "INVALID_PROPOSAL", "La propuesta no supera la validación del modelo UML."],
    ])("%s → %s", async (_case, output, code, message) => {
      const { http, db, untouched } = await setup({ output });
      const response = await http.post(route).set(auth(OWNER)).send({ instruction: instructionFor(output) });

      expect(response.status).toBe(422);
      expect(response.body).toEqual({ statusCode: 422, error: "Unprocessable Entity", code, message, ...(code === "INVALID_PROPOSAL" ? { diagnostics: [] } : {}) });
      expect(db.proposals).toHaveLength(0);
      untouched();
    });

    it("AI-08: atributo duplicado → 422 INVALID_PROPOSAL con diagnósticos UML públicos", async () => {
      const { http, db, untouched } = await setup({ output: { ...INTENT, attributeName: "nombre" } });
      const response = await http.post(route).set(auth(OWNER)).send({ instruction: "Agrega el atributo nombre de tipo String a Cliente" });

      expect(response.status).toBe(422);
      expect(response.body).toMatchObject({ code: "INVALID_PROPOSAL", diagnostics: [expect.objectContaining({ severity: "error" })] });
      for (const diagnostic of response.body.diagnostics as object[]) expect(Object.keys(diagnostic).sort()).toEqual(["code", "message", "severity"]);
      expect(JSON.stringify(response.body)).not.toContain(CLIENTE_ID);
      expect(db.proposals).toHaveLength(0);
      untouched();
    });
  });

  describe("503: modelo local no disponible", () => {
    it.each([
      ["sin ASSISTANT_MODEL_PATH (ASSISTANT_LOCAL_MODEL undefined)", { model: "none" as const }],
      ["timeout del modelo", { output: () => { throw new LocalModelError("TIMEOUT", "detalle interno: C:/modelos/qwen3.gguf"); } }],
    ])("%s → cuerpo seguro, sin propuesta", async (_case, options) => {
      const { http, db, untouched } = await setup(options);
      const response = await http.post(route).set(auth(OWNER)).send({ instruction: INSTRUCTION });

      expect(response.status).toBe(503);
      expect(response.body).toEqual({ statusCode: 503, error: "Service Unavailable", message: "El Mentor IA no está disponible en este momento." });
      expect(db.proposals).toHaveLength(0);
      untouched();
    });
  });
});

describe("POST /projects/:projectId/mentor/proposals: nombre no literal", () => {
  it("422 INVALID_PROPOSAL con el diagnóstico público NON_LITERAL_NAME, sin propuesta ni cambios", async () => {
    const { http, db, untouched } = await setup({ output: { ...INTENT, attributeName: "telefono" } });
    const response = await http.post(route).set(auth(OWNER)).send({ instruction: INSTRUCTION });

    expect(response.status).toBe(422);
    expect(response.body).toEqual({
      statusCode: 422,
      error: "Unprocessable Entity",
      code: "INVALID_PROPOSAL",
      message: "La propuesta no supera la validación del modelo UML.",
      diagnostics: [{ code: "NON_LITERAL_NAME", severity: "error", message: expect.stringContaining("cambió el nombre de la clase o del atributo") }],
    });
    expect(db.proposals).toHaveLength(0);
    untouched();
  });

  it("«…a cliente» en minúsculas responde 201 sobre la clase `Cliente`", async () => {
    const { http, db } = await setup({ output: { ...INTENT, attributeName: "telefono" } });
    const response = await http.post(route).set(auth(OWNER)).send({ instruction: "Agrega el atributo telefono de tipo string a cliente" });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ status: "PENDING", operation: { target: { className: "Cliente" }, change: { attributeName: "telefono" } }, preview: { diff: [{ label: "Cliente.telefono: string" }] } });
    expect(db.proposals).toHaveLength(1);
  });
});
