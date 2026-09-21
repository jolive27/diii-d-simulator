#!/usr/bin/env python3
"""Zero-install Jev gate: python3 tools/jev-gate.py [options]. See d3gate.gate.main."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "python"))

from d3gate.gate import main  # noqa: E402

if __name__ == "__main__":
    sys.exit(main())