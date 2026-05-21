# AgentDesk — Complete Architecture Summary

> A concise, visual reference to understand how the entire AgentDesk platform fits together.
> For the deep technical reference see `00-agentdesk-overview.md`.

---

## What Is AgentDesk?

AgentDesk is a **self-hosted AI agent orchestration platform** built on top of the Claude Code SDK. It adds a web dashboard, Kanban task board, cron scheduler, real-time UI, and integration hooks (Telegram, Notion) — giving teams a structured way for humans and AI agents to collaborate on long-running projects.

**Core problems it solves:**
- No persistent state between agent turns → AgentDesk manages sessions, WORKING.md, and DB records
- No native scheduling for agent work → AgentDesk's scheduler fires agent turns on a clock
- No visibility across projects/agents → unified dashboard + activity log
- No multi-provider routing for Claude Code → transparent proxy translates OpenAI ↔ Anthropic wire formats

---

## System Topology

```
┌─────────────────────────────────────────────────────────────────┐
│                    Browser / Telegram                           │
│               (React UI  •  WebSocket client)                   │
└────────────────────────┬────────────────────────────────────────┘
                         │  HTTP + WebSocket (port 3737)
┌────────────────────────▼────────────────────────────────────────┐
│                    server.ts  (Custom HTTP Server)              │
│                                                                 │
│  ┌──────────────┐  ┌────────────────┐  ┌─────────────────────┐ │
│  │  Next.js App │  │  WebSocket Hub │  │  LLM Proxy Server   │ │
│  │  (UI + API)  │  │  (ws/hub.ts)   │  │  (127.0.0.1 only)  │ │
│  └──────┬───────┘  └───────┬────────┘  └──────────┬──────────┘ │
│         │                  │                       │            │
│  ┌──────▼──────────────────▼───────────────────────▼────────┐  │
│  │                      src/lib/                            │  │
│  │                                                          │  │
│  │  ┌─────────────┐  ┌──────────────┐  ┌────────────────┐  │  │
│  │  │  Dispatcher │  │  SessionPool │  │   Scheduler    │  │  │
│  │  │  (heartbeat)│  │  (SDK mgmt)  │  │  (cron/every)  │  │  │
│  │  └──────┬──────┘  └──────┬───────┘  └───────┬────────┘  │  │
│  │         │                │                   │           │  │
│  │  ┌──────▼────────────────▼───────────────────▼────────┐  │  │
│  │  │                  SQLite Database                   │  │  │
│  │  │   agents · tasks · crons · sessions · providers   │  │  │
│  │  └────────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────┬────────────────────────────────────────┘
                         │
          ┌──────────────▼──────────────────┐
          │   Claude Code SDK Subprocess(es) │
          │   (one per agent per turn)       │
          │                                  │
          │   ANTHROPIC_BASE_URL env var     │
          │   → proxy (OpenAI providers)     │
          │   → direct (Anthropic providers) │
          └──────────────────────────────────┘
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16 (App Router) + React 19 + Tailwind CSS 4 |
| API | Next.js Route Handlers (`src/app/api/v1/`) |
| Real-time | Custom WebSocket hub (no Socket.io) |
| ORM | Drizzle ORM (type-safe, zero overhead) |
| Database | SQLite via `better-sqlite3` (WAL mode) |
| AI Sessions | `@anthropic-ai/claude-agent-sdk` |
| Language | TypeScript throughout |
| Scheduler | In-process: `node-cron` + `setTimeout` |
| Auth | bcryptjs (passwords) + AES-256-GCM (credentials) |
| Browser | Camoufox daemon (stealth Firefox at port 9377) |

---

## Source Directory Map

```
src/
├── app/
│   ├── api/v1/              # All REST API endpoints
│   │   ├── agents/[id]/     # Agent CRUD + token-usage + heartbeat
│   │   ├── tasks/[id]/      # Task CRUD + status + comments + subtasks
│   │   ├── projects/[id]/   # Project CRUD
│   │   ├── crons/[id]/      # Cron CRUD + run + history
│   │   ├── providers/[id]/  # LLM provider config
│   │   └── integrations/    # Notion + Telegram endpoints
│   └── [pages]/             # Dashboard UI pages
│
├── lib/
│   ├── claudecode/
│   │   ├── session-pool.ts      ← CORE: SDK session manager
│   │   ├── dispatcher.ts        ← CORE: autonomous agent heartbeat loop
│   │   ├── chat-bridge.ts       ← CORE: WebSocket ↔ SessionPool bridge
│   │   ├── scheduler.ts         ← CORE: cron/every/at job executor
│   │   └── threshold-utils.ts   ← context window alert utilities
│   ├── db/
│   │   ├── schema.ts            ← all Drizzle table definitions
│   │   └── index.ts             ← DB init + migrations on boot
│   ├── proxy/
│   │   ├── handler.ts           ← HTTP intercept for OpenAI providers
│   │   └── translator.ts        ← Anthropic ↔ OpenAI message translation
│   ├── providers/
│   │   ├── service.ts           ← provider CRUD + env builder
│   │   └── presets.ts           ← hard-coded provider definitions
│   ├── telegram/                ← Telegram bot service + voice (STT/TTS)
│   ├── notion/                  ← Notion MCP bridge
│   ├── ws/hub.ts                ← WebSocket broadcast hub
│   └── auth.ts / api-auth.ts   ← session tokens, rate-limit, actor resolution
│
└── components/ hooks/ stores/   # React UI layer

