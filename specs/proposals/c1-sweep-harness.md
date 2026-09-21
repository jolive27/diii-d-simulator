# M03 C1 — Python benchmark and sweep harness

**Status:** proposal; implementation requires Director approval.  
**Physics contract:** exercise the accepted `pyengine` only, with physics model
`0.1.0` and the declared validity limits unchanged. This is tooling, not a
physics or calibration change. Any needed change to an assumption, equation,
constant, limit, or tolerance is an open change-request concern, not a C1
feature.

## Purpose and command

Add a Python CLI (proposed `python -m d3gate.sweep`) that is the authoritative
regression and sweep runner for `python/d3gate`. It reads a versioned sweep
configuration, expands ordered control/config cases, and calls
`d3gate.engine.run_shot(config)` once per case. The default configuration is
small enough for a laptop (for example, three values per control, 21 shots
plus the baseline); the configuration can select the complete `LIMITS`
step-grid sweep when a longer run is wanted. No configuration value is
clipped, extrapolated, or silently substituted.

`--limit N` is a dry-run planning mode: it expands and prints the first `N`
ordered cases and their IDs, performs no engine calls, network calls, or
artifact writes, and exits successfully for `N >= 0`. A normal run writes
`experiments/sweeps/<batch-id>/` and fails the batch on any invalid case or
engine exception rather than returning a partial pass.

## Per-shot digest and manifest

The runner writes one small JSON digest per completed shot, never the full
shot, containing:

```json
{
  "schemaVersion": 1,
  "shotId": "control-ip-001",
  "config": {"controls": {"ip": 1.2}, "gridSize": 49, "dt": 0.002},
  "metrics": {"sampleCount": 251, "...": "get_metrics(run_shot(config))"},
  "modelVersion": "0.1.0",
  "sourceFingerprint": "<tools/workflow.mjs fingerprint>",
  "engine": "python/d3gate",
  "regression": {"status": "PASS", "maxRelativeError": 0.0}
}
```

`metrics` is exactly the Python `get_metrics` result; `modelVersion` must be
`0.1.0`, and `sourceFingerprint` is captured once for the batch from the
existing workflow fingerprint. The manifest
`experiments/sweeps/<batch-id>/manifest.json` records the frozen ordered case
list, CLI/configuration, runtime versions, model version, source fingerprint,
digest relative paths, and SHA-256 for every digest. It also records the
regression summary, Jev result, and final `go`/`no-go`. A batch is valid only
when every listed digest exists and its hash matches. Manifests and digests
are the normal retained evidence; they are not shot exports.

## TypeScript reference regression

For each sweep case, the harness invokes the accepted TypeScript reference
through `physics/api.ts` (`run_shot` and `get_metrics`) with the identical
configuration and compares the Python and TypeScript outputs. The mandatory
fixture is the default 5-second shot: 251 ordered samples and all 17 fields
(`t`, `ip`, `ne`, `te`, `ti`, `we`, `wi`, `nbi`, `ech`, `pOhm`, `pLoss`,
`pRad`, `tauE`, `pressure`, `beta`, `energyError`, `particleError`), pointwise
relative budget `1e-6`. Aggregate metrics use the accepted `1e-9` relative
budget; conservation and equilibrium checks retain the budgets in
`specs/proposals/pyengine.md`. The harness records maximum observed errors and
the first failing case/field/sample in each digest or the manifest.

The numerical regression result is `PASS` only if every requested case and the
251 x 17 fixture pass, all outputs are finite and deterministic, and no engine
call fails. A sweep is **go** only when this regression result is `PASS` and
the single Jev batch gate below is `PASS`; otherwise it is **no-go**.

## One batched Jev gate per sweep

At the end of every non-dry-run sweep, submit exactly one call to the existing
`tools/teamflow/jev.mjs` evaluation API, using model `jev-latest` by default.
The one state contains the manifest metadata, regression summary, and every
digest (metrics, config, model version, source fingerprint, and recorded
errors), not full shot JSON. Questions use the registry eval-template shape:
`{type, min, instructions, criteria}`. The harness expands the following
exact four-question set for each `shotId` (all expanded questions are in the
one request; no per-shot Jev calls):

```json
{
  "digest_complete": {
    "type": "noul",
    "min": 0.75,
    "instructions": "Does this shot digest contain the requested config, metrics, modelVersion 0.1.0, and sourceFingerprint, with no missing or contradictory fields?",
    "criteria": {
      "true": "The digest is complete, internally consistent, and identifies the frozen model and source.",
      "false": "A required field is missing, contradictory, or falsely identifies the model or source."
    }
  },
  "reference_regression_ready": {
    "type": "noul",
    "min": 0.75,
    "instructions": "Does this digest show that the Python shot is eligible for acceptance as a regression/sweep result against the TypeScript reference?",
    "criteria": {
      "true": "The recorded comparison passed the 1e-6 pointwise and applicable aggregate budgets, with no failed or non-finite result.",
      "false": "A budget failed, comparison evidence is absent, or the result is failed/non-finite."
    }
  },
  "physics_scope_respected": {
    "type": "noul",
    "min": 0.75,
    "instructions": "Does this digest remain within the frozen 0.1.0 pyengine scope and declared operating domain?",
    "criteria": {
      "true": "Controls/configuration are within declared limits and the digest claims no changed assumptions, constants, equations, or model version.",
      "false": "The case is out of domain or the evidence claims or implies a physics change."
    }
  },
  "retain_full_shot": {
    "type": "noul",
    "min": 0.75,
    "instructions": "Does this digest provide a concrete reason to retain the full shot JSON for forensic review?",
    "criteria": {
      "true": "A regression discrepancy, engine failure, non-finite metric, or other explicit anomaly is recorded for this shot.",
      "false": "The digest is a clean passing case with no anomaly requiring full-shot inspection."
    }
  }
}
```

The runner stores the one Jev response and normalized scores in the manifest.
Any expanded question below `0.75` is a gate failure; `retain_full_shot=true`
flags that shot. Jev does not override deterministic regression results or
declare scientific validation.

## Storage and failure policy

By default, only digests and the manifest are written. A full shot JSON may be
written to the same batch directory only when the digest shows a regression
(including a non-finite or failed comparison) or the Jev
`retain_full_shot` question is true; the manifest records its path and
SHA-256. A full shot is never written merely because a case was requested. If
Jev is unavailable, malformed, or below a threshold, the sweep is explicitly
`no-go` and no success-shaped fallback is allowed; a deterministic regression
still permits its flagged shot to be retained under the policy above.

## Required verification and open concerns

Software verification must cover dry-run boundedness, deterministic case
ordering, digest/manifest hash integrity, storage triage, one-call Jev
batching, and a full regression fixture of 251 samples x 17 fields at the
existing budgets. Independent Validation should attempt edge-of-domain and
failure cases and inspect that no full shot is retained for clean passes.
This proposal does not claim experimental validation of the educational
model; its reference pathway is the accepted TypeScript implementation.

Open concerns requiring Director review (not decisions in C1): the canonical
accepted-pyengine approval/hash and the exact default three-value sweep
configuration must be bound before implementation; the existing registry
does not yet define a C1-specific Jev template or a manifest schema; and
Jev service availability/response limits for a large full `LIMITS` expansion
must be confirmed without weakening the one-call rule. No physics constant,
assumption, or tolerance change is proposed.
