# Learning — Project Structure & Operations

This repo is a personal knowledge base of deep-dive engineering notes, published as a
website. Markdown notes are converted to HTML, fully indexed for search, and rendered
with an **Obsidian-style interactive graph** that lets you traverse the links between
notes. The site is built with **[Quartz v4](https://quartz.jzhao.xyz/)** and served by
Hostinger directly from the repository root.

---

## 1. What the toolchain does

| Requirement | How it's satisfied |
|---|---|
| Markdown → HTML | Quartz parses every `.md` under `content/` and emits a static HTML page per note. |
| Indexing | Quartz emits `static/contentIndex.json`, which powers full-text **search** (the search bar) and the file **Explorer** (left sidebar tree). |
| Obsidian graph traversal | The **Graph** component reads the same index and draws a force-directed graph from the links between notes. Hover a node to highlight neighbours; click to jump. A full-screen graph is available from any page. |
| Publishing to Hostinger | `scripts/publish.mjs` builds the site and mirrors the output to the repo **root** so `index.html` sits at the top level, where Hostinger serves it. |

Graph edges come from the links in your notes — both `[[wikilinks]]` and ordinary
relative Markdown links (`[text](../cloud/basic_learning.md)`). The **more cross-links
you add between notes, the richer the graph becomes.** Backlinks are shown automatically
at the bottom of each page.

---

## 2. Repository layout

```
Learning/
├── content/                 # ← ALL your notes live here (the only folder you edit day-to-day)
│   ├── index.md             # site landing page (was the root README)
│   ├── bridgeonline/        # BridgeOnline build notes (00–12, sessions, guides)
│   └── cloud/               # Cloud & Kubernetes notes (Architecture, MentalModels, kubernetes)
│
├── quartz/                  # Quartz generator source — do not edit
├── quartz.config.ts         # site title, theme, baseUrl, plugins  ← edit baseUrl here
├── quartz.layout.ts         # page layout: Search, Explorer, Graph, TOC, Backlinks
├── scripts/publish.mjs      # build + mirror-to-root + commit + push
├── package.json             # npm scripts (serve / build / deploy)
│
├── index.html, static/, bridgeonline/, cloud/, tags/, ...   # GENERATED site (mirrored to root; committed so Hostinger can serve it)
├── .generated-manifest.json # bookkeeping: which root entries were generated (auto-managed)
│
├── public/                  # raw Quartz build output (gitignored; mirrored to root)
└── node_modules/            # dependencies (gitignored)
```

**Rule of thumb:** you only ever create or edit files inside `content/`. Everything at the
root that looks like a web page is generated — never edit it by hand.

---

## 3. One-time setup (on your machine)

Requires **Node ≥ 22** and **npm ≥ 10.9**.

```bash
# from the repo root
npm install
```

Then set your real domain in `quartz.config.ts`:

```ts
baseUrl: "learning.example.com",   // ← your Hostinger domain, no protocol, no trailing slash
```

> **Heads-up — repair the git index once.** While the repo was prepared, the staging
> index got into a bad state (your commits are fine — only the disposable index was
> affected). On Windows run this once before your first commit:
> ```bash
> del .git\index        &  git reset
> # (Git Bash / macOS / Linux:  rm -f .git/index && git reset)
> ```

---

## 4. Daily workflow

**Write notes** — add or edit `.md` files in `content/`. To wire a note into the graph,
link to others with wikilinks, e.g. `[[04-realtime-socketio]]`, or relative links.

**Preview locally** (hot-reloading server at http://localhost:8080):

```bash
npm run serve
```

**Build only** (emits to `public/`, no deploy):

```bash
npm run build
```

---

## 5. Dispatch / deploy commands

These are the commands that push your changes live to Hostinger.

**One-command deploy** (build → mirror to root → commit → push):

```bash
npm run deploy
```

With a custom commit message:

```bash
node scripts/publish.mjs --push -m "Add notes on consensus and Raft"
```

Build + mirror but **review before pushing yourself**:

```bash
npm run publish-site      # builds and mirrors to root, no git
git add -A
git commit -m "Update notes"
git push
```

After `git push`, Hostinger pulls the repo and serves the refreshed `index.html` and
pages from the root.

---

## 6. Hostinger configuration

1. In hPanel → **Git**, connect this repository (`AkhtarShadab/Learning`), branch `main`.
2. Set the deploy directory so the repo root maps to `public_html` (the site root).
   `index.html` is committed at the repo root, so no build step runs on Hostinger.
3. Point your domain at it and confirm `baseUrl` in `quartz.config.ts` matches that domain.
4. Re-deploy any time with `npm run deploy` locally; pull/auto-deploy on Hostinger picks it up.

> If you'd rather keep generated files out of the repo root, an alternative is to set
> Hostinger's document root to the `public/` folder and commit `public/` instead — then
> you can delete the mirror step. The current setup assumes "`index.html` at the root."

---

## 7. Conventions

- **Why before how.** Each note explains *why* a thing exists before *how* it works.
- **`DOUBTS.md`** files capture open questions worth revisiting.
- **Link generously.** Wikilinks/relative links are what make the graph useful.
- **Drafts.** Add `draft: true` to a note's frontmatter to keep it out of the build.
