import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { VoskSpeechRecognitionAdapter } from "./vosk-speech-recognition.js";

const modelPath = process.env.VOSK_INTEGRATION_MODEL_PATH;
const pythonExecutable = process.env.VOSK_INTEGRATION_PYTHON_EXECUTABLE;
const describeVoskIntegration = modelPath && pythonExecutable ? describe : describe.skip;
const fixturePath = resolve(process.cwd(), "src", "speech", "vosk", "fixtures", "crear-clase-paciente.wav");
const workerPath = resolve(process.cwd(), "src", "speech", "vosk", "vosk-worker.py");

async function fixtureAudio() {
  const wav = await readFile(fixturePath);
  expect(wav.subarray(0, 4).toString("ascii")).toBe("RIFF");
  expect(wav.subarray(8, 12).toString("ascii")).toBe("WAVE");
  expect(wav.readUInt16LE(20)).toBe(1);
  expect(wav.readUInt16LE(22)).toBe(1);
  expect(wav.readUInt32LE(24)).toBe(16000);
  expect(wav.readUInt16LE(34)).toBe(16);
  return { encoding: "PCM_S16LE" as const, channels: 1 as const, sampleRate: 16000, chunks: (async function* () { yield wav.subarray(44); })() };
}

describeVoskIntegration("Vosk real local", () => {
  it("reconoce el fixture español mediante el adapter", async () => {
    const adapter = new VoskSpeechRecognitionAdapter({ pythonExecutable: pythonExecutable!, modelPath: modelPath!, sampleRate: 16000, locale: "es", workerPath });
    await expect(adapter.recognize(await fixtureAudio())).resolves.toEqual({ state: "RESULT", transcript: "crear clase paciente", locale: "es" });
  });

  it("cancela el worker local antes de producir un transcript", async () => {
    const adapter = new VoskSpeechRecognitionAdapter({ pythonExecutable: pythonExecutable!, modelPath: modelPath!, sampleRate: 16000, locale: "es", workerPath });
    const recognition = adapter.recognize(await fixtureAudio());
    await new Promise<void>((resolve) => setTimeout(resolve, 100));
    adapter.cancel();
    await expect(recognition).resolves.toMatchObject({ state: "ERROR", diagnostic: { code: "RECOGNITION_ERROR" } });
  });

  it("reporta rutas de modelo y runtime incorrectas", async () => {
    const missingModel = new VoskSpeechRecognitionAdapter({ pythonExecutable: pythonExecutable!, modelPath: "missing-model", sampleRate: 16000, locale: "es", workerPath });
    await expect(missingModel.recognize(await fixtureAudio())).resolves.toMatchObject({ diagnostic: { code: "MODEL_NOT_FOUND" } });
    const missingRuntime = new VoskSpeechRecognitionAdapter({ pythonExecutable: "missing-python", modelPath: modelPath!, sampleRate: 16000, locale: "es", workerPath });
    await expect(missingRuntime.recognize(await fixtureAudio())).resolves.toMatchObject({ diagnostic: { code: "RUNTIME_NOT_AVAILABLE" } });
  });
});
