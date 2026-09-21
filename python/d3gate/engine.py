"""Python port of the DIII-D reduced tokamak model (physics/engine.ts + physics/api.ts).

Shot-path arithmetic mirrors the TypeScript engine operation-for-operation so
the discrete solutions agree bit-for-bit; the fixed-boundary basis solve is a
pure-Python reproduction of the in-place SOR. The analytic-solovev,
shaped-convergence and m02 benchmarks are delegated to the reference engine.
Cross-engine equivalence budgets are defined in specs/proposals/pyengine.md.
"""

import json
import math
import os
import subprocess
from pathlib import Path

MU0 = 4 * math.pi * 1e-7
KEV = 1.602176634e-16
MACHINE = {"R": 1.66, "a": 0.66, "name": "DIII-D educational geometry"}

DEFAULT = {"ip": 1.2, "bt": 2.0, "nbi": 4, "ech": 1, "gas": 2.5, "kappa": 1.7, "delta": 0.35}
LIMITS = {
    "ip": [0.6, 2, 0.05],
    "bt": [1, 2.1, 0.05],
    "nbi": [0, 12, 0.25],
    "ech": [0, 3, 0.1],
    "gas": [0, 8, 0.1],
    "kappa": [1, 1.95, 0.05],
    "delta": [-0.3, 0.6, 0.05],
}

MODEL_VERSION = "0.1.0"
ASSUMPTIONS = [
    "Formed deuterium plasma; no breakdown or extinction",
    "Constant boundary per shot; programmed current with ideal external drive",
    "Heuristic confinement, resistivity and electron-ion exchange; no calibration",
    "Fixed absorbed heating fractions and 80 keV beam particle source",
    "Solovev fixed-boundary equilibrium; no coils, X-point, stability or disruptions",
]

REPO = Path(__file__).resolve().parents[2]
_API_URL = (REPO / "physics" / "api.ts").as_uri()
_ENGINE_URL = (REPO / "physics" / "engine.ts").as_uri()


def validate(c):
    for k, (lo, hi, _step) in LIMITS.items():
        v = c[k]
        if not isinstance(v, (int, float)) or not math.isfinite(v) or v < lo or v > hi:
            raise ValueError(f"Invalid {k}")


def boundary(c, n=160):
    return [
        [
            MACHINE["R"] + MACHINE["a"] * math.cos(t + math.asin(c["delta"]) * math.sin(t)),
            c["kappa"] * MACHINE["a"] * math.sin(t),
        ]
        for i in range(n + 1)
        for t in [2 * math.pi * i / n]
    ]


def geometry(c, n=49):
    validate(c)
    if not isinstance(n, int) or n < 17 or n > 129 or n % 2 != 1:
        raise ValueError("Grid must be odd, 17–129")
    R = [MACHINE["R"] - MACHINE["a"] * 1.04 + i * 2.08 * MACHINE["a"] / (n - 1) for i in range(n)]
    Z = [-c["kappa"] * MACHINE["a"] * 1.04 + j * 2.08 * c["kappa"] * MACHINE["a"] / (n - 1) for j in range(n)]
    dr = R[1] - R[0]
    dz = Z[1] - Z[0]
    mask = bytearray(n * n)
    volume = 0.0
    C = 0.0
    D = 0.0
    for j in range(1, n - 1):
        for i in range(1, n - 1):
            z = Z[j] / (c["kappa"] * MACHINE["a"])
            if abs(z) >= 1:
                continue
            t = math.asin(z)
            shift = math.asin(c["delta"]) * z
            right = MACHINE["R"] + MACHINE["a"] * math.cos(t + shift)
            left = MACHINE["R"] + MACHINE["a"] * math.cos(math.pi - t + shift)
            if R[i] > left and R[i] < right:
                mask[j * n + i] = 1
                volume += 2 * math.pi * R[i] * dr * dz
                C += R[i] * dr * dz
                D += dr * dz / (MU0 * R[i])
    return {"n": n, "R": R, "Z": Z, "dr": dr, "dz": dz, "mask": mask, "volume": volume, "C": C, "D": D}


