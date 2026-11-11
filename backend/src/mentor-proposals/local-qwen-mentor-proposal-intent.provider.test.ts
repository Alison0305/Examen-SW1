import { Logger } from "@nestjs/common";
import type { LocalTextModelRequest } from "@examen-sw1/assistant-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LocalModelError, QueuedLocalTextModel, type LocalModelErrorCode } from "../assistant/local-text-model";
import { parseSingleJsonObject } from "../assistant/structured-json";
import {
  buildMentorProposalUserPrompt,
  LocalQwenMentorProposalIntentProvider,
  MENTOR_PROPOSAL_ACCENTED_EXAMPLE,
  MENTOR_PROPOSAL_LITERAL_RETRY_PROMPT,
  MENTOR_PROPOSAL_MAX_TOKENS,
  MENTOR_PROPOSAL_SYSTEM_PROMPT,
  MentorProposalGenerationUnavailableError,
  NON_LITERAL_NAME_DIAGNOSTIC,
} from "./local-qwen-mentor-proposal-intent.provider";
import { MENTOR_PROPOSAL_INTENT_SCHEMA, namesAreLiteral, parseMentorProposalIntent } from "./mentor-proposal-intent";

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
    // Short: the rules plus a single one-shot example.
    expect(MENTOR_PROPOSAL_SYSTEM_PROMPT.length).toBeLessThan(1100);
    for (const fragment of ["generador de propuestas UML estructuradas", "No produces código", "no produces identificadores", "no modificas el modelo", "ADD_ATTRIBUTE", "UNSUPPORTED", "schema", "literalmente", "no corrijas ortografía", "no elimines tildes", "no traduzcas ni normalices"]) {
      expect(MENTOR_PROPOSAL_SYSTEM_PROMPT).toContain(fragment);
    }
    // v1 never asks the model for a multiplicity.
    expect(MENTOR_PROPOSAL_SYSTEM_PROMPT).not.toMatch(/multiplicity|multiplicidad/i);
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

// A model stand-in returning (or throwing) the given outputs in order; it records every request.
function sequenceModel(...outputs: Array<unknown | (() => unknown)>) {
  let call = 0;
  return {
    generateStructured: vi.fn(async (request: LocalTextModelRequest) => {
      void request;
      const output = outputs[Math.min(call, outputs.length - 1)];
      call += 1;
      return typeof output === "function" ? (output as () => unknown)() : output;
    }),
  };
}

const WITHOUT_ACCENT = { ...VALID, attributeName: "telefono" };

