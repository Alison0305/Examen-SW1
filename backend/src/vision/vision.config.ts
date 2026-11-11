import { VISION_MODEL_DTYPES, type VisionModelDtype } from "./florence2-ocr-engine";

export type VisionConfig = Readonly<{
  modelPath: string | undefined;
  dtype: VisionModelDtype;
  timeoutMs: number;
  maxQueue: number;
  preload: boolean;
  maxBytes: number;
  maxInputPixels: number;
  maxSide: number;
  minSide: number;
  // ONNX Runtime threads for Florence-2: VISION_THREADS, else ASSISTANT_THREADS (computed from the container CPU quota
  // by docker-entrypoint.sh), else undefined (runtime default). Both models share the same CPU quota.
  threads: number | undefined;
}>;

const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_QUEUE = 2;
const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;
const DEFAULT_MAX_INPUT_PIXELS = 40_000_000;
const MAX_SIDE = 1024;
const MIN_SIDE = 32;

const positiveInteger = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

export function getVisionConfig(env: NodeJS.ProcessEnv = process.env): VisionConfig {
  const dtype = env.VISION_MODEL_DTYPE?.trim().toLowerCase();
  return {
    modelPath: env.VISION_MODEL_PATH?.trim() || undefined,
    dtype: VISION_MODEL_DTYPES.includes(dtype as VisionModelDtype) ? dtype as VisionModelDtype : "q8",
    timeoutMs: positiveInteger(env.VISION_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
    maxQueue: positiveInteger(env.VISION_MAX_QUEUE, DEFAULT_MAX_QUEUE),
    preload: env.VISION_PRELOAD?.trim().toLowerCase() === "true",
    maxBytes: positiveInteger(env.VISION_MAX_BYTES, DEFAULT_MAX_BYTES),
    maxInputPixels: positiveInteger(env.VISION_MAX_INPUT_PIXELS, DEFAULT_MAX_INPUT_PIXELS),
    maxSide: MAX_SIDE,
    minSide: MIN_SIDE,
    threads: positiveInteger(env.VISION_THREADS, 0) || positiveInteger(env.ASSISTANT_THREADS, 0) || undefined,
  };
}
