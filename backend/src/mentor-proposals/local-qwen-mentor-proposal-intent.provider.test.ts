import { Logger } from "@nestjs/common";
import type { LocalTextModelRequest } from "@examen-sw1/assistant-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LocalModelError, QueuedLocalTextModel, type LocalModelErrorCode } from "../assistant/local-text-model";
import { parseSingleJsonObject } from "../assistant/structured-json";
import {
  buildMentorProposalUserPrompt,
  LocalQwenMentorProposalIntentProvider,
  MENTOR_PROPOSAL_MAX_TOKENS,
  MENTOR_PROPOSAL_SYSTEM_PROMPT,
  MentorProposalGenerationUnavailableError,
} from "./local-qwen-mentor-proposal-intent.provider";
import { MENTOR_PROPOSAL_INTENT_SCHEMA } from "./mentor-proposal-intent";

const INSTRUCTION = "Agrega el atributo teléfono de tipo String a Cliente";
const REQUEST = { instruction: INSTRUCTION, classNames: ["Cliente", "Pedido", "Cliente", "  "] };
const VALID = { operation: "ADD_ATTRIBUTE", className: "Cliente", attributeName: "teléfono", attributeType: "String" };

// A small deterministic stand-in for the shared model: it returns (or throws) exactly what it is given.
function fakeModel(output: unknown | (() => unknown)) {
  return { generateStructured: vi.fn(async (request: LocalTextModelRequest) => { void request; return typeof output === "function" ? (output as () => unknown)() : output; }) };
}

afterEach(() => vi.restoreAllMocks());

describe("LocalQwenMentorProposalIntentProvider", () => {
  it("AI-01: pide una generación estructurada con el schema cerrado, el prompt restrictivo y solo nombres de clases", async () => {
    const model = fakeModel(VALID);
    await expect(new LocalQwenMentorProposalIntentProvider(model).generate(REQUEST)).resolves.toEqual({ ok: true, intent: VALID });

    expect(model.generateStructured).toHaveBeenCalledExactlyOnceWith({
      systemPrompt: MENTOR_PROPOSAL_SYSTEM_PROMPT,
      userPrompt: 'Clases existentes en el modelo: ["Cliente","Pedido"]\nInstrucción: Agrega el atributo teléfono de tipo String a Cliente',
      schema: MENTOR_PROPOSAL_INTENT_SCHEMA,
      maxTokens: MENTOR_PROPOSAL_MAX_TOKENS,
    });
  });

  it("el system prompt es corto y restrictivo", () => {
    expect(MENTOR_PROPOSAL_SYSTEM_PROMPT.length).toBeLessThan(700);
    for (const fragment of ["generador de propuestas UML estructuradas", "No produces código", "no produces identificadores", "no modificas el modelo", "ADD_ATTRIBUTE", "UNSUPPORTED", "schema"]) {
      expect(MENTOR_PROPOSAL_SYSTEM_PROMPT).toContain(fragment);
    }
    expect(buildMentorProposalUserPrompt({ instruction: "x", classNames: [] })).toBe("Clases existentes en el modelo: []\nInstrucción: x");
  });

  it.each([
    ["AI-02 identificador", { ...VALID, attributeId: "00000000-0000-4000-8000-0000000000a1" }, "INVALID_PROPOSAL"],
    ["AI-03 operación fuera de la allow-list", { operation: "DELETE_CLASS", className: "Cliente" }, "UNSUPPORTED_OPERATION"],
    ["AI-03 salida UNSUPPORTED", { operation: "UNSUPPORTED" }, "UNSUPPORTED_OPERATION"],
    ["AI-05 falta className", { operation: "ADD_ATTRIBUTE", attributeName: "teléfono", attributeType: "String" }, "INVALID_PROPOSAL"],
    ["AI-15 campo adicional", { ...VALID, command: { type: "AddAttribute" } }, "INVALID_PROPOSAL"],
  ])("valida la salida aunque el modelo use gramática: %s", async (_case, output, code) => {
    await expect(new LocalQwenMentorProposalIntentProvider(fakeModel(output)).generate(REQUEST)).resolves.toMatchObject({ ok: false, error: { code } });
  });

  it("AI-04: un texto que no es un único objeto JSON (cola real + extracción del motor) es INVALID_PROPOSAL, no 503", async () => {
    // Engine stand-in doing exactly what NodeLlamaCppEngine does with the response text.
    const engine = { generate: vi.fn(async () => {
      const json = parseSingleJsonObject("Claro, agrego el atributo teléfono a Cliente.");
      if (!json) throw new LocalModelError("INVALID_OUTPUT");
      return json;
    }) };
    const model = new QueuedLocalTextModel(engine, { timeoutMs: 1000, maxQueue: 1 });

    await expect(new LocalQwenMentorProposalIntentProvider(model).generate(REQUEST)).resolves.toEqual({ ok: false, error: { code: "INVALID_PROPOSAL", message: "El asistente no produjo una propuesta estructurada válida.", diagnostics: [] } });
  });

  it("sin modelo configurado no hay propuesta: error de disponibilidad", async () => {
    await expect(new LocalQwenMentorProposalIntentProvider(undefined).generate(REQUEST)).rejects.toBeInstanceOf(MentorProposalGenerationUnavailableError);
  });

  it.each<LocalModelErrorCode>(["NOT_CONFIGURED", "MODEL_NOT_FOUND", "RUNTIME_NOT_AVAILABLE", "INFERENCE_ERROR", "TIMEOUT", "BUSY"])("%s del modelo local es indisponibilidad (503), sin detalles internos", async (code) => {
    const model = fakeModel(() => { throw new LocalModelError(code, "detalle interno: C:/modelos/qwen3.gguf"); });
    const failure = await new LocalQwenMentorProposalIntentProvider(model).generate(REQUEST).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(MentorProposalGenerationUnavailableError);
    expect((failure as Error).message).not.toContain("gguf");
  });

  it("un error inesperado no se disfraza", async () => {
    const bug = new TypeError("bug");
    await expect(new LocalQwenMentorProposalIntentProvider(fakeModel(() => { throw bug; })).generate(REQUEST)).rejects.toBe(bug);
  });

  it("los logs no contienen la instrucción, el prompt ni la salida cruda del modelo", async () => {
    const warn = vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    await new LocalQwenMentorProposalIntentProvider(fakeModel({ ...VALID, secretField: "SALIDA-CRUDA" })).generate(REQUEST);
    await new LocalQwenMentorProposalIntentProvider(fakeModel(() => { throw new LocalModelError("TIMEOUT", "C:/modelos/qwen3.gguf"); })).generate(REQUEST).catch(() => undefined);

    const logged = JSON.stringify(warn.mock.calls);
    expect(warn).toHaveBeenCalledTimes(2);
    for (const secret of ["SALIDA-CRUDA", "teléfono", "gguf", "Eres un generador"]) expect(logged).not.toContain(secret);
  });
});