server.ts                        # Custom HTTP server entry point
skills/agent-desk/               # Agent-side bash skill scripts (ad-*)
drizzle/                         # SQL migration files
```

---

## The 6 Core Subsystems

### 1. Dispatcher (Heartbeat Engine)
**File:** `src/lib/claudecode/dispatcher.ts`

The dispatcher is the "always-on" engine that makes agents autonomous. It runs on an adaptive tick:

| State | Interval |
|---|---|
| Active (agents working) | 15 s |
| Cooling (recent activity) | 45 s |
| Idle (nothing happening) | 90 s |

Each tick it checks every eligible agent for work:
- **Assigned tasks** — status in `assigned / planning / in-progress`
- **Review feedback** — human posted a new comment on a `review`-status task
- **@Mentions** — agent mentioned in any comment

If work exists, it fires a turn for the agent via the SessionPool. It implements **escalating error backoff** → auto-pause on repeated failures.

---

### 2. SessionPool (SDK Session Manager)
**File:** `src/lib/claudecode/session-pool.ts`

Manages the connection between AgentDesk and the Claude Code SDK subprocesses.

**Key behaviors:**
- **Session persistence:** Stores `sessionId` in `agents.ccSessionId` after the first turn and resumes it on every subsequent turn (conversation history preserved)
- **Per-agent locking:** Uses a promise-chain lock so one agent's turns are serialized (FIFO) while different agents run in parallel
- **Three send modes:**

| Mode | Use Case |
|---|---|
| `sendTurn()` (streaming) | Interactive chat via ChatBridge |
| `sendTurnAndCollect()` | Cron jobs needing a return value |
| `sendIsolatedTurnAndCollect()` | Background jobs — fresh ephemeral session, no history pollution |

---

### 3. ChatBridge (WebSocket ↔ SDK)
**File:** `src/lib/claudecode/chat-bridge.ts`

Translates browser WebSocket messages into SessionPool calls and streams events back to the UI.

**Wire protocol (simplified):**
```
Browser → Bridge:   { type: 'req', method: 'chat.send', payload: { agentId, message } }
Bridge  → Browser:  { type: 'event', event: 'chat state:delta', payload: { text, usage } }
Bridge  → Browser:  { type: 'event', event: 'chat state:final', payload: { ... } }
```

Also owns:
- **JSONL history reading** — parses SDK transcript files on disk for chat history
- **Context window tracking** — monitors token usage per session, powers the threshold alert system

---

### 4. Cron Scheduler
**File:** `src/lib/claudecode/scheduler.ts`

Provides cron, interval, and one-shot scheduling for agent turns.

| Schedule Kind | Example | Implementation |
|---|---|---|
| `every` | `15m`, `2h`, `1d` | `setInterval()` |
| `cron` | `*/5 * * * *` | `node-cron` |
| `at` | `2026-05-01T09:00:00Z` | `setTimeout()` one-shot |

All jobs persist to the `cc_crons` table and are **re-registered on server boot** (crash-safe). Each agent's heartbeat is a special cron job (`<agentId>-heartbeat`).

---

### 5. LLM Proxy (Multi-Provider Routing)
**Files:** `src/lib/proxy/handler.ts`, `src/lib/proxy/translator.ts`

Allows agents to use any LLM provider despite the Claude Code SDK being Anthropic-native.

**Three provider types:**

| Type | Routing |
|---|---|
| `anthropic-native` | SDK talks directly to `api.anthropic.com` |
| `anthropic-compat` | `ANTHROPIC_BASE_URL` overridden to the provider |
| `openai-compat` | All calls go through the local proxy on `127.0.0.1` |

**Proxy flow (for OpenAI-compat providers):**
```
Claude Code SDK
  → POST http://127.0.0.1:<port>/v1/messages
  → [proxy] HMAC verify routing key → decrypt real API key from DB
  → Translate: Anthropic request → OpenAI format
  → Forward to provider (e.g. api.openai.com)
  → Translate: OpenAI response → Anthropic format
  → Stream back to SDK
