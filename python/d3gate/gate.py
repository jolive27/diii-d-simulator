"""Build Jev state from the DIII-D shot engine and evaluate typed questions.

The Python package owns new tooling; the physical engine stays in the
TypeScript source (physics/api.ts) and is invoked deterministically. All
questions are submitted to Jev in ONE batched request over one state.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path
from typing import Any

from .jev import JevClient, JevError

REPO_ROOT = Path(__file__).resolve().parents[2]
ENGINE_URL = (REPO_ROOT / "physics" / "api.ts").as_uri()

QUESTIONS: dict[str, dict[str, Any]] = {
    "physically_plausible": {
        "type": "noul",
        "instructions": (
            "Judge whether the reported shot metrics are physically plausible for a reduced "
            "DIII-D-like tokamak (formed thermal plasma, Ip 0.6-2 MA, Bt 1-2.1 T)."
        ),
        "criteria": {
            "true": "Temperatures, density, beta, thermal energy and confinement time are physically reasonable and internally consistent.",
            "false": "At least one metric is unphysical, out of bounds, or internally inconsistent.",
        },
    },
    "numerics_healthy": {
        "type": "noul",
        "instructions": "Judging from the reported leading conservation residuals, are the numerical balances healthy?",
        "criteria": {
            "true": "Energy and particle balance errors are negligibly small.",
            "false": "Energy or particle balance errors are large enough to undermine the run.",
        },
    },
    "confinement_quality": {
        "type": "score",
        "instructions": "Rate the confinement and heating performance of this shot.",
        "criteria": ["poor", "weak", "moderate", "strong", "excellent"],
    },
    "next_action": {
        "type": "choice",
        "instructions": "Given the reported metrics, which next step is most warranted?",
        "criteria": {
            "accept_run": "Metrics look trustworthy and useful as-is.",
            "adjust_controls": "Performance or plausibility suggests a heating, fueling, current or field change.",
            "investigate_numerics": "Conservation residuals or instability suggest a numeric or time-step concern.",
            "detail_analysis": "The case warrants closer inspection of profiles or exported data.",
        },
    },
}

_ENGINE_CODE = (
    "import {run_shot,get_metrics} from "
    + repr(ENGINE_URL)
    + ";const shot=run_shot(JSON.parse(process.argv[1]||'{}'));"
    "console.log(JSON.stringify({metrics:get_metrics(shot),shot}));"
)


def run_ts(config: dict[str, Any] | None = None) -> dict[str, Any]:
    """Run the TypeScript engine in-process and return {metrics, shot}."""
    proc = subprocess.run(
        ["node", "--experimental-strip-types", "--input-type=module", "-e", _ENGINE_CODE, json.dumps(config or {})],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    if proc.returncode != 0:
        raise JevError(f"TypeScript engine failed: {proc.stderr.strip()}")
    return json.loads(proc.stdout)


def metrics_from_shot(shot: dict[str, Any]) -> dict[str, float]:
    """Python mirror of physics/api.ts get_metrics for imported shot exports."""
    samples = shot.get("samples") or shot.get("shot", {}).get("samples")
    if not samples:
        raise JevError("Imported export has no samples (expected physics/api.ts shot format)")
    metrics: dict[str, float] = {
        "sampleCount": float(len(samples)),
        "startTimeSeconds": samples[0]["t"],
        "endTimeSeconds": samples[-1]["t"],
        "peakElectronTemperatureKeV": max(s["te"] for s in samples),
        "peakIonTemperatureKeV": max(s["ti"] for s in samples),
        "peakDensity1e19PerM3": max(s["ne"] for s in samples),
        "peakThermalEnergyMJ": max(s["we"] + s["wi"] for s in samples),
        "peakBetaPercent": max(s["beta"] for s in samples),
        "maxAbsEnergyError": max(abs(s["energyError"]) for s in samples),
        "maxAbsParticleError": max(abs(s["particleError"]) for s in samples),
    }
    return metrics


def build_state(payload: dict[str, Any]) -> str:
    metrics = payload["metrics"]
    shot = payload["shot"] if "shot" in payload and "samples" in payload["shot"] else payload
    samples = shot["samples"]
    last = samples[-1]
    return json.dumps(
        {
            "instrument": (
                "DIII-D reduced educational tokamak model "
                "(0-D thermal + fixed-boundary Solovev equilibrium; not experimentally validated)"
            ),
            "controls": shot["controls"],
            "modelVersion": shot.get("modelVersion"),
            "volumeM3": shot.get("volume"),
            "sampleCount": metrics["sampleCount"],
            "startTimeSeconds": metrics["startTimeSeconds"],
            "endTimeSeconds": metrics["endTimeSeconds"],
            "peakElectronTemperatureKeV": metrics["peakElectronTemperatureKeV"],
            "peakIonTemperatureKeV": metrics["peakIonTemperatureKeV"],
            "peakDensity1e19PerM3": metrics["peakDensity1e19PerM3"],
            "peakThermalEnergyMJ": metrics["peakThermalEnergyMJ"],
            "peakBetaPercent": metrics["peakBetaPercent"],
            "confinementTimeAtEndSeconds": last["tauE"],
            "maxAbsEnergyError": metrics["maxAbsEnergyError"],
            "maxAbsParticleError": metrics["maxAbsParticleError"],
        },
        indent=2,
    )


def format_answers(answers: dict[str, Any]) -> str:
    """Render a Jev answers block, handling the typed answer shapes returned by the API."""
    lines = []
    for name, answer in answers.items():
        if not isinstance(answer, dict):
            lines.append(f"{name}: {answer}")
            continue
        parts = []
        kind = answer.get("type")
        if kind == "noul" and "noul" in answer:
            parts.append(f"odds={answer['noul']:.3f}")
        elif kind == "score" and "score" in answer:
            legend = answer.get("legend") or {}
            label = legend.get(str(round(answer["score"]))) or legend.get(round(answer["score"]))
            parts.append(f"score={answer['score']:.2f}" + (f" ({label})" if label is not None else ""))
        elif kind == "choice" and "choice" in answer:
            parts.append(f"choice={answer['choice']}")
        probabilities = answer.get("probabilities")
        if isinstance(probabilities, dict) and probabilities:
            best = max(probabilities.items(), key=lambda item: item[1])
            parts.append(f"top={best[0]}({best[1]:.2f})")
        if isinstance(answer.get("confidence"), (int, float)):
            parts.append(f"conf={answer['confidence']:.2f}")
        lines.append(f"{name}: {', '.join(parts) if parts else json.dumps(answer)}")
    return "\n".join(lines)


def run_gate(payload: dict[str, Any], model: str = "jev-latest") -> dict[str, Any]:
    response = JevClient(model=model).evaluate(build_state(payload), QUESTIONS)
    return {"answers": response.get("answers", {}), "usage": response.get("usage", {})}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Jev sanity gate for DIII-D shot metrics")
    parser.add_argument("--config", metavar="FILE", help="JSON shot config ({controls,gridSize,dt})")
    parser.add_argument("--from", dest="infile", metavar="FILE", help="Gate an existing exported shot JSON")
    parser.add_argument("--dry", action="store_true", help="Print the Jev state and questions without calling the API")
    parser.add_argument("--gate", metavar="P", type=float, help="Exit 1 when physically_plausible probability is below P")
    parser.add_argument("--model", default="jev-latest", help="Jev model id (default jev-latest)")
    args = parser.parse_args(argv)

    if args.infile:
        shot = json.loads(Path(args.infile).read_text(encoding="utf-8"))
        payload = {"metrics": metrics_from_shot(shot), "shot": shot}
    else:
        config = json.loads(Path(args.config).read_text(encoding="utf-8")) if args.config else {}
        payload = run_ts(config)

    state = build_state(payload)
    if args.dry:
        print(state)
        print(json.dumps(QUESTIONS, indent=2))
        return 0

    result = run_gate(payload, model=args.model)
    print(format_answers(result["answers"]))
    print("usage:", json.dumps(result["usage"]))

    if args.gate is not None:
        plausible = result["answers"].get("physically_plausible", {})
        prob = plausible.get("noul")
        if prob is None:
            print("gate: physically_plausible not returned by Jev", file=sys.stderr)
            return 1
        if prob < args.gate:
            print(f"gate: physically_plausible {prob:.3f} < {args.gate}", file=sys.stderr)
            return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())