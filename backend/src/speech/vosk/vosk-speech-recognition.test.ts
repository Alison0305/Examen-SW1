import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { appendBoundedVoskStderr, VOSK_MAX_STDERR_BYTES, VoskSpeechRecognitionAdapter } from "./vosk-speech-recognition.js";

function audio(bytes: number[]) {
  return { encoding: "PCM_S16LE" as const, channels: 1 as const, sampleRate: 16000, chunks: (async function* () { yield new Uint8Array(bytes); })() };
}

function worker() {
  const stdout = new PassThrough();
  const stdin = new PassThrough();
  const stderr = new PassThrough();
  const process = Object.assign(new EventEmitter(), { stdin, stdout, stderr, exitCode: null as number | null, kill: vi.fn() }) as unknown as ChildProcessWithoutNullStreams;
  return { process, stdin, stdout, stderr };
}

async function waitForSpawn(spawnWorker: ReturnType<typeof vi.fn>) {
  for (let attempt = 0; attempt < 10 && !spawnWorker.mock.calls.length; attempt += 1) await new Promise<void>((resolve) => setImmediate(resolve));
  expect(spawnWorker).toHaveBeenCalledOnce();
}

describe("VoskSpeechRecognitionAdapter", () => {
  const config = { pythonExecutable: "python-worker", workerPath: "fixed-worker.py", modelPath: "models/es", sampleRate: 16000, locale: "es" };

  it("reporta modelo inexistente y audio inválido antes de iniciar el worker", async () => {
    const spawnWorker = vi.fn();
    const missingModel = new VoskSpeechRecognitionAdapter(config, spawnWorker, () => false);
    await expect(missingModel.recognize(audio([0, 0]))).resolves.toMatchObject({ diagnostic: { code: "MODEL_NOT_FOUND" } });
    const adapter = new VoskSpeechRecognitionAdapter(config, spawnWorker, () => true);
    await expect(adapter.recognize(audio([]))).resolves.toMatchObject({ diagnostic: { code: "AUDIO_ERROR" } });
    expect(spawnWorker).not.toHaveBeenCalled();
  });

  it("usa spawn seguro, transmite PCM crudo y proyecta el transcript estructurado", async () => {
    const { process, stdin, stdout } = worker();
    const spawnWorker = vi.fn(() => process);
    const adapter = new VoskSpeechRecognitionAdapter(config, spawnWorker, () => true);
    const received: Buffer[] = [];
    stdin.on("data", (chunk: Buffer) => received.push(chunk));
    const recognition = adapter.recognize(audio([0, 0, 1, 0]));
    await waitForSpawn(spawnWorker);
    expect(Buffer.concat(received)).toEqual(Buffer.from([0, 0, 1, 0]));
    stdout.write('{"ok":true,"transcript":"crear clase Paciente"}\n');
    process.emit("close", 0);
    await expect(recognition).resolves.toEqual({ state: "RESULT", transcript: "crear clase Paciente", locale: "es" });
    expect(spawnWorker).toHaveBeenCalledWith("python-worker", ["fixed-worker.py", "--model-path", "models/es", "--sample-rate", "16000"], { shell: false, stdio: "pipe" });
  });

  it("consume stderr acotado sin convertirlo en transcript y limpia su listener", async () => {
    const { process, stderr } = worker();
    const spawnWorker = vi.fn(() => process);
    const adapter = new VoskSpeechRecognitionAdapter(config, spawnWorker, () => true);
    const recognition = adapter.recognize(audio([0, 0]));
    await waitForSpawn(spawnWorker);
    expect(stderr.listenerCount("data")).toBe(1);
    stderr.write(Buffer.alloc(VOSK_MAX_STDERR_BYTES * 2, "x"));
    process.emit("close", 1);
    await expect(recognition).resolves.toEqual({ state: "ERROR", diagnostic: { code: "RECOGNITION_ERROR", message: "El worker local informó un error de reconocimiento." } });
    expect(stderr.listenerCount("data")).toBe(0);
  });

  it("trunca stderr al límite configurado", () => {
    const stderr = appendBoundedVoskStderr(Buffer.from("inicio"), Buffer.alloc(VOSK_MAX_STDERR_BYTES * 2, "x"));
    expect(stderr).toHaveLength(VOSK_MAX_STDERR_BYTES);
    expect(stderr.toString("utf8")).toBe("x".repeat(VOSK_MAX_STDERR_BYTES));
  });

  it("mapea diagnóstico, JSON inválido y cierre inesperado sin ejecutar comandos", async () => {
    for (const output of ['{"ok":false,"diagnostic":{"code":"AUDIO_ERROR","message":"audio"}}', "not-json", '{"ok":true,"transcript":"texto"}']) {
      const { process, stdout } = worker();
      const spawnWorker = vi.fn(() => process);
      const adapter = new VoskSpeechRecognitionAdapter(config, spawnWorker, () => true);
      const recognition = adapter.recognize(audio([0, 0]));
      await waitForSpawn(spawnWorker);
      stdout.write(output);
      process.emit("close", output.includes("transcript") ? 1 : 0);
      await expect(recognition).resolves.toMatchObject({ state: "ERROR", diagnostic: { code: output.includes("AUDIO_ERROR") ? "AUDIO_ERROR" : "RECOGNITION_ERROR" } });
    }
  });

  it("mapea un error de spawn y cancela el proceso activo", async () => {
    const { process } = worker();
    const spawnWorker = vi.fn(() => process);
    const adapter = new VoskSpeechRecognitionAdapter(config, spawnWorker, () => true);
    const recognition = adapter.recognize(audio([0, 0]));
    await waitForSpawn(spawnWorker);
    adapter.cancel();
    expect(process.kill).toHaveBeenCalledOnce();
    process.emit("error", new Error("missing python"));
    await expect(recognition).resolves.toMatchObject({ diagnostic: { code: "RUNTIME_NOT_AVAILABLE" } });
    expect(process.listenerCount("close")).toBe(0);
    expect(process.stderr.listenerCount("data")).toBe(0);
  });
});
