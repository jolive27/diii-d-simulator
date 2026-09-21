"""d3gate: Jev-driven sanity gate for the DIII-D reduced shot simulator.

Python is the preferred home for new tooling; the TypeScript engine in
physics/ remains the sole physics implementation.
"""

from .engine import (
    DEFAULT,
    LIMITS,
    MODEL_VERSION,
    MACHINE,
    MU0,
    KEV,
    ASSUMPTIONS,
    boundary,
    basis,
    educational_transport,
    equilibrium,
    export_results,
    geometry,
    get_metrics,
    parameter_sweep,
    run_benchmark,
    run_shot,
    validate,
    waveform,
)
from .gate import QUESTIONS, build_state, run_gate
from .jev import JEV_BASE_URL, JevClient, JevError

__all__ = [
    "DEFAULT",
    "LIMITS",
    "MODEL_VERSION",
    "MACHINE",
    "MU0",
    "KEV",
    "ASSUMPTIONS",
    "boundary",
    "basis",
    "educational_transport",
    "equilibrium",
    "export_results",
    "geometry",
    "get_metrics",
    "parameter_sweep",
    "run_benchmark",
    "run_shot",
    "validate",
    "waveform",
    "QUESTIONS",
    "build_state",
    "run_gate",
    "JEV_BASE_URL",
    "JevClient",
    "JevError",
]
__version__ = "0.1.0"