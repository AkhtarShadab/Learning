# AgentDesk — Upstream v0.1.1 → v0.1.2 New Features & Fixes

> Documents all functional changes added in upstream AgentDesk between the fork's last sync point (v0.1.1, commit `6739c30`) and the current upstream HEAD (`4b78d30`).
> Synced on: 2026-05-03

---

## Overview of Changes

| # | Area | Commits | Impact |
|---|---|---|---|
| 1 | **Cron Skill Overhaul** | `698c0fc` | High — agents can now fully manage cron jobs from skills |
| 2 | **Scheduler Bug Fixes** | `c428105` | High — project pause + per-job toggle were both broken |
| 3 | **Chat File Link Fix** | `266d9a8` | Medium — View file links in tool-call bubbles no longer 404 |
| 4 | **Chat Clear + Camoufox Profile** | `e103144` | Medium — clear button now works; browser sessions persist |
| 5 | **Notion MCP Path Fix** | `033bedc` | Medium — Notion tools now work reliably in scheduled jobs |
| 6 | **Telegram/CC Import Fix** | `0747a1a` | Low — eliminates flaky module-not-found errors |

---

## 1. Cron Skill Overhaul

**Commit:** `698c0fc` — fix(skill): repair ad-cron-create + steer agents away from built-in scheduler

### What Was Broken

`ad-cron-create` was returning HTTP 400 on **every single call**. The script was sending the wrong field names to the API:

```bash
# What the script sent (wrong):
{ "projectId": "...", "agentId": "...", "name": "...", "schedule": "...", "enabled": true }

# What the API actually expects:
{ "projectId": "...", "agent": "...", "name": "...", "cron": "...", "disabled": false }
```

Field mapping was off on 3 keys: `agentId` → `agent`, `schedule` → `cron/every/at`, `enabled` → `disabled`. The success path also used `.cron` in jq when the field doesn't exist in the response — it silently returned null.

### What Was Added

**5 new cron skill scripts** — before this PR agents had only `ad-crons` (list) and `ad-cron-create`. They had no way to inspect, update, delete, or manually run a job:

| New Script | API Call | Purpose |
|---|---|---|
| `ad-cron <id>` | `GET /crons/:id` | View a single cron job's details |
| `ad-cron-update <id> [flags]` | `PATCH /crons/:id` | Update name, schedule, model, label, enabled state |
| `ad-cron-delete <id>` | `DELETE /crons/:id` | Remove a cron job |
| `ad-cron-run <id>` | `POST /crons/:id/run` | Trigger a job manually right now |
| `ad-cron-runs <id>` | `GET /crons/:id/runs` | View run history for a job |

**Flag form added to `ad-cron-create`** — previously only cron expressions were supported. Agents needing a one-shot job (`--at`) or an interval (`--every`) had no skill-level path and fell back to hand-rolling curl:

```bash
# Old (positional, cron-only):
ad-cron-create <projectId> <agentId> "job name" "0 9 * * *"

# New flag form (supports all schedule types):
ad-cron-create \
  --project <projectId> \
  --agent <agentId> \
  --name "Daily summary" \
  --every "24h" \
  --message "Generate a summary of today's tasks" \
  --session isolated

ad-cron-create \
  --project <projectId> \
  --agent <agentId> \
  --name "One-shot deploy" \
  --at "2026-06-01T09:00:00Z"
```

**jq fallback for global installs** — the existing walk-up from the script directory found bundled jq in dev (script lives inside repo → walks up to `node_modules/node-jq`). It silently failed after `npm i -g` because the skill is copied to `~/.claude/skills/agent-desk/` which has no ancestral relationship to the npm-global tree. Fix: adds `npm root -g` as a second lookup and prepends the bundled jq dir to PATH.

**Agents guided away from built-in scheduler** — guidance added to `CLAUDE.md`, `TOOLS.md`, and `SKILL.md` explicitly telling agents to use `ad-cron-create` instead of Claude Code's built-in `ScheduleWakeup`. Jobs scheduled outside AgentDesk are invisible to the dashboard, can't be paused, and have no audit trail.

### What It Means for You

- `ad-cron-create` now works reliably on both dev and global installs
- Agents can do full CRUD on cron jobs from the terminal
- One-shot and interval jobs can be created from skills (not just cron expressions)

---

## 2. Scheduler Bug Fixes

**Commit:** `c428105` — fix(scheduler): pause-project gate, per-job toggle save, dual-cache singleton

### Three Bugs Fixed

#### Bug 1: Project Pause Didn't Stop Scheduled Jobs

When a project was paused from the dashboard, task dispatching stopped — but scheduled cron jobs for that project kept firing. `fireJob()` had no gate for project status.