describe("LocalQwenMentorProposalIntentProvider: preservación literal y un único reintento", () => {
  it("1: «teléfono» devuelto como «telefono» se detecta como no literal y nunca se acepta ni se corrige", async () => {
    const model = sequenceModel(WITHOUT_ACCENT);
    const result = await new LocalQwenMentorProposalIntentProvider(model).generate(REQUEST);

    expect(result).toEqual({ ok: false, error: { code: "INVALID_PROPOSAL", message: "El asistente cambió el nombre de la clase o del atributo indicado en la instrucción.", diagnostics: [NON_LITERAL_NAME_DIAGNOSTIC] } });
    expect(NON_LITERAL_NAME_DIAGNOSTIC).toEqual({ code: "NON_LITERAL_NAME", severity: "error", message: expect.stringContaining("cambió el nombre de la clase o del atributo") });
    expect(JSON.stringify(result)).not.toContain("teléfono");
  });

  it("2: el primer intento pierde la tilde y el segundo devuelve «teléfono» → éxito con el mismo schema e instrucción más la corrección", async () => {
    const model = sequenceModel(WITHOUT_ACCENT, VALID);
    await expect(new LocalQwenMentorProposalIntentProvider(model).generate(REQUEST)).resolves.toEqual({ ok: true, intent: VALID });

    expect(model.generateStructured).toHaveBeenCalledTimes(2);
    const [first, second] = model.generateStructured.mock.calls.map(([request]) => request);
    expect(first!.userPrompt).toBe(buildMentorProposalUserPrompt(REQUEST));
    expect(second!.userPrompt).toBe(`${buildMentorProposalUserPrompt(REQUEST)}\n${MENTOR_PROPOSAL_LITERAL_RETRY_PROMPT}`);
    expect(second!.systemPrompt).toBe(MENTOR_PROPOSAL_SYSTEM_PROMPT);
    expect(second!.schema).toBe(MENTOR_PROPOSAL_INTENT_SCHEMA);
    expect(MENTOR_PROPOSAL_LITERAL_RETRY_PROMPT).toMatch(/exactamente.*tildes y mayúsculas/);
  });

  it("3 y 5: si ambos intentos pierden la tilde → INVALID_PROPOSAL tras exactamente un reintento", async () => {
    const model = sequenceModel(WITHOUT_ACCENT, WITHOUT_ACCENT, VALID);
    await expect(new LocalQwenMentorProposalIntentProvider(model).generate(REQUEST)).resolves.toMatchObject({ ok: false, error: { code: "INVALID_PROPOSAL" } });
    expect(model.generateStructured).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["con tilde añadida", "Clíente"],
    ["traducida", "Customer"],
  ])("4: una clase alterada (%s) sigue el mismo control", async (_case, className) => {
    const retried = sequenceModel({ ...VALID, className }, VALID);
    await expect(new LocalQwenMentorProposalIntentProvider(retried).generate(REQUEST)).resolves.toEqual({ ok: true, intent: VALID });
    expect(retried.generateStructured).toHaveBeenCalledTimes(2);

    const twice = sequenceModel({ ...VALID, className });
    await expect(new LocalQwenMentorProposalIntentProvider(twice).generate(REQUEST)).resolves.toMatchObject({ ok: false, error: { code: "INVALID_PROPOSAL" } });
    expect(twice.generateStructured).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["UNSUPPORTED", { operation: "UNSUPPORTED" }, "UNSUPPORTED_OPERATION"],
    ["operación fuera de la allow-list", { operation: "DELETE_CLASS", className: "Cliente" }, "UNSUPPORTED_OPERATION"],
    ["JSON inválido", () => { throw new LocalModelError("INVALID_OUTPUT"); }, "INVALID_PROPOSAL"],
    ["campos adicionales", { ...VALID, command: { type: "AddAttribute" } }, "INVALID_PROPOSAL"],
    ["multiplicidad generada", { ...VALID, multiplicity: "*" }, "INVALID_PROPOSAL"],
  ])("6: sin reintento para %s", async (_case, output, code) => {
    const model = sequenceModel(output, VALID);
    await expect(new LocalQwenMentorProposalIntentProvider(model).generate(REQUEST)).resolves.toMatchObject({ ok: false, error: { code } });
    expect(model.generateStructured).toHaveBeenCalledOnce();
  });

  it.each<LocalModelErrorCode>(["TIMEOUT", "BUSY", "INFERENCE_ERROR", "RUNTIME_NOT_AVAILABLE"])("7: sin reintento por %s (indisponibilidad)", async (code) => {
    const model = sequenceModel(() => { throw new LocalModelError(code); }, VALID);
    await expect(new LocalQwenMentorProposalIntentProvider(model).generate(REQUEST)).rejects.toBeInstanceOf(MentorProposalGenerationUnavailableError);
    expect(model.generateStructured).toHaveBeenCalledOnce();
  });

  it("7: si el reintento falla por timeout se informa la indisponibilidad y no hay un tercer intento", async () => {
    const model = sequenceModel(WITHOUT_ACCENT, () => { throw new LocalModelError("TIMEOUT"); }, VALID);
    await expect(new LocalQwenMentorProposalIntentProvider(model).generate(REQUEST)).rejects.toBeInstanceOf(MentorProposalGenerationUnavailableError);
    expect(model.generateStructured).toHaveBeenCalledTimes(2);
  });

  it("8 y 9: el schema no contiene multiplicity y una instrucción con multiplicidad produce una intención sin ella", async () => {
    expect(JSON.stringify(MENTOR_PROPOSAL_INTENT_SCHEMA)).not.toContain("multiplicity");
    const request = { instruction: "Agrega el atributo teléfono de tipo String con multiplicidad 0..1 a Cliente", classNames: ["Cliente"] };
    const model = sequenceModel(VALID);

    const result = await new LocalQwenMentorProposalIntentProvider(model).generate(request);
    expect(result).toEqual({ ok: true, intent: VALID });
    expect(result.ok && "multiplicity" in result.intent).toBe(false);
  });
});

