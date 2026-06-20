import fs from "node:fs";
import path from "node:path";
import { render } from "svgbob-wasm/svgbob_wasm.js";

const CONTENT = process.argv[2];
const DRY = process.argv.includes("--dry");
const BOX = /[┌└┐┘│├┤┬┴┼─═║╔╗╚╝]/;

function styleSvg(svg) {
  // white canvas + responsive + subtle frame, so it reads in light & dark themes
  svg = svg.replace(/<svg ([^>]*)>/, (m, attrs) =>
    `<svg ${attrs} style="background:#ffffff;border:1px solid #e5e5e5;border-radius:8px;max-width:100%;height:auto">`);
  svg = svg.replace(/(<svg[^>]*>)/, `$1<rect x="0" y="0" width="100%" height="100%" fill="#ffffff"/>`);
  return svg;
}

function walk(dir) {
  let out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out = out.concat(walk(p));
    else if (e.name.endsWith(".md")) out.push(p);
  }
  return out;
}

let totalDiagrams = 0, totalFiles = 0, converted = 0;
for (const md of walk(CONTENT)) {
  const src = fs.readFileSync(md, "utf8");
  const lines = src.split("\n");
  const base = path.basename(md, ".md");
  const dir = path.dirname(md);
  const assetsDir = path.join(dir, "assets");
  let out = [], i = 0, n = 0, fileChanged = false;

  while (i < lines.length) {
    const line = lines[i];
    const fence = line.match(/^(\s*)```/);
    if (fence) {
      // collect until closing fence
      let j = i + 1, body = [];
      while (j < lines.length && !/^\s*```/.test(lines[j])) { body.push(lines[j]); j++; }
      const block = body.join("\n");
      if (BOX.test(block)) {
        n++; totalDiagrams++;
        if (!DRY) {
          let svg;
          try { svg = styleSvg(render(block)); }
          catch (err) { out.push(line, ...body, lines[j] ?? "```"); i = j + 1; console.warn("  ! render failed in", md, err.message); continue; }
          fs.mkdirSync(assetsDir, { recursive: true });
          const fname = `${base}-${n}.svg`;
          fs.writeFileSync(path.join(assetsDir, fname), svg);
          out.push(`![${base} diagram ${n}](assets/${fname})`);
          converted++;
        } else {
          out.push(line, ...body, lines[j] ?? "```");
        }
        fileChanged = true;
        i = j + 1; // skip past closing fence
        continue;
      } else {
        // not a diagram — keep the whole fenced block verbatim
        out.push(line, ...body); if (j < lines.length) out.push(lines[j]); i = j + 1; continue;
      }
    }
    out.push(line); i++;
  }
  if (fileChanged) { totalFiles++; if (!DRY) fs.writeFileSync(md, out.join("\n")); }
}
console.log(`${DRY ? "[DRY] " : ""}files with diagrams: ${totalFiles}, diagrams: ${totalDiagrams}, SVGs written: ${converted}`);