**Fix:** `fireJob()` now resolves the linked project before executing and short-circuits with a `skipped` run row when `projects.status = 'paused'`. Applies to both automatic timer-fired runs and manual "Run now" clicks.

#### Bug 2: Per-Job Enable/Disable Was Silently Failing

The cron edit modal sent `{ disabled: true }` on PATCH. The API's allowlist only accepts `enabled` and returned 400 "Unknown fields: disabled". The store swallowed the error and toasted success anyway — so the toggle appeared to work but the job kept running.

**Fix:** The modal now sends `enabled` (not `disabled`) on edit. Failures surface as error toasts instead of being swallowed.

**UI addition:** A **Pause Project** pill was also added to the Schedule page, matching the pill already on the Kanban filter bar. Both now toggle `projects.status` consistently.

#### Bug 3: Disabling a Job Didn't Stop Its Timer

Even after fixing Bug 2, disabling a job didn't actually stop it. The scheduler singleton was stored in a module-level `let _scheduler`. In the same server process, `tsx` (which starts the HTTP server) and webpack (which bundles Next.js API routes) each evaluate `scheduler.ts` independently — so there were **two instances** with separate timer maps.

Calling `disableJob()` cleared the webpack instance's empty handles map. The live `setInterval` lived on the tsx instance and kept firing indefinitely.

**Fix:** Singleton pinned to `globalThis` (same pattern used for ChatBridge fix in the same release). Also added a belt-and-suspenders `enabled === 1` check at the top of `fireJob()`.

### What It Means for You

- Pausing a project now stops all its scheduled jobs too
- The enable/disable toggle in the schedule UI actually works
- Cron timers respect disable state across module boundaries

---

## 3. Chat File Link Fix

**Commit:** `266d9a8` — fix(chat): map agent absolute paths to project-relative for View file link

### What Was Broken

When an agent opened or wrote a file, the tool-call bubble showed a "View file" link. Clicking it 404'd silently. The problem: agents emit **absolute paths** (e.g. `/home/shadab/.agent-desk/projects/agentdesk/docs/foo.md`) but the file explorer's `findDocByPath` matches by **slug-relative path** (e.g. `agentdesk/docs/foo.md`).

The link was also rendered for paths outside the project directory — paths the file explorer can never open.

### The Fix

