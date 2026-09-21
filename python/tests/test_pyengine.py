"""Cross-engine verification for the Python engine port (specs/pyengine.json).

Each test method maps to one requiredCheck in the spec. The Python engine is
built from physics/engine.ts + physics/api.ts; the reference engine is invoked
through the same Node runtime the project already uses.

Run:  python3 -m unittest discover -s python/tests -v
"""

import json
import math
import py_compile
import subprocess
import sys
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "python"))

from d3gate import engine as E

NODE = ["node", "--experimental-strip-types", "--input-type=module"]
API_URL = (REPO / "physics" / "api.ts").as_uri()
ENGINE_URL = (REPO / "physics" / "engine.ts").as_uri()

RUN_SHOT = (
    "import {run_shot,get_metrics} from " + repr(API_URL) + ";"
    "const shot=run_shot(JSON.parse(process.argv[1]||'{}'));"
    "console.log(JSON.stringify({metrics:get_metrics(shot),shot}));"
)
SWEEP = (
    "import {parameter_sweep,get_metrics} from " + repr(API_URL) + ";"
    "const c=JSON.parse(process.argv[1]);const out={};"
    "for(const k of Object.keys(c))out[k]=parameter_sweep({},k,c[k]).map(get_metrics);"
    "console.log(JSON.stringify(out));"
)
EQUILIBRIUM = (
    "import {geometry,basis,equilibrium,DEFAULT} from " + repr(ENGINE_URL) + ";"
    "const c=JSON.parse(process.argv[1]);const g=geometry(c.controls,c.grid);"
    "const b=basis(g);const eq=equilibrium(b,c.controls.ip,c.controls.bt,c.pbar);"
    "console.log(JSON.stringify({volume:g.volume,C:g.C,D:g.D,mask:Array.from(g.mask),"
    "u:Array.from(b.u),v:Array.from(b.v),ubar:b.ubar,vbar:b.vbar,"
    "iterations:b.iterations,residual:b.residual,valid:eq.valid,psi:eq.psi,A:eq.A,B:eq.B,"
    "meanPressure:eq.meanPressure,current:eq.current,maxPsi:eq.maxPsi,minF2:eq.minF2,"
    "eqResidual:eq.residual,pressureError:eq.pressureError,currentError:eq.currentError}));"
)
CONSTANTS = (
    "import {DEFAULT,LIMITS,MACHINE,MU0,KEV} from " + repr(ENGINE_URL) + ";"
    "console.log(JSON.stringify({DEFAULT,LIMITS,MACHINE,MU0,KEV}));"
)

CHECKS = {
    "BASELINE-METRICS": "PYENGINE-BASELINE-METRICS",
    "VERIFY": "PYENGINE-VERIFY",
    "TIMESERIES": "PYENGINE-TIMESERIES-MATCH",
    "CONSERVATION": "PYENGINE-CONSERVATION",
    "SWEEP": "PYENGINE-SWEEP-MATCH",
    "EQUILIBRIUM": "PYENGINE-EQUILIBRIUM-MATCH",
    "DETERMINISM": "PYENGINE-DETERMINISM",
    "SCOPE": "PYENGINE-SCIENTIFIC-SCOPE",
    "LEGACY": "PYENGINE-LEGACY-TESTS",
    "LINT": "PYENGINE-LINT",
}


def ts_eval(code, payload=None, timeout=600):
    argv = list(NODE) + ["-e", code]
    if payload is not None:
        argv.append(json.dumps(payload))
    proc = subprocess.run(argv, capture_output=True, text=True, cwd=REPO, timeout=timeout)
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr[-3000:] if proc.stderr else f"exit {proc.returncode}")
    return json.loads(proc.stdout.strip())


def rel(a, b):
    d = max(abs(a), abs(b))
    return 0.0 if d == 0 else abs(a - b) / d


def stepped(lo, hi, step):
    values, v = [], lo
    while v <= hi + 1e-9:
        values.append(min(v, hi))
        v += step
    return values