describe("prompt con ejemplo acentuado (few-shot)", () => {
  it("1: contiene un único ejemplo con el nombre acentuado conservado exactamente", () => {
    expect(MENTOR_PROPOSAL_ACCENTED_EXAMPLE).toEqual({
      instruction: "Agrega el atributo teléfono de tipo String a Cliente",
      output: { operation: "ADD_ATTRIBUTE", className: "Cliente", attributeName: "teléfono", attributeType: "String" },
    });
    expect(MENTOR_PROPOSAL_SYSTEM_PROMPT).toContain('Ejemplo: Instrucción: Agrega el atributo teléfono de tipo String a Cliente → {"operation":"ADD_ATTRIBUTE","className":"Cliente","attributeName":"teléfono","attributeType":"String"}');
    expect(MENTOR_PROPOSAL_SYSTEM_PROMPT.match(/Ejemplo:/g)).toHaveLength(1);
  });

  it("1: el ejemplo cumple el mismo schema, parser y validación literal que cualquier salida", () => {
    const { instruction, output } = MENTOR_PROPOSAL_ACCENTED_EXAMPLE;
    expect(parseMentorProposalIntent(output)).toEqual({ ok: true, intent: output });
    expect(namesAreLiteral(instruction, output)).toBe(true);
  });

  it("2: sigue exigiendo copia literal, también con la regla breve explícita", () => {
    expect(MENTOR_PROPOSAL_SYSTEM_PROMPT).toContain("Copy class and attribute names exactly as written by the user. Preserve accents, diacritics, capitalization and spelling. Never normalize identifiers.");
    expect(MENTOR_PROPOSAL_SYSTEM_PROMPT).toContain("Copia className y attributeName literalmente desde la instrucción");
  });

  it("3: el schema sigue sin multiplicity", () => {
    expect(JSON.stringify(MENTOR_PROPOSAL_INTENT_SCHEMA)).not.toContain("multiplicity");
  });

  it("4, 5 y 6: con el ejemplo en el prompt, «telefono» sigue rechazándose tras un único reintento y nada lo corrige", async () => {
    const model = sequenceModel(WITHOUT_ACCENT, WITHOUT_ACCENT, VALID);
    const result = await new LocalQwenMentorProposalIntentProvider(model).generate(REQUEST);

    expect(result).toMatchObject({ ok: false, error: { code: "INVALID_PROPOSAL" } });
    expect(model.generateStructured).toHaveBeenCalledTimes(2);
    for (const [request] of model.generateStructured.mock.calls) expect(request.systemPrompt).toBe(MENTOR_PROPOSAL_SYSTEM_PROMPT);
    // The example lives only in the prompt: it never becomes the answer.
    expect(JSON.stringify(result)).not.toContain("teléfono");
  });
});

describe("LocalQwenMentorProposalIntentProvider: clase escrita en minúsculas", () => {
  it("«…a cliente» con la clase `Cliente`: la respuesta del modelo con `Cliente` se acepta al primer intento", async () => {
    const request = { instruction: "Agrega el atributo telefono de tipo string a cliente", classNames: ["Cliente"] };
    const output = { operation: "ADD_ATTRIBUTE", className: "Cliente", attributeName: "telefono", attributeType: "String" };
    const model = sequenceModel(output);

    await expect(new LocalQwenMentorProposalIntentProvider(model).generate(request)).resolves.toEqual({ ok: true, intent: output });
    expect(model.generateStructured).toHaveBeenCalledOnce();
  });

  it("el atributo sigue siendo estrictamente literal aunque la clase se compare sin mayúsculas", async () => {
    const request = { instruction: "Agrega el atributo telefono de tipo string a cliente", classNames: ["Cliente"] };
    const model = sequenceModel({ operation: "ADD_ATTRIBUTE", className: "Cliente", attributeName: "Telefono", attributeType: "String" });

    await expect(new LocalQwenMentorProposalIntentProvider(model).generate(request)).resolves.toMatchObject({ ok: false, error: { code: "INVALID_PROPOSAL", diagnostics: [NON_LITERAL_NAME_DIAGNOSTIC] } });
    expect(model.generateStructured).toHaveBeenCalledTimes(2);
  });
});
