import { spawn, type ChildProcessWithoutNullStreams, type SpawnOptionsWithoutStdio } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { SpeechAudio, SpeechRecognitionAdapter, SpeechRecognitionDiagnosticCode, SpeechRecognitionResult } from "../speech-recognition.js";

type WorkerMessage = Readonly<{ ok: true; transcript: string }> | Readonly<{ ok: false; diagnostic: Readonly<{ code: SpeechRecognitionDiagnosticCode; message: string }> }>;
type SpawnWorker = (command: string, args: readonly string[], options: SpawnOptionsWithoutStdio) => ChildProcessWithoutNullStreams;

export type VoskSpeechRecognitionConfig = Readonly<{
  pythonExecutable: string;
  modelPath: string;
  sampleRate: number;
  locale: string;
  workerPath?: string;
}>;

const workerPath = resolve(__dirname, "vosk-worker.py");
export const VOSK_MAX_STDERR_BYTES = 4 * 1024;
const failure = (code: SpeechRecognitionDiagnosticCode, message: string): SpeechRecognitionResult => ({ state: "ERROR", diagnostic: { code, message } });

export function appendBoundedVoskStderr(current: Buffer, chunk: Buffer): Buffer {
  if (chunk.length >= VOSK_MAX_STDERR_BYTES) return Buffer.from(chunk.subarray(chunk.length - VOSK_MAX_STDERR_BYTES));
  return Buffer.concat([current.subarray(Math.max(0, current.length - (VOSK_MAX_STDERR_BYTES - chunk.length))), chunk]);
}

function parseWorkerMessage(line: string): WorkerMessage | undefined {
  try {
    const value: unknown = JSON.parse(line);
    if (!value || typeof value !== "object") return undefined;
    if ("ok" in value && value.ok === true && "transcript" in value && typeof value.transcript === "string") return { ok: true, transcript: value.transcript };
    if ("ok" in value && value.ok === false && "diagnostic" in value && value.diagnostic && typeof value.diagnostic === "object") {
      const diagnostic = value.diagnostic as { code?: unknown; message?: unknown };
      if (typeof diagnostic.code === "string" && typeof diagnostic.message === "string" && ["MODEL_NOT_FOUND", "RUNTIME_NOT_AVAILABLE", "AUDIO_ERROR", "RECOGNITION_ERROR"].includes(diagnostic.code)) {
        return { ok: false, diagnostic: diagnostic as WorkerMessage & { diagnostic: { code: SpeechRecognitionDiagnosticCode; message: string } }["diagnostic"] };
      }
    }
  } catch {
    return undefined;
  }
  return undefined;
}

export class VoskSpeechRecognitionAdapter implements SpeechRecognitionAdapter {
  private activeProcess?: ChildProcessWithoutNullStreams;

  constructor(
    private readonly config: VoskSpeechRecognitionConfig,
    private readonly spawnWorker: SpawnWorker = spawn,
    private readonly modelExists: (path: string) => boolean = existsSync,
  ) {}

  async recognize(audio: SpeechAudio): Promise<SpeechRecognitionResult> {
    if (!this.config.modelPath.trim() || !this.modelExists(this.config.modelPath)) return failure("MODEL_NOT_FOUND", "El modelo local configurado no existe.");
    if (audio.encoding !== "PCM_S16LE" || audio.channels !== 1 || audio.sampleRate !== this.config.sampleRate) return failure("AUDIO_ERROR", "No se pudo procesar el audio.");

    const chunks: Uint8Array[] = [];
    let byteLength = 0;
    for await (const chunk of audio.chunks) {
      if (!(chunk instanceof Uint8Array)) return failure("AUDIO_ERROR", "No se pudo procesar el audio.");
      chunks.push(chunk);
      byteLength += chunk.byteLength;
    }
    if (!byteLength || byteLength % 2) return failure("AUDIO_ERROR", "No se pudo procesar el audio.");

    return new Promise((resolveResult) => {
      let process: ChildProcessWithoutNullStreams;
      try {
        process = this.spawnWorker(this.config.pythonExecutable, [this.config.workerPath ?? workerPath, "--model-path", this.config.modelPath, "--sample-rate", String(this.config.sampleRate)], { shell: false, stdio: "pipe" });
      } catch {
        resolveResult(failure("RUNTIME_NOT_AVAILABLE", "El runtime local de reconocimiento no está disponible."));
        return;
      }

      this.activeProcess = process;
      let stdout = "";
      let stderr: Buffer<ArrayBufferLike> = Buffer.alloc(0);
      let settled = false;
      const settle = (result: SpeechRecognitionResult) => {
        if (settled) return;
        settled = true;
        process.stdout.removeListener("data", onStdout);
        process.stderr.removeListener("data", onStderr);
        process.stdin.removeListener("error", onStdinError);
        process.removeListener("error", onError);
        process.removeListener("close", onClose);
        if (this.activeProcess === process) this.activeProcess = undefined;
        resolveResult(result);
      };
      const onStdout = (chunk: Buffer) => { stdout += chunk.toString("utf8"); };
      const onStderr = (chunk: Buffer) => { stderr = appendBoundedVoskStderr(stderr, chunk); };
      const onStdinError = () => settle(failure("RECOGNITION_ERROR", "No se pudo reconocer el audio."));
      const onError = () => settle(failure("RUNTIME_NOT_AVAILABLE", "El runtime local de reconocimiento no está disponible."));
      const onClose = (code: number | null) => {
        const line = stdout.trim();
        const message = parseWorkerMessage(line);
        if (!message) return settle(failure("RECOGNITION_ERROR", stderr.length ? "El worker local informó un error de reconocimiento." : "No se pudo reconocer el audio."));
        if (!message.ok) return settle(failure(message.diagnostic.code, message.diagnostic.message));
        if (code !== 0) return settle(failure("RECOGNITION_ERROR", stderr.length ? "El worker local informó un error de reconocimiento." : "No se pudo reconocer el audio."));
        settle({ state: "RESULT", transcript: message.transcript, locale: this.config.locale });
      };

      process.stdout.on("data", onStdout);
      process.stderr.on("data", onStderr);
      process.stdin.once("error", onStdinError);
      process.once("error", onError);
      process.once("close", onClose);
      for (const chunk of chunks) process.stdin.write(chunk);
      process.stdin.end();
    });
  }

  cancel() {
    const process = this.activeProcess;
    if (!process || process.exitCode !== null) return;
    process.stdin.end();
    process.kill();
  }
}
