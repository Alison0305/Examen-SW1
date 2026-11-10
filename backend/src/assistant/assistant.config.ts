import type { AssistantGpuMode } from "./node-llama-cpp-engine";

export type AssistantConfig = Readonly<{
  modelPath: string | undefined;
  gpu: AssistantGpuMode;
  timeoutMs: number;
  maxQueue: number;
  preload: boolean;
  contextSize: number;
  maxTokens: number;
}>;

const GPU_MODES: readonly AssistantGpuMode[] = ["auto", "vulkan", "cuda", "cpu"];
// Local Qwen inference may legitimately exceed 30 seconds on CPU; callers stay pending until this server-side bound.
const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_QUEUE = 5;
const CONTEXT_SIZE = 4096;
const MAX_OUTPUT_TOKENS = 256;

const positiveInteger = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

export function getAssistantConfig(env: NodeJS.ProcessEnv = process.env): AssistantConfig {
  const gpu = env.ASSISTANT_GPU?.trim().toLowerCase();
  return {
    modelPath: env.ASSISTANT_MODEL_PATH?.trim() || undefined,
    gpu: GPU_MODES.includes(gpu as AssistantGpuMode) ? gpu as AssistantGpuMode : "auto",
    timeoutMs: positiveInteger(env.ASSISTANT_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
    maxQueue: positiveInteger(env.ASSISTANT_MAX_QUEUE, DEFAULT_MAX_QUEUE),
    preload: env.ASSISTANT_PRELOAD?.trim().toLowerCase() === "true",
    contextSize: CONTEXT_SIZE,
    maxTokens: MAX_OUTPUT_TOKENS,
  };
}