```

Credentials are **always encrypted at rest** (AES-256-GCM) and **never passed in plaintext** to SDK subprocesses. Instead, an HMAC-signed routing key is passed, which the proxy uses to look up and decrypt the real key.

---

### 6. Skills System (Agent CLI Interface)
**Location:** `skills/agent-desk/`

Bash scripts that agents call from inside their Claude Code sessions to interact with AgentDesk's REST API. Each script sources `ad-common` for auth and URL resolution.

| Script | What It Does |
|---|---|
| `ad-projects` | List all projects |
| `ad-tasks <projectId>` | List tasks (filterable by assignee/status) |
| `ad-task <taskId>` | Full task details + comments |
| `ad-status <taskId> <status>` | Change task status |
| `ad-comment <taskId> <agentId> "msg"` | Post a comment |
| `ad-plan <taskId> <agentId> "s1" "s2"` | Create subtasks in bulk |
| `ad-submit <taskId>` | Submit for human review |
| `ad-pause / ad-resume` | Pause/resume tasks, agents, projects |
| `ad-file-read/write <slug> <path>` | Read/write project files |
| `ad-telegram-send "msg"` | Push a Telegram message |

---

## Database Schema (Key Tables)

```
Users & Auth
  users                 → email, passwordHash, role (owner/member)
  authSessions          → UUID token, 30-day TTL
  invites               → invite codes, 7-day TTL
  projectMembers        → project ACL (userId ↔ projectId)

Agents & Providers
  agents                → id, title, model, ccSessionId, providerId, paused, warn1Pct, warn2Pct
  providers             → presetKey, type, credentialEncrypted (AES-256-GCM), baseUrl

Projects & Tasks
  projects              → id, slug, name, mission, status
  tasks                 → id, projectId, title, status, assigneeId, priority, paused
  subtasks              → taskId, title, done
  comments              → taskId, authorType, authorId, content
  mentions              → commentId, mentionedId (powers @mention detection)
  activities            → audit log (actor, type, payload)

Scheduler
  ccCrons               → agentId, scheduleKind, scheduleValue, sessionTarget, payloadMessage
  ccCronRuns            → cronId, status, triggeredAt, finishedAt, summary, error
  ccChatTabs            → agentId, name, sessionId (user-created chat tabs)

Integrations
  telegramConfig        → botToken (encrypted), mode (polling/webhook)
  telegramLinks         → userId ↔ telegramChatId ↔ selectedAgentId
  notionConnections     → userId, accessToken (encrypted)
```

---

## Task Lifecycle

```
  todo
   ↓  (assigned to agent)
  assigned
   ↓  (agent acknowledges)
  planning      ← agent creates subtasks here
   ↓  (agent begins work)
  in-progress   ← agent posts progress, marks subtasks done
   ↓  (ad-submit)
  review        ← human reviews
   ↓              ↓
  done          rejected → agent fixes → back to in-progress
