#!/usr/bin/env node
/**
 * publish.mjs — build the Quartz site and mirror it to the repo root for Hostinger.
 *
 * Why mirror to root? Hostinger serves this repo's root directory directly, so
 * `index.html` and all generated HTML must live at the top level. Quartz emits
 * into `public/`; this script copies `public/*` up to the root.
 *
 * A manifest (.generated-manifest.json) records exactly which top-level entries
 * were generated last time, so a re-publish removes stale pages WITHOUT ever
 * touching your source folders (content/, quartz/, scripts/, node_modules/).
 *
 * Usage:
 *   node scripts/publish.mjs            # build + mirror only
 *   node scripts/publish.mjs --push     # build + mirror + git add/commit/push
 *   node scripts/publish.mjs --push -m "your commit message"
 */
import { execSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const publicDir = path.join(root, "public")
const manifestPath = path.join(root, ".generated-manifest.json")
const args = process.argv.slice(2)
const doPush = args.includes("--push")
const msgIdx = args.indexOf("-m")
const commitMsg =
  msgIdx !== -1 && args[msgIdx + 1]
    ? args[msgIdx + 1]
    : `Publish site: ${new Date().toISOString()}`

const run = (cmd) => execSync(cmd, { cwd: root, stdio: "inherit" })

// Never delete these, even if a name collides.
const PROTECTED = new Set([
  ".git", "node_modules", "content", "quartz", "scripts", "public",
  "quartz.config.ts", "quartz.layout.ts", "tsconfig.json", "package.json",
  "package-lock.json", "globals.d.ts", "index.d.ts", "README.md", "PROJECT.md",
  ".gitignore", ".gitattributes", ".npmrc", ".prettierrc", ".prettierignore",
  ".node-version", ".generated-manifest.json", ".htaccess",
])

console.log("▶ Building Quartz site ...")
run("npx quartz build")

if (!fs.existsSync(publicDir)) {
  console.error("✘ public/ not found — build failed.")
  process.exit(1)
}

// 1. Remove what the previous publish generated.
let prev = []
try { prev = JSON.parse(fs.readFileSync(manifestPath, "utf8")) } catch {}
for (const name of prev) {
  if (PROTECTED.has(name)) continue
  fs.rmSync(path.join(root, name), { recursive: true, force: true })
}

// 2. Mirror public/* to the repo root.
const generated = []
for (const name of fs.readdirSync(publicDir)) {
  if (PROTECTED.has(name)) {
    console.warn(`⚠ skipping '${name}' (protected name)`)
    continue
  }
  fs.cpSync(path.join(publicDir, name), path.join(root, name), { recursive: true })
  generated.push(name)
}
fs.writeFileSync(manifestPath, JSON.stringify(generated.sort(), null, 2) + "\n")
console.log(`✔ Mirrored ${generated.length} entries to repo root (index.html at root).`)

// 3. Optionally commit and push.
if (doPush) {
  console.log("▶ Committing and pushing ...")
  run("git add -A")
  try {
    run(`git commit -m "${commitMsg.replace(/"/g, '\\"')}"`)
  } catch {
    console.log("ℹ Nothing to commit.")
  }
  run("git push")
  console.log("✔ Pushed. Hostinger will serve the updated site from the repo root.")
} else {
  console.log("ℹ Skipped git push (run with --push to deploy).")
}
