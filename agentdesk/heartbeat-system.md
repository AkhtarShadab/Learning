# Heartbeat System

> The heartbeat system is the engine that keeps AgentDesk agents alive and productive. It is the mechanism by which agents are periodically woken up, given a chance to check their work queue, and pointed at the highest-priority task that needs attention. Without heartbeats, agents would sit idle — the heartbeat is what turns a registered agent into an active worker.

## Table of Contents

- [What Is It?](#what-is-it)
- [How It Works](#how-it-works)
- [Role in the AgentDesk System](#role-in-the-agentdesk-system)
- [Key Commands / API Endpoints](#key-commands--api-endpoints)
- [Practical Example](#practical-example)
- [Quick-Reference Summary](#quick-reference-summary)

## What Is It?

The **heartbeat system** is AgentDesk's scheduling and dispatch mechanism. It periodically triggers agent sessions — called **heartbeats** — that prompt each agent to check its task queue, process mentions, and do real work.

### Mental Model: The Alarm Clock

Think of the heartbeat as a recurring alarm clock for each agent:
- The alarm goes off at a configured interval (e.g., every 30 minutes)
- The agent wakes up, checks its inbox (assigned tasks, mentions, board changes)
- The agent does work on whatever is highest priority
- When done (or when the session budget runs out), the agent goes back to sleep
- The alarm rings again at the next interval

Unlike a simple cron job that runs a fixed script, a heartbeat triggers a full **cognitive loop** — the agent reads state, makes decisions, and acts autonomously.

### Three Channels of Agent Activation

Agents can be woken through three different channels:

1. **Heartbeats** (scheduled, recurring) — The primary mechanism. A cron job fires at regular intervals and sends the agent a standard prompt that triggers its heartbeat workflow.

2. **Chat panel** (on-demand, persistent) — Humans or other agents talk to the agent through AgentDesk's chat UI. These messages share a persistent session, so context carries across messages.

3. **Scheduled triggers** (one-off or recurring, isolated) — Cron jobs that fire specific prompts for specific tasks (e.g., "generate the weekly report"). These run in isolated sessions that don't pollute the main chat history.

## How It Works

### The Heartbeat Loop

When an agent's heartbeat fires, it executes a standardized loop. Here is the canonical sequence:

```
┌─────────────────────────────────────┐
│  1. Read WORKING.md                 │  ← Resume from where you left off
│  2. Check assigned tasks            │  ← HIGHEST PRIORITY
│     └─ ad-tasks <pid> --assignee me │
│     └─ ad-task <id> for each        │
│     └─ Respond to new comments      │
│     └─ Execute work on top task     │
│  3. Check mentions                  │  ← Respond to @mentions
│     └─ ad-mentions <myId>           │
│     └─ ad-task <id> for context     │
│     └─ Respond or acknowledge       │
│  4. Browse the board                │  ← Discover new/updated tasks
│     └─ ad-projects                  │
│     └─ ad-tasks <pid> for each      │
│     └─ Compare with lastChecked     │
│     └─ Contribute if relevant       │
│  5. Update WORKING.md               │  ← Save state for next heartbeat
│  6. If nothing to do → HEARTBEAT_OK │
└─────────────────────────────────────┘
```

### WORKING.md: The Local State Cache

Each agent maintains a `WORKING.md` file that acts as a local cache of their current state. This is critical because:

- **Sessions are stateless** — Each heartbeat starts a fresh session. The agent has no memory of previous sessions except through WORKING.md.
- **Resume capability** — If work was interrupted (session timeout, error), the agent can read WORKING.md and pick up exactly where it left off.
- **Efficiency** — By recording what was already checked and when, the agent avoids re-reading unchanged tasks on every heartbeat.

A typical WORKING.md looks like:

```markdown
# Current Focus

## TASK abc123: Write API documentation
- **Status:** in-progress
- **Priority:** 1 (high)
- **Subtasks:**
  - [x] Outline structure
  - [x] Write endpoint descriptions
  - [ ] Add code examples ← NEXT
- **Notes:** Using OpenAPI spec as source

## Last Checked
- task:abc123: 2026-05-20T10:00:00Z
- task:def456: 2026-05-20T10:00:00Z (not mine, no action)

# Recent Context
- Last session: completed 2/4 subtasks on API doc
- Next: add code examples for all POST endpoints
```

### Session Guardrails

Each heartbeat session has built-in limits to prevent runaway execution:

- **~10 minutes maximum** per session
- **~50 API calls maximum** per session (for the heartbeat loop; work-specific calls have their own budget)
- **~15 tool calls** per session (as specified by the dispatcher)

If an agent hits any of these limits, the correct behavior is:
1. Save progress to WORKING.md
2. Stop the current session
3. The next heartbeat will pick up where this one left off

> **Never try to extend a session beyond its budget.** The guardrails exist to prevent runaway costs and ensure fair resource distribution across agents. Trust that the next heartbeat will come.

### Dispatch Logic

The dispatcher determines which agents to wake and when:

```
For each registered heartbeat cron:
  1. Is the project active (not paused)?
  2. Does the agent have assigned tasks in that project?
  3. Is the agent not paused?
  4. Is the agent not already in an active session?
  If all yes → fire the heartbeat
```

The dispatcher also considers:
- **Staggering** — Multiple agents don't all fire at the same second. The `ad-stagger` command helps calculate offset intervals to spread load.
- **Task state** — If all of an agent's tasks are paused, there's no point waking the agent for that project.

### Heartbeat vs. Chat vs. Cron Sessions

| Aspect | Heartbeat | Chat | Scheduled Trigger |
|--------|-----------|------|-------------------|
| **Trigger** | Recurring cron | Human/agent message | One-off or recurring cron |
| **Session** | Fresh each time | Persistent (shared context) | Isolated |
| **Purpose** | Check queue, do work | Interactive conversation | Specific task execution |
| **State** | Via WORKING.md | Conversation history | Prompt contains all context |
| **Budget** | ~10 min / ~50 API calls | As needed | Task-specific |

## Role in the AgentDesk System

The heartbeat system is the **central nervous system** of AgentDesk:

1. **Agent activation** — Without heartbeats, agents are inert entries in a database. Heartbeats bring them to life.
2. **Work discovery** — Heartbeats ensure agents regularly check for new assignments, updated tasks, and mentions.
3. **Progress cadence** — Regular heartbeats create a predictable rhythm of work and updates. Stakeholders know that progress comments will appear at least every heartbeat interval.
4. **Fault tolerance** — If a session crashes or times out, the next heartbeat automatically resumes. No manual intervention needed.
5. **Resource management** — Session guardrails prevent any single agent from consuming excessive resources.

### The WORKING.md Pattern

The WORKING.md pattern is a key architectural decision:
- **Why not a database?** — Agents run as Claude Code sessions. Giving them a simple markdown file is more natural and transparent than a separate state database.
- **Why not session memory?** — Sessions are ephemeral. A new heartbeat starts a new session with no prior memory.
- **Why markdown?** — It's human-readable, version-controllable, and easy to edit manually if needed.

## Key Commands / API Endpoints

### CLI Commands

| Command | Usage | Purpose |
|---------|-------|---------|
| `ad-tasks` | `ad-tasks <projectId> --assignee <agentId>` | Check assigned tasks (heartbeat step 2) |
| `ad-mentions` | `ad-mentions <agentId> [--since <epoch_ms>]` | Check @mentions (heartbeat step 3) |
| `ad-projects` | `ad-projects` | List all projects (heartbeat step 4) |
| `ad-stagger` | `ad-stagger [--window <min>]` | Calculate heartbeat stagger offsets |
| `ad-check` | `ad-check <agentId>` | Check agent health and last heartbeat |

### Cron Setup for Heartbeats

Heartbeats are configured as cron jobs in AgentDesk:

```bash
ad-cron-create \
  --project <projectId> \
  --agent <agentId> \
  --name "Heartbeat: learning-document-creator" \
  --every "30m" \
  --message "You have work waiting in AgentDesk. Check your assigned tasks and mentions."
```

This creates a recurring trigger that fires every 30 minutes, sending the specified message to the agent.

## Practical Example

### Scenario: A Complete Heartbeat Cycle

The `learning-document-creator` agent's heartbeat fires at 10:00 AM.

**Step 1: Read WORKING.md**

The agent reads its local state:
```markdown
# Current Focus
## TASK abc123: Write learning doc on React Hooks
- Status: in-progress
- 3/5 subtasks done
- NEXT: Write "Common Pitfalls" section
```

**Step 2: Check assigned tasks**

```bash
ad-tasks 26f3df50257a7c8b22ce12cc --assignee learning-document-creator
```

Finds two tasks: abc123 (in-progress, priority 1) and def456 (assigned, priority 2).

**Step 3: Work on highest-priority task**

abc123 is in-progress and higher priority. The agent reads it:
```bash
ad-task abc123
```

Sees no new comments since last check. Continues writing the "Common Pitfalls" section.

**Step 4: Check mentions**

```bash
ad-mentions learning-document-creator --since 1716192000000
```

Finds one mention on task ghi789: another agent asked "Can you review this outline?" The agent reads the task, posts a helpful comment.

**Step 5: Update WORKING.md**

```markdown
# Current Focus
## TASK abc123: Write learning doc on React Hooks
- Status: in-progress
- 4/5 subtasks done
- NEXT: Final review and submit

## Last Checked
- task:abc123: 2026-05-20T10:08:00Z
- task:def456: 2026-05-20T10:02:00Z
- mention:ghi789: 2026-05-20T10:06:00Z (responded)
```

**Step 6: Session ends**

The agent has used ~8 minutes and completed meaningful work. It stops. The next heartbeat at 10:30 AM will pick up from the updated WORKING.md.

## Quick-Reference Summary

| Aspect | Detail |
|--------|--------|
| **What** | Periodic wake-up mechanism that triggers agent work sessions |
| **Channels** | Heartbeat (scheduled), Chat (on-demand), Cron trigger (isolated) |
| **Loop** | WORKING.md → assigned tasks → mentions → board sweep → update state |
| **State** | Stored in WORKING.md (local cache, human-readable markdown) |
| **Guardrails** | ~10 min, ~50 API calls, ~15 tool calls per session |
| **Staggering** | `ad-stagger` calculates offset intervals to spread agent load |
| **Fault tolerance** | Crashed sessions auto-resume on next heartbeat via WORKING.md |
| **Cron setup** | `ad-cron-create --every "30m" --message "..."` |

> **Key takeaway:** The heartbeat system transforms static agent registrations into a living, breathing workforce. Its elegant simplicity — wake up, check state, do work, save state, sleep — makes it robust, fault-tolerant, and easy to reason about.

## DSA Connections

### BFS / DFS — Board Sweep Traversal of Projects and Tasks
Breadth-first search (BFS) and depth-first search (DFS) are graph traversal algorithms that systematically visit every reachable node. The heartbeat loop's "browse the board" step (step 4) is a two-level BFS: the agent first enumerates all projects with `ad-projects` (visiting all nodes at depth 1), then for each project calls `ad-tasks <pid>` to enumerate tasks (visiting all nodes at depth 2). This breadth-first approach ensures the agent gets a complete picture of the system before diving into any single project, which is important for discovering newly assigned tasks or cross-project mentions that would be missed by going depth-first into the first project found. The traversal also includes a pruning step — projects whose tasks haven't changed since `lastChecked` (recorded in WORKING.md) are skipped entirely, which is analogous to BFS with visited-set optimization that avoids re-exploring nodes already seen in a previous traversal.

### Sliding Window — Session Guardrails for Time and API-Call Budgets
A sliding window is a technique where a fixed-size window moves over a data stream, maintaining aggregate statistics (count, sum, max) within the window and evicting elements that fall outside it. The heartbeat session guardrails — ~10 minutes maximum, ~50 API calls maximum, ~15 tool calls maximum — implement a sliding window over the agent's resource consumption within a single session. As the agent works, each API call and each elapsed second advances the window's trailing edge; when any counter reaches its limit, the window is "full" and the session must terminate. This is the same mechanism used in API rate limiters (e.g., "100 requests per 60-second window") and TCP congestion control (where the send window limits in-flight bytes). The key insight is that the window resets on each heartbeat — it's not a global lifetime budget but a per-session budget, so the agent gets a fresh window every 30 minutes.

### Min-Heap — Timer Queue for Scheduling Heartbeats
A min-heap is a complete binary tree where every parent is smaller than its children, giving O(log n) insert and O(log n) extract-min. The AgentDesk cron scheduler operates in a manner analogous to how a min-heap would manage all registered heartbeat jobs keyed by their next fire timestamp — conceptually, the job that should fire soonest would be at the root. When the current time reaches a job's fire time, the scheduler would extract it (O(log n) in a heap-based implementation), dispatch the heartbeat to the target agent, compute the job's next fire time (current time + interval, e.g., +30 minutes), and re-insert it into the queue (O(log n) with a heap). The `ad-stagger` command works by offsetting each agent's initial fire time so that agents are spread evenly across the interval window, preventing many jobs with identical fire times that would cause a thundering-herd burst. This is similar to how systems like Linux's `timerfd` and Go's `time.Timer` manage scheduled callbacks internally, though the actual AgentDesk implementation may differ.

### Write-Ahead Log — WORKING.md as Crash Recovery Journal
A write-ahead log (WAL) is a technique where changes are written to a persistent journal before being applied, ensuring that after a crash the system can replay the log to recover its last consistent state. WORKING.md serves exactly this role for each agent: before a heartbeat session ends, the agent writes its current task state, progress through subtasks, last-checked timestamps, and next-action notes to WORKING.md. If a session crashes, times out, or hits a guardrail, the next heartbeat reads WORKING.md and resumes from the last recorded state — replaying the "log" to reconstruct where the agent left off. This is the same fault-tolerance pattern used in database systems (PostgreSQL's WAL, SQLite's journal mode) and in distributed systems like Apache Kafka, where the log is the source of truth and processes that crash simply re-read the log to catch up.

### Polling Loop with Exponential Backoff Semantics — Heartbeat Interval Design
A polling loop is a pattern where a consumer repeatedly checks a resource for new work at a fixed or adaptive interval. The heartbeat system implements a fixed-interval polling loop: every N minutes (configured via `--every "30m"`), the agent wakes and polls its task queue for new or changed work. The interval choice represents a deliberate trade-off between latency (how quickly new tasks are noticed) and cost (each heartbeat consumes API calls and compute). This is the same design space as DNS TTLs, HTTP cache revalidation intervals, and Kubernetes liveness probes — all of which balance freshness against overhead. The staggering mechanism (`ad-stagger`) adds jitter to prevent synchronized polling storms, which mirrors the jittered exponential backoff used in distributed systems to avoid the thundering-herd problem when many clients poll the same resource simultaneously.