def basis(g, boundary_values=None):
    n, R, dr, dz, mask = g["n"], g["R"], g["dr"], g["dz"], g["mask"]
    u = [0.0] * (n * n)
    v = [0.0] * (n * n)
    if boundary_values is not None:
        for key in ("u", "v"):
            values = boundary_values[key]
            if not values or len(values) != n * n:
                raise ValueError("Boundary arrays must match the grid")
            target = u if key == "u" else v
            for k in range(n * n):
                val = values[k]
                if not isinstance(val, (int, float)) or not math.isfinite(val):
                    raise ValueError("Boundary values must be finite")
                if not mask[k]:
                    target[k] = val
    ar = 1 / dr**2
    az = 1 / dz**2
    den = 2 * (ar + az)
    iterations = 0
    residual = math.inf
    while iterations < 12000:
        for j in range(1, n - 1):
            for i in range(1, n - 1):
                k = j * n + i
                if not mask[k]:
                    continue
                l = ar + 1 / (2 * R[i] * dr)
                r = ar - 1 / (2 * R[i] * dr)
                u[k] += 1.7 * ((l * u[k - 1] + r * u[k + 1] + az * (u[k - n] + u[k + n]) + MU0 * R[i] ** 2) / den - u[k])
                v[k] += 1.7 * ((l * v[k - 1] + r * v[k + 1] + az * (v[k - n] + v[k + n]) + 1) / den - v[k])
        if iterations % 20 == 0:
            a = 0.0
            b = 0.0
            for j in range(1, n - 1):
                for i in range(1, n - 1):
                    k = j * n + i
                    if not mask[k]:
                        continue
                    l = ar + 1 / (2 * R[i] * dr)
                    r = ar - 1 / (2 * R[i] * dr)
                    a = max(a, abs(l * u[k - 1] + r * u[k + 1] + az * (u[k - n] + u[k + n]) - den * u[k] + MU0 * R[i] ** 2) / (MU0 * R[i] ** 2))
                    b = max(b, abs(l * v[k - 1] + r * v[k + 1] + az * (v[k - n] + v[k + n]) - den * v[k] + 1))
            residual = max(a, b)
            if residual < 1e-8:
                break
        iterations += 1
    if residual >= 1e-8:
        raise ValueError("Equilibrium basis did not converge")
    ubar = 0.0
    vbar = 0.0
    for k in range(n * n):
        w = 2 * math.pi * R[k % n] * dr * dz / g["volume"]
        ubar += u[k] * w
        vbar += v[k] * w
    return {"g": g, "u": u, "v": v, "ubar": ubar, "vbar": vbar, "iterations": iterations, "residual": residual}


def equilibrium(b, ipMA, bt, pbar):
    g, u, v, ubar, vbar = b["g"], b["u"], b["v"], b["ubar"], b["vbar"]
    I = ipMA * 1e6
    h = ubar - g["C"] * vbar / g["D"]
    q = I * vbar / g["D"]
    disc = q * q + 4 * h * pbar
    if disc < 0:
        return {"valid": False, "reason": "Pressure exceeds this equilibrium family's solvable range."}
    A = 0.0 if pbar == 0 else 2 * pbar / (q + math.sqrt(disc))
    B = (I - A * g["C"]) / g["D"]
    psi = [A * x + B * v[k] for k, x in enumerate(u)]
    meanPressure = 0.0
    current = 0.0
    minF2 = math.inf
    maxPsi = 0.0
    residual = 0.0
    sourceMax = 0.0
    ar = 1 / g["dr"] ** 2
    az = 1 / g["dz"] ** 2
    for k in range(len(psi)):
        if g["mask"][k]:
            R = g["R"][k % g["n"]]
            F2 = (MACHINE["R"] * bt) ** 2 + 2 * B * psi[k]
            minF2 = min(minF2, F2)
            maxPsi = max(maxPsi, psi[k])
            if psi[k] < -1e-10:
                return {"valid": False, "reason": "Flux reversal is outside the supported equilibrium family."}
            meanPressure += A * psi[k] * 2 * math.pi * R * g["dr"] * g["dz"] / g["volume"]
            current += (A * R + B / (MU0 * R)) * g["dr"] * g["dz"]
            source = MU0 * R**2 * A + B
            L = (ar + 1 / (2 * R * g["dr"])) * psi[k - 1] + (ar - 1 / (2 * R * g["dr"])) * psi[k + 1] + az * (psi[k - g["n"]] + psi[k + g["n"]]) - 2 * (ar + az) * psi[k]
            residual = max(residual, abs(L + source))
            sourceMax = max(sourceMax, abs(source))
    if minF2 <= 0:
        return {"valid": False, "reason": "The requested pressure requires nonphysical toroidal field in this equilibrium family."}
    return {
        "valid": True,
        "psi": psi,
        "A": A,
        "B": B,
        "meanPressure": meanPressure,
        "current": current,
        "maxPsi": maxPsi,
        "minF2": minF2,
        "residual": residual / sourceMax,
        "pressureError": abs(meanPressure - pbar) / max(1, pbar),
        "currentError": abs(current - I) / I,
    }


def educational_transport(c, ne, te, ip, pAux):
    return {
        "tauE": 0.12 * (ip / 1.2) ** 0.7 * (c["bt"] / 2) ** 0.2 * (max(ne, 1e18) / 4e19) ** 0.2 * (max(pAux, 0.5) / 5) ** -0.35,
        "tauP": 1.6,
        "resistivity": 2.8e-8 * (max(te, 0.02)) ** -1.5,
    }