`GET /api/v1/projects/:id` now returns `contextDir` (the absolute path to the project's files directory). The chat panel uses this to:

1. **Suppress the link** when the file path is outside `contextDir` (the explorer can't open it)
2. **Translate inside-project paths** from absolute to `<slug>/<relative>` so `findDocByPath` matches correctly

### What It Means for You

- "View file" links in agent tool-call bubbles now work
- No stale links shown for files the explorer can't reach

---

## 4. Chat Clear Button + Camoufox Profile Persistence

**Commit:** `e103144` — fix(chat,camoufox): clear-button persistence + camoufox profile

### Bug 1: Chat Clear Button Didn't Persist After Refresh

The "Clear" button correctly nulled `agents.cc_session_id` in the DB. But after a browser refresh the old chat history reappeared.

**Root cause:** Two `ChatBridge` instances existed in the same process. `server.ts` (loaded by tsx) and `/api/v1/chat/reset` (loaded by Next.js webpack) each evaluated `chat-bridge.ts` separately, creating independent module-scope `_bridge` singletons.

`resetSessionForKey()` cleared the API-route bridge's `history` and `hydratedKeys` maps. But the **chat-proxy bridge** — the one that handles `chat.history` over WebSocket — kept its caches. On refresh, `handleHistory` saw `hydratedKeys.has(sessionKey) === true`, skipped re-hydration from disk, and returned stale in-memory history.

**Fix:** Singleton pinned to `globalThis`:
```typescript
// Before:
let _bridge: ChatBridge | null = null;
export function getChatBridge(...) { ... }

// After:
const g = globalThis as typeof globalThis & { __agdeskChatBridge?: ChatBridge };
export function getChatBridge(...) {
  if (!g.__agdeskChatBridge) g.__agdeskChatBridge = new ChatBridge(...);
  return g.__agdeskChatBridge;
}
```

### Bug 2: Camoufox Wiped Browser Profile on Every Restart

Camoufox launched with a fresh ephemeral profile on every server boot — logins, cookies, localStorage, and cache were wiped on each restart. Agents using the browser daemon for authenticated sessions (Gmail, LinkedIn, etc.) had to log in again after every server restart.

**Fix:** A persistent `user_data_dir` is now passed to the Camoufox daemon:
- **Path:** `~/.agent-desk/camoufox-profile/` (created automatically if missing)
- **Effect:** Browser profile (cookies, sessions, cache) survives server restarts

> Note: `camoufox-js` returns a `BrowserContext` instead of a `Browser` when `user_data_dir` is set. Both expose `.newPage()` and `.close()`, so no other changes were needed.

### What It Means for You

- The Clear chat button actually clears history and stays cleared after refresh
- Authenticated browser sessions (logged-in sites) survive server restarts — no re-login needed

---

## 5. Notion MCP Path Fix

**Commit:** `033bedc` — fix(notion-mcp): resolve cli path via fs walk instead of require.resolve

### What Was Broken

Notion's MCP server is injected into each agent's Claude Code session via a stdio config:

```typescript
{
  notion: {
    command: 'npx',
    args: ['@notionhq/notion-mcp-server/bin/cli.mjs', '--token', token],
  }
}
```

The path to `cli.mjs` was resolved using `require.resolve('@notionhq/notion-mcp-server/bin/cli.mjs')`. webpack rewrites `require.resolve(literalSpec)` into a **numeric module id** at build time. In production, `args[0]` became a number like `4891` instead of a file path string.

Claude Code's MCP schema validator requires `args: string[]` — it rejected the numeric id and the Notion tools were silently unavailable on every **scheduler-triggered** run. (Chat sessions didn't hit this because they resume a saved session ID and skip MCP re-validation.)

### The Fix

Replaced `require.resolve()` with a pure fs-walk using `fs.existsSync` and `path.join`. Walking up the directory tree with native fs ops is invisible to webpack's module-resolution analysis — the resolved path stays a real filesystem string in both dev and production builds:

```typescript
// Before (webpack mangles this):
const cliPath = require.resolve('@notionhq/notion-mcp-server/bin/cli.mjs');

// After (webpack-safe):
function findCliMjs(startDir: string): string | null {
  let dir = startDir;
  while (true) {
    const candidate = path.join(dir, 'node_modules/@notionhq/notion-mcp-server/bin/cli.mjs');
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}
const cliPath = findCliMjs(process.cwd());
```

### What It Means for You

- Notion tools (search, read page, create page, etc.) now work reliably in **scheduled jobs**, not just in interactive chat
- No more silent MCP validation failures on cron runs

---

## 6. Telegram / Claude Code Dynamic Import Fix

**Commit:** `0747a1a` — fix(telegram,cc): resolve `@/lib` aliases at module load, not at runtime

### What Was Broken

Two places used dynamic `await import('@/lib/...')` for lazy loading:

1. `TelegramService.flushMessageBuffer()` — lazy-imported the SessionPool
2. `ClaudeCodeAdapter.chatCompletion()` — lazy-imported the chat bridge

Static `@/` imports are resolved by `tsconfig-paths/register` at startup. But **dynamic `await import()`** goes through Node's native ESM resolver, which has no knowledge of tsconfig path aliases. This caused a flaky `Cannot find package '@/lib'` error from the long-lived tsx server process, depending on whether some other code path had already cached the target module.

### The Fix

**Telegram service:** Imports hoisted to top-level statics. There was no platform-gating reason to keep them lazy.

**ClaudeCode adapter:** The lazy-load was intentional (adapters/index.ts must not drag in the SDK on non-ClaudeCode installs). Kept lazy but switched to a **relative-path** dynamic import:

```typescript
// Before (breaks in long-lived tsx process):
const { getChatBridge } = await import('@/lib/claudecode/chat-bridge');

// After (Node resolves relative paths without tsconfig hooks):
const { getChatBridge } = await import('../../lib/claudecode/chat-bridge.js');
```

> Next.js API routes using the same pattern are unaffected — Next's bundler resolves `@/` aliases for both static and dynamic imports.

### What It Means for You

- No more random `Cannot find package '@/lib'` errors in long-running server sessions
- Telegram message flushing and Claude Code adapter are both more reliable

---

## Summary: Key Patterns from This Release

Three recurring architectural patterns were fixed across these commits:

### Pattern 1: globalThis Singleton for Cross-Module-Boundary Singletons
**Applies to:** ChatBridge, Scheduler
When a singleton needs to be shared between `tsx` (server.ts) and webpack (Next.js API routes) in the same process, module-level `let _instance` creates separate instances per evaluator. Solution: pin to `globalThis`.

### Pattern 2: Avoid webpack-Sensitive APIs for Path Resolution
**Applies to:** Notion MCP
`require.resolve()` and `import.meta.resolve()` are rewritten by webpack at build time. For filesystem path resolution that needs to work in both dev and production, use plain `fs.existsSync` + `path.join` walks anchored on `process.cwd()`.

### Pattern 3: Static Imports > Dynamic Imports for tsconfig Aliases
**Applies to:** Telegram, ClaudeCode adapter
`@/` path aliases work in static imports (resolved at startup by `tsconfig-paths/register`) but break in dynamic `await import()` under Node's native ESM resolver. Either hoist to static imports or switch to relative paths for dynamic imports.

---

## DSA Connections

### Singleton via Global Symbol Table — The `globalThis` Fix

A **singleton** ensures exactly one instance of a class or resource exists in a program, typically accessed through a global registry. The dual-instance bugs in ChatBridge and Scheduler (Bugs #2 and #4) are a textbook singleton violation: `tsx` (the HTTP server runtime) and webpack (the Next.js bundler) each evaluate the same module file independently, creating two module-scope `let _instance` singletons with separate state. This is analogous to having two hash maps with the same keys but different values — operations on one are invisible to the other. The fix — pinning to `globalThis` — uses JavaScript's global symbol table as a process-wide registry, guaranteeing that `globalThis.__agdeskChatBridge` resolves to the same object regardless of which module evaluator accesses it. In DSA terms, `globalThis` acts as a single shared hash map keyed by property name, providing O(1) lookup with guaranteed uniqueness across all execution contexts in the same Node.js process.

### Trie / Path Prefix Matching — File Path Resolution

A **trie** (prefix tree) is a tree structure where each node represents a character (or path segment), enabling efficient prefix-based search and longest-prefix matching. The Chat File Link Fix (#3) solves a path-matching problem: agent tool calls emit absolute paths (`/home/shadab/.agent-desk/projects/agentdesk/docs/foo.md`), but the file explorer indexes by slug-relative paths (`agentdesk/docs/foo.md`). The fix uses `contextDir` as a prefix — if the absolute path starts with this prefix, strip it to get the relative path; otherwise, suppress the link entirely. This is a single-level trie match: the `contextDir` prefix partitions all filesystem paths into "inside project" (matchable) and "outside project" (unmatchable). The Notion MCP path fix (#5) uses a similar upward fs-walk — starting from `process.cwd()`, it walks parent directories checking for `node_modules/@notionhq/notion-mcp-server/bin/cli.mjs`, which is equivalent to traversing a trie of directory segments from leaf to root until a match is found.

### Timer Wheel — Cron Job Scheduling & Lifecycle

A **timer wheel** is a data structure for managing many timers efficiently, typically using a circular array of "slots" where each slot holds timers expiring in a specific time range. AgentDesk's scheduler manages three types of timers (`every` → `setInterval`, `cron` → `node-cron`, `at` → `setTimeout`), each stored in an in-memory handle map keyed by job ID. The Scheduler Bug Fixes (#2) exposed a critical timer-lifecycle issue: disabling a job called `clearInterval()` on the wrong instance's handle map (the webpack instance), while the live timer continued firing on the tsx instance. This is the timer wheel's cancellation problem — you must cancel the exact timer handle you registered, not a copy. The belt-and-suspenders fix (checking `enabled === 1` inside `fireJob()`) adds a guard that's equivalent to a "dead timer" check in a timer wheel: even if the timer fires, the callback verifies the job is still active before executing, preventing stale timers from doing work.

### Dependency Graph — Module Resolution & Import Order

A **dependency graph** is a directed graph where nodes are modules and edges represent import relationships; cycles or incorrect resolution can cause load-order bugs. Three of the six fixes in this release stem from dependency graph issues: (1) The Cron Skill's `jq` binary resolution walked up the directory tree from the script location to find `node_modules/node-jq` — this walk follows the Node.js module resolution algorithm, which traverses the directory ancestry graph. After `npm i -g`, the skill script lands in `~/.claude/skills/` which has no ancestral path to the npm-global `node_modules` — a broken edge in the dependency graph. The fix adds `npm root -g` as an alternative traversal root. (2) The Telegram/CC dynamic import fix (#6) addresses a mismatch between Node's native ESM resolver (which doesn't know about tsconfig path aliases) and the static import resolver (which does). Switching to relative paths gives Node a concrete edge in the dependency graph instead of an alias that only one resolver understands.

### Hash Map Key Collision (Logical) — Dual-Cache Singleton Bugs

A **hash map collision** occurs when two distinct keys map to the same bucket; a **logical collision** occurs when two separate maps hold entries for the same logical key, creating ambiguity about which is authoritative. The dual-instance bugs (ChatBridge in #4, Scheduler in #2) are logical key collisions: both the tsx and webpack module evaluators create their own `Map` instances, and both insert entries keyed by the same agent IDs or job IDs. When code in one execution context (e.g., the API route handler) performs `map.delete(jobId)`, it deletes from its local map — but the authoritative timer lives in the other map. This is functionally identical to a distributed cache inconsistency problem: two caches hold the same key but can diverge silently. The `globalThis` fix collapses both maps into one, eliminating the possibility of logical collisions — all readers and writers operate on the same underlying hash map.

---
