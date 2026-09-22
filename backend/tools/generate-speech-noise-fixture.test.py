import importlib.util
import struct
import tempfile
import unittest
import wave
from pathlib import Path

SCRIPT = Path(__file__).with_name("generate-speech-noise-fixture.py")
SPEC = importlib.util.spec_from_file_location("speech_noise_fixture", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)


class SpeechNoiseFixtureTests(unittest.TestCase):
    def baseline(self, path):
        samples = [1000, -1000, 2000, -2000] * 400
        with wave.open(str(path), "wb") as target:
            target.setparams((1, 2, 16000, len(samples), "NONE", "not compressed"))
            target.writeframes(struct.pack(f"<{len(samples)}h", *samples))
        return samples

    def test_generates_reproducible_pcm_fixture_at_target_snr(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "baseline.wav"
            first = root / "first.wav"
            second = root / "second.wav"
            baseline = self.baseline(source)
            MODULE.generate(source, first)
            MODULE.generate(source, second)
            self.assertEqual(first.read_bytes(), second.read_bytes())
            params, noisy = MODULE.read_pcm(first)
            self.assertEqual((params.nchannels, params.sampwidth, params.framerate, params.nframes), (1, 2, 16000, len(baseline)))
            self.assertNotEqual(noisy, baseline)
            noise = [actual - original for actual, original in zip(noisy, baseline)]
            self.assertAlmostEqual(20 * __import__("math").log10(MODULE.rms(baseline) / MODULE.rms(noise)), 15.0, delta=0.25)


if __name__ == "__main__":
    unittest.main()
