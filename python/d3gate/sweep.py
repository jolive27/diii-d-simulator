"""C1 ordered sweep runner and evidence writer."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import platform
import subprocess
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from . import engine
from .gate import run_ts
from .jev import JevError

REPO = Path(__file__).resolve().parents[2]
MODEL_VERSION = "0.1.0"
APPROVAL_HASH = "71787da902190d6038460bbb2d46a0dc810a8a4e91a12ced9b38fe7ea9f1fd54"
POINTWISE_BUDGET = 1e-6
AGGREGATE_BUDGET = 1e-9
IP_VALUES = (0.9, 1.2, 1.5)
NBI_VALUES = (2, 4, 6)
QUESTIONS = {
    "digest_complete": {
        "type": "noul", "min": 0.75,
        "instructions": "Does this shot digest contain the requested config, metrics, modelVersion 0.1.0, and sourceFingerprint, with no missing or contradictory fields?",
        "criteria": {"true": "The digest is complete, internally consistent, and identifies the frozen model and source.", "false": "A required field is missing, contradictory, or falsely identifies the model or source."},
    },
    "reference_regression_ready": {
        "type": "noul", "min": 0.75,
        "instructions": "Does this digest show that the Python shot is eligible for acceptance as a regression/sweep result against the TypeScript reference?",
        "criteria": {"true": "The recorded comparison passed the 1e-6 pointwise and applicable aggregate budgets, with no failed or non-finite result.", "false": "A budget failed, comparison evidence is absent, or the result is failed/non-finite."},
    },
    "physics_scope_respected": {
        "type": "noul", "min": 0.75,
        "instructions": "Does this digest remain within the frozen 0.1.0 pyengine scope and declared operating domain?",
        "criteria": {"true": "Controls/configuration are within declared limits and the digest claims no changed assumptions, constants, equations, or model version.", "false": "The case is out of domain or the evidence claims or implies a physics change."},
    },
    "retain_full_shot": {
        "type": "noul", "min": 0.75,
        "instructions": "Does this digest provide a concrete reason to retain the full shot JSON for forensic review?",
        "criteria": {"true": "A regression discrepancy, engine failure, non-finite metric, or other explicit anomaly is recorded for this shot.", "false": "The digest is a clean passing case with no anomaly requiring full-shot inspection."},
    },
}


def _json_hash(value: Any) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":")).encode("utf-8")).hexdigest()


def _file_hash(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _source_fingerprint() -> str:
    proc = subprocess.run(
        ["node", "tools/workflow.mjs", "fingerprint"], cwd=REPO,
        capture_output=True, text=True, check=False,
    )
    if proc.returncode:
        raise RuntimeError(f"Unable to obtain source fingerprint: {proc.stderr.strip()}")
    return proc.stdout.strip()


def _validate_controls(config: dict[str, Any]) -> None:
    controls = config.get("controls", {})
    if not isinstance(controls, dict):
        raise ValueError("Controls must be an object")
    for key, value in controls.items():
        lo, hi, _step = engine.LIMITS[key]
        if not isinstance(value, (int, float)) or not math.isfinite(value) or not (lo <= value <= hi):
            raise ValueError(f"Control {key}={value!r} outside [{lo}, {hi}]")


def _base_config(config: dict[str, Any] | None) -> dict[str, Any]:
    if config is None:
        return {"controls": {}, "gridSize": 49, "dt": 0.002}
    if not isinstance(config, dict):
        raise ValueError("Config must be an object")
    return json.loads(json.dumps(config))


def expand_cases(config: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    base = _base_config(config)
    cases = [{"shotId": "baseline", "config": base}]
    for ip in IP_VALUES:
        for nbi in NBI_VALUES:
            controls = {**base.get("controls", {}), "ip": ip, "nbi": nbi}
            cases.append({
                "shotId": f"ip-{ip:g}-nbi-{nbi:g}",
                "config": {**base, "controls": controls},
            })
    return cases


def _relative(a: Any, b: Any) -> float:
    if not isinstance(a, (int, float)) or not isinstance(b, (int, float)) or not math.isfinite(a) or not math.isfinite(b):
        return math.inf
    scale = max(abs(a), abs(b))
    return 0.0 if scale == 0 else abs(a - b) / scale


def _compare(py_shot: dict[str, Any], ts_result: dict[str, Any]) -> dict[str, Any]:
    first = None
    maximum = 0.0
    ts_shot = ts_result["shot"]
    py_samples, ts_samples = py_shot.get("samples", []), ts_shot.get("samples", [])
    if len(py_samples) != 251 or len(ts_samples) != 251 or len(py_samples) != len(ts_samples):
        return {"status": "FAIL", "maxRelativeError": math.inf, "firstFailure": {"reason": "sampleCount", "python": len(py_samples), "reference": len(ts_samples)}}
    for sample_index, (py_sample, ts_sample) in enumerate(zip(py_samples, ts_samples)):
        for field in engine.SAMPLE_FIELDS:
            error = _relative(py_sample.get(field), ts_sample.get(field))
            maximum = max(maximum, error)
            if first is None and error > POINTWISE_BUDGET:
                first = {"field": field, "sample": sample_index, "relativeError": error}
    py_metrics, ts_metrics = engine.get_metrics(py_shot), ts_result["metrics"]
    for field, value in py_metrics.items():
        error = _relative(value, ts_metrics.get(field))
        maximum = max(maximum, error)
        if first is None and error > AGGREGATE_BUDGET:
            first = {"metric": field, "relativeError": error}
    return {"status": "PASS" if first is None else "FAIL", "maxRelativeError": maximum, "firstFailure": first}


def _questions(cases: list[dict[str, Any]]) -> dict[str, Any]:
    return {f"{case['shotId']}.{name}": question for case in cases for name, question in QUESTIONS.items()}


def _score(answer: Any) -> float | None:
    if isinstance(answer, bool):
        return 1.0 if answer else 0.0
    if isinstance(answer, (int, float)) and math.isfinite(answer):
        return float(answer)
    if isinstance(answer, dict):
        for key in ("noul", "score", "value", "confidence"):
            if key in answer:
                return _score(answer[key])
        if "answer" in answer:
            return _score(answer["answer"])
    if isinstance(answer, str):
        lowered = answer.strip().lower()
        if lowered in {"true", "pass", "yes"}:
            return 1.0
        if lowered in {"false", "fail", "no"}:
            return 0.0
    return None


def _run_jev(state: str, questions: dict[str, Any], model: str = "jev-latest") -> dict[str, Any]:
    proc = subprocess.run(
        ["node", "tools/teamflow/jev.mjs", "evaluate"], cwd=REPO,
        input=json.dumps({"state": state, "questions": questions, "model": model}),
        capture_output=True, text=True, check=False,
    )
    if proc.returncode:
        raise JevError(proc.stderr.strip() or f"jev.mjs evaluate exited {proc.returncode}")
    try:
        body = json.loads(proc.stdout)
    except json.JSONDecodeError as exc:
        raise JevError(f"Malformed jev.mjs output: {exc}") from exc
    if not isinstance(body, dict) or "answers" not in body:
        raise JevError("Unexpected Jev response shape")
    return body


def _jev(cases: list[dict[str, Any]], manifest_meta: dict[str, Any], digests: list[dict[str, Any]]) -> tuple[dict[str, Any], set[str]]:
    result: dict[str, Any] = {"callCount": 1, "model": "jev-latest", "scores": {}, "status": "FAIL"}
    try:
        response = _run_jev(
            json.dumps({"manifest": manifest_meta, "digests": digests}, sort_keys=True),
            _questions(cases),
        )
        answers = response.get("answers") if isinstance(response, dict) else None
        if not isinstance(answers, dict):
            raise JevError("Malformed Jev answers")
        scores: dict[str, float] = {}
        retain: set[str] = set()
        for case in cases:
            for name in QUESTIONS:
                key = f"{case['shotId']}.{name}"
                score = _score(answers.get(key))
                if score is None:
                    raise JevError(f"Malformed Jev score for {key}")
                scores[key] = score
            gate_names = [n for n in QUESTIONS if n != "retain_full_shot"]
            if any(scores[f"{case['shotId']}.{n}"] < QUESTIONS[n]["min"] for n in gate_names) or \
               scores[f"{case['shotId']}.retain_full_shot"] >= QUESTIONS["retain_full_shot"]["min"]:
                retain.add(case["shotId"])
        gate_scores = [score for key, score in scores.items() if not key.endswith(".retain_full_shot")]
        result.update({"response": response, "scores": scores, "status": "PASS" if all(score >= 0.75 for score in gate_scores) else "FAIL"})
        return result, retain
    except (JevError, OSError, ValueError, TypeError) as error:
        result["error"] = str(error)
        return result, set()


def run(config: dict[str, Any] | None = None, limit: int | None = None) -> int:
    cases = expand_cases(config)
    if limit is not None:
        if limit < 0:
            raise ValueError("--limit must be non-negative")
        for case in cases[:limit]:
            print(json.dumps(case, sort_keys=True))
        return 0
    for case in cases:
        engine._normalize(case["config"])
        _validate_controls(case["config"])
    source_fingerprint = _source_fingerprint()
    engine_path = REPO / "python" / "d3gate" / "engine.py"
    engine_fingerprint = _file_hash(engine_path)
    if not engine_fingerprint:
        raise RuntimeError("Missing engine fingerprint")
    completed: list[tuple[dict[str, Any], dict[str, Any], dict[str, Any]]] = []
    for case in cases:
        shot = engine.run_shot(case["config"])
        regression = _compare(shot, run_ts(case["config"]))
        digest = {
            "schemaVersion": 1, "shotId": case["shotId"], "config": case["config"],
            "metrics": engine.get_metrics(shot), "modelVersion": MODEL_VERSION,
            "sourceFingerprint": source_fingerprint, "engine": "python/d3gate", "regression": regression,
        }
        completed.append((case, shot, digest))
    batch_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S") + "-" + uuid.uuid4().hex[:8]
    batch_rel = f"experiments/sweeps/{batch_id}"
    manifest_meta = {
        "schemaVersion": 2, "batchId": batch_rel, "createdAt": datetime.now(timezone.utc).isoformat(),
        "config": _base_config(config), "cases": [{"shotId": c["shotId"], "config": c["config"]} for c, _, _ in completed],
        "runtimeVersions": {"python": platform.python_version(), "node": _node_version()},
        "pyengineApprovalHash": APPROVAL_HASH, "engineFingerprint": engine_fingerprint,
        "modelVersion": MODEL_VERSION, "sourceFingerprint": source_fingerprint,
    }
    digest_records = [{"shotId": c["shotId"], "path": f"{batch_rel}/digests/{c['shotId']}.json"} for c, _, d in completed]
    regression_summary = {
        "status": "PASS" if all(d["regression"]["status"] == "PASS" for _, _, d in completed) else "FAIL",
        "maxRelativeError": max(d["regression"]["maxRelativeError"] for _, _, d in completed),
        "firstFailure": next(({"shotId": c["shotId"], **d["regression"]["firstFailure"]} for c, _, d in completed if d["regression"]["firstFailure"]), None),
    }
    jev_result, retain = _jev([c for c, _, _ in completed], manifest_meta | {"regressionSummary": regression_summary}, [d for _, _, d in completed])
    root = REPO / batch_rel
    root.joinpath("digests").mkdir(parents=True, exist_ok=False)
    manifest = {**manifest_meta, "digests": digest_records, "regressionSummary": regression_summary, "jevResult": jev_result,
                "go": regression_summary["status"] == "PASS" and jev_result["status"] == "PASS"}
    for case, shot, digest in completed:
        flagged = digest["regression"]["status"] != "PASS" or not math.isfinite(digest["regression"]["maxRelativeError"]) or case["shotId"] in retain
        if flagged:
            path = root / f"{case['shotId']}.shot.json"
            path.write_text(json.dumps(shot, indent=2, sort_keys=True) + "\n", encoding="utf-8")
            digest_records_for_case = next(x for x in digest_records if x["shotId"] == case["shotId"])
            digest_records_for_case["shotPath"] = f"{batch_rel}/{path.name}"
            digest_records_for_case["shotSha256"] = _file_hash(path)
        digest_path = root / "digests" / f"{case['shotId']}.json"
        digest_path.write_text(json.dumps(digest, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        next(x for x in digest_records if x["shotId"] == case["shotId"])["sha256"] = _file_hash(digest_path)
    (root / "manifest.json").write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({"batchId": batch_rel, "go": manifest["go"]}))
    return 0 if manifest["go"] else 1


def _node_version() -> str:
    proc = subprocess.run(["node", "--version"], cwd=REPO, capture_output=True, text=True, check=False)
    return proc.stdout.strip()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", type=Path)
    parser.add_argument("--limit", type=int)
    args = parser.parse_args()
    config = json.loads(args.config.read_text(encoding="utf-8")) if args.config else None
    try:
        raise SystemExit(run(config, args.limit))
    except (ValueError, RuntimeError, OSError, KeyError) as error:
        parser.error(str(error))


if __name__ == "__main__":
    main()
