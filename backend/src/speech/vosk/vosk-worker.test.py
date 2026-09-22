import json
import subprocess
import sys
import unittest
from pathlib import Path


WORKER = Path(__file__).with_name("vosk-worker.py")


class VoskWorkerTests(unittest.TestCase):
    def run_worker(self, audio, model_path="missing-model"):
        result = subprocess.run(
            [sys.executable, str(WORKER), "--model-path", model_path, "--sample-rate", "16000"],
            input=audio,
            capture_output=True,
            check=False,
        )
        return json.loads(result.stdout)

    def test_reports_missing_model_without_loading_it(self):
        self.assertEqual(self.run_worker(b"\x00\x00")["diagnostic"]["code"], "MODEL_NOT_FOUND")

    def test_rejects_invalid_sample_rate_before_loading_a_model(self):
        result = subprocess.run(
            [sys.executable, str(WORKER), "--model-path", ".", "--sample-rate", "0"],
            input=b"",
            capture_output=True,
            check=False,
        )
        self.assertEqual(json.loads(result.stdout)["diagnostic"]["code"], "AUDIO_ERROR")


if __name__ == "__main__":
    unittest.main()
