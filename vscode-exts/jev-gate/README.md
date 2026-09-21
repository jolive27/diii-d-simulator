# Jev Gate (VS Code)

Evaluate any selection, file, or saved file against typed [Jev](https://api.typesafe.ai/v1/systemone) questions (noul / choice / score) straight from VS Code. Same API, same model, same batching semantics as the opencode `jev` tool — all questions in one call.

## Usage

1. `Cmd+Shift+P` → **Jev: Evaluate** (against the current selection, else the whole active file)
2. Result panel shows probabilities / confidence / score legend + token usage; **Copy raw JSON** available
3. Status bar (`Jev: …`) keeps the last verdict visible

## Questions

Define questions as a JSON map in `.jevgate/questions.json` at the workspace root (default) or inline via `jev.questions` in settings.json:

```json
{
  "q1": {
    "type": "noul",
    "instructions": "Is the plan sound?",
    "criteria": { "true": "Sound", "false": "Not sound" }
  }
}
```

`type` is one of `noul` | `choice` | `score`; `criteria` is `{true,false}` for noul, an option map for choice, or an ordered string array for score.

## Run on save (governance gate)

Enable `jev.runOnSave.enabled` and set `jev.runOnSave.extensions` (e.g. `["json","py"]`) — saved matching files are evaluated automatically.

## Settings

| Key | Default | Meaning |
| --- | --- | --- |
| `jev.apiUrl` | `https://api.typesafe.ai/v1/systemone` | Jev endpoint |
| `jev.model` | `jev-latest` | Model id (`jev-latest`, `jev-preview`) |
| `jev.keyFile` | (empty) | Key override; default `~/.config/opencode/.secrets/jev.key`, `JEV_API_KEY` wins |
| `jev.questions` | `{}` | Inline questions map (fallback: `.jevgate/questions.json`) |
| `jev.state` | `""` | Fallback state when no editor/selection |
| `jev.runOnSave.enabled` | `false` | Auto-evaluate saved files |
| `jev.runOnSave.extensions` | `[]` | File extensions to gate on save |

## Develop / package

```bash
npm install
npm run compile      # tsc -> out/
npm run package      # creates jev-gate-0.1.0.vsix
code --install-extension jev-gate-0.1.0.vsix --force
```