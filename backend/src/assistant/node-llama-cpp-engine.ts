import { existsSync } from "node:fs";
import { Logger } from "@nestjs/common";
import type { LocalTextModelRequest } from "@examen-sw1/assistant-core";
import type { GbnfJsonSchema, Llama, LlamaContext, LlamaContextSequence, LlamaJsonSchemaGrammar, LlamaModel } from "node-llama-cpp";
import { LocalModelError, type StructuredGenerationEngine, type TextGenerationRequest } from "./local-text-model";
import { parseSingleJsonObject } from "./structured-json";

type NodeLlamaCpp = typeof import("node-llama-cpp");
type JsonGrammar = LlamaJsonSchemaGrammar<GbnfJsonSchema>;

// node-llama-cpp is ESM with top-level await, so it cannot be require()d from this CommonJS build.
// A real dynamic import keeps the native runtime out of startup until the first interpretation.
const importModule = new Function("specifier", "return import(specifier)") as (specifier: string) => Promise<unknown>;

export type AssistantGpuMode = "auto" | "vulkan" | "cuda" | "cpu";

export type NodeLlamaCppEngineConfig = Readonly<{
  modelPath: string;
  gpu: AssistantGpuMode;
  contextSize: number;
  maxTokens: number;
}>;

type LoadedRuntime = Readonly<{ lib: NodeLlamaCpp; llama: Llama; model: LlamaModel; context: LlamaContext; sequence: LlamaContextSequence }>;

const GRAMMAR_CACHE_LIMIT = 16;

export class NodeLlamaCppEngine implements StructuredGenerationEngine {
  private readonly logger = new Logger(NodeLlamaCppEngine.name);
  private loading: Promise<LoadedRuntime> | undefined;
  private readonly grammars = new Map<string, Promise<JsonGrammar>>();

  constructor(private readonly config: NodeLlamaCppEngineConfig, private readonly loadModule: () => Promise<unknown> = () => importModule("node-llama-cpp")) {}

  async warmup(): Promise<void> {
    await this.load();
  }

  // Effective backend chosen by node-llama-cpp and its VRAM view, for benchmarks and diagnostics.
  async runtimeInfo(): Promise<Readonly<{ gpu: string; vramUsedBytes: number; vramTotalBytes: number }>> {
    const runtime = await this.load();
    const vram = await runtime.llama.getVramState();
    return { gpu: runtime.llama.gpu === false ? "cpu" : runtime.llama.gpu, vramUsedBytes: vram.used, vramTotalBytes: vram.total };
  }

  async generate(request: LocalTextModelRequest, signal: AbortSignal): Promise<unknown> {
    if (signal.aborted) throw new LocalModelError("TIMEOUT");
    this.logger.log("recommendation:engine-start");
    const runtime = await this.load();
    const grammar = await this.grammarFor(runtime, request.schema);
    this.logger.log("recommendation:grammar-ready");
    const session = new runtime.lib.LlamaChatSession({
      contextSequence: runtime.sequence,
      systemPrompt: request.systemPrompt,
      chatWrapper: new runtime.lib.QwenChatWrapper({ thoughts: "discourage" }),
      autoDisposeSequence: false,
    });
    try {
      // Greedy decoding (temperature 0) and no thought tokens: only the constrained JSON is generated.
      const maxTokens = request.maxTokens ?? this.config.maxTokens;
      const result = await session.promptWithMeta(request.userPrompt, { grammar, temperature: 0, maxTokens, budgets: { thoughtTokens: 0 }, signal });
      const text = result.responseText;
      try {
        const json = parseSingleJsonObject(text);
        if (!json) {
          this.logger.warn(JSON.stringify({ stage: "recommendation:json-extraction", errorName: "LocalModelError", errorCode: "INVALID_OUTPUT", message: "The model response did not contain one JSON object." }));
          throw new LocalModelError("INVALID_OUTPUT");
        }
        const parsed = grammar.parse(JSON.stringify(json));
        this.logger.log("recommendation:grammar-parse-ok");
        return parsed;
      } catch (error) {
        if (!(error instanceof LocalModelError)) this.logger.warn(JSON.stringify({ stage: "recommendation:grammar-parse", errorName: error instanceof Error ? error.name : typeof error, errorCode: "INVALID_OUTPUT", message: "The JSON object did not match the constrained schema." }));
        throw new LocalModelError("INVALID_OUTPUT");
      }
    } finally {
      session.dispose({ disposeSequence: false });
      await runtime.sequence.clearHistory();
    }
  }

  async generateText(request: TextGenerationRequest, signal: AbortSignal): Promise<string> {
    if (signal.aborted) throw new LocalModelError("TIMEOUT");
    const runtime = await this.load();
    const session = new runtime.lib.LlamaChatSession({
      contextSequence: runtime.sequence,
      systemPrompt: request.systemPrompt,
      chatWrapper: new runtime.lib.QwenChatWrapper({ thoughts: "discourage" }),
      autoDisposeSequence: false,
    });
    try {
      const answer = await session.prompt(request.userPrompt, { temperature: 0, maxTokens: this.config.maxTokens, budgets: { thoughtTokens: 0 }, signal });
      const trimmed = answer.trim();
      if (!trimmed) throw new LocalModelError("INVALID_OUTPUT", "El modelo local no produjo una respuesta.");
      return trimmed;
    } finally {
      session.dispose({ disposeSequence: false });
      await runtime.sequence.clearHistory();
    }
  }

  async dispose(): Promise<void> {
    const loading = this.loading;
    this.loading = undefined;
    this.grammars.clear();
    if (!loading) return;
    const runtime = await loading.catch(() => undefined);
    await runtime?.llama.dispose();
  }

  private load(): Promise<LoadedRuntime> {
    // A failed load is not cached: a later request retries it.
    this.loading ??= this.loadNow().catch((error: unknown) => {
      this.loading = undefined;
      throw error;
    });
    return this.loading;
  }

  private async loadNow(): Promise<LoadedRuntime> {
    if (!existsSync(this.config.modelPath)) throw new LocalModelError("MODEL_NOT_FOUND");
    let lib: NodeLlamaCpp;
    try {
      lib = await this.loadModule() as NodeLlamaCpp;
    } catch {
      throw new LocalModelError("RUNTIME_NOT_AVAILABLE");
    }
    try {
      const llama = await lib.getLlama({ gpu: this.config.gpu === "cpu" ? false : this.config.gpu });
      const model = await llama.loadModel({ modelPath: this.config.modelPath });
      const context = await model.createContext({ contextSize: this.config.contextSize });
      return { lib, llama, model, context, sequence: context.getSequence() };
    } catch {
      throw new LocalModelError("RUNTIME_NOT_AVAILABLE", "No se pudo cargar el modelo local con el runtime configurado.");
    }
  }

  private grammarFor(runtime: LoadedRuntime, schema: LocalTextModelRequest["schema"]): Promise<JsonGrammar> {
    const key = JSON.stringify(schema);
    const cached = this.grammars.get(key);
    if (cached) return cached;
    // The schema is built at runtime, so the library's literal-type inference cannot apply here.
    const createGrammar = runtime.llama.createGrammarForJsonSchema.bind(runtime.llama) as (schema: unknown) => Promise<JsonGrammar>;
    const created = createGrammar(schema);
    if (this.grammars.size >= GRAMMAR_CACHE_LIMIT) this.grammars.delete(this.grammars.keys().next().value!);
    this.grammars.set(key, created);
    created.catch(() => this.grammars.delete(key));
    return created;
  }
}
