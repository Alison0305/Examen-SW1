import argparse
import ctypes
import importlib.metadata
import json
import math
import os
import platform
import string
import subprocess
import sys
import time
import unicodedata
import wave
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
DEFAULT_CORPUS = BACKEND_DIR / "src" / "speech" / "vosk" / "fixtures" / "corpus.json"
DEFAULT_MODEL = BACKEND_DIR / "models" / "vosk-model-small-es-0.42"


def normalize(text):
    normalized = unicodedata.normalize("NFKC", text).casefold()
    return " ".join("".join(char for char in token if not unicodedata.category(char).startswith("P")) for token in normalized.split() if token.strip(string.punctuation))


def word_errors(reference, hypothesis):
    reference_words, hypothesis_words = reference.split(), hypothesis.split()
    table = [[(index, 0, index, 0) for index in range(len(hypothesis_words) + 1)]]
    for row in range(1, len(reference_words) + 1):
        table.append([(row, 0, 0, row)])
        for column in range(1, len(hypothesis_words) + 1):
            if reference_words[row - 1] == hypothesis_words[column - 1]:
                table[row].append(table[row - 1][column - 1])
                continue
            substitution = table[row - 1][column - 1]
            insertion = table[row][column - 1]
            deletion = table[row - 1][column]
            choices = [(substitution[0] + 1, substitution[1] + 1, substitution[2], substitution[3]), (insertion[0] + 1, insertion[1], insertion[2] + 1, insertion[3]), (deletion[0] + 1, deletion[1], deletion[2], deletion[3] + 1)]
            table[row].append(min(choices, key=lambda value: value[0]))
    _, substitutions, insertions, deletions = table[-1][-1]
    return {"substitutions": substitutions, "insertions": insertions, "deletions": deletions, "distance": substitutions + insertions + deletions}


def percentile(values, fraction):
    ordered = sorted(values)
    return ordered[max(0, math.ceil(len(ordered) * fraction) - 1)]


def working_set_bytes():
    if os.name != "nt":
        return None
    class Counters(ctypes.Structure):
        _fields_ = [("cb", ctypes.c_ulong), ("page_fault_count", ctypes.c_ulong), ("peak_working_set_size", ctypes.c_size_t), ("working_set_size", ctypes.c_size_t), ("quota_peak_paged_pool_usage", ctypes.c_size_t), ("quota_paged_pool_usage", ctypes.c_size_t), ("quota_peak_non_paged_pool_usage", ctypes.c_size_t), ("quota_non_paged_pool_usage", ctypes.c_size_t), ("pagefile_usage", ctypes.c_size_t), ("peak_pagefile_usage", ctypes.c_size_t), ("private_usage", ctypes.c_size_t)]
    counters = Counters()
    counters.cb = ctypes.sizeof(counters)
    get_process_memory_info = ctypes.windll.psapi.GetProcessMemoryInfo
    get_process_memory_info.argtypes = [ctypes.c_void_p, ctypes.POINTER(Counters), ctypes.c_ulong]
    get_process_memory_info.restype = ctypes.c_int
    if not get_process_memory_info(ctypes.windll.kernel32.GetCurrentProcess(), ctypes.byref(counters), counters.cb):
        return None
    return counters.working_set_size


def read_audio(path):
    with wave.open(str(path), "rb") as audio:
        if (audio.getnchannels(), audio.getsampwidth(), audio.getframerate(), audio.getcomptype()) != (1, 2, 16000, "NONE"):
            raise ValueError(f"Formato invalido: {path.name}")
        return audio.readframes(audio.getnframes()), audio.getnframes() / audio.getframerate()


def recognize(model, vosk, pcm):
    recognizer = vosk.KaldiRecognizer(model, 16000)
    for offset in range(0, len(pcm), 4000):
        recognizer.AcceptWaveform(pcm[offset:offset + 4000])
    return json.loads(recognizer.FinalResult()).get("text", "")