class PyEngineChecks(unittest.TestCase):
    maxDiff = None

    def check(self, name):
        print(f"\n[{name}]", flush=True)

    def test_baseline_metrics_match(self):
        self.check(CHECKS["BASELINE-METRICS"])
        ts = ts_eval(RUN_SHOT, {})["metrics"]
        py = E.get_metrics(E.run_shot({}))
        worst = 0.0
        for key in py:
            diff = rel(py[key], ts[key])
            worst = max(worst, diff)
            self.assertTrue(
                diff <= 1e-9,
                f"baseline metric {key} py={py[key]!r} ts={ts[key]!r} rel={diff:.2e}",
            )
        print(f"    aggregate budget 1e-9 satisfied; worst rel diff across 10 metrics: {worst:.2e}")

    def test_timeseries_match(self):
        self.check(CHECKS["TIMESERIES"])
        ts_shot = ts_eval(RUN_SHOT, {})["shot"]
        py_shot = E.run_shot({})
        self.assertEqual(py_shot["schemaVersion"], ts_shot["schemaVersion"])
        self.assertEqual(py_shot["modelVersion"], ts_shot["modelVersion"])
        self.assertEqual(py_shot["volume"], ts_shot["volume"])
        self.assertEqual(py_shot["dt"], ts_shot["dt"])
        self.assertEqual(len(py_shot["samples"]), len(ts_shot["samples"]))
        worst = 0.0
        for field in E.SAMPLE_FIELDS:
            for i, (pys, tss) in enumerate(zip(py_shot["samples"], ts_shot["samples"])):
                diff = rel(pys[field], tss[field])
                worst = max(worst, diff)
                self.assertTrue(
                    diff <= 1e-6,
                    f"sample {i} field {field} py={pys[field]!r} ts={tss[field]!r} rel={diff:.2e}",
                )
        print(f"    pointwise budget 1e-6 satisfied over {len(py_shot['samples'])} samples x 17 fields; worst rel diff: {worst:.2e}")

    def test_conservation_match(self):
        self.check(CHECKS["CONSERVATION"])
        ts = ts_eval(RUN_SHOT, {})
        py_shot, ts_shot = E.run_shot({}), ts["shot"]
        max_energy = max(abs(pys["energyError"] - tss["energyError"]) for pys, tss in zip(py_shot["samples"], ts_shot["samples"]))
        max_particle = max(abs(pys["particleError"] - tss["particleError"]) for pys, tss in zip(py_shot["samples"], ts_shot["samples"]))
        self.assertTrue(max_energy <= 1e-12, f"max |ΔenergyError| = {max_energy:.2e}")
        self.assertTrue(max_particle <= 1e-12, f"max |ΔparticleError| = {max_particle:.2e}")
        for key in ("maxAbsEnergyError", "maxAbsParticleError"):
            diff = rel(E.get_metrics(py_shot)[key], ts["metrics"][key])
            self.assertTrue(diff <= 1e-9, f"{key} rel diff {diff:.2e}")
        print(f"    max |ΔenergyError|={max_energy:.2e} max |ΔparticleError|={max_particle:.2e}; aggregate 1e-9 held")

    def test_sweep_match(self):
        self.check(CHECKS["SWEEP"])
        cases = {control: stepped(lo, hi, step) for control, (lo, hi, step) in E.LIMITS.items()}
        total = sum(len(v) for v in cases.values())
        ts = ts_eval(SWEEP, cases, timeout=900)
        worst = 0.0
        for control, values in cases.items():
            py = [E.get_metrics(s) for s in E.parameter_sweep({}, control, values)]
            for value, pm, tm in zip(values, py, ts[control]):
                self.assertEqual(len(pm), len(tm))
                for key in pm:
                    diff = rel(pm[key], tm[key])
                    worst = max(worst, diff)
                    self.assertTrue(
                        diff <= 1e-9,
                        f"sweep {control}={value} {key} py={pm[key]!r} ts={tm[key]!r} rel={diff:.2e}",
                    )
        print(f"    full LIMITS step grid ({total} shots) compared; worst rel diff across all metrics: {worst:.2e}")

    def test_equilibrium_match(self):
        self.check(CHECKS["EQUILIBRIUM"])
        cases = [(grid, pbar) for grid in (33, 49, 65, 129) for pbar in (30000, 250000)]
        worst_psi = worst_pressure = worst_current = 0.0
        for grid, pbar in cases:
            payload = {"grid": grid, "pbar": pbar, "controls": dict(E.DEFAULT)}
            ts = ts_eval(EQUILIBRIUM, payload, timeout=900)
            g = E.geometry(dict(E.DEFAULT), grid)
            b = E.basis(g)
            eq = E.equilibrium(b, E.DEFAULT["ip"], E.DEFAULT["bt"], pbar)
            self.assertEqual(g["volume"], ts["volume"])
            self.assertEqual(list(g["mask"]), ts["mask"])
            self.assertEqual(g["C"], ts["C"])
            self.assertEqual(g["D"], ts["D"])
            self.assertEqual(b["iterations"], ts["iterations"])
            self.assertEqual(b["residual"], ts["residual"])
            self.assertEqual(b["ubar"], ts["ubar"])
            self.assertEqual(b["vbar"], ts["vbar"])
            self.assertEqual(b["u"], ts["u"])
            self.assertEqual(b["v"], ts["v"])
            self.assertEqual(eq["valid"], ts["valid"], f"grid {grid} pbar {pbar} valid flag mismatch")
            if eq["valid"]:
                d_psi = max(rel(a, c) for a, c in zip(eq["psi"], ts["psi"]))
                worst_psi = max(worst_psi, d_psi)
                self.assertTrue(d_psi <= 1e-6, f"grid {grid} psi rel diff {d_psi:.2e}")
                for key, budget in (("A", 1e-6), ("B", 1e-6), ("meanPressure", 1e-9), ("current", 1e-9), ("maxPsi", 1e-6), ("minF2", 1e-6)):
                    diff = rel(eq[key], ts[key])
                    worst_pressure = max(worst_pressure, diff) if key == "meanPressure" else worst_pressure
                    worst_current = max(worst_current, diff) if key == "current" else worst_current
                    self.assertTrue(diff <= budget, f"grid {grid} pbar {pbar} {key} rel diff {diff:.2e}")
                self.assertEqual(eq["pressureError"], ts["pressureError"])
                self.assertEqual(eq["currentError"], ts["currentError"])
        print(f"    grids 33/49/65/129, pbar 30/250 kPa; basis arrays bitwise-identical; "
              f"worst psi rel {worst_psi:.2e}, meanPressure rel {worst_pressure:.2e}, current rel {worst_current:.2e}")

    def test_determinism(self):
        self.check(CHECKS["DETERMINISM"])
        a = json.dumps(E.run_shot({}), sort_keys=True, separators=(",", ":"))
        b = json.dumps(E.run_shot({}), sort_keys=True, separators=(",", ":"))
        self.assertEqual(a, b, "repeated run_shot() not bitwise-identical")
        base = json.dumps(E.run_benchmark("baseline"), sort_keys=True, separators=(",", ":"))
        self.assertEqual(base, a, "run_benchmark('baseline') diverges from run_shot()")
        g1 = E.geometry(dict(E.DEFAULT), 49)
        g2 = E.geometry(dict(E.DEFAULT), 49)
        self.assertEqual(E.basis(g1)["u"], E.basis(g2)["u"])
        print("    repeated runs and benchmark('baseline') bitwise-identical (JSON fingerprints equal)")

    def test_scope_constants_match(self):
        self.check(CHECKS["SCOPE"])
        ts = ts_eval(CONSTANTS)
        ts_shot = ts_eval(RUN_SHOT, {})["shot"]
        self.assertEqual(E.DEFAULT, ts["DEFAULT"])
        self.assertEqual(E.LIMITS, ts["LIMITS"])
        self.assertEqual(E.MACHINE, ts["MACHINE"])
        self.assertEqual(E.MU0, ts["MU0"])
        self.assertEqual(E.KEV, ts["KEV"])
        self.assertEqual(E.MODEL_VERSION, ts_shot["modelVersion"])
        self.assertEqual(E.ASSUMPTIONS, ts_shot["assumptions"])
        print("    DEFAULT/LIMITS/MACHINE/MU0/KEV and model version + assumptions identical to the reference engine")

    def test_legacy_ts_tests_pass(self):
        self.check(CHECKS["LEGACY"])
        proc = subprocess.run(
            ["node", "--experimental-strip-types", "--test", "tests/physics.test.mjs"],
            cwd=REPO, capture_output=True, text=True, timeout=600,
        )
        self.assertEqual(proc.returncode, 0, proc.stdout[-2000:] + proc.stderr[-2000:])
        print("    existing TypeScript physics test suite passes unchanged")

    def test_lint_pycompile(self):
        self.check(CHECKS["LINT"])
        for module in ("engine.py", "gate.py", "jev.py"):
            py_compile.compile(str(REPO / "python" / "d3gate" / module), doraise=True)
        print("    python/d3gate/*.py compile cleanly")


if __name__ == "__main__":
    unittest.main(verbosity=2)