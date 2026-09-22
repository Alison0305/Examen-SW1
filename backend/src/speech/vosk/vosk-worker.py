import argparse
import json
import os
import sys


def emit(payload):
    print(json.dumps(payload), flush=True)


def failure(code, message):
    emit({"ok": False, "diagnostic": {"code": code, "message": message}})
    return 1


def parse_args():
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument("--model-path", required=True)
    parser.add_argument("--sample-rate", type=int, required=True)
    return parser.parse_args()


def main():
    args = parse_args()
    if not os.path.isdir(args.model_path):
        return failure("MODEL_NOT_FOUND", "El modelo local configurado no existe.")
    if args.sample_rate <= 0:
        return failure("AUDIO_ERROR", "La frecuencia de muestreo no es válida.")

    try:
        from vosk import KaldiRecognizer, Model, SetLogLevel
    except ImportError:
        return failure("RUNTIME_NOT_AVAILABLE", "El runtime local de reconocimiento no está disponible.")

    audio = sys.stdin.buffer.read()
    if not audio or len(audio) % 2:
        return failure("AUDIO_ERROR", "No se pudo procesar el audio.")

    try:
        SetLogLevel(-1)
        model = Model(args.model_path)
        recognizer = KaldiRecognizer(model, args.sample_rate)
        for offset in range(0, len(audio), 4000):
            recognizer.AcceptWaveform(audio[offset : offset + 4000])
        result = json.loads(recognizer.FinalResult())
        transcript = result.get("text")
        if not isinstance(transcript, str):
            return failure("RECOGNITION_ERROR", "No se pudo reconocer el audio.")
        emit({"ok": True, "transcript": transcript})
        return 0
    except Exception:
        return failure("RECOGNITION_ERROR", "No se pudo reconocer el audio.")


if __name__ == "__main__":
    sys.exit(main())
