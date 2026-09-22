import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { LOCAL_SPEECH_RECOGNITION_CONFIG, inspectLocalSpeechRecognition, speechRecognitionFailure, type SpeechRecognitionAdapter, type SpeechRecognitionResult } from "./speech-recognition.js";

describe("speech recognition contract", () => {
  it("representa la configuración local PCM española", () => {
    expect(LOCAL_SPEECH_RECOGNITION_CONFIG).toEqual({ runtime: "vosk", locale: "es", audio: { encoding: "PCM_S16LE", channels: 1, sampleRate: 16000 } });
  });

  it("reporta modelo no configurado, inexistente y runtime ausente", () => {
    expect(inspectLocalSpeechRecognition(LOCAL_SPEECH_RECOGNITION_CONFIG)).toMatchObject({ state: "ERROR", diagnostic: { code: "MODEL_NOT_CONFIGURED" } });
    expect(inspectLocalSpeechRecognition({ ...LOCAL_SPEECH_RECOGNITION_CONFIG, modelPath: "models/es" }, () => false)).toMatchObject({ state: "ERROR", diagnostic: { code: "MODEL_NOT_FOUND" } });
    expect(inspectLocalSpeechRecognition({ ...LOCAL_SPEECH_RECOGNITION_CONFIG, modelPath: "models/es" }, () => true, () => false)).toMatchObject({ state: "ERROR", diagnostic: { code: "RUNTIME_NOT_AVAILABLE" } });
  });

  it("representa errores de permiso, audio y reconocimiento", () => {
    for (const code of ["MICROPHONE_DENIED", "AUDIO_ERROR", "RECOGNITION_ERROR"] as const) expect(speechRecognitionFailure(code)).toMatchObject({ state: "ERROR", diagnostic: { code } });
  });

  it("limita el resultado exitoso al transcript y su locale", () => {
    const result: SpeechRecognitionResult = { state: "RESULT", transcript: "crear clase Pedido", locale: "es" };
    expect(result).toEqual({ state: "RESULT", transcript: "crear clase Pedido", locale: "es" });
    expect(Object.keys(result)).toEqual(["state", "transcript", "locale"]);
  });

  it("mantiene el adapter fuera de comandos y transporte", async () => {
    const adapter: SpeechRecognitionAdapter = { recognize: async () => ({ state: "RESULT", transcript: "texto", locale: "es" }) };
    await expect(adapter.recognize({ encoding: "PCM_S16LE", channels: 1, sampleRate: 16000, chunks: (async function* () { yield new Uint8Array(); })() })).resolves.toMatchObject({ transcript: "texto" });
    const source = await readFile(resolve(process.cwd(), "src", "speech", "speech-recognition.ts"), "utf8");
    expect(source).not.toMatch(/AssistantCommand|UmlCommand|\bfetch\b|\baxios\b|https?:\/\/|download/i);
  });
});