```

Any status can also be **paused** (`tasks.paused = true`) — paused tasks are invisible to the dispatcher until a human resumes them.

---

## Agent Model

An agent is **four things at once:**

| Thing | Location |
|---|---|
| DB row | `agents` table — model, provider, session ID, thresholds |
| Identity file | `~/.claude/agents/<id>.md` — YAML frontmatter + system prompt prose |
| Workspace | `~/.claude/agent-desk-agents/<id>/` — Claude Code's CWD |
| SDK session | Identified by `agents.ccSessionId`, persists conversation history |

The `master-agent` (ships with every install) is the default orchestrator. It is the first point of contact for all user requests and the fallback executor when no specialist exists.

---

## Real-Time (WebSocket Hub)

**File:** `src/lib/ws/hub.ts`

All real-time events flow through a central broadcast hub. Clients subscribe to channels:

| Channel | Events |
|---|---|
| `global` | Dispatcher state, system events |
| `agent:<agentId>` | Chat stream (delta, final, error) |
| `task:<taskId>` | Task status changes |
| Project files | `file:created`, `file:updated`, `file:deleted` (via chokidar watcher) |

---

## Auth & Security

| Concern | Mechanism |
|---|---|
| Browser sessions | UUID token, HttpOnly cookie, 30-day TTL, 5 attempts/15 min rate-limit |
| Agent API access | Shared `x-agdesk-token` header (static install token) |
| Credential storage | AES-256-GCM with `AGDESK_SECRET_KEY` |
| Proxy auth | HMAC-signed routing keys (`AGDESK_INTERNAL_TOKEN`) |
| Invite-only signup | 7-day invite codes, atomic check-and-create in SQLite transaction |
| First-run protection | `/setup` returns 409 if owner already exists |

---

## Integrations

### Telegram
- Bot runs in **polling** (no public URL) or **webhook** (HTTPS required) mode
- Users link their Telegram chat via `/connect AD-XXXXXX` flow
- Incoming voice notes → **Whisper STT** → forwarded to agent as text
- Outgoing messages can be **TTS voice notes** (`voice: true` flag on send API)
- Rate-limited with per-chat message buffering

### Notion
- User pastes `ntn_...` token → stored encrypted
- Agents get Notion's **official MCP server** injected into their SDK session
- Full read/write access to user's Notion workspace (search, pages, databases)

---

## Key Configuration

### Environment Variables (`~/.agent-desk/.env`)

| Variable | Purpose |
|---|---|
| `AGDESK_SECRET_KEY` | AES-256-GCM master key (auto-generated) |
| `AGDESK_INTERNAL_TOKEN` | HMAC secret for proxy routing (auto-generated) |
| `CAMOUFOX_URL` | Browser daemon URL (default: `http://localhost:9377`) |

### Server Config (`~/.agent-desk/config.json`)

| Key | Default | Purpose |
|---|---|---|
| `server.port` | `3737` | HTTP listen port |
| `server.host` | `0.0.0.0` | Bind address |
| `dispatcher.tickActiveMs` | `15000` | Tick rate when agents are working |
| `dispatcher.tickIdleMs` | `90000` | Tick rate when nothing is happening |
| `dispatcher.perTurnHardTimeoutMs` | `600000` | 10-min per-turn hard cutoff |

### Data Directory (`~/.agent-desk/`)

```
~/.agent-desk/
├── .env                 # Secrets
├── config.json          # Server + dispatcher config
├── data.db              # SQLite database
├── logs/agdesk.log      # Daemon logs
└── projects/            # Per-project working files
```

---

## How a Full Request Flows (End-to-End)

### User sends a chat message in the dashboard:
```
1. Browser → WebSocket → ChatBridge.handleMessage()
2. ChatBridge → SessionPool.sendTurn(agentId, message)
3. SessionPool acquires per-agent lock
4. SessionPool spawns Claude Code SDK subprocess with:
   - Agent's system prompt (from ~/.claude/agents/<id>.md)
   - Correct ANTHROPIC_API_KEY + ANTHROPIC_BASE_URL for the agent's provider
   - AGDESK_AGENT_ID env var (for skill scripts)
5. If OpenAI-compat provider:
   SDK → local proxy (127.0.0.1) → translate → real provider → translate back
6. SDK emits streaming events → SessionPool normalizes → ChatBridge streams via WebSocket
7. Browser renders text delta by delta
8. On completion: usage tracked in memory, context window % updated in UI
```

### Dispatcher fires an agent heartbeat:
```
1. Dispatcher tick fires (every 15–90s)
2. For each eligible agent:
   a. Query DB: assigned tasks + review feedback + @mentions
   b. If work found → build heartbeat prompt
   c. SessionPool.sendTurnAndCollect(agentId, heartbeatPrompt)
3. Agent's Claude Code session reads WORKING.md, calls ad-* skill scripts
4. Skills call AgentDesk REST API (x-agdesk-token auth)
5. Agent posts comments, updates task status, writes files
6. On completion: agentRuns DB row updated, dispatcher clears in-flight flag
7. If 3 consecutive errors → stall → escalate → auto-pause
```

---

## Design Decisions at a Glance

| Decision | Reason |
|---|---|
| **SQLite over Postgres** | Zero-dependency deployment; WAL mode sufficient for a team tool |
| **In-process scheduler** | No Redis/BullMQ to deploy; SQLite persistence makes it crash-safe |
| **Per-agent session locking** | SDK JSONL conversations are append-only — concurrent writes would corrupt history |
| **Local proxy for OpenAI providers** | SDK is Anthropic-native; proxy translates wire formats without exposing credentials to subprocesses |
| **Isolated sessions for cron jobs** | Keeps main chat history clean; no queue contention with interactive chat |
| **Bash skill scripts** | Agents can invoke shell natively in Claude Code; scripts handle auth/URL in one place |
| **Adaptive dispatcher tick rate** | Saves compute when idle; fast response when agents are actively working |

