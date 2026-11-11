import { describe, expect, it, vi } from "vitest";
import { getAssistantConfig } from "./assistant.config";
import { NodeLlamaCppEngine } from "./node-llama-cpp-engine";

// ASSISTANT_THREADS fixes the inference threads. In a container node-llama-cpp may see every core of the host while
// the CPU quota is much lower, which made each generation exceed the 120 s timeout in the cloud.
describe("ASSISTANT_THREADS", () => {
  it("sin la variable conserva el comportamiento por defecto de node-llama-cpp", () => {
    expect(getAssistantConfig({}).threads).toBeUndefined();
  });

  it("acepta un entero positivo e ignora valores inválidos", () => {
    expect(getAssistantConfig({ ASSISTANT_THREADS: "4" }).threads).toBe(4);
    for (const value of ["0", "-2", "1.5", "muchos", "", " "]) expect(getAssistantConfig({ ASSISTANT_THREADS: value }).threads).toBeUndefined();
  });
});

function fakeRuntime() {
  const context = { currentThreads: 4, getSequence: () => ({}) };
  const model = { createContext: vi.fn(async () => context) };
  const llama = { gpu: false, loadModel: vi.fn(async () => model) };
  const lib = { getLlama: vi.fn(async () => llama) };
  return { lib, llama, model };
}

describe("NodeLlamaCppEngine: hilos de inferencia", () => {
  it("con hilos configurados los pasa a getLlama (maxThreads) y a createContext (threads)", async () => {
    const runtime = fakeRuntime();
    const engine = new NodeLlamaCppEngine({ modelPath: __filename, gpu: "cpu", contextSize: 4096, maxTokens: 256, threads: 4 }, async () => runtime.lib);

    await engine.warmup();

    expect(runtime.lib.getLlama).toHaveBeenCalledWith({ gpu: false, maxThreads: 4 });
    expect(runtime.model.createContext).toHaveBeenCalledWith({ contextSize: 4096, threads: 4 });
  });

  it("sin hilos configurados no envía ninguna opción de hilos", async () => {
    const runtime = fakeRuntime();
    const engine = new NodeLlamaCppEngine({ modelPath: __filename, gpu: "cpu", contextSize: 4096, maxTokens: 256 }, async () => runtime.lib);

    await engine.warmup();

    expect(runtime.lib.getLlama).toHaveBeenCalledWith({ gpu: false });
    expect(runtime.model.createContext).toHaveBeenCalledWith({ contextSize: 4096 });
  });
});
