"""Minimal Jev HTTP client.

Mirrors the opencode jev-tool plugin contract: Bearer auth, a single POST to
/v1/systemone with {model, state, questions}, and retries on 429/529 with
exponential backoff. Batching rule: ALL questions go in ONE request.
"""

from __future__ import annotations

import json
import os
import random
import time
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

JEV_BASE_URL = "https://api.typesafe.ai/v1/systemone"
DEFAULT_MODEL = "jev-latest"
KEY_RETRIES = 4
RETRY_STATUSES = {429, 529}

KEY_FILE = Path.home() / ".config/opencode/.secrets/jev.key"

LEDGER_DEFAULT = Path.home() / ".local/share/opencode/jev-usage.jsonl"


def _append_ledger(body: dict[str, Any], model: str, state: str, questions: dict[str, Any]) -> None:
    """Best-effort append-only usage record; never raises."""
    try:
        ledger = os.environ.get("D3GATE_JEV_LEDGER") or str(LEDGER_DEFAULT)
        usage = body.get("usage") or {}
        record = {
            "time": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "model": model,
            "questions": len(questions),
            "state_chars": len(state),
            "input_tokens": usage.get("input_tokens"),
            "output_tokens": usage.get("output_tokens"),
            "total_tokens": usage.get("total_tokens"),
        }
        with open(ledger, "a", encoding="utf-8") as handle:
            handle.write(json.dumps(record) + "\n")
    except Exception:
        pass


class JevError(RuntimeError):
    pass


def api_key() -> str:
    env = os.environ.get("JEV_API_KEY")
    if env and env.strip():
        return env.strip()
    if KEY_FILE.exists():
        key = KEY_FILE.read_text(encoding="utf-8").strip()
        if key:
            return key
    raise JevError(
        "JEV_API_KEY not set and ~/.config/opencode/.secrets/jev.key is missing"
    )


def evaluate(
    state: str,
    questions: dict[str, Any],
    model: str = DEFAULT_MODEL,
    retries: int = KEY_RETRIES,
) -> dict[str, Any]:
    """POST the full batch of typed questions over one state."""
    payload = json.dumps({"model": model, "state": state, "questions": questions}).encode()
    last_error: JevError | None = None
    for attempt in range(retries):
        if attempt:
            seconds = 0.5 * 2 ** (attempt - 1) + random.uniform(0, 0.25)
            time.sleep(seconds)
        request = Request(
            JEV_BASE_URL,
            data=payload,
            method="POST",
            headers={"Authorization": f"Bearer {api_key()}", "Content-Type": "application/json"},
        )
        try:
            with urlopen(request, timeout=60) as response:
                body = json.load(response)
                if not isinstance(body, dict) or "answers" not in body:
                    raise JevError(f"Unexpected Jev response shape: {json.dumps(body)[:300]}")
                _append_ledger(body, model, state, questions)
                return body
        except HTTPError as error:
            if error.code in RETRY_STATUSES:
                last_error = JevError(f"Jev API {error.code}: {error.read()[:300]}")
                continue
            raise JevError(f"Jev API {error.code}: {error.read()[:300]}")
        except (URLError, TimeoutError) as error:
            last_error = JevError(f"Jev API request failed: {error}")
    raise JevError(f"Jev API retries exhausted: {last_error}")


class JevClient:
    def __init__(self, model: str = DEFAULT_MODEL) -> None:
        self.model = model

    def evaluate(self, state: str, questions: dict[str, Any]) -> dict[str, Any]:
        return evaluate(state, questions, model=self.model)