def waveform(c, t):
    ramp = 0.4 + (c["ip"] - 0.4) * t if t < 1 else (c["ip"] + (0.4 - c["ip"]) * (t - 4) if t > 4 else c["ip"])
    heat = 1 if t >= 1 and t < 4 else 0
    return {"ip": ramp, "nbi": c["nbi"] * heat, "ech": c["ech"] * heat}


def runShot(c, g, dt=0.002, closure=None, observer=None):
    validate(c)
    if not (isinstance(dt, (int, float)) and dt > 0 and dt <= 0.01):
        raise ValueError("Time step must be >0 and <=0.01 s")
    closure = closure or educational_transport
    V = g["volume"]
    N0 = 3e19 * V
    W0 = 1.5 * N0 * KEV * 0.5
    N = N0
    We = W0
    Wi = W0
    Ein = 0.0
    Eout = 0.0
    Nin = 0.0
    Nout = 0.0
    samples = []
    steps = math.floor(5 / dt + 0.5)
    dt = 5 / steps

    def rates(t):
        w = waveform(c, t)
        ne = N / V
        te = We / (1.5 * N * KEV)
        ti = Wi / (1.5 * N * KEV)
        tr = closure(c, ne, te, w["ip"], w["nbi"] + w["ech"])
        pOhm = tr["resistivity"] * (2 * math.pi * MACHINE["R"]) ** 2 / V * (w["ip"] * 1e6) ** 2
        pRad = 1.69e-38 * ne * ne * math.sqrt(te * 1000) * V
        gas = 0.3 * c["gas"] * 1e21
        beam = 0.8 * w["nbi"] * 1e6 / (80 * KEV)
        source = gas + beam
        return {**w, "ne": ne, "te": te, "ti": ti, **tr, "pOhm": pOhm, "pRad": pRad, "source": source}

    for s in range(steps + 1):
        t = s * dt
        r = rates(t)
        if s % max(1, math.floor(0.02 / dt + 0.5)) == 0 or s == steps:
            pressure = 2 * (We + Wi) / (3 * V)
            samples.append(
                {
                    "t": t,
                    "ip": r["ip"],
                    "ne": r["ne"] / 1e19,
                    "te": r["te"],
                    "ti": r["ti"],
                    "we": We / 1e6,
                    "wi": Wi / 1e6,
                    "nbi": r["nbi"],
                    "ech": r["ech"],
                    "pOhm": r["pOhm"] / 1e6,
                    "pLoss": (We + Wi) / r["tauE"] / 1e6,
                    "pRad": r["pRad"] / 1e6,
                    "tauE": r["tauE"],
                    "pressure": pressure,
                    "beta": 100 * 2 * MU0 * pressure / c["bt"] ** 2,
                    "energyError": (We + Wi - 2 * W0 - Ein + Eout) / max(2 * W0, Ein),
                    "particleError": (N - N0 - Nin + Nout) / max(N0, Nin),
                }
            )
        if s == steps:
            break
        exchange = (We - Wi) / 0.25
        ionization = 0.0136 * KEV * 0.3 * c["gas"] * 1e21
        pe = (0.8 * 0.35 * r["nbi"] + 0.9 * r["ech"]) * 1e6 + r["pOhm"]
        pi = 0.8 * 0.65 * r["nbi"] * 1e6
        le = We / r["tauE"] + r["pRad"] + ionization
        li = Wi / r["tauE"]
        observed = (
            {"step": s, "t": t, "dt": dt, "volume": V, "initialN": N0, "initialWe": W0, "initialWi": W0, "preN": N, "preWe": We, "preWi": Wi}
            if observer
            else None
        )
        We += dt * (pe - le - exchange)
        Wi += dt * (pi - li + exchange)
        sink = N / r["tauP"]
        N += dt * (r["source"] - sink)
        Ein += dt * (pe + pi)
        Eout += dt * (le + li)
        Nin += dt * r["source"]
        Nout += dt * sink
        if not math.isfinite(We + Wi + N) or We <= 0 or Wi <= 0 or N <= 0:
            raise ValueError(f"Reduced model left its valid thermal-plasma regime at {t:.3f} s. Reduce fueling or increase heating.")
        if observer and observed:
            observer({**observed, "postN": N, "postWe": We, "postWi": Wi})
    return {
        "schemaVersion": 1,
        "modelVersion": MODEL_VERSION,
        "controls": {**c},
        "volume": V,
        "dt": dt,
        "samples": samples,
        "assumptions": list(ASSUMPTIONS),
    }


