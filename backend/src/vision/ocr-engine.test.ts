import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { GrayImage, OcrLine } from "./diagram-analyzer";
import { Florence2OcrEngine, florence2ModelFiles } from "./florence2-ocr-engine";
import { QueuedOcrEngine, type OcrEngine } from "./ocr-engine";
import { getVisionConfig } from "./vision.config";
import { VisionError } from "./vision-errors";

const image: GrayImage = { data: new Uint8Array(64 * 64).fill(255), width: 64, height: 64 };
const line: OcrLine = { text: "Cliente", box: { left: 1, top: 2, right: 30, bottom: 12 } };

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

describe("QueuedOcrEngine", () => {
  it("procesa una imagen a la vez en orden de llegada", async () => {
    const first = deferred<OcrLine[]>();
    const calls: string[] = [];
    const engine: OcrEngine = { recognize: vi.fn(async () => { calls.push("start"); const result = calls.length === 1 ? await first.promise : [line]; calls.push("end"); return result; }) };
    const queue = new QueuedOcrEngine(engine, { timeoutMs: 1000, maxQueue: 3 });

    const a = queue.recognize(image);
    const b = queue.recognize(image);
    await vi.waitFor(() => expect(calls).toEqual(["start"]));
    first.resolve([]);
    await expect(a).resolves.toEqual([]);
    await expect(b).resolves.toEqual([line]);
    expect(calls).toEqual(["start", "end", "start", "end"]);
  });

  it("rechaza con BUSY lo que excede la cola", async () => {
    const blocked = deferred<OcrLine[]>();
    const queue = new QueuedOcrEngine({ recognize: () => blocked.promise }, { timeoutMs: 1000, maxQueue: 1 });
    const pending = queue.recognize(image);
    await expect(queue.recognize(image)).rejects.toMatchObject({ code: "BUSY" });
    blocked.resolve([line]);
    await expect(pending).resolves.toEqual([line]);
  });

  it("agota el tiempo sin contar la carga del modelo y cancela la inferencia", async () => {
    vi.useFakeTimers();
    try {
      const load = deferred<void>();
      let signal: AbortSignal | undefined;
      const engine: OcrEngine = { warmup: () => load.promise, recognize: (_image, received) => { signal = received; return new Promise<OcrLine[]>(() => undefined); } };
      const queue = new QueuedOcrEngine(engine, { timeoutMs: 100, maxQueue: 2 });
      const result = queue.recognize(image);
      const outcome = expect(result).rejects.toMatchObject({ code: "TIMEOUT" });

      await vi.advanceTimersByTimeAsync(500);
      expect(signal).toBeUndefined();
      load.resolve();
      await vi.advanceTimersByTimeAsync(99);
      expect(signal?.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      await outcome;
      expect(signal?.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("convierte errores inesperados del runtime en INFERENCE_ERROR y conserva los VisionError", async () => {
    await expect(new QueuedOcrEngine({ recognize: () => Promise.reject(new Error("onnx")) }, { timeoutMs: 1000, maxQueue: 1 }).recognize(image)).rejects.toMatchObject({ code: "INFERENCE_ERROR" });
    await expect(new QueuedOcrEngine({ recognize: () => Promise.reject(new VisionError("MODEL_NOT_FOUND")) }, { timeoutMs: 1000, maxQueue: 1 }).recognize(image)).rejects.toMatchObject({ code: "MODEL_NOT_FOUND" });
  });
});

function modelFolder(files: readonly string[]): string {
  const folder = join(mkdtempSync(join(tmpdir(), "florence-")), "Florence-2-base-ft");
  mkdirSync(join(folder, "onnx"), { recursive: true });
  for (const file of files) writeFileSync(join(folder, file), "");
  return folder;
}

// Minimal stand-in for the Transformers.js surface the engine uses.
function fakeTransformers(decoded: string, parsed: unknown) {
  const env = { allowRemoteModels: true, allowLocalModels: false, localModelPath: "" };
  const generate = vi.fn(async () => [[0]]);
  const processor = Object.assign(vi.fn(async () => ({ input_ids: [] })), {
    construct_prompts: (task: string) => [task],
    batch_decode: () => [decoded],
    post_process_generation: vi.fn(() => parsed),
  });
  const lib = {
    env,
    RawImage: class { size: [number, number]; constructor(_data: unknown, width: number, height: number) { this.size = [width, height]; } rgb() { return this; } },
    StoppingCriteria: class {},
    Florence2ForConditionalGeneration: { from_pretrained: vi.fn(async () => ({ generate, dispose: vi.fn(async () => undefined) })) },
    Florence2Processor: { from_pretrained: vi.fn(async () => processor) },
  };
  return { lib, generate, processor };
}

describe("Florence2OcrEngine", () => {
  it("informa MODEL_NOT_FOUND si falta algún archivo y no intenta cargar el runtime", async () => {
    const loader = vi.fn();
    const folder = modelFolder(florence2ModelFiles("q8").filter((file) => !file.includes("vision_encoder")));
    const engine = new Florence2OcrEngine({ modelPath: folder, dtype: "q8" }, loader);
    await expect(engine.recognize(image, new AbortController().signal)).rejects.toMatchObject({ code: "MODEL_NOT_FOUND" });
    expect(loader).not.toHaveBeenCalled();
  });

  it("informa RUNTIME_NOT_AVAILABLE si el runtime no carga y reintenta en la siguiente solicitud", async () => {
    const loader = vi.fn().mockRejectedValue(new Error("no onnxruntime"));
    const engine = new Florence2OcrEngine({ modelPath: modelFolder(florence2ModelFiles("q8")), dtype: "q8" }, loader);
    await expect(engine.warmup()).rejects.toMatchObject({ code: "RUNTIME_NOT_AVAILABLE" });
    await expect(engine.warmup()).rejects.toMatchObject({ code: "RUNTIME_NOT_AVAILABLE" });
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("carga solo archivos locales y convierte la salida OCR_WITH_REGION en líneas con caja", async () => {
    const parsed = { "<OCR_WITH_REGION>": { labels: ["</s>Cliente", "- nombre : String", " "], quad_boxes: [[10.2, 5, 60.7, 5, 60.7, 20.4, 10.2, 20.4], [12, 30, 150, 30, 150, 46, 12, 46], [0, 0, 1, 0, 1, 1, 0, 1]] } };
    const { lib, generate } = fakeTransformers("text", parsed);
    const folder = modelFolder(florence2ModelFiles("q8"));
    const engine = new Florence2OcrEngine({ modelPath: folder, dtype: "q8" }, async () => lib as never);

    const lines = await engine.recognize(image, new AbortController().signal);

    expect(lib.env).toMatchObject({ allowRemoteModels: false, allowLocalModels: true });
    expect(lib.Florence2ForConditionalGeneration.from_pretrained).toHaveBeenCalledWith("Florence-2-base-ft", { dtype: "q8", device: "cpu", local_files_only: true });
    expect(generate).toHaveBeenCalledWith(expect.objectContaining({ max_new_tokens: 1024, stopping_criteria: expect.anything() }));
    expect(lines).toEqual([
      { text: "Cliente", box: { left: 10, top: 5, right: 61, bottom: 21 } },
      { text: "- nombre : String", box: { left: 12, top: 30, right: 150, bottom: 46 } },
    ]);
  });

  it("no ejecuta una inferencia ya cancelada", async () => {
    const controller = new AbortController();
    controller.abort();
    const engine = new Florence2OcrEngine({ modelPath: "C:/no-existe", dtype: "q8" }, vi.fn());
    await expect(engine.recognize(image, controller.signal)).rejects.toMatchObject({ code: "TIMEOUT" });
  });
});

describe("getVisionConfig", () => {
  it("usa valores por defecto seguros y respeta las variables válidas", () => {
    expect(getVisionConfig({})).toMatchObject({ modelPath: undefined, dtype: "q8", timeoutMs: 60_000, maxQueue: 2, preload: false, maxBytes: 5 * 1024 * 1024, maxSide: 1024 });
    expect(getVisionConfig({ VISION_MODEL_PATH: " C:/modelos/Florence-2-base-ft ", VISION_MODEL_DTYPE: "FP32", VISION_TIMEOUT_MS: "1500", VISION_MAX_QUEUE: "0", VISION_PRELOAD: "true" })).toMatchObject({ modelPath: "C:/modelos/Florence-2-base-ft", dtype: "fp32", timeoutMs: 1500, maxQueue: 2, preload: true });
    expect(getVisionConfig({ VISION_MODEL_DTYPE: "bnb4" }).dtype).toBe("q8");
  });
});
