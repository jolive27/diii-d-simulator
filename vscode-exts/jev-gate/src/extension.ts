import * as vscode from "vscode"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { homedir } from "node:os"

const DEFAULT_URL = "https://api.typesafe.ai/v1/systemone"
const DEFAULT_MODEL = "jev-latest"
const RETRY_STATUSES = new Set([429, 529])
const DEFAULT_KEY_FILE = join(homedir(), ".config/opencode/.secrets/jev.key")

type Answer = { type: string; [k: string]: unknown }
type Result = { model: string; answers: Record<string, Answer>; usage: { input_tokens?: number; output_tokens?: number } }

async function getApiKey(override: string): Promise<string> {
  if (process.env.JEV_API_KEY) return process.env.JEV_API_KEY
  const file = override || DEFAULT_KEY_FILE
  const key = (await readFile(file, "utf8")).trim()
  if (!key) throw new Error("Jev API key missing: set JEV_API_KEY or ~/.config/opencode/.secrets/jev.key")
  return key
}

async function callJev(model: string, state: string, questions: Record<string, unknown>): Promise<Result> {
  const cfg = vscode.workspace.getConfiguration("jev")
  const url = cfg.get<string>("apiUrl", DEFAULT_URL)
  const key = await getApiKey(cfg.get<string>("keyFile", ""))
  let lastError: unknown
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt > 0) {
      const ms = 500 * 2 ** (attempt - 1) + Math.round(Math.random() * 250)
      await new Promise((resolve) => setTimeout(resolve, ms))
    }
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model, state, questions }),
      })
      const body = (await res.json().catch((): unknown => ({}))) as {
        model?: string
        answers?: Record<string, Answer>
        usage?: Result["usage"]
      }
      if (RETRY_STATUSES.has(res.status)) {
        lastError = new Error(`Jev API ${res.status}: ${JSON.stringify(body)}`)
        continue
      }
      if (!res.ok) throw new Error(`Jev API error ${res.status}: ${JSON.stringify(body)}`)
      return { model: body.model ?? model, answers: body.answers ?? {}, usage: body.usage ?? {} }
    } catch (err) {
      lastError = err
    }
  }
  throw lastError
}

async function loadQuestions(): Promise<{ questions: Record<string, unknown>; source: string }> {
  const cfg = vscode.workspace.getConfiguration("jev").get<Record<string, unknown>>("questions", {})
  if (cfg && Object.keys(cfg).length > 0) return { questions: cfg, source: "settings.json" }
  const folder = vscode.workspace.workspaceFolders?.[0]
  if (folder) {
    const file = join(folder.uri.fsPath, ".jevgate", "questions.json")
    try {
      const parsed = JSON.parse(await readFile(file, "utf8"))
      if (parsed && Object.keys(parsed).length > 0) return { questions: parsed, source: ".jevgate/questions.json" }
    } catch {
      /* fall through */
    }
  }
  throw new Error(
    "No typed questions found. Add jev.questions to settings.json or create .jevgate/questions.json with a JSON map like {\"q1\":{\"type\":\"noul\",\"instructions\":\"...\",\"criteria\":{\"true\":\"...\",\"false\":\"...\"}}}",
  )
}

function getState(): string {
  const editor = vscode.window.activeTextEditor
  if (editor && !editor.selection.isEmpty) return editor.document.getText(editor.selection)
  if (editor) return editor.document.getText()
  return vscode.workspace.getConfiguration("jev").get<string>("state", "")
}

function summaryLine(model: string, answers: Record<string, Answer>, usage: Result["usage"]): string {
  const lines: string[] = []
  for (const [id, a] of Object.entries(answers)) {
    if (a.type === "noul") lines.push(`${id}: p=${(a.noul as number).toFixed(2)}`)
    else if (a.type === "choice") lines.push(`${id}: ${a.choice} (conf ${(a.confidence as number).toFixed(2)})`)
    else if (a.type === "score") lines.push(`${id}: ${(a.score as number).toFixed(2)}`)
  }
  return `$(graph) Jev[${model}] ${lines.join(" · ")} · in ${usage.input_tokens ?? "?"} out ${usage.output_tokens ?? "?"}`
}

