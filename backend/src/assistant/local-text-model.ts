import type { LocalTextModel, LocalTextModelRequest } from "@examen-sw1/assistant-core";

export type LocalModelErrorCode = "NOT_CONFIGURED" | "MODEL_NOT_FOUND" | "RUNTIME_NOT_AVAILABLE" | "INVALID_OUTPUT" | "INFERENCE_ERROR" | "TIMEOUT" | "BUSY";

const messages: Record<LocalModelErrorCode, string> = {
  NOT_CONFIGURED: "No se configuró un modelo local de texto.",
  MODEL_NOT_FOUND: "El modelo local configurado no existe.",
  RUNTIME_NOT_AVAILABLE: "El runtime local de texto no está disponible.",
  INVALID_OUTPUT: "El modelo local no produjo una salida estructurada válida.",
  INFERENCE_ERROR: "No se pudo completar la interpretación local.",
  TIMEOUT: "La interpretación local superó el tiempo máximo.",
  BUSY: "El intérprete local está ocupado; inténtalo nuevamente.",
};

export class LocalModelError extends Error {
  constructor(readonly code: LocalModelErrorCode, message: string = messages[code]) {
    super(message);
  }
}

// A runtime engine performs one structured generation; the queue below owns concurrency and time limits.
export interface StructuredGenerationEngine {
  generate(request: LocalTextModelRequest, signal: AbortSignal): Promise<unknown>;
  generateText?(request: TextGenerationRequest, signal: AbortSignal): Promise<string>;
  warmup?(): Promise<void>;
  dispose?(): Promise<void>;
}

export type TextGenerationRequest = Readonly<{ systemPrompt: string; userPrompt: string }>;

export type QueuedLocalTextModelOptions = Readonly<{ timeoutMs: number; maxQueue: number }>;

const noop = () => undefined;

// Serializes inferences (one GPU context, one sequence) and rejects with BUSY beyond maxQueue pending requests.
export class QueuedLocalTextModel implements LocalTextModel {
  private tail: Promise<unknown> = Promise.resolve();
  private pending = 0;

  constructor(private readonly engine: StructuredGenerationEngine, private readonly options: QueuedLocalTextModelOptions) {}

  async generateStructured(request: LocalTextModelRequest): Promise<unknown> {
    return this.enqueue((signal) => this.engine.generate(request, signal));
  }

  async generateText(request: TextGenerationRequest): Promise<string> {
    if (!this.engine.generateText) throw new LocalModelError("NOT_CONFIGURED");
    return this.enqueue((signal) => this.engine.generateText!(request, signal));
  }

  private async enqueue<T>(generate: (signal: AbortSignal) => Promise<T>): Promise<T> {
    if (this.pending >= this.options.maxQueue) throw new LocalModelError("BUSY");
    this.pending += 1;
    const previous = this.tail;
    let release: () => void = noop;
    this.tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    let generation: Promise<T> | undefined;
    try {
      await previous;
      // Loading the model is excluded from the timeout: the first load can take longer than an inference.
      await this.engine.warmup?.();
      const controller = new AbortController();
      generation = generate(controller.signal);
      // The slot is released when the engine settles, even after a timeout, so generations never overlap.
      generation.then(release, release);
      return await this.withTimeout(generation, controller);
    } catch (error) {
      if (error instanceof LocalModelError) throw error;
      throw new LocalModelError("INFERENCE_ERROR");
    } finally {
      if (!generation) release();
      this.pending -= 1;
    }
  }

  warmup(): Promise<void> {
    return this.engine.warmup?.() ?? Promise.resolve();
  }

  dispose(): Promise<void> {
    return this.engine.dispose?.() ?? Promise.resolve();
  }

  private async withTimeout<T>(generation: Promise<T>, controller: AbortController): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new LocalModelError("TIMEOUT"));
      }, this.options.timeoutMs);
    });
    try {
      return await Promise.race([generation, timeout]);
    } catch (error) {
      if (!(error instanceof LocalModelError) && controller.signal.aborted) throw new LocalModelError("TIMEOUT");
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
}
