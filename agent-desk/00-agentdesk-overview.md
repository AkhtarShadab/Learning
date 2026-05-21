# AgentDesk: Comprehensive Technical Reference

> **Audience:** Developers who have never seen the codebase before.  
> **Goal:** Provide a full conceptual and implementation-level understanding of AgentDesk — from high-level architecture down to the code that makes each subsystem tick.  
> **Version:** Based on `@zish/agent-desk` v0.1.1  
> **Source:** `/home/shadab/.nvm/versions/node/v24.13.0/lib/node_modules/@zish/agent-desk/`

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Architecture](#2-architecture)
3. [Database Design](#3-database-design)
4. [Agent Model](#4-agent-model)
5. [Heartbeat Mechanism & Dispatcher](#5-heartbeat-mechanism--dispatcher)
6. [Task Lifecycle](#6-task-lifecycle)
7. [Chat & Session System](#7-chat--session-system)
8. [Cron Scheduler](#8-cron-scheduler)
9. [Skills System](#9-skills-system)
10. [LLM Provider & Proxy System](#10-llm-provider--proxy-system)
11. [Integrations](#11-integrations)
12. [Auth & Multi-User](#12-auth--multi-user)
13. [Real-Time & WebSocket Layer](#13-real-time--websocket-layer)
14. [Key Configuration & Directory Layout](#14-key-configuration--directory-layout)
15. [Quick Reference: API Routes](#15-quick-reference-api-routes)

---

## 1. Project Overview

### What is AgentDesk?

AgentDesk is a **self-hosted AI agent orchestration platform**. It wraps the [Claude Code SDK](https://docs.anthropic.com/claude-code) with a web-based Kanban board, task management system, cron scheduler, and real-time dashboard — giving teams a structured way for humans and AI agents to collaborate on long-running projects.

**Core problems it solves:**
- No persistent state between AI agent turns (AgentDesk manages `WORKING.md`, sessions, and DB records)
- No native way to schedule agent work on a clock (AgentDesk's scheduler fires turns at intervals)
- No visibility into what agents are doing across projects (unified dashboard + activity log)
- No multi-provider routing for Claude Code (transparent proxy translates OpenAI ↔ Anthropic shapes)

### Installation & Setup

```bash
npm install -g @zish/agent-desk

agdesk setup          # Interactive first-run: creates owner account, generates secrets
agdesk start          # Start the server on http://localhost:3737
agdesk stop           # Stop the server
agdesk status         # Check running status + port
```

**What `agdesk setup` does:**
1. Generates `AGDESK_SECRET_KEY` (AES-256-GCM credential encryption)
2. Generates `AGDESK_INTERNAL_TOKEN` (HMAC signing for proxy routing)
3. Creates the SQLite database at `~/.claude/agdesk.db`
4. Registers the default `master-agent` agent
5. Writes a `.env` file in the install directory

### Tech Stack

| Layer | Technology |
|-------|-----------|
| UI | Next.js 15 (App Router) + React 19 + Tailwind CSS |
| API | Next.js Route Handlers (`/app/api/v1/`) |
| Realtime | Socket.io (WebSocket upgrade on the same port) |
| ORM | Drizzle ORM (type-safe, zero-runtime-overhead) |
| Database | SQLite (via `better-sqlite3`, WAL mode) |
| AI Sessions | `@anthropic-ai/claude-code` SDK |
| Language | TypeScript throughout |
| Scheduler | In-process: `node-cron` + `setTimeout` |
| Auth | bcryptjs (passwords), AES-256-GCM (credentials) |

---

## 2. Architecture

### System Topology

```
┌──────────────────────────────────────────────────────────────────────────┐
│                         Browser / Telegram                               │
│                      (React UI  •  WebSocket client)                     │
└──────────────────────────────┬───────────────────────────────────────────┘
                               │  HTTP + WebSocket (port 3737)
┌──────────────────────────────▼───────────────────────────────────────────┐
│                         server.ts  (Custom HTTP Server)                  │
│  ┌─────────────────┐  ┌──────────────────┐  ┌───────────────────────┐   │
│  │  Next.js App    │  │  Socket.io Layer  │  │   LLM Proxy Server    │   │
│  │  (UI + API)     │  │  (WS hub + rooms) │  │  (127.0.0.1 only)    │   │
│  └────────┬────────┘  └────────┬─────────┘  └──────────┬────────────┘   │
│           │                   │                         │                │
│  ┌────────▼───────────────────▼─────────────────────────▼────────────┐  │
│  │                        src/lib/                                    │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐ │  │
│  │  │  Dispatcher  │  │  SessionPool │  │  Scheduler (node-cron)   │ │  │
│  │  │  (auto-tick) │  │  (SDK mgmt)  │  │  (cron/every/at jobs)    │ │  │
│  │  └──────┬───────┘  └──────┬───────┘  └────────────┬─────────────┘ │  │
│  │         │                 │                         │               │  │
│  │  ┌──────▼─────────────────▼─────────────────────────▼──────────┐  │  │
│  │  │                   SQLite Database                            │  │  │
│  │  │  (agents, tasks, crons, sessions, providers, integrations)   │  │  │
│  │  └──────────────────────────────────────────────────────────────┘  │  │
│  └────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────┘
                               │
                ┌──────────────▼──────────────────┐
                │   Claude Code SDK Subprocess(es) │
                │   (one per agent per turn)        │
                │   ┌──────────────────────────┐   │
                │   │  ANTHROPIC_BASE_URL env  │   │
                │   │  → proxy (openai-compat) │   │
                │   │  → direct (anthropic)    │   │
                │   └──────────────────────────┘   │
                └──────────────────────────────────┘
```

### Source Directory Map

```
src/
├── app/                        # Next.js App Router
│   ├── api/v1/                 # REST API endpoints
│   │   ├── agents/[id]/        # Agent CRUD + heartbeat + work dispatch
│   │   ├── tasks/[id]/         # Task CRUD + status + subtasks + comments
│   │   ├── projects/[id]/      # Project CRUD
│   │   ├── crons/[id]/         # Cron job CRUD + run + history
│   │   ├── providers/[id]/     # LLM provider CRUD + test + refresh
│   │   └── integrations/       # Notion + Telegram endpoints
│   ├── agents/                 # UI: agent list + detail pages
│   ├── settings/               # UI: integrations, providers, invite
│   └── layout.tsx              # App shell (auth guard)
│
├── lib/
│   ├── claudecode/
│   │   ├── session-pool.ts     # Persistent SDK session manager  ← CORE
│   │   ├── dispatcher.ts       # Autonomous agent heartbeat loop ← CORE
│   │   ├── chat-bridge.ts      # WebSocket ↔ SessionPool bridge  ← CORE
│   │   └── scheduler.ts        # Cron/every/at job executor      ← CORE
│   ├── db/
│   │   ├── schema.ts           # Drizzle ORM table definitions
│   │   └── index.ts            # DB init, migrations, boot logic ← CORE
│   ├── proxy/
│   │   ├── handler.ts          # HTTP request interceptor        ← CORE
│   │   └── translator.ts       # Anthropic ↔ OpenAI transforms   ← CORE
│   ├── providers/
│   │   ├── service.ts          # Provider CRUD + env builder
│   │   └── presets.ts          # Hard-coded provider presets
│   ├── auth.ts                 # Session tokens, bcrypt, rate-limit
│   ├── api-auth.ts             # API actor resolution
│   ├── notion/                 # Notion MCP bridge
│   ├── telegram/               # Telegram bot service
│   └── ws/hub.ts               # WebSocket broadcast hub
│
├── components/                 # React UI components
├── hooks/                      # React hooks
└── stores/                     # Zustand client state

server.ts                       # Custom HTTP server (file watcher, WS, proxy)
skills/agent-desk/              # Agent-side bash skill scripts
```

---

## 3. Database Design

**Engine:** SQLite via `better-sqlite3`, WAL mode enabled, foreign keys on.  
**ORM:** Drizzle ORM — types derived from schema, zero abstraction cost.  
**File:** `src/lib/db/schema.ts` (tables) + `src/lib/db/index.ts` (boot/migrations)

### Users & Auth

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `users` | Human accounts | `id`, `email`, `passwordHash` (bcrypt), `role` (`owner`/`member`) |
| `authSessions` | Browser login tokens | `id` (UUID token), `userId`, `expiresAt` (30-day TTL) |
| `invites` | Invite links | `id` (code), `email`, `role`, `expiresAt` (7-day), `usedAt`, `projectIds` (JSON) |
| `projectMembers` | Project access ACL | `projectId`, `userId`, `role` |

### Agents & Providers

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `agents` | Registered agents | `id`, `title`, `role`, `ccSessionId` (SDK session ID), `providerId`, `model`, `paused` |
| `providers` | LLM provider configs | `id`, `presetKey`, `type` (`anthropic-native`/`anthropic-compat`/`openai-compat`), `credentialEncrypted` (AES-256-GCM), `baseUrl`, `isDefault` |

### Tasks & Collaboration

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `projects` | Kanban projects | `id`, `slug`, `name`, `mission`, `status` |
| `tasks` | Work items | `id`, `projectId`, `title`, `description`, `deliverableDescription`, `status`, `assigneeId`, `priority` (0–3), `paused` |
| `subtasks` | Task checklists | `id`, `taskId`, `title`, `done` |
| `comments` | Markdown comments | `id`, `taskId`, `authorType` (`agent`/`user`/`system`), `authorId`, `content`, `replyToId` |
| `mentions` | @mention index | `id`, `commentId`, `taskId`, `mentionedId`, `mentionedType` |
| `activities` | Audit log | `id`, `taskId`, `actorId`, `actorType`, `type`, `payload` (JSON) |
| `taskContexts` | Task ↔ file links | `taskId`, `filePath` |

### Claude Code Platform

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `ccCrons` | Scheduled jobs | `id`, `name`, `agentId`, `scheduleKind` (`every`/`cron`/`at`), `scheduleValue`, `sessionTarget` (`isolated`/`main`), `payloadMessage`, `enabled` |
| `ccCronRuns` | Job run history | `id`, `jobId`, `status` (`running`/`success`/`error`/`missed`), `triggeredAt`, `finishedAt`, `durationMs`, `summary`, `error` |
| `ccChatTabs` | Agent sub-tabs | `id`, `agentId`, `name`, `sessionId` (SDK session), `createdAt` |
| `agentRuns` | Dispatcher firings | `id`, `agentId`, `ccSessionId`, `status`, `triggeredAt`, `finishedAt` |

### Integrations

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `telegramConfig` | Bot configuration | `botToken` (encrypted), `mode` (`polling`/`webhook`), `webhookUrl` |
| `telegramLinkCodes` | `/connect` flow codes | `id` (6-char hex), `userId`, `expiresAt` (10-min), `used` |
| `telegramLinks` | User ↔ Telegram chat | `userId`, `telegramChatId`, `selectedAgentId` |
| `notionConnections` | Per-user Notion auth | `userId`, `accessToken` (AES-256-GCM encrypted), `workspaceName` |

### Migration System

The database uses a hybrid migration approach:
1. **Drizzle SQL migrations** (`drizzle/*.sql`) — structural changes, run at boot
2. **Imperative versioned migrations** — in `src/lib/db/index.ts`, tagged by date string, run once and recorded in `appConfig` table (key/value store)

```typescript
// Pattern used for imperative migrations:
if (tableExists('agents') && !hasAppliedMigration('2026-04-mc-operator-to-master-agent')) {
  db.transaction(() => {
    // ... rename mc-operator → master-agent in DB + cascade FKs
    // ... rename filesystem dirs + patch YAML frontmatter
  });
  recordMigration('2026-04-mc-operator-to-master-agent');
}
```

---

## 4. Agent Model

### What is an Agent?

An agent is:
1. **A database row** in the `agents` table (`src/lib/db/schema.ts`)
2. **A Markdown file** on disk at `~/.claude/agents/<id>.md` (loaded as system prompt by Claude Code SDK)
3. **A workspace directory** at `~/.claude/agent-desk-agents/<id>/` (Claude Code's CWD for this agent)
4. **A persistent SDK session** identified by `agents.ccSessionId`

### Agent Roles

| Role | Typical Use |
|------|-------------|
| `orchestrator` | Decomposes goals, routes work to specialists, reviews deliverables |
| `worker` | Executes scoped tasks in a domain (frontend, legal, research, etc.) |
| (custom) | User-defined free-form role |

The `master-agent` that ships with every install has `role: orchestrator`. It is the **first point of contact** for all user requests and the **fallback executor** when no specialist fits.

### Registration Flow

1. User creates an agent via the dashboard (`POST /api/v1/agents`)
2. AgentDesk writes `~/.claude/agents/<id>.md` (YAML frontmatter + identity prose)
3. AgentDesk creates `~/.claude/agent-desk-agents/<id>/CLAUDE.md` (project config auto-loaded by SDK)
4. Agent appears on the board and is immediately available for task assignment

### Dispatch Eligibility

An agent is eligible for a dispatcher turn when **all** of:

- `agents.paused = false`
- Not currently running (in-memory check)
- Not error-stalled (`stalledUntil[agentId] > now`)
- Last run > `POST_RUN_COOLDOWN_MS` (60 s) ago
- Has real work (assigned tasks, review feedback, or @mentions)

### The `master-agent` Concept

`master-agent` is the default orchestrator. Its defining properties:
- It is the only agent on a fresh install
- It receives all undirected user messages
- Its `CLAUDE.md` at `~/.claude/agent-desk-agents/master-agent/CLAUDE.md` defines the heartbeat loop, task ownership rules, and guardrails
- It was formerly called `mc-operator` (renamed by a 2026-04 DB migration)

---

## 5. Heartbeat Mechanism & Dispatcher

**File:** `src/lib/claudecode/dispatcher.ts`

### Why Heartbeats?

Claude Code SDK sessions are **stateless between turns** — each turn is a fresh call unless the session ID is preserved. The dispatcher provides the "always-on" illusion: it periodically fires a turn for each eligible agent with a synthesized prompt describing their current work queue.

### Tick Rate (Adaptive)

The dispatcher uses three speeds to balance responsiveness vs. compute cost:

| State | Interval | Trigger |
|-------|----------|---------|
| Active | 15 s | System is busy, agents recently ran |
| Cooling | 45 s | Last activity was 2 min ago |
| Idle | 90 s | No activity in 5 min |

This means when agents are actively working, the dispatcher checks every 15 seconds. When nothing is happening, it backs off to 90 seconds.

### What Counts as "Work"?

The dispatcher queries the DB for each agent and checks three work types:

1. **Assigned tasks** — `status IN (assigned, planning, in-progress)` assigned to this agent
2. **Review feedback** — `status = review` + a human posted a new comment since agent last replied
3. **Mentions** — Agent `@mentioned` on any task (even ones it doesn't own)

### Heartbeat Prompt (Built Dynamically)

When work is found, the dispatcher builds a prompt like this:

```
You have work waiting in AgentDesk. Load the `agent-desk` skill and handle the items below —
the dispatcher has already checked eligibility, so you do not need to run `ad-projects` /
`ad-tasks` discovery yourself.

### Assigned tasks — your responsibility
- "Build login page" (task `abc123`, project "MyApp", status: in-progress)

For each:
  1. `ad-task <id>` to read full details and recent comments.
  2. Transition status if appropriate (assigned → planning → in-progress → review).
  3. Do the actual work. Post a progress comment every 2–3 steps.
  4. When complete, move to `review`. Do NOT move to `done`.
  5. If stuck, ad-pause task <id> <agent-id> "reason".
  6. NEVER post "check-in" or "still waiting" comments.

Session budget: ~10 minutes / ~15 tool calls. Save state to WORKING.md before stopping.
If everything is already handled, reply HEARTBEAT_OK.
```

The agent receives this as a "user turn" in its Claude Code session.

### Error Handling & Escalating Backoff

```
Level 0 (no errors)
  → 3 consecutive errors → Level 1: stall 2 min (skip this agent)

Level 1 (stall 2 min)
  → 1 more error → Level 2: stall 10 min

Level 2 (stall 10 min)
  → 1 more error → AUTO-PAUSE: sets agents.paused = true in DB
                   (human must re-enable from dashboard)

Any success resets counter and level to 0.
Hard timeout: 10 min per turn (AbortController.abort()).
```

### `ad-stagger` — Preventing Thundering Herd

When multiple agents have heartbeats set to the same interval, they would all fire simultaneously. The `ad-stagger` skill script adds a random jitter delay before the agent starts its work loop, spreading the load across the tick window.

```bash
# Inside an agent's HEARTBEAT.md:
bash skills/agent-desk/ad-stagger --window 60   # Sleep 0–60s randomly
```

### Global Pause Toggle

The entire dispatcher can be frozen without stopping the server:

```typescript
// src/lib/claudecode/dispatcher.ts
export function getDispatcherPaused(): boolean {
  const row = db.select().from(appConfig)
    .where(eq(appConfig.key, 'dispatcher.paused')).get();
  return row?.value === 'true';
}
```

Accessible from the dashboard's Settings → Agents panel or via `ad-pause all-agents`.

---

## 6. Task Lifecycle

### State Machine

```
          ┌──────────┐
          │  (todo)  │   ← Created but unassigned
          └────┬─────┘
               │ assigned
          ┌────▼─────┐
          │ assigned │   ← Agent sees it, must acknowledge
          └────┬─────┘
               │ planning
          ┌────▼──────┐
          │ planning  │   ← Agent analyzes, may create subtasks
          └────┬──────┘
               │ in-progress
          ┌────▼─────────┐
          │  in-progress │   ← Active execution
          └────┬─────────┘
               │ submit (ad-submit)
          ┌────▼──────┐
          │  review   │   ← Human reviews deliverable
          └────┬──────┘
          ┌────┴────────────────┐
          │                     │
    ┌─────▼──────┐        ┌─────▼────────┐
    │    done    │        │   rejected   │
    │ (human     │        │ (agent fixes │
    │  approves) │        │  + resubmits)│
    └────────────┘        └─────┬────────┘
                                │ back to in-progress
                                └──────────────────────┐
                                                       │
                                                 (agent fixes)
```

Any state can also be **paused**: `tasks.paused = true`. Paused tasks are excluded from the dispatcher's work queue until a human resumes them.

### Key Operations

| Operation | Agent Command | API |
|-----------|--------------|-----|
| Acknowledge | `ad-status <id> planning` | `PATCH /tasks/:id/status` |
| Begin work | `ad-status <id> in-progress` | `PATCH /tasks/:id/status` |
| Add subtasks | `ad-plan <id> <agentId> "s1" "s2"` | `POST /tasks/:id/plan` |
| Mark subtask done | `ad-subtask-done <id> "title"` | `PATCH /subtasks/:id` |
| Post update | `ad-comment <id> <agentId> "msg"` | `POST /tasks/:id/comments` |
| Submit | `ad-submit <id>` | `POST /tasks/:id/submit` |
| Pause (stuck) | `ad-pause task <id> <agentId> "reason"` | `PATCH /tasks/:id` + comment |
| Progress note | `ad-progress <id> <agentId> "update"` | `POST /tasks/:id/comments` |

### Subtasks

Subtasks are lightweight checklists within a task. Agents create them during planning and mark them done during execution:

```bash
# Create subtasks in bulk (planning phase)
bash skills/agent-desk/ad-plan aed95ff46c9e "master-agent" \
  "Explore codebase" \
  "Write section 1-5" \
  "Write section 6-11" \
  "Upload document"

# Mark one done
bash skills/agent-desk/ad-subtask-done aed95ff46c9e "Explore codebase"
```

### Mentions

When a comment contains `@master-agent` (or any agent ID), the system:
1. Inserts a row into the `mentions` table
2. The dispatcher's `hasWork()` check surfaces this as `mentionWork`
3. The agent is triggered even if it has no assigned tasks

---

## 7. Chat & Session System

### SessionPool — Persistent SDK Sessions

**File:** `src/lib/claudecode/session-pool.ts`

The SessionPool is the bridge between AgentDesk and the Claude Code SDK. It manages a pool of persistent sessions so the system prompt is loaded once and reused across turns.

#### Session ID Persistence

On the **first turn** for an agent, the SDK emits a `system/init` event containing a `sessionId`. SessionPool stores this in `agents.ccSessionId`. On subsequent turns, it passes `Options.resume = sessionId` to resume the same conversation thread.

#### Per-Agent Locking

To prevent concurrent writes to the same SDK session (which would corrupt the conversation), SessionPool uses a promise-chain lock per agent:

```typescript
// src/lib/claudecode/session-pool.ts (simplified)
const inFlightByAgent = new Map<string, Promise<unknown>>();

async function withAgentLock<T>(agentId: string, fn: () => Promise<T>): Promise<T> {
  const prev = inFlightByAgent.get(agentId) ?? Promise.resolve();
  let release: () => void;
  const mySlot = new Promise<void>(r => { release = r; });
  inFlightByAgent.set(agentId, prev.then(() => mySlot));
  try {
    await prev;       // Wait for any prior turn to finish
    return await fn();
  } finally {
    release!();       // Unblock the next turn
  }
}
```

This means:
- **Same agent**: turns are serialized (FIFO queue)
- **Different agents**: turns run in parallel (no shared SDK state)

#### Three Send Modes

| Mode | Function | Use Case |
|------|----------|---------|
| Streaming | `sendTurn(agentId, text, opts)` | Interactive chat (ChatBridge) |
| Synchronous | `sendTurnAndCollect(agentId, text, opts)` | Cron jobs needing a return value |
| Isolated | `sendIsolatedTurnAndCollect(agentId, text, opts)` | Background jobs (ephemeral, no lock) |

**Isolated mode** is critical for background jobs: it creates a **fresh ephemeral session** that doesn't pollute the agent's main chat history and doesn't queue behind interactive turns.

#### Environment Isolation Per Agent

Each SDK subprocess gets a tailored environment:

```typescript
const childEnv = await buildEnvForAgent(
  { providerId: agentRow?.providerId ?? null },
  process.env,        // Parent env as base
  localProxyUrl,      // http://127.0.0.1:<proxy-port>
);
childEnv.AGDESK_AGENT_ID = agentId;  // Injected for skill scripts
```

The SDK reads `ANTHROPIC_API_KEY` and `ANTHROPIC_BASE_URL` from this env. For non-Anthropic providers, the proxy URL is substituted.

#### SessionEvent Types

The pool normalizes raw SDK events into a clean union type:

```typescript
export type SessionEvent =
  | { kind: 'init';           sessionId: string }
  | { kind: 'assistant-text'; text: string; usage?: TokenUsage }
  | { kind: 'tool-use';       toolName: string; input: unknown; toolUseId: string }
  | { kind: 'tool-progress';  toolName: string; elapsedSec: number }
  | { kind: 'result-success'; finalText: string; durationMs: number; totalCostUsd: number }
  | { kind: 'result-error';   error: string }
  | { kind: 'status';         status: string | null };
```

---

### ChatBridge — WebSocket ↔ SessionPool

**File:** `src/lib/claudecode/chat-bridge.ts`

ChatBridge translates browser WebSocket messages into SessionPool calls and streams events back. It also owns JSONL history reading and in-memory caching.

#### Wire Protocol

```typescript
// Browser → Bridge (request)
{ type: 'req', method: 'chat.send',    payload: { agentId, sessionKey, message } }
{ type: 'req', method: 'chat.history', payload: { sessionKey } }
{ type: 'req', method: 'chat.abort',   payload: { sessionKey } }

// Bridge → Browser (response)
{ type: 'res', ok: true, payload: { runId, status: 'started' } }
{ type: 'res', ok: true, payload: { messages: [...] } }

// Bridge → Browser (streamed events)
{ type: 'event', event: 'chat state:delta', payload: { runId, text, usage } }
{ type: 'event', event: 'chat state:final', payload: { text, usage, duration } }
{ type: 'event', event: 'chat state:error', payload: { error } }
```

#### Session Keys

Session keys identify which SDK session to use:

| Key Format | Meaning |
|------------|---------|
| `agent:<agentId>:tab-<tabId>` | A user-created isolated chat tab |
| `main` or bare `<agentId>` | Agent's primary persistent session |
| `webchat:<agentId>` | Legacy format (still supported) |

#### History Hydration (JSONL)

Claude Code SDK stores conversation history as JSONL files on disk at `~/.claude/projects/<encoded-cwd>/<session-id>.jsonl`. ChatBridge reads these lazily on first `chat.history` request:

```typescript
// Simplified JSONL parser (src/lib/claudecode/chat-bridge.ts)
for (const line of raw.split('\n')) {
  const obj = JSON.parse(line);
  if (obj.type === 'assistant') {
    messages.push({ role: 'assistant', content: extractMsgText(obj), ... });
    lastUsage = extractUsage(obj); // Cache last known token counts
  } else if (obj.type === 'user') {
    messages.push({ role: 'user', content: extractMsgText(obj), ... });
  }
}
```

Parsed history is cached in memory (`Map<sessionKey, ChatMessage[]>`) to avoid repeated disk reads.

#### Context Window Tracking

ChatBridge tracks token usage per session and compares against model-specific context window limits:

```typescript
const MODEL_CONTEXT_WINDOWS: Array<[string, number]> = [
  ['claude-opus-4-6', 1_000_000],   // 1M context
  // All others default to 200k
];
```

This powers the context usage progress bar in the dashboard UI.

---

## 8. Cron Scheduler

**File:** `src/lib/claudecode/scheduler.ts`

### Purpose & Design

AgentDesk owns its own scheduler because Claude Code SDK has no native cron primitive. All jobs persist to the `cc_crons` table and are re-registered on server boot (crash-safe).

### Schedule Types

| Kind | Value Example | Implementation |
|------|--------------|----------------|
| `every` | `15m`, `2h`, `1d` | `parseEveryToMs()` → `setInterval()` |
| `cron` | `*/5 * * * *` | `node-cron` expression |
| `at` | `2026-05-01T09:00:00Z` | `setTimeout()`, one-shot |

**Parsing `every` intervals:**

```typescript
function parseEveryToMs(value: string): number {
  const match = value.match(/^(\d+)\s*(ms|s|m|min|h|hr|d|day|w|wk)$/i);
  const n = parseInt(match[1]);
  const unit = match[2].toLowerCase();
  switch (unit) {
    case 'ms': return n;
    case 's':  return n * 1000;
    case 'm': case 'min': return n * 60_000;
    case 'h': case 'hr':  return n * 3_600_000;
    case 'd': case 'day': return n * 86_400_000;
    case 'w': case 'wk':  return n * 604_800_000;
  }
}
```

**Hard max: 7 days** (Node.js `setInterval` overflows past ~24.8 days).

### Session Targets

| Target | SDK Mode | Use Case |
|--------|----------|---------|
| `isolated` | Fresh ephemeral session | Heartbeats, background reports (clean history) |
| `main` | Persistent session (with locking) | Interactive-style cron jobs that need conversation context |

### Job Execution Flow

```
Scheduler timer fires
  → db.insert(ccCronRuns, { status: 'running' })
  → pool.sendIsolatedTurnAndCollect()  [if isolated]
    OR pool.sendTurnAndCollect()       [if main]
  → db.update(ccCronRuns, { status: 'success', summary })
  → broadcast('cron:run', { jobId, status: 'success' })
```

On error, status is set to `error` and the error message is stored in `ccCronRuns.error` (truncated to 500 chars).

### Boot Recovery

On server start, `scheduler.boot()` reads all enabled `cc_crons` rows and re-registers them. This is idempotent — calling `boot()` twice has no effect.

### Heartbeat Crons

Each agent's "heartbeat" is a special cron job named `<agentId>-heartbeat`. It's managed via the heartbeat API:

- `PUT /api/v1/agents/[id]/heartbeat` — Create or update the interval
- `DELETE /api/v1/agents/[id]/heartbeat` — Remove (disable) the heartbeat

When an agent has `agents.paused = true`, the scheduler still runs the cron, but the dispatcher's eligibility check skips it — so **paused agents consume no AI API calls**.

---

## 9. Skills System

### What Are Skills?

Skills are **bash scripts** in `skills/agent-desk/` that agents invoke from within their Claude Code sessions. They provide a clean, authenticated CLI interface to the AgentDesk REST API.

**Why bash instead of calling the API directly?**
- Agents can invoke shell commands natively in their Claude Code sessions
- Scripts handle auth, URL resolution, and JSON parsing in one place
- No token management complexity in the agent's context

### Shared Config (`ad-common`)

Every skill script sources `skills/agent-desk/ad-common`, which:

1. **Resolves `AGDESK_URL`** — from `$AGDESK_URL` env var → `.url` file → fallback `http://localhost:3737`
2. **Resolves `AGDESK_TOKEN`** — from `$AGDESK_TOKEN` env var → `.token` file
3. **Bootstraps `jq`** — walks up `node_modules` tree to find `node-jq/bin/jq` if system `jq` is absent
4. **Provides `agdesk_curl()`** — wrapper that adds `-H "x-agdesk-token: $AGDESK_TOKEN"` to every request

```bash
# ad-common excerpt
agdesk_curl() {
  if [[ -n "${AGDESK_TOKEN:-}" ]]; then
    curl -sf -H "x-agdesk-token: $AGDESK_TOKEN" "$@"
  else
    curl -sf "$@"
  fi
}
```

### Core Skills Reference

| Script | Usage | API Call |
|--------|-------|---------|
| `ad-projects` | `ad-projects` | `GET /projects` |
| `ad-tasks` | `ad-tasks <projectId> [--assignee <id>] [--status <s>]` | `GET /projects/:id/tasks` |
| `ad-task` | `ad-task <taskId>` | `GET /tasks/:id` + `GET /tasks/:id/comments` |
| `ad-status` | `ad-status <taskId> <status>` | `PATCH /tasks/:id/status` |
| `ad-comment` | `ad-comment <taskId> <agentId> "message"` | `POST /tasks/:id/comments` |
| `ad-plan` | `ad-plan <taskId> <agentId> "s1" "s2" ...` | `POST /tasks/:id/plan` |
| `ad-subtask-done` | `ad-subtask-done <taskId> "title"` | `PATCH /subtasks/:id` |
| `ad-submit` | `ad-submit <taskId>` | `POST /tasks/:id/submit` |
| `ad-progress` | `ad-progress <taskId> <agentId> "update"` | `POST /tasks/:id/comments` |
| `ad-pause task` | `ad-pause task <taskId> <agentId> "reason"` | `PATCH /tasks/:id` + comment |
| `ad-resume task` | `ad-resume task <taskId>` | `PATCH /tasks/:id` |
| `ad-mentions` | `ad-mentions <agentId> [--since <ms>]` | `GET /agents/:id/mentions` |
| `ad-file-read` | `ad-file-read <slug> <path>` | `GET /contexts/:slug/:path` |
| `ad-file-write` | `ad-file-write <slug> <path> "content"` | `PUT /contexts/:slug/:path` |
| `ad-files` | `ad-files <slug>` | `GET /contexts/:slug` |
| `ad-stagger` | `ad-stagger [--window <s>]` | (local sleep) |
| `ad-cron-create` | `ad-cron-create <opts>` | `POST /crons` |
| `ad-crons` | `ad-crons` | `GET /crons` |

### Invocation Example

A typical agent turn looks like this:

```bash
# Agent calls skill scripts like any shell command in its Claude Code session
bash skills/agent-desk/ad-task aed95ff46c9e955535dc0852

# Move task to in-progress
bash skills/agent-desk/ad-status aed95ff46c9e955535dc0852 in-progress

# Post a comment
bash skills/agent-desk/ad-comment aed95ff46c9e955535dc0852 master-agent \
  "Starting implementation. Will tackle auth endpoint first."

# Write a project file
bash skills/agent-desk/ad-file-write agentdesk docs/learning/overview.md \
  "$(cat /tmp/my-document.md)"
```

### `WORKING.md` Convention

Agents are expected to maintain a `WORKING.md` file in their workspace (`~/.claude/agent-desk-agents/<id>/WORKING.md`). This file serves as **inter-session state** — a scratchpad that survives heartbeat gaps:

```markdown
# Current Focus

## TASK aed95ff46c9e: Create learning document
- **Status:** in-progress
- **Subtasks:**
  - [x] Explore codebase
  - [ ] Write document ← NEXT
- **Notes:** Found source at /home/shadab/.nvm/.../agent-desk/

## Last Checked
- task:aed95ff46c9e: 2026-04-24T14:00:00Z
```

The dispatcher's heartbeat prompt explicitly tells agents to read this file first and save to it before stopping.

---

## 10. LLM Provider & Proxy System

**Files:**
- `src/lib/providers/service.ts` — Provider CRUD, credential encryption, env builder
- `src/lib/providers/presets.ts` — Hard-coded provider definitions
- `src/lib/proxy/handler.ts` — HTTP intercept layer
- `src/lib/proxy/translator.ts` — Anthropic ↔ OpenAI message translation

### Provider Types

| Type | Description | Routing |
|------|-------------|---------|
| `anthropic-native` | Direct to `api.anthropic.com` | SDK talks directly (no proxy) |
| `anthropic-compat` | Anthropic-shaped endpoint (z.ai, Claude-compatible) | SDK talks directly, `ANTHROPIC_BASE_URL` overridden |
| `openai-compat` | OpenAI-shaped endpoint (OpenAI, OpenRouter, custom) | All calls go through AgentDesk proxy |

### Supported Presets

| Key | Type | Notes |
|-----|------|-------|
| `anthropic-native` | `anthropic-native` | Official Anthropic API |
| `z-ai` | `anthropic-compat` | z.ai subscription (no API key needed) |
| `openrouter` | `openai-compat` | OpenRouter aggregator |
| `openai` | `openai-compat` | OpenAI direct (strips `max_tokens` for o-series) |
| `anthropic-compat` | `anthropic-compat` | Generic Anthropic-shape endpoint |

### Credential Encryption

All API keys are stored encrypted using AES-256-GCM with `AGDESK_SECRET_KEY`:

```typescript
// Never logged, never returned in list endpoints
const encrypted = encrypt(rawApiKey); // AES-256-GCM ciphertext
db.insert(providers).values({ credentialEncrypted: encrypted, ... });

// Only decrypted when building the child environment
const { credential } = await getProviderWithCredential(providerId);
childEnv[provider.authEnvVar] = credential;
```

### Per-Agent Environment Building

```typescript
// src/lib/providers/service.ts
async function buildEnvForAgent(agentOverride, parentEnv, localProxyUrl) {
  const provider = await resolveProvider(agentOverride.providerId);

  if (provider.type === 'anthropic-native') {
    childEnv.ANTHROPIC_API_KEY = provider.credential;
    // ANTHROPIC_BASE_URL left unset → SDK uses default

  } else if (provider.type === 'anthropic-compat') {
    childEnv[provider.authEnvVar] = provider.credential;
    childEnv.ANTHROPIC_BASE_URL = provider.baseUrl;

  } else if (provider.type === 'openai-compat') {
    // HMAC-signed routing key — proxy decrypts real key from DB
    const hmac = signProviderRouting(provider.id);
    childEnv.ANTHROPIC_API_KEY = `agdesk-proxy-${provider.id}.${hmac}`;
    childEnv.ANTHROPIC_BASE_URL = localProxyUrl; // http://127.0.0.1:<port>
  }
}
```

### The Proxy (OpenAI-Compat Providers Only)

**Security:** The proxy only accepts connections from `127.0.0.1`. All other callers get 404.

**Authentication:** The SDK passes `agdesk-proxy-<providerId>.<hmac>` as its API key. The proxy verifies the HMAC signature using `AGDESK_INTERNAL_TOKEN` to identify the provider (without exposing the real credential to the SDK subprocess).

**Request Flow:**

```
Claude Code SDK
  → POST http://127.0.0.1:<port>/v1/messages
  → [proxy handler.ts]
     1. Loopback check (reject non-localhost)
     2. HMAC verify → resolve provider ID → decrypt real API key from DB
     3. Translate request body: Anthropic → OpenAI format
     4. Forward to provider (e.g., api.openai.com/v1/chat/completions)
     5. Translate response: OpenAI → Anthropic format
     6. Stream or return JSON to SDK
```

**Key Message Translations (`translator.ts`):**

| Anthropic Concept | OpenAI Equivalent | Notes |
|-------------------|------------------|-------|
| `tool_result` blocks | `tool` role messages | Split into separate messages |
| Consecutive `assistant` msgs | Merged | OpenAI rejects consecutive same-role |
| Unanswered `tool_calls` | Synthetic stubs injected | Prevents OpenAI validation error |
| `thinking: { budget_tokens }` | `reasoning_effort: 'high'` | No direct equivalent |
| `cache_control` breakpoints | Stripped | No OpenAI equivalent |
| Image blocks | `image_url` format | Base64 or URL |

---

## 11. Integrations

### Telegram

**Files:** `src/lib/telegram/service.ts`, `src/lib/telegram/link-manager.ts`

#### Setup Flow

1. User creates a Telegram bot via [@BotFather](https://t.me/botfather) → gets bot token
2. User goes to AgentDesk Settings → Integrations → Telegram
3. Pastes the bot token + selects `polling` or `webhook`
4. AgentDesk saves encrypted token + starts `TelegramService`

#### Modes

| Mode | How It Works | Use Case |
|------|-------------|---------|
| `polling` | Long-polls `getUpdates` in a loop | Self-hosted, no public URL needed |
| `webhook` | Telegram POSTs updates to a URL | Production with HTTPS endpoint |

#### Linking a Telegram User to AgentDesk

```
AgentDesk UI                    Telegram
─────────────────               ──────────────────────
1. Click "Generate Code"   →    Code: AD-A1B2C3 (expires 10 min)
                                
                            →   User sends /connect AD-A1B2C3
                            
2. Link created:
   telegramLinks row:
   { userId, telegramChatId,
     selectedAgentId: 'master-agent' }
```

Once linked, messages sent to the bot are forwarded to the selected agent as a `sendTurn()` call on the SessionPool.

#### Rate Limiting & Message Buffering

`TelegramService` implements per-chat rate limiting and message buffering to handle rapid-fire messages and Telegram's 30-messages/second API limit.

---

### Notion

**Files:** `src/lib/notion/client.ts`, `src/lib/notion/session-mcp.ts`

#### Setup Flow

1. User creates an internal integration at [notion.so/my-integrations](https://www.notion.so/my-integrations)
2. Pastes the `ntn_...` token into AgentDesk Settings → Integrations → Notion
3. AgentDesk validates via `GET /users/me` and stores encrypted token in `notionConnections`

#### How Agents Use Notion

AgentDesk injects Notion's official MCP server into each agent's Claude Code session options:

```typescript
// src/lib/notion/session-mcp.ts
return {
  notion: {
    command: 'npx',
    args: ['@notionhq/notion-mcp-server', '--token', decryptedToken],
  },
};
```

This means agents get a full set of Notion tools (search, read page, create page, etc.) automatically when the user's Notion workspace is connected.

#### Integration Verification

```bash
bash skills/agent-desk/ad-integration-verify notion
# Calls GET /users/me + POST /search to confirm connectivity
```

---

## 12. Auth & Multi-User

**Files:** `src/lib/auth.ts`, `src/lib/api-auth.ts`

### First-Run Setup (Owner Creation)

```
GET /setup    → Shows setup form if no owner exists
POST /setup   → Creates owner account + first session
               (atomic: check-and-create in SQLite transaction)
```

This endpoint returns `409 Conflict` if an owner already exists — preventing takeover attacks on restart.

### User Sessions (Browser Clients)

```typescript
// 30-day expiry, UUID token, stored in authSessions table
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

// Cookie: HttpOnly, SameSite=Strict, Secure in prod
response.cookies.set('agdesk-session', token, { httpOnly: true });
```

Login is rate-limited: **5 attempts per 15-minute window** per IP address (in-memory map).

### Agent Authentication (API Clients)

Agents authenticate via the `x-agdesk-token` header, which is a static token stored in `skills/agent-desk/.token` and injected into every `agdesk_curl()` call.

There is **no per-agent token** — all agents share the single installation token. The `x-agdesk-agent-id` header (or request body `actorId`) is used to tag which agent authored a comment or activity.

```typescript
// src/lib/api-auth.ts — actor resolution priority:
// 1. body.actorId  (explicit)
// 2. x-agdesk-agent-id header
// 3. authenticated user ID
// 4. 'system' (fallback)
```

### Invite-Only Registration

New users can only join via an invite link:

```
Admin: POST /api/v1/invites  →  { code, email, role, projectIds[] }
                                 → Invite valid for 7 days
                                 
User: GET /register?token=<code>
      POST /register  →  Creates user + marks invite used
                         + adds to specified projects (all in one transaction)
```

### Role System

| Role | Access |
|------|--------|
| `owner` | Full access: settings, providers, agents, all projects, invites |
| `member` | Access to projects they're invited to |

---

## 13. Real-Time & WebSocket Layer

### WebSocket Hub (`src/lib/ws/hub.ts`)

All real-time events flow through a central broadcast hub. Connected browser clients are tracked in a `Map<id, { send, subscribed }>`. Events are broadcast to clients subscribed to matching channels.

```typescript
// Current channels:
'global'                    // All connected clients
`agent:${agentId}`          // Events for a specific agent
`task:${taskId}`            // Task-specific events
```

### Event Types Broadcast

| Event | Payload | Who Listens |
|-------|---------|------------|
| `chat state:delta` | `{ runId, text, usage }` | Chat panel (streaming) |
| `chat state:final` | `{ text, usage, duration }` | Chat panel |
| `chat state:error` | `{ error }` | Chat panel |
| `cron:run` | `{ jobId, status }` | Cron dashboard |
| `file:created` | `{ path, projectSlug }` | File explorer |
| `file:updated` | `{ path, projectSlug }` | File explorer |
| `file:deleted` | `{ path, projectSlug }` | File explorer |
| `dispatcher:state` | `{ paused, activeCount }` | Settings panel |

### File Watcher (`server.ts`)

AgentDesk watches `~/.openclaw/workspace/agent-desk/` (the project files directory) using `chokidar`:

- Ignores dotfiles (`.git`, `.DS_Store`)
- 100ms debounce on rapid changes
- Broadcasts `file:created/updated/deleted` with project slug + relative path

This powers live reload of project files in the dashboard without polling.

---

## 14. Key Configuration & Directory Layout

### Environment Variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `AGDESK_SECRET_KEY` | AES-256-GCM master key (credentials, tokens) | Generated by `agdesk setup` |
| `AGDESK_INTERNAL_TOKEN` | HMAC secret for proxy route signing | Generated by `agdesk setup` |
| `AGDESK_PORT` | HTTP server port | `3737` |
| `AGDESK_HOST` | HTTP server bind host | `127.0.0.1` |
| `AGDESK_DB_PATH` | SQLite database path | `~/.claude/agdesk.db` |
| `CLAUDE_HOME` | Claude Code home directory | `~/.claude` |
| `ANTHROPIC_API_KEY` | Default Anthropic credential (fallback) | (none) |
| `AGDESK_PLATFORM` | Force platform: `claude-code` or `openclaw` | Auto-detect |
| `AGDESK_URL` | Override API base for skill scripts | `http://localhost:3737` |

### Directory Structure

```
~/.claude/
├── agdesk.db                       # SQLite database
├── agents/
│   ├── master-agent.md             # Agent definition (YAML frontmatter + prose)
│   └── <other-agent>.md
├── agent-desk-agents/
│   ├── master-agent/
│   │   ├── CLAUDE.md               # Project config (auto-loaded by SDK)
│   │   └── WORKING.md              # Agent's inter-session state
│   └── <other-agent>/
│       ├── CLAUDE.md
│       └── WORKING.md
├── agent-memory/
│   ├── master-agent/               # Claude Code memory files (--memory)
│   └── <other-agent>/
└── projects/
    └── <encoded-cwd>/
        └── <session-id>.jsonl      # SDK conversation transcripts

~/.openclaw/
└── workspace/
    └── agent-desk/
        └── <project-slug>/
            └── <files>             # Project files (watched by file-watcher)

<npm-global>/node_modules/@zish/agent-desk/
├── server.ts                       # Custom HTTP server entry point
├── src/                            # TypeScript source
├── skills/agent-desk/              # Skill bash scripts
└── .next/                          # Built Next.js app
```

### Agent Definition File Format

`~/.claude/agents/<id>.md` uses YAML frontmatter:

```yaml
---
name: Master Agent
model: claude-sonnet-4-5
description: Default orchestrator. Routes work and executes generalist tasks.
---

You are the Master Agent of AgentDesk...
(Identity prose, values, approach)
```

The SDK loads this file as the agent's **system prompt** for every session.

---

## 15. Quick Reference: API Routes

### Agents

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/agents` | List all agents |
| `POST` | `/api/v1/agents` | Register new agent |
| `GET` | `/api/v1/agents/:id` | Get agent details |
| `PATCH` | `/api/v1/agents/:id` | Update agent (model, paused, etc.) |
| `DELETE` | `/api/v1/agents/:id` | Remove agent |
| `POST` | `/api/v1/agents/:id/chat` | Send chat message (triggers sendTurn) |
| `GET` | `/api/v1/agents/:id/runs` | Get dispatcher run history |

### Projects & Tasks

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/projects` | List all projects |
| `POST` | `/api/v1/projects` | Create project |
| `GET` | `/api/v1/projects/:id/tasks` | List tasks (filterable) |
| `POST` | `/api/v1/projects/:id/tasks` | Create task |
| `GET` | `/api/v1/tasks/:id` | Get task with subtasks |
| `PATCH` | `/api/v1/tasks/:id/status` | Change task status |
| `POST` | `/api/v1/tasks/:id/plan` | Create subtasks in bulk |
| `POST` | `/api/v1/tasks/:id/submit` | Submit for review |
| `POST` | `/api/v1/tasks/:id/approve` | Approve task (human) |
| `POST` | `/api/v1/tasks/:id/reject` | Reject with feedback (human) |
| `GET/POST` | `/api/v1/tasks/:id/comments` | List / post comments |

### Crons

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/crons` | List all crons |
| `POST` | `/api/v1/crons` | Create cron job |
| `PATCH` | `/api/v1/crons/:id` | Update cron |
| `DELETE` | `/api/v1/crons/:id` | Delete cron |
| `POST` | `/api/v1/crons/:id/run` | Trigger manually |
| `GET` | `/api/v1/crons/:id/runs` | Run history |

### Providers

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/providers` | List (no credentials) |
| `POST` | `/api/v1/providers` | Create + validate + encrypt |
| `PATCH` | `/api/v1/providers/:id` | Update |
| `POST` | `/api/v1/providers/:id/test` | Validate + fetch models |

### Integrations

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v1/integrations/notion/connect` | Link Notion workspace |
| `POST` | `/api/v1/integrations/notion/disconnect` | Unlink |
| `POST` | `/api/v1/integrations/telegram/connect` | Save bot token + start service |
| `POST` | `/api/v1/integrations/telegram/link-code` | Generate `/connect` code |
| `DELETE` | `/api/v1/integrations/telegram` | Disconnect Telegram |

### Files / Contexts

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/contexts/:slug` | List project files |
| `GET` | `/api/v1/contexts/:slug/:path` | Read file |
| `PUT` | `/api/v1/contexts/:slug/:path` | Write file |
| `DELETE` | `/api/v1/contexts/:slug/:path` | Delete file |

### Auth

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v1/auth/setup` | Create owner account (first run) |
| `POST` | `/api/v1/auth/login` | Login + create session |
| `POST` | `/api/v1/auth/logout` | Invalidate session |
| `POST` | `/api/v1/auth/invite` | Generate invite link (owner only) |
| `POST` | `/api/v1/auth/register` | Register via invite code |

---

## Appendix: Key Design Decisions

### Why SQLite?

- Zero-dependency deployment (no Postgres server to manage)
- WAL mode gives sufficient concurrent-read performance for a team tool
- Drizzle ORM provides type safety without the overhead of a full query builder
- Imperative migrations handle complex renames/cascades that SQL DDL can't express cleanly

### Why In-Process Scheduler?

- No external job queue (Redis, BullMQ) to deploy or maintain
- Node.js `setInterval` / `node-cron` is sufficient for ~10s minimum granularity
- Scheduler state persists in SQLite (crash-safe: jobs re-register on boot)
- Single-binary deployment is a core goal

### Why Per-Agent Session Locking?

Claude Code SDK conversations are append-only JSONL files. Concurrent writes to the same session would interleave messages, corrupting the conversation. The promise-chain lock in `session-pool.ts` ensures strict FIFO ordering per agent while allowing full parallelism across agents.

### Why a Local Proxy for OpenAI-Compat Providers?

The Claude Code SDK is hard-coded to call the Anthropic API. To support other providers:
- You can override `ANTHROPIC_BASE_URL` if the endpoint speaks Anthropic's wire format
- For OpenAI-format endpoints, you need an in-process translation layer
- Credentials are kept in the DB (encrypted), never in the subprocess environment
- HMAC-signed routing keys prevent one agent from accessing another provider's credentials

### Why Isolated Sessions for Background Jobs?

If cron jobs ran in the agent's main session, their tool calls and outputs would appear in the chat history seen by the user. `sendIsolatedTurnAndCollect()` creates a fresh ephemeral session with no persistence, keeping the main chat history clean while still executing agent work.

---

## DSA Connections

### Finite State Machine — Task Status Lifecycle

A **finite state machine** (FSM) is a computational model with a finite set of states, a set of transitions between those states, and rules governing which transitions are valid from each state. AgentDesk's task lifecycle is a textbook FSM: the states are `todo → assigned → planning → in-progress → review → done/rejected`, with `paused` as an overlay flag on any state. Each transition is triggered by a specific operation — `ad-status` for forward moves, `ad-submit` for the review transition, and human `approve`/`reject` for the terminal fork. The system enforces valid transitions at the API layer: you cannot jump from `assigned` directly to `review`, and only humans can trigger `done`. This FSM is the backbone of the entire orchestration model — without it, there would be no way to know whether an agent should be working on a task, waiting for feedback, or idle. The dispatcher's `hasWork()` check is essentially asking "which tasks are in a state that requires agent action?" — a query against FSM state.

### Priority Queue (Min-Heap) — Dispatcher Task Selection

A **priority queue** is an abstract data type where each element has a priority, and the element with the highest priority (lowest numeric value in a min-heap) is always extracted first. AgentDesk tasks have a `priority` field (0 = critical, 1 = high, 2 = medium, 3 = low), and the dispatcher always selects the lowest-priority-number task for an agent to work on. This is a textbook min-heap extraction: each dispatch tick is conceptually an `extractMin()` over the agent's eligible task set. The agent's own rules reinforce this — rejected tasks (which already have context loaded) take precedence, then recently resumed tasks, then the highest-priority assigned task, with creation timestamp as a tiebreaker. Without priority-queue semantics, the dispatcher would need an O(n) scan of all tasks every tick; with a heap-ordered structure, the next task is always at the root.

### N-ary Tree — Project → Task → Subtask Hierarchy

An **N-ary tree** is a rooted tree where each node can have an arbitrary number of children. AgentDesk's data model forms a three-level N-ary tree: `Project` (root) → `Task` (children) → `Subtask` (leaves). A project contains many tasks (each with its own status, assignee, and priority), and each task can contain many subtasks (lightweight checklist items). This tree structure is reflected directly in the database schema — `tasks.projectId` is the parent pointer from task to project, and `subtasks.taskId` is the parent pointer from subtask to task. Tree traversal matters operationally: when a project is paused, the system must propagate that pause downward to all tasks (a pre-order traversal). When checking if a task is "complete," the system checks all leaf subtasks (a post-order check — all children must be `done` before the parent can move to `review`).

### Hash Map — Mention Routing & Session Key Resolution

A **hash map** provides O(1) average-case lookup by key, making it the go-to structure for any "find X by identifier" operation. AgentDesk uses hash maps in at least three critical paths: (1) The `mentions` table is an indexed lookup from `mentionedId` to the set of tasks where that agent is mentioned — the dispatcher's `hasWork()` check does an O(1) lookup per agent to find pending mentions. (2) The SessionPool's `inFlightByAgent` is a `Map<string, Promise>` — keyed by agent ID — enabling O(1) lookup of the current promise chain for any agent's turn serialization. (3) ChatBridge's `hydratedKeys` set and `history` map cache parsed JSONL conversation histories keyed by session key, avoiding repeated O(n) disk reads on every `chat.history` request. In each case, the alternative — linear scanning — would be prohibitively slow at scale.

### FIFO Queue (Promise Chain) — Per-Agent Turn Serialization

A **FIFO queue** processes elements in first-in-first-out order, ensuring sequential execution of items that arrive concurrently. The SessionPool implements per-agent FIFO queuing using a promise chain: each new turn awaits the previous turn's promise before executing, then resolves its own promise to unblock the next waiter. This is functionally a lock-free FIFO queue built from JavaScript's event loop — `inFlightByAgent.get(agentId)` retrieves the tail of the queue, and the new turn appends itself as the next link. The critical insight is that this queue is per-agent (same agent → serialized, different agents → parallel), which maps directly to the concurrency constraint: Claude Code SDK JSONL sessions are append-only files, so concurrent writes to the same session would corrupt the conversation. The queue guarantees that each agent's turns execute in arrival order without blocking other agents' turns — optimal throughput under the safety constraint.

---
