"""Background run management for the dashboard console.

Long-running commands (agent dispatches, workflow actions, shell) run in
daemon threads writing to a module-level state dict; the Streamlit script
polls it each rerun so output streams live without blocking the UI. Every
finished run is appended to a JSONL console ledger.
"""

import atexit
import json
import os
import signal
import subprocess
import threading
import time
from pathlib import Path

_RUNS = {}
_LOGGER_LOCK = threading.Lock()

LEDGER_DEFAULT = Path.home() / ".local/share/opencode/console.jsonl"

LINE_CAP = 5000


def _display_command(argv):
    return argv if isinstance(argv, str) else " ".join(argv)


def start(kind, run_id, cwd, argv, ledger=None, shell=False):
    if shell and isinstance(argv, (list, tuple)):
        argv = " ".join(argv)
    proc = subprocess.Popen(
        argv,
        cwd=cwd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
        shell=shell,
        start_new_session=True,
    )
    stop = threading.Event()
    record = {
        "id": run_id,
        "kind": kind,
        "argv": argv,
        "cwd": str(cwd),
        "started": time.time(),
        "lines": [],
        "exit": None,
        "ledger": ledger,
        "stop": stop,
        "proc": proc,
    }
    _RUNS[run_id] = record

    def pump():
        try:
            for line in iter(proc.stdout.readline, ""):
                if stop.is_set():
                    _terminate(proc)
                    break
                lines = record["lines"]
                lines.append(line.rstrip())
                if len(lines) > LINE_CAP:
                    del lines[: len(lines) - LINE_CAP]
        finally:
            proc.wait()
            record["exit"] = proc.returncode
            _log_finished(record)

    threading.Thread(target=pump, daemon=True).start()
    return run_id


def _terminate(proc):
    try:
        os.killpg(proc.pid, signal.SIGTERM)
    except (ProcessLookupError, PermissionError):
        try:
            proc.terminate()
        except Exception:
            pass
    try:
        proc.communicate(timeout=10)
    except Exception:
        try:
            os.killpg(proc.pid, signal.SIGKILL)
        except (ProcessLookupError, PermissionError):
            pass


def _shutdown():
    for record in _RUNS.values():
        if record["exit"] is None:
            _terminate(record["proc"])


atexit.register(_shutdown)


def poll(run_id):
    record = _RUNS.get(run_id)
    if not record:
        return None
    return {
        "lines": record["lines"],
        "exit": record["exit"],
        "started": record["started"],
        "cwd": record["cwd"],
        "argv": record["argv"],
        "command": _display_command(record["argv"]),
    }


def cancel(run_id):
    if run_id in _RUNS and _RUNS[run_id]["exit"] is None:
        _RUNS[run_id]["stop"].set()


def active():
    return [run_id for run_id, record in _RUNS.items() if record["exit"] is None]


def _log_finished(record):
    try:
        lines = record["lines"]
        head = "\n".join(lines[:40])
        tail = "\n".join(lines[-40:])
        entry = {
            "time": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "id": record["id"],
            "kind": record["kind"],
            "cwd": record["cwd"],
            "command": _display_command(record["argv"]),
            "exit": record["exit"],
            "duration_s": round(time.time() - record["started"], 1),
            "output_lines": len(lines),
            "output_head": head,
            "output_tail": tail,
        }
        ledger = record.get("ledger") or str(LEDGER_DEFAULT)
        with _LOGGER_LOCK:
            with open(ledger, "a", encoding="utf-8") as handle:
                handle.write(json.dumps(entry) + "\n")
    except Exception:
        pass


def read_ledger(ledger=None):
    path = Path(ledger or LEDGER_DEFAULT)
    records = []
    if path.exists():
        for line in path.read_text("utf-8", errors="replace").splitlines():
            line = line.strip()
            if line:
                try:
                    records.append(json.loads(line))
                except json.JSONDecodeError:
                    pass
    return {"path": str(path), "records": records}