---

## DSA Connections

### Priority Queue (Min-Heap) — Dispatcher Work Selection

A **priority queue** can be implemented using a binary min-heap to achieve O(log n) time for extracting the highest-priority element. The dispatcher's core job each tick is to determine, for each eligible agent, which task to work on next. Tasks carry a `priority` field (0 = critical through 3 = low), and the agent always picks the lowest number first — conceptually analogous to a min-heap `extractMin()`. The priority rules add secondary sort keys (rejected > resumed > highest priority > oldest creation date), forming a composite comparator. Without priority-queue semantics, the dispatcher would need to linearly scan every task assigned to every agent on every tick — O(agents × tasks). With a heap-backed priority queue, each agent's next-work decision would be conceptually O(log t) where t is that agent's task count, though actual complexity depends on the chosen data structure and comparator behavior in the implementation.

### Finite State Machine — Task Lifecycle

A **finite state machine** (FSM) has a fixed set of states and deterministic transitions between them. The task lifecycle (`todo → assigned → planning → in-progress → review → done | rejected`) is a canonical FSM: each state has a defined set of valid outgoing transitions, and the API layer enforces them — you cannot jump from `assigned` to `review`, and only a human actor can trigger `done`. The `paused` flag acts as a state overlay (any state can be paused/unpaused without changing the underlying status). This FSM governs the entire orchestration: the dispatcher queries "which tasks are in an actionable state for this agent?" and the Kanban UI renders columns directly from FSM states. Modeling this explicitly as a state machine prevents invalid transitions and makes the system's behavior predictable and auditable.

### Pub/Sub (Observer Pattern) — WebSocket Event Hub

The **publish-subscribe pattern** decouples event producers from consumers: producers broadcast to named channels, and any number of subscribers receive matching events without the producer knowing who's listening. The WebSocket hub (`ws/hub.ts`) is a textbook pub/sub broker — clients subscribe to channels (`global`, `agent:<id>`, `task:<id>`), and subsystems publish events (chat deltas, cron completions, file changes, dispatcher state) to those channels. The hub maintains a `Map<clientId, { send, subscribed }>` for O(1) client lookup and O(s) broadcast where s is the number of subscribers on a channel. This decoupling is critical: the SessionPool doesn't need to know whether zero or five browser tabs are watching an agent's chat stream — it publishes the delta, and the hub fans it out. The file watcher (chokidar) publishes `file:created/updated/deleted` without knowing whether the file explorer is open, enabling live UI updates without polling.

### Producer-Consumer Queue — Dispatcher ↔ SessionPool

The **producer-consumer pattern** separates the entity that generates work from the entity that executes it, connected by a shared queue. The dispatcher is the producer: on each tick it scans eligible agents, identifies pending work, and builds heartbeat prompts. The SessionPool is the consumer: it receives these prompts and executes them as Claude Code SDK turns. The per-agent promise chain in `SessionPool.inFlightByAgent` is the bounded queue — it serializes turns for the same agent (consumer processes one item at a time) while allowing different agents' turns to run concurrently (multiple independent consumer lanes). This separation of concerns means the dispatcher can be tuned independently (tick rate, backoff, stall thresholds) without affecting session management, and the SessionPool can evolve its locking strategy without changing dispatch logic.

### Exponential Backoff — Error Escalation & Adaptive Tick Rate

**Exponential backoff** is a strategy where retry intervals grow geometrically after failures, reducing load on a struggling system while still allowing recovery. The dispatcher uses a three-level escalating backoff: Level 0 (no errors) → 3 consecutive errors → Level 1 (stall 2 min) → 1 more error → Level 2 (stall 10 min) → 1 more error → auto-pause (human intervention required). Any success resets to Level 0 — this is the "full jitter" variant where recovery is immediate. The adaptive tick rate is a related mechanism: Active (15s) → Cooling (45s, after 2 min idle) → Idle (90s, after 5 min idle) — the system reduces its own polling frequency when there's no work, which is functionally an exponential backoff on the monitoring loop itself. Together, these prevent the "thundering herd" problem (all agents polling aggressively when the system is under stress) and the "wasted compute" problem (fast polling when nothing is happening).

---
