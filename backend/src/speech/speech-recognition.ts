import { existsSync } from "node:fs";

export const SPEECH_RECOGNITION_STATES = ["IDLE", "LISTENING", "PROCESSING", "RESULT", "ERROR"] as const;
export const SPEECH_RECOGNITION_DIAGNOSTICS = ["MICROPHONE_DENIED", "MODEL_NOT_CONFIGURED", "MODEL_NOT_FOUND", "RUNTIME_NOT_AVAILABLE", "AUDIO_ERROR", "RECOGNITION_ERROR"] as const;

export type SpeechRecognitionState = (typeof SPEECH_RECOGNITION_STATES)[number];
export type SpeechRecognitionDiagnosticCode = (typeof SPEECH_RECOGNITION_DIAGNOSTICS)[number];
export type SpeechRecognitionDiagnostic = Readonly<{ code: SpeechRecognitionDiagnosticCode; message: string }>;
export type SpeechAudio = Readonly<{ encoding: "PCM_S16LE"; channels: 1; sampleRate: number; chunks: AsyncIterable<Uint8Array> }>;
export type SpeechRecognitionSuccess = Readonly<{ state: "RESULT"; transcript: string; locale: string }>;
export type SpeechRecognitionFailure = Readonly<{ state: "ERROR"; diagnostic: SpeechRecognitionDiagnostic }>;
export type SpeechRecognitionResult = SpeechRecognitionSuccess | SpeechRecognitionFailure;

export interface SpeechRecognitionAdapter {
  recognize(audio: SpeechAudio): Promise<SpeechRecognitionResult>;
}

export type LocalSpeechRecognitionConfig = Readonly<{
  runtime: "vosk";
  modelPath?: string;
  locale: "es";
  audio: Readonly<{ encoding: "PCM_S16LE"; channels: 1; sampleRate: 16000 }>;
}>;

export const LOCAL_SPEECH_RECOGNITION_CONFIG: Omit<LocalSpeechRecognitionConfig, "modelPath"> = {
  runtime: "vosk",
  locale: "es",
  audio: { encoding: "PCM_S16LE", channels: 1, sampleRate: 16000 },
};

export type SpeechRecognitionInspection = Readonly<{
  state: "IDLE" | "ERROR";
  diagnostic?: SpeechRecognitionDiagnostic;
}>;

const diagnostic = (code: SpeechRecognitionDiagnosticCode, message: string): SpeechRecognitionDiagnostic => ({ code, message });

export function inspectLocalSpeechRecognition(
  config: LocalSpeechRecognitionConfig,
  modelExists: (path: string) => boolean = existsSync,
  runtimeAvailable: () => boolean = () => false,
): SpeechRecognitionInspection {
  if (!config.modelPath?.trim()) return { state: "ERROR", diagnostic: diagnostic("MODEL_NOT_CONFIGURED", "No se configuró un modelo local de reconocimiento.") };
  if (!modelExists(config.modelPath)) return { state: "ERROR", diagnostic: diagnostic("MODEL_NOT_FOUND", "El modelo local configurado no existe.") };
  if (!runtimeAvailable()) return { state: "ERROR", diagnostic: diagnostic("RUNTIME_NOT_AVAILABLE", "El runtime local de reconocimiento no está disponible.") };
  return { state: "IDLE" };
}

export function speechRecognitionFailure(code: Exclude<SpeechRecognitionDiagnosticCode, "MODEL_NOT_CONFIGURED" | "MODEL_NOT_FOUND" | "RUNTIME_NOT_AVAILABLE">): SpeechRecognitionFailure {
  const messages: Record<typeof code, string> = {
    MICROPHONE_DENIED: "No se concedió acceso al micrófono.",
    AUDIO_ERROR: "No se pudo procesar el audio.",
    RECOGNITION_ERROR: "No se pudo reconocer el audio.",
  };
  return { state: "ERROR", diagnostic: diagnostic(code, messages[code]) };
}
