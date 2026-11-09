import { existsSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import type { GrayImage, OcrLine } from "./diagram-analyzer";
import type { OcrEngine } from "./ocr-engine";
import { VisionError } from "./vision-errors";

type Transformers = typeof import("@huggingface/transformers");
type Florence2Model = Awaited<ReturnType<Transformers["Florence2ForConditionalGeneration"]["from_pretrained"]>>;
type Florence2Processor = InstanceType<Transformers["Florence2Processor"]>;
type LoadedRuntime = Readonly<{ lib: Transformers; model: Florence2Model; processor: Florence2Processor }>;

export const VISION_MODEL_DTYPES = ["q8", "fp32", "fp16", "int8", "uint8", "q4"] as const;
export type VisionModelDtype = (typeof VISION_MODEL_DTYPES)[number];

const DTYPE_SUFFIX: Readonly<Record<VisionModelDtype, string>> = { q8: "_quantized", fp32: "", fp16: "_fp16", int8: "_int8", uint8: "_uint8", q4: "_q4" };
const MODEL_PARTS = ["embed_tokens", "vision_encoder", "encoder_model", "decoder_model_merged"] as const;
const REQUIRED_FILES = ["config.json", "generation_config.json", "preprocessor_config.json", "tokenizer.json", "tokenizer_config.json"] as const;
const OCR_TASK = "<OCR_WITH_REGION>";
const MAX_NEW_TOKENS = 1024;

export type Florence2OcrEngineConfig = Readonly<{ modelPath: string; dtype: VisionModelDtype }>;

// Files the configured model folder must contain; nothing is ever downloaded at runtime.
export function florence2ModelFiles(dtype: VisionModelDtype): string[] {
  return [...REQUIRED_FILES, ...MODEL_PARTS.map((part) => `onnx/${part}${DTYPE_SUFFIX[dtype]}.onnx`)];
}

const toBox = (quad: readonly number[]) => {
  const xs = [quad[0]!, quad[2]!, quad[4]!, quad[6]!];
  const ys = [quad[1]!, quad[3]!, quad[5]!, quad[7]!];
  return { left: Math.floor(Math.min(...xs)), top: Math.floor(Math.min(...ys)), right: Math.ceil(Math.max(...xs)), bottom: Math.ceil(Math.max(...ys)) };
};

// Florence-2 through Transformers.js (ONNX Runtime on CPU), only for OCR with regions.
export class Florence2OcrEngine implements OcrEngine {
  private loading: Promise<LoadedRuntime> | undefined;

  constructor(private readonly config: Florence2OcrEngineConfig, private readonly loadModule: () => Promise<Transformers> = () => import("@huggingface/transformers")) {}

  async warmup(): Promise<void> {
    await this.load();
  }

  async recognize(image: GrayImage, signal: AbortSignal): Promise<OcrLine[]> {
    if (signal.aborted) throw new VisionError("TIMEOUT");
    const { lib, model, processor } = await this.load();
    const raw = new lib.RawImage(new Uint8ClampedArray(image.data), image.width, image.height, 1).rgb();
    const inputs = await processor(raw, processor.construct_prompts(OCR_TASK));
    // Checked after every generated token, so a timeout stops the decoder instead of letting it run on.
    class AbortCriteria extends lib.StoppingCriteria {
      override _call(inputIds: number[][]): boolean[] {
        return inputIds.map(() => signal.aborted);
      }
    }
    const generated = await model.generate({ ...inputs, max_new_tokens: MAX_NEW_TOKENS, stopping_criteria: new AbortCriteria() });
    if (signal.aborted) throw new VisionError("TIMEOUT");
    const text = processor.batch_decode(generated as Parameters<typeof processor.batch_decode>[0], { skip_special_tokens: false })[0] ?? "";
    const result = processor.post_process_generation(text, OCR_TASK, raw.size) as Record<string, { labels?: string[]; quad_boxes?: number[][] }>;
    const output = result[OCR_TASK] ?? {};
    const labels = output.labels ?? [];
    const quads = output.quad_boxes ?? [];
    return labels.flatMap((label, index) => {
      const quad = quads[index];
      const cleaned = label.replace(/<\/?s>/g, "").trim();
      return quad && quad.length === 8 && cleaned ? [{ text: cleaned, box: toBox(quad) }] : [];
    });
  }

  async dispose(): Promise<void> {
    const loading = this.loading;
    this.loading = undefined;
    const runtime = await loading?.catch(() => undefined);
    await runtime?.model.dispose();
  }

  private load(): Promise<LoadedRuntime> {
    this.loading ??= this.loadRuntime().catch((error: unknown) => {
      // A failed load is retried on the next request (for example after the files are copied).
      this.loading = undefined;
      throw error;
    });
    return this.loading;
  }

  private async loadRuntime(): Promise<LoadedRuntime> {
    const { modelPath, dtype } = this.config;
    if (florence2ModelFiles(dtype).some((file) => !existsSync(join(modelPath, file)))) throw new VisionError("MODEL_NOT_FOUND");
    let lib: Transformers;
    try {
      lib = await this.loadModule();
    } catch {
      throw new VisionError("RUNTIME_NOT_AVAILABLE");
    }
    // Local files only: the folder name is the model id under its parent directory.
    lib.env.allowRemoteModels = false;
    lib.env.allowLocalModels = true;
    lib.env.localModelPath = `${dirname(modelPath).replace(/\\/g, "/")}/`;
    const modelId = basename(modelPath);
    try {
      const model = await lib.Florence2ForConditionalGeneration.from_pretrained(modelId, { dtype, device: "cpu", local_files_only: true });
      const processor = await lib.Florence2Processor.from_pretrained(modelId, { local_files_only: true }) as Florence2Processor;
      return { lib, model, processor };
    } catch {
      throw new VisionError("RUNTIME_NOT_AVAILABLE");
    }
  }
}
