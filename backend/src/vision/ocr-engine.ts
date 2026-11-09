import type { GrayImage, OcrLine } from "./diagram-analyzer";
import { VisionError } from "./vision-errors";

// A runtime engine performs one OCR pass; the queue below owns concurrency and time limits.
export interface OcrEngine {
  recognize(image: GrayImage, signal: AbortSignal): Promise<OcrLine[]>;
  warmup?(): Promise<void>;
  dispose?(): Promise<void>;
}

export type QueuedOcrEngineOptions = Readonly<{ timeoutMs: number; maxQueue: number }>;

const noop = () => undefined;

// One image at a time (one ONNX session set); rejects with BUSY beyond maxQueue pending requests.
// The model load runs before the timer starts, so the first request is not timed out by it.
export class QueuedOcrEngine {
  private tail: Promise<unknown> = Promise.resolve();
  private pending = 0;

  constructor(private readonly engine: OcrEngine, private readonly options: QueuedOcrEngineOptions) {}

  async recognize(image: GrayImage): Promise<OcrLine[]> {
    if (this.pending >= this.options.maxQueue) throw new VisionError("BUSY");
    this.pending += 1;
    const previous = this.tail;
    let release: () => void = noop;
    this.tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    let recognition: Promise<OcrLine[]> | undefined;
    try {
      await previous;
      await this.engine.warmup?.();
      const controller = new AbortController();
      recognition = this.engine.recognize(image, controller.signal);
      // The slot is released when the engine settles, even after a timeout, so inferences never overlap.
      recognition.then(release, release);
      return await this.withTimeout(recognition, controller);
    } catch (error) {
      if (error instanceof VisionError) throw error;
      throw new VisionError("INFERENCE_ERROR");
    } finally {
      if (!recognition) release();
      this.pending -= 1;
    }
  }

  warmup(): Promise<void> {
    return this.engine.warmup?.() ?? Promise.resolve();
  }

  dispose(): Promise<void> {
    return this.engine.dispose?.() ?? Promise.resolve();
  }

  private async withTimeout(recognition: Promise<OcrLine[]>, controller: AbortController): Promise<OcrLine[]> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new VisionError("TIMEOUT"));
      }, this.options.timeoutMs);
    });
    try {
      return await Promise.race([recognition, timeout]);
    } catch (error) {
      if (!(error instanceof VisionError) && controller.signal.aborted) throw new VisionError("TIMEOUT");
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
}
