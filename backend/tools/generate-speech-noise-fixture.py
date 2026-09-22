import argparse
import math
import random
import struct
import wave
from pathlib import Path

SNR_DB = 15.0
SEED = 42
BACKEND_DIR = Path(__file__).resolve().parents[1]
DEFAULT_INPUT = BACKEND_DIR / "src" / "speech" / "vosk" / "fixtures" / "crear-clase-paciente.wav"
DEFAULT_OUTPUT = BACKEND_DIR / "src" / "speech" / "vosk" / "fixtures" / "crear-clase-paciente-ruido-15db.wav"


def read_pcm(path: Path):
    with wave.open(str(path), "rb") as source:
        if source.getcomptype() != "NONE" or source.getsampwidth() != 2 or source.getnchannels() != 1:
            raise ValueError("El fixture debe ser WAV PCM signed 16-bit mono.")
        return source.getparams(), list(struct.unpack(f"<{source.getnframes()}h", source.readframes(source.getnframes())))


def rms(samples):
    return math.sqrt(sum(sample * sample for sample in samples) / len(samples))


def add_white_noise(samples, snr_db=SNR_DB, seed=SEED):
    signal_rms = rms(samples)
    generator = random.Random(seed)
    unit_noise = [generator.gauss(0.0, 1.0) for _ in samples]
    scale = (signal_rms / (10 ** (snr_db / 20))) / rms(unit_noise)
    return [max(-32768, min(32767, round(sample + noise * scale))) for sample, noise in zip(samples, unit_noise)]


def generate(input_path: Path, output_path: Path, snr_db=SNR_DB, seed=SEED):
    params, samples = read_pcm(input_path)
    noisy = add_white_noise(samples, snr_db, seed)
    with wave.open(str(output_path), "wb") as target:
        target.setparams(params)
        target.writeframes(struct.pack(f"<{len(noisy)}h", *noisy))


def main():
    parser = argparse.ArgumentParser(description="Genera un fixture WAV con ruido blanco determinista.")
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--snr-db", type=float, default=SNR_DB)
    parser.add_argument("--seed", type=int, default=SEED)
    args = parser.parse_args()
    generate(args.input, args.output, args.snr_db, args.seed)


if __name__ == "__main__":
    main()
