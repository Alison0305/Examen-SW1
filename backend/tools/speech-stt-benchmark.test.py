import importlib.util
import unittest
from pathlib import Path

SCRIPT = Path(__file__).with_name("speech-stt-benchmark.py")
SPEC = importlib.util.spec_from_file_location("speech_stt_benchmark", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)


class SpeechSttBenchmarkTests(unittest.TestCase):
    def test_normalization_drops_only_surface_punctuation(self):
        self.assertEqual(MODULE.normalize("  Crear, CLASE paciente!  "), "crear clase paciente")

    def test_word_errors_are_deterministic(self):
        self.assertEqual(MODULE.word_errors("crear clase paciente", "crear clase cliente"), {"substitutions": 1, "insertions": 0, "deletions": 0, "distance": 1})
        self.assertEqual(MODULE.word_errors("crear clase paciente", "crear paciente extra"), {"substitutions": 2, "insertions": 0, "deletions": 0, "distance": 2})

    def test_percentile_uses_nearest_rank(self):
        self.assertEqual(MODULE.percentile([1, 2, 3, 4, 5], 0.5), 3)
        self.assertEqual(MODULE.percentile([1, 2, 3, 4, 5], 0.95), 5)


if __name__ == "__main__":
    unittest.main()
