"""Centralized agent & work dashboard.

Aggregates across whatever lives on this machine, plus a console for running work:

  * opencode's global session database (~/.local/share/opencode/opencode.db):
    every session across every project — which agent and which model worked,
    timestamps, token counts, cost, subagent links.
  * any git worktrees found under the watch roots in dash/config.json:
    HEAD, dirty state, last commit, plus harness-governance records where a
    repo uses them (validation/*-decision.json, specs/*.json,
    experiments/records/audit.jsonl).
  * a Jev usage ledger (~/.local/share/opencode/jev-usage.jsonl) appended by
    python/d3gate/jev.py on every successful call.
  * a Console tab that dispatches the harnessed agents
    (node tools/dispatch-agent.mjs), runs the workflow gates
    (node tools/workflow.mjs), and executes shell commands in the selected
    repo. Each run streams live and is appended to a JSONL console ledger
    (~/.local/share/opencode/console.jsonl). Everything else is read-only.

Run:

  .venv-dash/bin/streamlit run dash/app.py
"""

import json
import sqlite3
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path

import streamlit as st

import console

HERE = Path(__file__).resolve().parent
CONFIG_PATH = HERE / "config.json"


def expand(path):
    return Path(path).expanduser()


def read_json(path):
    try:
        return json.loads(Path(path).read_text("utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def run(cmd, cwd=None, timeout=30):
    try:
        proc = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=timeout)
        return proc.stdout.strip() if proc.returncode == 0 else None
    except Exception:
        return None


def ago(epoch_ms):
    if not epoch_ms:
        return ""
    seconds = (time.time() * 1000 - epoch_ms) / 1000
    units = [(60, "s"), (60, "m"), (24, "h"), (7, "d")]
    value, name = seconds, "s"
    for span, unit in units:
        if value < span:
            name = unit
            break
        value = value / span
        name = unit
    return f"{value:.0f}{name} ago"


def iso(epoch_ms):
    if not epoch_ms:
        return ""
    return datetime.fromtimestamp(epoch_ms / 1000, tz=timezone.utc).strftime("%Y-%m-%d %H:%M")


@st.cache_data(ttl=5, show_spinner=False)
def load_config():
    return read_json(CONFIG_PATH) or {}


@st.cache_data(ttl=5, show_spinner=False)
def load_sessions(config):
    db = expand(config.get("opencode_db", "~/.local/share/opencode/opencode.db"))
    if not db.exists():
        return {"ok": False, "reason": f"missing {db}"}
    rows = None
    try:
        conn = sqlite3.connect(f"file:{db}?mode=ro", uri=True, timeout=5)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA query_only=ON")
        rows = conn.execute(
            "select id, directory, title, agent, model, tokens_input, tokens_output, "
            "tokens_reasoning, tokens_cache_read, tokens_cache_write, cost, "
            "time_created, time_updated, time_compacting, parent_id from session "
            "order by time_created desc"
        ).fetchall()
        conn.close()
    except Exception as error:  # database may be locked by a running editor
        return {"ok": False, "reason": str(error)}
    sessions = []
    for row in rows:
        model = row["model"]
        provider, model_id = "?", "?"
        if model:
            try:
                parsed = json.loads(model)
                provider = parsed.get("providerID") or "?"
                model_id = parsed.get("id") or "?"
            except (TypeError, json.JSONDecodeError):
                model_id = model
        sessions.append(
            {
                "id": row["id"],
                "directory": row["directory"],
                "title": row["title"],
                "agent": row["agent"],
                "provider": provider,
                "model": model_id,
                "tokens_input": row["tokens_input"] or 0,
                "tokens_output": row["tokens_output"] or 0,
                "tokens_reasoning": row["tokens_reasoning"] or 0,
                "tokens_cache_read": row["tokens_cache_read"] or 0,
                "tokens_cache_write": row["tokens_cache_write"] or 0,
                "cost": row["cost"] or 0.0,
                "time_created": row["time_created"],
                "time_updated": row["time_updated"],
                "parent_id": row["parent_id"],
            }
        )
    return {"ok": True, "sessions": sessions}


@st.cache_data(ttl=30, show_spinner=False)
def load_projects(config):
    repos = []
    for root in config.get("watch_roots", []):
        base = expand(root)
        if not base.is_dir():
            continue
        candidates = [base] + [p for p in base.iterdir() if p.is_dir()]
        seen = set()
        for cand in candidates:
            resolved = cand.resolve()
            if resolved in seen:
                continue
            seen.add(resolved)
            head = run(["git", "rev-parse", "--short", "HEAD"], cwd=resolved)
            if head is None:
                continue
            repo = {
                "root": str(resolved),
                "name": cand.name,
                "head": head,
                "dirty": len(run(["git", "status", "--porcelain"], cwd=resolved).splitlines()) if run(["git", "status", "--porcelain"], cwd=resolved) else 0,
                "last_commit": run(["git", "log", "-1", "--format=%ct", "HEAD"], cwd=resolved),
                "decisions": sorted((resolved / "validation").glob("*-decision.json")) if (resolved / "validation").is_dir() else [],
                "specs": sorted((resolved / "specs").glob("*.json")) if (resolved / "specs").is_dir() else [],
                "audit": resolved / "experiments/records/audit.jsonl",
            }
            repo["last_commit_at"] = repo["last_commit"]
            repo["has_harness"] = bool(repo["decisions"] or repo["specs"] or repo["audit"].exists())
            repos.append(repo)
    return repos


@st.cache_data(ttl=5, show_spinner=False)
def load_jev_usage(config):
    ledger = expand(config.get("jev_usage_ledger", "~/.local/share/opencode/jev-usage.jsonl"))
    if not ledger.exists():
        return {"ok": False, "path": str(ledger)}
    records = []
    for line in ledger.read_text("utf-8").splitlines():
        line = line.strip()
        if line:
            try:
                records.append(json.loads(line))
            except json.JSONDecodeError:
                pass
    return {"ok": True, "path": str(ledger), "records": records}


def nearest_repo_directory(sessions, repos):
    roots = sorted({Path(r["root"]) for r in repos}, key=lambda p: len(p.parts), reverse=True)
    mapping = {}
    for session in sessions:
        directory = Path(session["directory"] or ".").resolve()
        label = directory.name or str(directory)
        for root in roots:
            try:
                directory.relative_to(root)
            except ValueError:
                continue
            label = root.name
            break
        mapping[session["id"]] = label
    return mapping


def render_console_tab(config, repos):
    repo_paths = [r["root"] for r in repos]
    ledger = expand(config.get("console_ledger", "~/.local/share/opencode/console.jsonl"))

    st.subheader("Run work from here")
    if not repo_paths:
        st.info("No tracked repos in dash/config.json — add watch_roots to enable the console.")
        return

    tab_agent, tab_workflow, tab_shell = st.tabs(["Harnessed agent", "Workflow gate", "Shell"])

    with tab_agent:
        agent_repo = st.selectbox("Target repo", repo_paths, format_func=lambda p: Path(p).name, key="console_repo")
        role = st.selectbox("Agent role", ["physics", "software", "validation"], key="console_role")
        task_id = st.text_input("Task id (slug; the fit-logged task name)", value=time.strftime("task-%Y%m%d-%H%M%S"), key="console_taskid")
        task = st.text_area("Task", height=90, key="console_task")
        confirm_agent = st.checkbox("Run a real harnessed agent in this repo (separate workspace + records)", key="console_confirm_agent")
        if st.button("Dispatch agent", key="console_btn_agent", disabled=not (confirm_agent and task.strip() and task_id.strip())):
            console.start(
                "agent",
                f"agent-{int(time.time() * 1000)}",
                agent_repo,
                ["node", "tools/dispatch-agent.mjs", role, task_id.strip(), task.strip()],
                ledger=str(ledger),
            )
            st.success(f"Dispatched {role}:{task_id.strip()} — output below while it runs.")
        st.caption("dispatch-agent.mjs runs a preset agent in a separate workspace, refuses out-of-role changed files on import, then Director approves via the Workflow gate.")

    with tab_workflow:
        wf_repo = st.selectbox("Target repo", repo_paths, format_func=lambda p: Path(p).name, key="console_wf_repo")
        milestones = []
        for repo in repos:
            if repo["root"] == wf_repo:
                milestones = [spec.stem for spec in repo["specs"]]
        if not milestones:
            st.info("No specs/*.json in that repo — nothing to gate yet.")
        else:
            milestone = st.selectbox("Milestone", milestones, key="console_milestone")
            action = st.radio("Action", ["gate", "approve", "accept"], horizontal=True, key="console_action")
            confirm_wf = st.checkbox("approve/accept writes decision + audit records", key="console_confirm_wf")
            can_run = action == "gate" or confirm_wf
            if st.button("Run workflow", key="console_btn_wf", disabled=not can_run):
                console.start(
                    "workflow",
                    f"wf-{int(time.time() * 1000)}",
                    wf_repo,
                    ["node", "tools/workflow.mjs", action, milestone],
                    ledger=str(ledger),
                )

    with tab_shell:
        shell_repo = st.selectbox("Target repo", repo_paths, format_func=lambda p: Path(p).name, key="console_shell_repo")
        command = st.text_input("Command", placeholder="e.g. pnpm test", key="console_command")
        confirm_shell = st.checkbox("This runs a real shell command in that repo", key="console_confirm_shell")
        if st.button("Run command", key="console_btn_shell", disabled=not (confirm_shell and command.strip())):
            console.start(
                "shell",
                f"shell-{int(time.time() * 1000)}",
                shell_repo,
                command.strip(),
                ledger=str(ledger),
                shell=True,
            )

    st.divider()

    active_ids = console.active()
    if active_ids:
        for run_id in active_ids:
            info = console.poll(run_id)
            st.markdown(f"**Running:** `{info['command']}`")
            st.code("\n".join(info["lines"][-200:]) or "(no output yet)", language="text")
            if st.button("Stop", key=f"console-stop-{run_id}"):
                console.cancel(run_id)
            st.caption(f"{len(info['lines'])} lines in")

        time.sleep(1)
        st.rerun()
    else:
        last = console.read_ledger(ledger)["records"][-1:]
        if last:
            entry = last[-1]
            st.markdown(f"**Last run:** `{entry['command']}` — exit {entry['exit']}, {entry['duration_s']}s, {entry['output_lines']} lines")

    st.divider()
    st.subheader("Console ledger")
    ledger_data = console.read_ledger(ledger)
    if ledger_data["records"]:
        st.dataframe(
            [
                {
                    "time": r.get("time", ""),
                    "kind": r.get("kind", ""),
                    "exit": r.get("exit", ""),
                    "duration": f"{r.get('duration_s', '')}s",
                    "lines": r.get("output_lines", ""),
                    "command": r.get("command", ""),
                }
                for r in ledger_data["records"][-25:][::-1]
            ],
            hide_index=True,
            width="stretch",
        )
        st.caption(f"Ledger: {ledger_data['path']}")
    else:
        st.caption(f"No runs logged yet (ledger: {ledger_data['path']}).")


def main():
    st.set_page_config(page_title="Agent Work Dashboard", page_icon="⚙", layout="wide")
    st.title("Agent Work Dashboard")
    st.caption("Aggregates opencode sessions, watched git projects, and tool usage ledgers. The Console tab runs harnessed agents, workflow gates, and shell commands — live-streamed and logged. Edit `dash/config.json` to add sources.")

    config = load_config()

    st.sidebar.subheader("Session")
    if expand(config.get("opencode_db", "")).exists() if config else False:
        st.sidebar.write("opencode DB: ok")
    if st.sidebar.toggle("Auto-refresh (5s)", value=False):
        time.sleep(5)
        st.rerun()

    sessions_data = load_sessions(config)
    repos = load_projects(config)
    jev = load_jev_usage(config)

    sessions = sessions_data["sessions"] if sessions_data["ok"] else []
    now = time.time() * 1000
    day, week = now - 24 * 3600 * 1000, now - 7 * 24 * 3600 * 1000
    recent_day = [s for s in sessions if s["time_created"] >= day]
    recent_week = [s for s in sessions if s["time_created"] >= week]
    models = sorted({(s["provider"], s["model"]) for s in sessions})
    agents = sorted({s["agent"] or "?" for s in sessions})
    subagents = [s for s in sessions if s["parent_id"]]
    total_in = sum(s["tokens_input"] for s in sessions)
    total_out = sum(s["tokens_output"] for s in sessions)
    total_cache = sum(s["tokens_cache_read"] + s["tokens_cache_write"] for s in sessions)
    total_cost = sum(s["cost"] for s in sessions)

    c1, c2, c3, c4, c5, c6, c7 = st.columns(7)
    c1.metric("Sessions total", len(sessions))
    c2.metric("Last 24h", len(recent_day))
    c3.metric("Last 7d", len(recent_week))
    c4.metric("Models", len(models))
    c5.metric("Agents", len(agents))
    c6.metric("Repos tracked", len(repos))
    c7.metric("Subagent runs", len(subagents))

    m1, m2, m3, m4 = st.columns(4)
    m1.metric("Tokens in", f"{total_in:,}")
    m2.metric("Tokens out", f"{total_out:,}")
    m3.metric("Cache tokens", f"{total_cache:,}")
    m4.metric("Total cost", f"${total_cost:.2f}")

    if not sessions_data["ok"]:
        st.warning(f"opencode DB unavailable: {sessions_data['reason']}")

    tabs = st.tabs(["Console", "Sessions & agents", "Models", "Projects", "Activity", "Jev usage", "Sources"])

    with tabs[0]:
        render_console_tab(config, repos)

    with tabs[1]:
        label_map = nearest_repo_directory(sessions, repos)
        since = st.selectbox("Since", ["All time", "24h", "7d"], index=0)
        agent_choice = st.multiselect("Agents", agents, default=agents)
        rows = []
        for session in sessions:
            if agent_choice and session["agent"] not in agent_choice:
                continue
            if since == "24h" and session["time_created"] < day:
                continue
            if since == "7d" and session["time_created"] < week:
                continue
            rows.append(
                {
                    "time": ago(session["time_created"]),
                    "at": iso(session["time_created"]),
                    "project": label_map.get(session["id"], "?"),
                    "agent": session["agent"] or "?",
                    "model": f"{session['provider']}:{session['model']}",
                    "subagent": "yes" if session["parent_id"] else "",
                    "tokens in": f"{session['tokens_input']:,}",
                    "tokens out": f"{session['tokens_output']:,}",
                    "cache rd": f"{session['tokens_cache_read']:,}",
                    "title": (session["title"] or "")[:80],
                }
            )
        st.dataframe(rows, hide_index=True, width="stretch")
        st.caption("Each row is one opencode session. `subagent` marks a child session (agent spawned by an agent).")

    with tabs[2]:
        st.subheader("Model usage")
        usage = {}
        for session in sessions:
            key = f"{session['provider']}:{session['model']}"
            entry = usage.setdefault(
                key, {"sessions": 0, "in": 0, "out": 0, "reasoning": 0, "cache": 0, "cost": 0.0}
            )
            entry["sessions"] += 1
            entry["in"] += session["tokens_input"]
            entry["out"] += session["tokens_output"]
            entry["reasoning"] += session["tokens_reasoning"]
            entry["cache"] += session["tokens_cache_read"] + session["tokens_cache_write"]
            entry["cost"] += session["cost"]
        st.dataframe(
            [
                {
                    "model": k,
                    "sessions": v["sessions"],
                    "tokens in": f"{v['in']:,}",
                    "tokens out": f"{v['out']:,}",
                    "reasoning": f"{v['reasoning']:,}",
                    "cache": f"{v['cache']:,}",
                    "cost": f"${v['cost']:.2f}",
                }
                for k, v in sorted(usage.items(), key=lambda kv: -kv[1]["in"])
            ],
            hide_index=True,
            width="stretch",
        )
        st.divider()
        st.subheader("Agent usage")
        agent_usage = {}
        for session in sessions:
            key = session["agent"] or "?"
            entry = agent_usage.setdefault(key, {"sessions": 0, "in": 0, "out": 0})
            entry["sessions"] += 1
            entry["in"] += session["tokens_input"]
            entry["out"] += session["tokens_output"]
        st.dataframe(
            [
                {
                    "agent": k,
                    "sessions": v["sessions"],
                    "tokens in": f"{v['in']:,}",
                    "tokens out": f"{v['out']:,}",
                }
                for k, v in sorted(agent_usage.items(), key=lambda kv: -kv[1]["sessions"])
            ],
            hide_index=True,
            width="stretch",
        )

    with tabs[3]:
        st.subheader("Tracked git projects")
        rows = []
        for repo in repos:
            harness = ""
            if repo["has_harness"]:
                accepted = 0
                for decision in repo["decisions"]:
                    payload = read_json(decision)
                    if payload and payload.get("status") == "ACCEPTED":
                        accepted += 1
                harness = f"{len(repo['decisions'])} decisions" + (f" ({accepted} accepted)" if accepted else "")
            rows.append(
                {
                    "repo": repo["name"],
                    "path": repo["root"],
                    "HEAD": repo["head"],
                    "dirty": repo["dirty"],
                    "last commit": ago(int(repo["last_commit"]) * 1000) if repo["last_commit"] else "",
                    "specs": len(repo["specs"]),
                    "harness": harness or "—",
                }
            )
        st.dataframe(rows, hide_index=True, width="stretch")
        st.caption("Repos discovered under the watch roots in `dash/config.json`; `harness` shows governance records when a repo uses them.")

    with tabs[4]:
        st.subheader("Recent work")
        events = []
        for session in sessions[:30]:
            events.append({"time": iso(session["time_created"]), "ago": ago(session["time_created"]), "kind": "session", "source": "opencode", "item": f"{session['agent']} · {session['provider']}:{session['model']} · {(session['title'] or '')[:70]}"})
        for repo in repos:
            for decision in repo["decisions"][-5:]:
                payload = read_json(decision)
                if not payload:
                    continue
                stamp = payload.get("time") or ""
                events.append({"time": stamp[:16] if stamp else "?", "ago": "", "kind": "decision", "source": repo["name"], "item": f"{decision.stem} → {payload.get('status', '?')}"})
        if jev["ok"]:
            for record in jev["records"][-10:]:
                events.append({"time": str(record.get("time", "")), "ago": "", "kind": "jev", "source": "jev", "item": f"{record.get('model')} · {record.get('questions')} questions · {record.get('total_tokens')} tokens"})
        events.sort(key=lambda event: event["time"], reverse=True)
        st.dataframe(events[:50], hide_index=True, width="stretch")

    with tabs[5]:
        if jev["ok"]:
            records = jev["records"]
            st.subheader(f"Jev usage ({len(records)} calls)")
            totals = {"calls": len(records), "tokens": 0}
            for record in records:
                totals["tokens"] += record.get("total_tokens") or 0
            c1, c2 = st.columns(2)
            c1.metric("Calls", totals["calls"])
            c2.metric("Total tokens", f"{totals['tokens']:,}")
            st.dataframe(records[-50:][::-1], hide_index=True, width="stretch")
        else:
            st.info(
                "No Jev usage ledger yet. Logging activates automatically on the next call "
                f"through python/d3gate/jev.py (writes {jev['path']}); "
                "set D3GATE_JEV_LEDGER to redirect."
            )

    with tabs[6]:
        st.subheader("Sources")
        st.json(config)
        st.divider()
        st.caption(
            "opencode session rows: model/agent/token/cost metadata only (message contents never rendered). "
            "Console runs stream live and append to a JSONL ledger (`console_ledger` in config.json) — the "
            "only write surface on this dashboard. Jev usage is appended by python/d3gate/jev.py per call."
        )

    st.divider()
    st.caption("Extension path: per-call tracing (Phoenix/Langfuse) keyed by session id, and ledger feeds from any other tool that appends JSONL to `dash/config.json`.")


main()