def run(corpus_path, model_path, iterations):
    try:
        import vosk
    except ImportError:
        return {"status": "blocked", "reason": "Vosk no esta disponible.", "metrics": "N/A"}
    if not model_path.is_dir():
        return {"status": "blocked", "reason": "El modelo local no existe.", "metrics": "N/A"}
    corpus = json.loads(corpus_path.read_text(encoding="utf-8"))
    samples = corpus["samples"]
    baseline_memory = working_set_bytes()
    vosk.SetLogLevel(-1)
    load_started = time.perf_counter()
    model = vosk.Model(str(model_path))
    load_ms = (time.perf_counter() - load_started) * 1000
    loaded_memory = working_set_bytes()
    results, all_latencies, totals = [], [], {"substitutions": 0, "insertions": 0, "deletions": 0, "referenceWords": 0, "exactMatches": 0}
    for sample in samples:
        pcm, duration = read_audio(corpus_path.parent / sample["audio"])
        raw, latencies = "", []
        for iteration in range(iterations):
            started = time.perf_counter()
            transcript = recognize(model, vosk, pcm)
            latencies.append((time.perf_counter() - started) * 1000)
            if iteration == 0:
                raw = transcript
        golden = normalize(sample["goldenTranscript"])
        hypothesis = normalize(raw)
        errors = word_errors(golden, hypothesis)
        exact = golden == hypothesis
        totals["exactMatches"] += exact
        totals["referenceWords"] += len(golden.split())
        for key in ("substitutions", "insertions", "deletions"):
            totals[key] += errors[key]
        all_latencies.extend(latencies)
        results.append({"id": sample["id"], "conditions": sample["conditions"], "audioDurationMs": round(duration * 1000, 3), "goldenTranscript": sample["goldenTranscript"], "rawTranscript": raw, "normalizedGolden": golden, "normalizedTranscript": hypothesis, "exactMatch": exact, "wordErrors": errors, "wer": errors["distance"] / len(golden.split()), "recognitionLatencyMs": {"iterations": [round(value, 3) for value in latencies], "p50": round(percentile(latencies, 0.5), 3), "p95": round(percentile(latencies, 0.95), 3)}})
    total_errors = totals["substitutions"] + totals["insertions"] + totals["deletions"]
    return {"status": "completed", "corpusVersion": corpus["version"], "normalization": "NFKC, lowercase, trim, espacios consecutivos y puntuacion Unicode superficial.", "iterations": iterations, "warmup": "No se oculta cold start: modelLoadMs se mide por separado; cada iteracion mide reconocimiento con modelo ya cargado.", "environment": {"os": platform.system(), "architecture": platform.machine(), "python": platform.python_version(), "vosk": importlib.metadata.version("vosk"), "node": subprocess.check_output(["node", "--version"], text=True).strip(), "sampleRate": 16000, "model": model_path.name}, "modelLoadMs": round(load_ms, 3), "ram": {"baselineBytes": baseline_memory, "afterModelLoadBytes": loaded_memory, "deltaBytes": None if baseline_memory is None or loaded_memory is None else loaded_memory - baseline_memory}, "samples": results, "aggregate": {"exactMatches": totals["exactMatches"], "exactMatchRate": totals["exactMatches"] / len(samples), "wer": total_errors / totals["referenceWords"], "wordErrors": {key: totals[key] for key in ("substitutions", "insertions", "deletions")}, "recognitionLatencyMs": {"observations": len(all_latencies), "p50": round(percentile(all_latencies, 0.5), 3), "p95": round(percentile(all_latencies, 0.95), 3)}}, "failures": []}


def main():
    parser = argparse.ArgumentParser(description="Ejecuta benchmark STT local sobre corpus v1.")
    parser.add_argument("--corpus", type=Path, default=DEFAULT_CORPUS)
    parser.add_argument("--model-path", type=Path, default=DEFAULT_MODEL)
    parser.add_argument("--iterations", type=int, default=3)
    args = parser.parse_args()
    if args.iterations < 1:
        parser.error("--iterations debe ser mayor que cero")
    print(json.dumps(run(args.corpus, args.model_path, args.iterations), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
