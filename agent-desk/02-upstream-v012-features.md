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

### Tree Traversal (DFS) — Filesystem Walk for Module Resolution

A **depth-first search (DFS)** traverses a tree or graph by exploring as far as possible along each branch before backtracking. The Notion MCP fix (Section 5) and the `jq` fallback fix (Section 1) both use a DFS up the filesystem directory tree: starting from the current working directory, the algorithm walks parent-by-parent (`path.dirname(dir)`) checking for `node_modules/@notionhq/notion-mcp-server/bin/cli.mjs` at each level until it either finds the file or reaches the filesystem root. This is a classic DFS on a singly-linked list (each directory has exactly one parent), terminating when `parent === dir` — the root sentinel. The fix was necessary because webpack's static `require.resolve()` performs this same walk at build time and bakes the result into a numeric module ID, which breaks at runtime when the actual filesystem path is needed.

### Singleton Cache with Invalidation — globalThis Deduplication Pattern

A **cache** stores computed results for reuse, and **cache invalidation** is the process of evicting stale entries. The dual-instance bugs fixed in Sections 2 and 4 (Scheduler and ChatBridge) are fundamentally cache coherence problems: `tsx` and webpack each maintained their own cached singleton instance (module-level `let _instance`), creating two independent caches for what should be shared state. The `globalThis` fix establishes a single authoritative cache entry. The `resetSessionForKey()` bug in the ChatBridge was specifically a cache invalidation failure — clearing one cache (`_bridge` in the webpack evaluator) left the other (`_bridge` in the tsx evaluator) serving stale history from its `hydratedKeys` map. This mirrors the "write-invalidate" protocol in CPU caches, where a write to one cache must invalidate all other copies to prevent stale reads.

### Exponential Backoff — Dispatcher Error Escalation

**Exponential backoff** is an algorithm where retry delays increase geometrically after each failure, preventing a failing component from consuming unbounded resources. The dispatcher's error handling (referenced in Section 2's scheduler fixes) implements a stepped variant: Level 0 allows 3 errors before stalling for 2 minutes, Level 1 stalls for 10 minutes after one more error, and Level 2 auto-pauses the agent entirely. The stall durations (0 → 2 min → 10 min → permanent pause) grow super-linearly, which is more aggressive than standard 2^n backoff but appropriate for an autonomous agent system where repeated failures likely indicate a systemic problem (wrong API key, broken system prompt) rather than a transient network blip. The belt-and-suspenders `enabled === 1` check added to `fireJob()` in this release acts as a circuit breaker — a complementary pattern that cuts off execution entirely when the system is in a known-bad state.

*Document created: 2026-05-03 | Based on upstream commits `6739c30`→`4b78d30`*