def _normalize(config):
    if not isinstance(config, dict):
        raise ValueError("Shot config must be an object")
    extra = set(config) - {"controls", "gridSize", "dt"}
    if extra:
        raise ValueError(f"Unknown config field: {sorted(extra)[0]}")
    controls = config.get("controls", {})
    if not isinstance(controls, dict):
        raise ValueError("Controls must be an object")
    extra_c = set(controls) - set(LIMITS)
    if extra_c:
        raise ValueError(f"Unknown control field: {sorted(extra_c)[0]}")
    grid = config.get("gridSize", 49)
    dt = config.get("dt", 0.002)
    if not isinstance(grid, int) or grid < 17 or grid > 129 or grid % 2 != 1:
        raise ValueError("Grid must be odd, 17–129")
    if not isinstance(dt, (int, float)) or not math.isfinite(dt) or dt <= 0 or dt > 0.01:
        raise ValueError("Time step must be >0 and <=0.01 s")
    return {**DEFAULT, **controls}, grid, dt


def run_shot(config=None):
    config = {} if config is None else config
    controls, grid, dt = _normalize(config)
    return runShot(controls, geometry(controls, grid), dt)


def get_metrics(shot):
    if not shot["samples"]:
        raise ValueError("Cannot summarize an empty shot")
    metrics = {
        "sampleCount": len(shot["samples"]),
        "startTimeSeconds": shot["samples"][0]["t"],
        "endTimeSeconds": shot["samples"][-1]["t"],
        "peakElectronTemperatureKeV": -math.inf,
        "peakIonTemperatureKeV": -math.inf,
        "peakDensity1e19PerM3": -math.inf,
        "peakThermalEnergyMJ": -math.inf,
        "peakBetaPercent": -math.inf,
        "maxAbsEnergyError": 0.0,
        "maxAbsParticleError": 0.0,
    }
    for sample in shot["samples"]:
        metrics["peakElectronTemperatureKeV"] = max(metrics["peakElectronTemperatureKeV"], sample["te"])
        metrics["peakIonTemperatureKeV"] = max(metrics["peakIonTemperatureKeV"], sample["ti"])
        metrics["peakDensity1e19PerM3"] = max(metrics["peakDensity1e19PerM3"], sample["ne"])
        metrics["peakThermalEnergyMJ"] = max(metrics["peakThermalEnergyMJ"], sample["we"] + sample["wi"])
        metrics["peakBetaPercent"] = max(metrics["peakBetaPercent"], sample["beta"])
        metrics["maxAbsEnergyError"] = max(metrics["maxAbsEnergyError"], abs(sample["energyError"]))
        metrics["maxAbsParticleError"] = max(metrics["maxAbsParticleError"], abs(sample["particleError"]))
    return metrics


def parameter_sweep(config, control, values):
    _normalize(config)
    if control not in LIMITS:
        raise ValueError(f"Unknown sweep control: {control}")
    if not isinstance(values, list) or len(values) == 0:
        raise ValueError("Sweep values must be a nonempty array")
    return [run_shot({"gridSize": config.get("gridSize", 49), "dt": config.get("dt", 0.002), "controls": {**config.get("controls", {}), control: value}}) for value in values]


SAMPLE_FIELDS = (
    "t", "ip", "ne", "te", "ti", "we", "wi", "nbi", "ech", "pOhm", "pLoss", "pRad",
    "tauE", "pressure", "beta", "energyError", "particleError",
)


def export_results(shot, fmt="json"):
    if not isinstance(shot, dict):
        raise ValueError("shot must be a Shot object")
    if fmt == "json":
        return json.dumps(shot, indent=2)
    if fmt == "csv":
        rows = [",".join(SAMPLE_FIELDS)]
        for sample in shot["samples"]:
            rows.append(",".join(str(sample[field]) for field in SAMPLE_FIELDS))
        return "\n".join(rows) + "\n"
    raise ValueError(f"Unsupported export format: {fmt}")


def _node(code, payload=None, env=None, timeout=300):
    proc = subprocess.run(
        ["node", "--experimental-strip-types", "--input-type=module", "-e", code],
        input="" if payload is None else json.dumps(payload),
        capture_output=True,
        text=True,
        cwd=REPO,
        env=env if env is not None else os.environ.copy(),
        timeout=timeout,
    )
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr[-2000:])
    return proc.stdout


def run_benchmark(name):
    if name == "baseline":
        return run_shot()
    if name not in ("analytic-solovev", "shaped-convergence", "m02"):
        raise ValueError(f"Unsupported benchmark: {name}")
    env = os.environ.copy()
    env["PYENGINE_BENCH"] = name
    code = "import {run_benchmark} from " + repr(_API_URL) + ";console.log('###BEGIN###');console.log(JSON.stringify(run_benchmark(process.env.PYENGINE_BENCH)));"
    stdout = _node(code, env=env, timeout=600)
    return json.loads(stdout.split("###BEGIN###", 1)[1])