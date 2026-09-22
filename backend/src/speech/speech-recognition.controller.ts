import { Body, Controller, Post } from "@nestjs/common";
import { VoskSpeechRecognitionAdapter } from "./vosk/vosk-speech-recognition";
import type { SpeechRecognitionAdapter, SpeechRecognitionResult } from "./speech-recognition";

function configuredAdapter(): SpeechRecognitionAdapter | undefined {
  const pythonExecutable = process.env.SPEECH_PYTHON_EXECUTABLE;
  const modelPath = process.env.SPEECH_MODEL_PATH;
  if (!pythonExecutable || !modelPath) return undefined;
  return new VoskSpeechRecognitionAdapter({ pythonExecutable, modelPath, sampleRate: 16000, locale: "es" });
}

async function* pcmChunk(pcm: Buffer) { yield pcm; }

@Controller("speech")
export class SpeechRecognitionController {
  private readonly adapter: SpeechRecognitionAdapter | undefined = configuredAdapter();

  @Post("recognize")
  async recognize(@Body() body: unknown): Promise<SpeechRecognitionResult> {
    if (!this.adapter) return { state: "ERROR", diagnostic: { code: "MODEL_NOT_CONFIGURED", message: "No se configuró un modelo local de reconocimiento." } };
    if (!body || typeof body !== "object" || !("pcm" in body) || typeof body.pcm !== "string") return { state: "ERROR", diagnostic: { code: "AUDIO_ERROR", message: "No se pudo procesar el audio." } };
    const pcm = Buffer.from(body.pcm, "base64");
    if (!pcm.length || pcm.length % 2) return { state: "ERROR", diagnostic: { code: "AUDIO_ERROR", message: "No se pudo procesar el audio." } };
    return this.adapter.recognize({ encoding: "PCM_S16LE", channels: 1, sampleRate: 16000, chunks: pcmChunk(pcm) });
  }
}
