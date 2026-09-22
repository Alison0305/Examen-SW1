"use client";

import { Alert, Button, Stack, TextField, Typography } from "@mui/material";
import { useEffect, useRef, useState } from "react";

type SpeechResult = { state: "RESULT"; transcript: string } | { state: "ERROR"; diagnostic: { code: string; message: string } };
type VoiceState = "IDLE" | "LISTENING" | "PROCESSING" | "RESULT" | "ERROR";

function toBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function blobToPcm(blob: Blob): Promise<string> {
  const context = new AudioContext({ sampleRate: 16000 });
  try {
    const audio = await context.decodeAudioData(await blob.arrayBuffer());
    const samples = audio.getChannelData(0);
    const pcm = new Int16Array(samples.length);
    for (let index = 0; index < samples.length; index += 1) pcm[index] = Math.max(-1, Math.min(1, samples[index])) * 0x7fff;
    return toBase64(new Uint8Array(pcm.buffer));
  } finally {
    await context.close();
  }
}

export function VoiceTranscriptInput({ onTranscript, disabled = false }: Readonly<{ onTranscript: (transcript: string) => void; disabled?: boolean }>) {
  const [state, setState] = useState<VoiceState>("IDLE");
  const [diagnostic, setDiagnostic] = useState<string | null>(null);
  const [transcript, setTranscript] = useState("");
  const stream = useRef<MediaStream | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<BlobPart[]>([]);
  const cancelled = useRef(false);
  function stopTracks() { stream.current?.getTracks().forEach((track) => { track.removeEventListener("ended", onTrackEnded); track.stop(); }); stream.current = null; recorder.current = null; }
  function onTrackEnded() { if (!stream.current) return; cancelled.current = true; recorder.current?.stop(); stopTracks(); setDiagnostic("MICROPHONE_DENIED: Se perdió acceso al micrófono."); setState("ERROR"); }
  const cancel = () => { cancelled.current = true; recorder.current?.stop(); stopTracks(); chunks.current = []; setState("IDLE"); setDiagnostic(null); };

  useEffect(() => () => stopTracks(), []);

  async function recognize() {
    if (cancelled.current) return;
    setState("PROCESSING");
    try {
      const pcm = await blobToPcm(new Blob(chunks.current));
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001"}/speech/recognize`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pcm }) });
      const result = await response.json() as SpeechResult;
      if (cancelled.current) return;
      if (result.state !== "RESULT") throw new Error(result.diagnostic.message);
      setTranscript(result.transcript);
      onTranscript(result.transcript);
      setState("RESULT");
    } catch (error) {
      if (!cancelled.current) { setDiagnostic(error instanceof Error ? error.message : "No se pudo procesar el audio."); setState("ERROR"); }
    } finally { stopTracks(); }
  }

  async function start() {
    setDiagnostic(null); cancelled.current = false;
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.current.getTracks().forEach((track) => track.addEventListener("ended", onTrackEnded, { once: true }));
      const next = new MediaRecorder(stream.current);
      chunks.current = [];
      next.ondataavailable = (event) => { if (event.data.size) chunks.current.push(event.data); };
      next.onstop = () => { void recognize(); };
      recorder.current = next; next.start(); setState("LISTENING");
    } catch (error) {
      stopTracks();
      setDiagnostic(error instanceof DOMException && error.name === "NotAllowedError" ? "MICROPHONE_DENIED: No se concedió acceso al micrófono." : "AUDIO_ERROR: No se pudo iniciar la captura.");
      setState("ERROR");
    }
  }

  return <Stack spacing={1} aria-label="Captura de voz"><Typography variant="body2">Estado de voz: {state}</Typography>{diagnostic && <Alert severity="error">{diagnostic}</Alert>}{state === "LISTENING" ? <Stack direction="row" spacing={1}><Button onClick={() => recorder.current?.stop()}>Detener voz</Button><Button onClick={cancel}>Cancelar voz</Button></Stack> : <Button variant="outlined" onClick={() => void start()} disabled={disabled || state === "PROCESSING"}>Iniciar voz</Button>}<TextField label="Transcript de voz" value={transcript} onChange={(event) => { setTranscript(event.target.value); onTranscript(event.target.value); }} size="small" /></Stack>;
}
