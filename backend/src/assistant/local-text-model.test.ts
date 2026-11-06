import { describe, expect, it } from "vitest";
import type { LocalTextModelRequest } from "@examen-sw1/assistant-core";
import { LocalModelError, QueuedLocalTextModel, type StructuredGenerationEngine } from "./local-text-model";

const request: LocalTextModelRequest = { systemPrompt: "s", userPrompt: "u", schema: { oneOf: [] } };

function deferredEngine() {
  const calls: Array<{ resolve: (value: unknown) => void; reject: (error: unknown) => void; signal: AbortSignal }> = [];
  const engine: StructuredGenerationEngine = { generate: (_request, signal) => new Promise((resolve, reject) => calls.push({ resolve, reject, signal })) };
  return { engine, calls };
}

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe("QueuedLocalTextModel", () => {
  it("serializa las inferencias: la segunda empieza cuando termina la primera", async () => {
    const { engine, calls } = deferredEngine();
    const model = new QueuedLocalTextModel(engine, { timeoutMs: 1_000, maxQueue: 5 });
    const first = model.generateStructured(request);
    const second = model.generateStructured(request);
    await flush();
    expect(calls).toHaveLength(1);
    calls[0]!.resolve({ n: 1 });
    await expect(first).resolves.toEqual({ n: 1 });
    await flush();
    expect(calls).toHaveLength(2);
    calls[1]!.resolve({ n: 2 });
    await expect(second).resolves.toEqual({ n: 2 });
  });

  it("responde BUSY cuando la cola supera el límite", async () => {
    const { engine, calls } = deferredEngine();
    const model = new QueuedLocalTextModel(engine, { timeoutMs: 1_000, maxQueue: 1 });
    const first = model.generateStructured(request);
    await expect(model.generateStructured(request)).rejects.toMatchObject({ code: "BUSY" });
    await flush();
    calls[0]!.resolve("ok");
    await expect(first).resolves.toBe("ok");
  });

  it("aborta por timeout y no solapa la siguiente inferencia con la abortada", async () => {
    const { engine, calls } = deferredEngine();
    const model = new QueuedLocalTextModel(engine, { timeoutMs: 20, maxQueue: 5 });
    await expect(model.generateStructured(request)).rejects.toMatchObject({ code: "TIMEOUT" });
    expect(calls[0]!.signal.aborted).toBe(true);
    const next = model.generateStructured(request);
    await flush();
    expect(calls).toHaveLength(1);
    calls[0]!.reject(new Error("aborted"));
    await flush();
    expect(calls).toHaveLength(2);
    calls[1]!.resolve("next");
    await expect(next).resolves.toBe("next");
  });

  it("excluye la carga del modelo del timeout de inferencia", async () => {
    const engine: StructuredGenerationEngine = {
      warmup: () => new Promise((resolve) => setTimeout(resolve, 60)),
      generate: () => Promise.resolve("listo"),
    };
    await expect(new QueuedLocalTextModel(engine, { timeoutMs: 20, maxQueue: 5 }).generateStructured(request)).resolves.toBe("listo");
  });

  it("un fallo de carga reporta su diagnóstico y libera la cola", async () => {
    let loads = 0;
    const engine: StructuredGenerationEngine = {
      warmup: () => (loads += 1) === 1 ? Promise.reject(new LocalModelError("RUNTIME_NOT_AVAILABLE")) : Promise.resolve(),
      generate: () => Promise.resolve("segundo"),
    };
    const model = new QueuedLocalTextModel(engine, { timeoutMs: 1_000, maxQueue: 1 });
    await expect(model.generateStructured(request)).rejects.toMatchObject({ code: "RUNTIME_NOT_AVAILABLE" });
    await expect(model.generateStructured(request)).resolves.toBe("segundo");
  });

  it("conserva diagnósticos del runtime y oculta errores internos", async () => {
    const failing = (error: unknown): StructuredGenerationEngine => ({ generate: () => Promise.reject(error) });
    await expect(new QueuedLocalTextModel(failing(new LocalModelError("MODEL_NOT_FOUND")), { timeoutMs: 1_000, maxQueue: 5 }).generateStructured(request)).rejects.toMatchObject({ code: "MODEL_NOT_FOUND" });
    const hidden = new QueuedLocalTextModel(failing(new Error("C:\\secreto\\ruta interna")), { timeoutMs: 1_000, maxQueue: 5 }).generateStructured(request);
    await expect(hidden).rejects.toMatchObject({ code: "INFERENCE_ERROR" });
    await expect(hidden).rejects.not.toMatchObject({ message: expect.stringContaining("secreto") });
  });
});
