#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const mmd = join(here, "workflow.mmd");
const out = join(here, "workflow.png");
const cache = join(here, ".mmd-cache");

function chromePath() {
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) {
    return process.env.CHROME_PATH;
  }
  const candidates = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Google Chrome 2.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
  ];
  return candidates.find((c) => existsSync(c));
}

function mermaidPath() {
  const js = join(cache, "node_modules", "mermaid", "dist", "mermaid.min.js");
  if (!existsSync(js) && !existsSync(join(cache, "node_modules"))) {
    mkdirSync(cache, { recursive: true });
    writeFileSync(join(cache, "package.json"), "{}");
    const r = spawnSync("npm", ["install", "--no-audit", "--no-fund", "mermaid"], {
      cwd: cache, stdio: "inherit",
    });
    if (r.status !== 0) throw new Error("mermaid install failed");
  }
  if (!existsSync(js)) throw new Error("mermaid.min.js not found in " + cache);
  return js;
}

function htmlFor(src, mermaidJs) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
html,body{margin:0;padding:0;background:#fff}
</style></head><body>
<pre class="mermaid"></pre>
<script src="file://${mermaidJs}"></script>
<script>
const srcEl = document.querySelector('.mermaid');
const demo = String(\`${src.replace(/`/g, "\\`")}\`).replace(/\\r\\n/g,'\\n');
srcEl.textContent = demo;
mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'base' });
(async () => {
  const { svg } = await mermaid.render('id_m', demo);
  srcEl.innerHTML = svg;
  const svgEl = srcEl.querySelector('svg');
  const r = svgEl.getBBox();
  const S = 2;
  const vbw = Math.ceil(r.width), vbh = Math.ceil(r.height);
  svgEl.setAttribute('viewBox', \`\${r.x} \${r.y} \${r.width} \${r.height}\`);
  svgEl.setAttribute('width', vbw*S); svgEl.setAttribute('height', vbh*S);
  svgEl.style.width = (vbw*S)+'px'; svgEl.style.height = (vbh*S)+'px';
  document.title = \`SIZE:\${vbw*S}x\${vbh*S}\`;
})();
</script></body></html>`;
}

const chrome = chromePath();
if (!chrome) {
  console.error("No Chrome/Chromium found. Install Chrome or set CHROME_PATH.");
  process.exit(2);
}
const mermaidJs = mermaidPath();
const html = htmlFor(readFileSync(mmd, "utf8"), mermaidJs);
const page = join(cache, "render.html");
writeFileSync(page, html);
mkdirSync(cache, { recursive: true });

execFileSync(
  chrome,
  [
    "--headless=new", "--disable-gpu", "--no-sandbox",
    "--window-size=1598,5524",
    "--run-all-compositor-stages-before-draw", "--timeout=20000",
    `--screenshot=${out}`,
    `file://${page}`,
  ],
  { stdio: "inherit" }
);
console.log("Wrote " + out);