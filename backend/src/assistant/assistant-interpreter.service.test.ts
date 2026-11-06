import { describe, expect, it, vi } from "vitest";
import type { LocalTextModel, LocalTextModelRequest } from "@examen-sw1/assistant-core";
import type { DomainManifestV1 } from "@examen-sw1/spring-generator";
import { AssistantInterpreterService } from "./assistant-interpreter.service";
import { usuarioManifest } from "./assistant-fixtures";
import { LocalModelError } from "./local-text-model";

const classes = [{ id: "c-1", name: "Paciente" }];
const manifest = usuarioManifest;

const fakeModel = (output: unknown) => {
  const generateStructured = vi.fn<(request: LocalTextModelRequest) => Promise<unknown>>().mockResolvedValue(output);
  return { model: { generateStructured } satisfies LocalTextModel, generateStructured };
};

describe("AssistantInterpreterService modo uml", () => {
  it("usa el parser estricto sin invocar el modelo", async () => {
    const { model, generateStructured } = fakeModel(undefined);
    const service = new AssistantInterpreterService(model);
    await expect(service.interpretUml('CREATE_CLASS name="Cita"', classes)).resolves.toEqual({ ok: true, mode: "uml", source: "strict", proposal: { type: "CREATE_CLASS", name: "Cita" } });
    await expect(service.interpretUml("DELETE_CLASS", classes)).resolves.toMatchObject({ ok: false, diagnostic: { code: "INVALID_OUTPUT" } });
    expect(generateStructured).not.toHaveBeenCalled();
  });

  it("interpreta español natural con schema dinámico y resuelve el nombre a id", async () => {
    const { model, generateStructured } = fakeModel({ operation: "DELETE_CLASS", targetName: "Paciente" });
    const result = await new AssistantInterpreterService(model).interpretUml("elimina la clase paciente", classes);
    expect(result).toEqual({ ok: true, mode: "uml", source: "model", proposal: { type: "DELETE_CLASS", targetId: "c-1" } });
    const sent = generateStructured.mock.calls[0]![0];
    expect(sent.userPrompt).toContain("Instrucción: elimina la clase paciente");
    expect(JSON.stringify(sent.schema)).toContain('"enum":["Paciente"]');
  });

  it("traduce UNSUPPORTED, salidas inválidas y nombres inexistentes a diagnósticos sin propuesta", async () => {
    const run = (output: unknown) => new AssistantInterpreterService(fakeModel(output).model).interpretUml("hola", classes);
    await expect(run({ operation: "UNSUPPORTED", reason: "saludo" })).resolves.toMatchObject({ ok: false, diagnostic: { code: "OUT_OF_DOMAIN" } });
    await expect(run({ operation: "RUN_SHELL" })).resolves.toMatchObject({ ok: false, diagnostic: { code: "INVALID_OUTPUT" } });
    await expect(run({ operation: "DELETE_CLASS", targetName: "Doctor" })).resolves.toMatchObject({ ok: false, diagnostic: { code: "NAME_NOT_FOUND" } });
  });

  it("sin modelo configurado responde NOT_CONFIGURED y sugiere la sintaxis estricta", async () => {
    const result = await new AssistantInterpreterService(undefined).interpretUml("crear clase paciente", classes);
    expect(result).toMatchObject({ ok: false, mode: "uml", diagnostic: { code: "NOT_CONFIGURED" } });
    expect(result.ok ? "" : result.diagnostic.message).toContain('CREATE_CLASS name="Paciente"');
  });

  it("propaga diagnósticos del runtime local", async () => {
    const model: LocalTextModel = { generateStructured: () => Promise.reject(new LocalModelError("TIMEOUT")) };
    await expect(new AssistantInterpreterService(model).interpretUml("crear clase cita", classes)).resolves.toMatchObject({ ok: false, diagnostic: { code: "TIMEOUT" } });
    const unknown: LocalTextModel = { generateStructured: () => Promise.reject(new Error("x")) };
    await expect(new AssistantInterpreterService(unknown).interpretUml("crear clase cita", classes)).resolves.toMatchObject({ ok: false, diagnostic: { code: "INFERENCE_ERROR" } });
  });
});

describe("AssistantInterpreterService modo data", () => {
  it("interpreta español natural y valida contra el Domain Manifest", async () => {
    const { model, generateStructured } = fakeModel({ operation: "GET", entity: "usuario", identifier: 2 });
    await expect(new AssistantInterpreterService(model).interpretData("muestra el usuario 2", manifest)).resolves.toEqual({ ok: true, mode: "data", source: "model", command: { operation: "GET", entity: "usuario", identifier: 2 } });
    expect(JSON.stringify(generateStructured.mock.calls[0]![0].schema)).toContain('"const":"usuario"');
  });

  it("acepta JSON estricto sin modelo y rechaza salidas fuera de dominio o inválidas", async () => {
    await expect(new AssistantInterpreterService(undefined).interpretData('{"operation":"COUNT","entity":"usuario"}', manifest)).resolves.toEqual({ ok: true, mode: "data", source: "strict", command: { operation: "COUNT", entity: "usuario" } });
    await expect(new AssistantInterpreterService(undefined).interpretData("listar usuarios", manifest)).resolves.toMatchObject({ ok: false, diagnostic: { code: "NOT_CONFIGURED" } });
    const run = (output: unknown) => new AssistantInterpreterService(fakeModel(output).model).interpretData("hola", manifest);
    await expect(run({ operation: "UNSUPPORTED", reason: "saludo" })).resolves.toMatchObject({ ok: false, diagnostic: { code: "OUT_OF_DOMAIN" } });
    await expect(run({ operation: "DELETE", entity: "usuario" })).resolves.toMatchObject({ ok: false, diagnostic: { code: "INVALID_OUTPUT" } });
    await expect(run({ operation: "CREATE", entity: "usuario", fields: { nombre: "Ana" } })).resolves.toMatchObject({ ok: false, diagnostic: { code: "VALIDATION_ERROR", details: [{ code: "MISSING_REQUIRED_FIELD", field: "id" }] } });
  });

  it("rechaza manifests cuyo schema supera el límite sin invocar el modelo", async () => {
    const { model, generateStructured } = fakeModel(undefined);
    const huge: DomainManifestV1 = { schemaVersion: 1, entities: Array.from({ length: 100 }, (_, index) => ({ ...manifest.entities[0]!, name: `entidad${index}`, attributes: Array.from({ length: 30 }, (_, field) => ({ ...manifest.entities[0]!.attributes[1]!, name: `campoConNombreLargo${field}` })) })) };
    await expect(new AssistantInterpreterService(model).interpretData("listar", huge)).resolves.toMatchObject({ ok: false, diagnostic: { code: "INVALID_REQUEST" } });
    expect(generateStructured).not.toHaveBeenCalled();
  });
});
