import { afterAll, describe, expect, it } from "vitest";
import { getAssistantConfig } from "./assistant.config";
import { usuarioManifest } from "./assistant-fixtures";
import { AssistantInterpreterService } from "./assistant-interpreter.service";
import { QueuedLocalTextModel } from "./local-text-model";
import { NodeLlamaCppEngine } from "./node-llama-cpp-engine";

const config = getAssistantConfig();
const describeQwenIntegration = config.modelPath ? describe : describe.skip;
const MODEL_LOAD_TIMEOUT_MS = 180_000;

describeQwenIntegration("Qwen3 real local mediante node-llama-cpp", () => {
  const engine = new NodeLlamaCppEngine({ modelPath: config.modelPath!, gpu: config.gpu, contextSize: config.contextSize, maxTokens: config.maxTokens });
  // Production timeout: the first request also loads the model, which must not count against it.
  const model = new QueuedLocalTextModel(engine, { timeoutMs: config.timeoutMs, maxQueue: config.maxQueue });
  const interpreter = new AssistantInterpreterService(model);
  const classes = [{ id: "c-1", name: "Paciente" }];

  afterAll(async () => {
    await model.dispose();
  });

  it("interpreta una creación de clase en español natural", async () => {
    await expect(interpreter.interpretUml("crear clase cita", classes)).resolves.toEqual({ ok: true, mode: "uml", source: "model", proposal: { type: "CREATE_CLASS", name: "Cita" } });
  }, MODEL_LOAD_TIMEOUT_MS);

  it("resuelve una eliminación por nombre sin emitir UUIDs", async () => {
    await expect(interpreter.interpretUml("elimina la clase paciente", classes)).resolves.toEqual({ ok: true, mode: "uml", source: "model", proposal: { type: "DELETE_CLASS", targetId: "c-1" } });
  }, MODEL_LOAD_TIMEOUT_MS);

  it("rechaza una frase fuera de dominio", async () => {
    await expect(interpreter.interpretUml("hola, ¿cómo estás?", classes)).resolves.toMatchObject({ ok: false, diagnostic: { code: "OUT_OF_DOMAIN" } });
  }, MODEL_LOAD_TIMEOUT_MS);

  it("interpreta un comando de datos validado contra el Domain Manifest", async () => {
    await expect(interpreter.interpretData("lista los usuarios", usuarioManifest)).resolves.toEqual({ ok: true, mode: "data", source: "model", command: { operation: "LIST", entity: "usuario" } });
  }, MODEL_LOAD_TIMEOUT_MS);

  it("reporta MODEL_NOT_FOUND para una ruta inexistente sin descargar nada", async () => {
    const missing = new QueuedLocalTextModel(new NodeLlamaCppEngine({ ...config, modelPath: "missing-model.gguf" }), { timeoutMs: 10_000, maxQueue: 1 });
    await expect(new AssistantInterpreterService(missing).interpretUml("crear clase cita", classes)).resolves.toMatchObject({ ok: false, diagnostic: { code: "MODEL_NOT_FOUND" } });
  });
});
