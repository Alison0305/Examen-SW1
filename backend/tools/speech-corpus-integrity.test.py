import json
import math
import struct
import unittest
import wave
from pathlib import Path

FIXTURES = Path(__file__).resolve().parents[1] / "src" / "speech" / "vosk" / "fixtures"


class SpeechCorpusIntegrityTests(unittest.TestCase):
    def test_manifest_references_five_valid_non_silent_pcm_fixtures(self):
        corpus = json.loads((FIXTURES / "corpus.json").read_text(encoding="utf-8"))
        self.assertEqual(corpus["version"], 1)
        self.assertEqual(corpus["audioFormat"], {"sampleRate": 16000, "channels": 1, "bitDepth": 16, "encoding": "PCM_S16LE"})
        samples = corpus["samples"]
        self.assertEqual(len(samples), 5)
        self.assertEqual(len({sample["id"] for sample in samples}), 5)
        self.assertEqual(len({sample["audio"] for sample in samples}), 5)
        self.assertEqual({sample["goldenTranscript"] for sample in samples}, {"crear clase paciente"})
        expected_conditions = {"baseline", "noise", "slow", "fast", "clear-articulation"}
        actual_conditions = set()
        for sample in samples:
            conditions = sample["conditions"]
            if conditions.get("baseline"):
                actual_conditions.add("baseline")
            if "noise" in conditions:
                actual_conditions.add("noise")
            if "speed" in conditions:
                actual_conditions.add(conditions["speed"])
            if "pronunciation" in conditions:
                actual_conditions.add(conditions["pronunciation"])
            with wave.open(str(FIXTURES / sample["audio"]), "rb") as audio:
                self.assertEqual((audio.getnchannels(), audio.getsampwidth(), audio.getframerate(), audio.getcomptype()), (1, 2, 16000, "NONE"))
                frames = audio.getnframes()
                self.assertGreater(frames, 0)
                values = struct.unpack(f"<{frames}h", audio.readframes(frames))
                self.assertGreater(math.sqrt(sum(value * value for value in values) / frames), 0)
        self.assertEqual(actual_conditions, expected_conditions)
        noise = next(sample["conditions"]["noise"] for sample in samples if "noise" in sample["conditions"])
        self.assertEqual(noise, {"type": "white", "snrDb": 15, "seed": 42})


if __name__ == "__main__":
    unittest.main()