function renderPanel(panel: vscode.WebviewPanel, model: string, answers: Record<string, Answer>, usage: Result["usage"], rawJson: string): void {
  panel.webview.onDidReceiveMessage(async (msg) => {
    if (msg.command === "copy") await vscode.env.clipboard.writeText(rawJson)
  })
  panel.webview.html = `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<style>
  body{font-family:-apple-system,sans-serif;background:#1e1e1e;color:#d4d4d4;padding:16px}
  .q{border:1px solid #333;border-radius:6px;padding:10px 12px;margin:10px 0}
  .qhead{display:flex;justify-content:space-between;font-weight:600}
  .bar{height:8px;background:#333;border-radius:4px;overflow:hidden;margin:4px 0}
  .bar>div{height:100%;background:#4a9eff}
  .dim{color:#888;font-size:12px}
  .chosen{color:#7ee787}
</style>
</head><body>
<h3>Jev · ${model}</h3>
${Object.entries(answers)
  .map(
    ([id, a]) => `<div class="q">
<div class="qhead"><span>${id}</span><span class="dim">${a.type}</span></div>
${renderAnswer(a)}
</div>`,
  )
  .join("")}
<div class="dim">tokens in: ${usage.input_tokens ?? "?"} · out: ${usage.output_tokens ?? "?"}</div>
<p><button onclick="copy()">Copy raw JSON</button></p>
<script>
const vscode=acquireVsCodeApi();
window.copy=()=>vscode.postMessage({command:'copy'});
</script>
</body></html>`

  function renderAnswer(a: Answer): string {
    if (a.type === "noul") {
      const p = a.noul as number
      return `p = <b style="color:#7ee787">${p.toFixed(3)}</b> ${(p * 100).toFixed(1)}%<div class="bar"><div style="width:${Math.round(p * 100)}%"></div></div>`
    }
    if (a.type === "choice") {
      const probs = (a.probabilities as Record<string, number>) ?? {}
      const entries = Object.entries(probs).sort((x, y) => y[1] - x[1])
      return `chosen: <b class="chosen">${String(a.choice)}</b> · conf ${(a.confidence as number).toFixed(3)}
${entries
  .map(
    ([k, v]) => `<div class="dim">${k} — ${(v * 100).toFixed(1)}%</div><div class="bar"><div style="width:${Math.round(v * 100)}%"></div></div>`,
  )
  .join("")}`
    }
    if (a.type === "score") {
      const legend = (a.legend as string[]) ?? []
      const probs = (a.probabilities as Record<string, number>) ?? {}
      return `score = <b style="color:#7ee787">${(a.score as number).toFixed(2)}</b> · conf ${(a.confidence as number).toFixed(3)}
<div class="dim">legend: ${legend.map((l, i) => `${i} = ${l}`).join(" · ")}</div>
${Object.entries(probs)
  .sort((x, y) => y[1] - x[1])
  .map(
    ([k, v]) => `<div class="dim">level ${k} — ${(v * 100).toFixed(1)}%</div><div class="bar"><div style="width:${Math.round(v * 100)}%"></div></div>`,
  )
  .join("")}`
    }
    return `<pre>${JSON.stringify(a, null, 2)}</pre>`
  }
}

export function activate(context: vscode.ExtensionContext): void {
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100)
  statusBar.text = "$(graph) Jev: ready"
  statusBar.show()
  context.subscriptions.push(statusBar)

  const evaluate = async (stateOverride?: string): Promise<Result | undefined> => {
    const model = vscode.workspace.getConfiguration("jev").get<string>("model", DEFAULT_MODEL)
    const { questions } = await loadQuestions()
    let state = stateOverride ?? getState()
    if (!state.trim()) {
      const input = await vscode.window.showInputBox({ placeHolder: "State text to evaluate…" })
      if (!input) return undefined
      state = input
    }
    statusBar.text = "$(loading~spin) Jev: evaluating…"
    try {
      const result = await callJev(model, state, questions)
      statusBar.text = summaryLine(result.model, result.answers, result.usage)
      const panel = vscode.window.createWebviewPanel("jevGate", "Jev result", vscode.ViewColumn.Beside, { enableScripts: true })
      renderPanel(panel, result.model, result.answers, result.usage, JSON.stringify(result, null, 2))
      return result
    } catch (err) {
      statusBar.text = "$(error) Jev: error"
      vscode.window.showErrorMessage(`Jev Gate: ${err instanceof Error ? err.message : String(err)}`)
      return undefined
    }
  }

  context.subscriptions.push(
    vscode.commands.registerCommand("jev-gate.evaluate", async () => {
      await evaluate()
    }),
  )
  const onSave = vscode.workspace.onDidSaveTextDocument(async (doc) => {
    const cfg = vscode.workspace.getConfiguration("jev")
    if (!cfg.get<boolean>("runOnSave.enabled", false)) return
    const exts = cfg.get<string[]>("runOnSave.extensions", [])
    const ext = doc.uri.fsPath.split(".").pop()?.toLowerCase() ?? ""
    if (exts.length > 0 && !exts.includes(ext)) return
    statusBar.text = "$(loading~spin) Jev: evaluating on save…"
    try {
      const { questions } = await loadQuestions()
      const result = await callJev(cfg.get<string>("model", DEFAULT_MODEL), doc.getText(), questions)
      statusBar.text = summaryLine(result.model, result.answers, result.usage)
    } catch (err) {
      statusBar.text = "$(error) Jev: error"
      vscode.window.showErrorMessage(`Jev Gate (on save): ${err instanceof Error ? err.message : String(err)}`)
    }
  })
  context.subscriptions.push(onSave)
}

export function deactivate(): void {
  /* noop */
}