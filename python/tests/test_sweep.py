import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "python"))

from d3gate import engine
from d3gate import sweep


class SweepTests(unittest.TestCase):
    def _fake_repo(self, directory):
        engine_path = Path(directory) / "python" / "d3gate" / "engine.py"
        engine_path.parent.mkdir(parents=True)
        engine_path.write_bytes((REPO / "python" / "d3gate" / "engine.py").read_bytes())

    def test_limit_is_bounded_and_does_not_write_or_run(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(sweep, "REPO", Path(directory)), \
             patch.object(sweep.engine, "run_shot", side_effect=AssertionError("engine called")), \
             patch.object(sweep, "_source_fingerprint", side_effect=AssertionError("fingerprint called")):
            self.assertEqual(sweep.run(limit=3), 0)
            self.assertEqual(list(Path(directory).rglob("*")), [])

    def test_default_order(self):
        cases = sweep.expand_cases()
        self.assertEqual([case["shotId"] for case in cases], [
            "baseline", "ip-0.9-nbi-2", "ip-0.9-nbi-4", "ip-0.9-nbi-6",
            "ip-1.2-nbi-2", "ip-1.2-nbi-4", "ip-1.2-nbi-6",
            "ip-1.5-nbi-2", "ip-1.5-nbi-4", "ip-1.5-nbi-6",
        ])

    def test_invalid_case_fails_before_engine(self):
        with patch.object(sweep, "expand_cases", return_value=[{"shotId": "bad", "config": {"controls": {"ip": 99}}}]), \
             patch.object(sweep.engine, "run_shot", side_effect=AssertionError("engine called")):
            with self.assertRaises(ValueError):
                sweep.run()

    def test_clean_pass_writes_digest_not_shot_and_hashes_manifest(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(sweep, "REPO", Path(directory)), \
             patch.object(sweep, "_source_fingerprint", return_value="source"), \
             patch.object(sweep, "_node_version", return_value="node"), \
             patch.object(sweep, "run_ts", side_effect=lambda config: {"shot": engine.run_shot(config), "metrics": engine.get_metrics(engine.run_shot(config))}), \
             patch.object(sweep, "_run_jev", return_value={"answers": {
                 f"{case['shotId']}.{name}": {"score": 0.9 if name != "retain_full_shot" else 0.0}
             for case in sweep.expand_cases() for name in sweep.QUESTIONS
             }}):
            self._fake_repo(directory)
            self.assertEqual(sweep.run(), 0)
            manifest_path = next(Path(directory).rglob("manifest.json"))
            manifest = json.loads(manifest_path.read_text())
            digest_path = Path(directory) / manifest["digests"][0]["path"]
            self.assertEqual(manifest["digests"][0]["sha256"], sweep._file_hash(digest_path))
            self.assertFalse(list(digest_path.parent.parent.glob("*.shot.json")))

    def test_flagged_case_stores_full_shot(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(sweep, "REPO", Path(directory)), \
             patch.object(sweep, "expand_cases", return_value=[sweep.expand_cases()[0]]), \
             patch.object(sweep, "_source_fingerprint", return_value="source"), \
             patch.object(sweep, "_node_version", return_value="node"), \
             patch.object(sweep, "run_ts", side_effect=lambda config: {"shot": engine.run_shot(config), "metrics": engine.get_metrics(engine.run_shot(config))}), \
             patch.object(sweep, "_run_jev", return_value={"answers": {
                 "baseline.digest_complete": {"score": 0.9}, "baseline.reference_regression_ready": {"score": 0.0},
                 "baseline.physics_scope_respected": {"score": 0.9}, "baseline.retain_full_shot": {"score": 0.0},
             }}):
            self._fake_repo(directory)
            self.assertEqual(sweep.run(), 1)
            self.assertTrue(list(Path(directory).rglob("baseline.shot.json")))
