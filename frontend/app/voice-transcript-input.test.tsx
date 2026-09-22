import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { VoiceTranscriptInput } from "./voice-transcript-input";

class MediaRecorderMock {
  static current: MediaRecorderMock | null = null;
  ondataavailable: ((event: BlobEvent) => void) | null = null;
  onstop: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn(() => this.onstop?.());
  constructor() { MediaRecorderMock.current = this; }
}

afterEach(() => { MediaRecorderMock.current = null; vi.unstubAllGlobals(); });

function microphone() {
  const listeners = new Set<() => void>();
  const track = { stop: vi.fn(), addEventListener: vi.fn((_: string, listener: () => void) => listeners.add(listener)), removeEventListener: vi.fn((_: string, listener: () => void) => listeners.delete(listener)), end: () => listeners.forEach((listener) => listener()) };
  return { stream: { getTracks: () => [track] }, track };
}

describe("VoiceTranscriptInput", () => {
  it("solicita el micrófono solo al iniciar y libera tracks al cancelar", async () => {
    const { stream, track } = microphone(); const getUserMedia = vi.fn().mockResolvedValue(stream);
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } }); vi.stubGlobal("MediaRecorder", MediaRecorderMock);
    const onTranscript = vi.fn(); render(<VoiceTranscriptInput onTranscript={onTranscript} />);
    expect(getUserMedia).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Iniciar voz" }));
    await screen.findByRole("button", { name: "Cancelar voz" });
    fireEvent.click(screen.getByRole("button", { name: "Cancelar voz" }));
    expect(track.stop).toHaveBeenCalled(); expect(track.removeEventListener).toHaveBeenCalled(); expect(onTranscript).not.toHaveBeenCalled(); expect(screen.getByText("Estado de voz: IDLE")).toBeInTheDocument();
  });

  it("mapea permiso denegado y conserva el transcript editable", async () => {
    const getUserMedia = vi.fn().mockRejectedValue(new DOMException("", "NotAllowedError"));
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } }); vi.stubGlobal("MediaRecorder", MediaRecorderMock);
    render(<VoiceTranscriptInput onTranscript={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Iniciar voz" }));
    await waitFor(() => expect(screen.getByText(/MICROPHONE_DENIED/)).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("Transcript de voz"), { target: { value: "texto manual" } });
    expect(screen.getByLabelText("Transcript de voz")).toHaveValue("texto manual");
  });

  it("reporta permiso revocado al finalizar el track y conserva el fallback", async () => {
    const { stream, track } = microphone(); vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(stream) } }); vi.stubGlobal("MediaRecorder", MediaRecorderMock);
    render(<VoiceTranscriptInput onTranscript={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Iniciar voz" }));
    await screen.findByRole("button", { name: "Cancelar voz" }); act(() => track.end());
    await waitFor(() => expect(screen.getByText(/MICROPHONE_DENIED/)).toBeInTheDocument());
    expect(screen.getByText("Estado de voz: ERROR")).toBeInTheDocument(); expect(track.stop).toHaveBeenCalled(); expect(screen.getByLabelText("Transcript de voz")).toBeInTheDocument();
  });

  it("muestra PROCESSING y un transcript editable sin ejecutarlo", async () => {
    const { stream } = microphone(); let resolveResponse!: (value: Response) => void; const response = new Promise<Response>((resolve) => { resolveResponse = resolve; }); const onTranscript = vi.fn();
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(stream) } }); vi.stubGlobal("MediaRecorder", MediaRecorderMock); vi.stubGlobal("Blob", class { async arrayBuffer() { return new ArrayBuffer(0); } }); vi.stubGlobal("AudioContext", class { async decodeAudioData() { return { getChannelData: () => new Float32Array([0]) }; } async close() {} }); vi.stubGlobal("fetch", vi.fn(() => response));
    render(<VoiceTranscriptInput onTranscript={onTranscript} />);
    fireEvent.click(screen.getByRole("button", { name: "Iniciar voz" })); await screen.findByRole("button", { name: "Detener voz" }); fireEvent.click(screen.getByRole("button", { name: "Detener voz" }));
    await screen.findByText("Estado de voz: PROCESSING");
    resolveResponse({ json: async () => ({ state: "RESULT", transcript: "crear clase paciente" }) } as Response);
    await screen.findByText("Estado de voz: RESULT");
    const transcript = screen.getByLabelText("Transcript de voz"); expect(transcript).toHaveValue("crear clase paciente"); expect(onTranscript).toHaveBeenCalledWith("crear clase paciente");
    fireEvent.change(transcript, { target: { value: "crear clase cliente" } }); expect(transcript).toHaveValue("crear clase cliente"); expect(onTranscript).toHaveBeenLastCalledWith("crear clase cliente");
  });
});
