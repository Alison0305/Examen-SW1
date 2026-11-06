import { Test } from "@nestjs/testing";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LocalTextModel } from "@examen-sw1/assistant-core";
import { usuarioManifest as manifest } from "./assistant-fixtures";
import { AssistantInterpretController } from "./assistant-interpret.controller";
import { AssistantInterpreterService } from "./assistant-interpreter.service";

describe("POST /assistant/interpret", () => {
  let app: NestFastifyApplication;
  let generateStructured: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    generateStructured = vi.fn();
    const model: LocalTextModel = { generateStructured };
    const module = await Test.createTestingModule({ controllers: [AssistantInterpretController], providers: [{ provide: AssistantInterpreterService, useValue: new AssistantInterpreterService(model) }] }).compile();
    app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterEach(async () => {
    await app.close();
  });

  const post = (body: unknown) => request(app.getHttpServer()).post("/assistant/interpret").send(body as object);

  it("modo uml responde 200 con una propuesta sin requerir JWT", async () => {
    generateStructured.mockResolvedValue({ operation: "CREATE_CLASS", name: "Paciente" });
    const response = await post({ mode: "uml", text: "crear clase paciente", classes: [] }).expect(200);
    expect(response.body).toEqual({ ok: true, mode: "uml", source: "model", proposal: { type: "CREATE_CLASS", name: "Paciente" } });
  });

  it("modo data responde 200 con un AssistantCommand validado", async () => {
    generateStructured.mockResolvedValue({ operation: "LIST", entity: "usuario" });
    const response = await post({ mode: "data", text: "listar usuarios", manifest }).expect(200);
    expect(response.body).toEqual({ ok: true, mode: "data", source: "model", command: { operation: "LIST", entity: "usuario" } });
  });

  it("frase fuera de dominio responde 200 con OUT_OF_DOMAIN y sin propuesta", async () => {
    generateStructured.mockResolvedValue({ operation: "UNSUPPORTED", reason: "Saludo." });
    const response = await post({ mode: "uml", text: "hola cómo estás", classes: [{ id: "c-1", name: "Paciente" }] }).expect(200);
    expect(response.body).toMatchObject({ ok: false, mode: "uml", diagnostic: { code: "OUT_OF_DOMAIN" } });
    expect(response.body).not.toHaveProperty("proposal");
  });

  it("rechaza con 400 payloads inválidos y mezclas de modos sin invocar el modelo", async () => {
    const invalid = [
      {},
      { mode: "uml", text: "", classes: [] },
      { mode: "uml", text: "x".repeat(501), classes: [] },
      { mode: "uml", text: "crear", classes: [{ id: "c-1" }] },
      { mode: "uml", text: "crear", classes: [], manifest },
      { mode: "data", text: "listar", manifest: { schemaVersion: 2, entities: [] } },
      { mode: "data", text: "listar", manifest, classes: [] },
      { mode: "sql", text: "drop table" },
    ];
    for (const body of invalid) {
      const response = await post(body).expect(400);
      expect(response.body).toMatchObject({ ok: false, diagnostic: { code: "INVALID_REQUEST" } });
    }
    expect(generateStructured).not.toHaveBeenCalled();
  });
});
