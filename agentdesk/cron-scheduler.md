# Cron / Scheduler

> The cron/scheduler system is how AgentDesk automates recurring and time-based work. It powers agent heartbeats, periodic reports, scheduled sweeps, and one-off delayed tasks. Every recurring agent behavior — from regular heartbeats to weekly summaries — is driven by a cron job registered in AgentDesk.

## Table of Contents

- [What Is It?](#what-is-it)
- [How It Works](#how-it-works)
- [Role in the AgentDesk System](#role-in-the-agentdesk-system)
- [Key Commands / API Endpoints](#key-commands--api-endpoints)
- [Practical Example](#practical-example)
- [Quick-Reference Summary](#quick-reference-summary)

## What Is It?

The **cron/scheduler** is AgentDesk's built-in job scheduling system. It allows you to define jobs that fire at regular intervals, on specific cron schedules, or as one-shot timed triggers. When a job fires, it sends a message to a specified agent, triggering a session.

### Mental Model: The Alarm System

Think of AgentDesk's scheduler as a building's alarm system with three types of alarms:

1. **Cron expression** — Like a building's daily fire drill: "Every weekday at 9 AM" (`0 9 * * 1-5`). Full crontab syntax for precise scheduling.
2. **Interval** — Like a security guard's patrol: "Every 30 minutes" (`--every "30m"`). Simple, repeating, no fixed clock time.
3. **One-shot** — Like a delivery reminder: "At exactly 3 PM on May 25th" (`--at "2026-05-25T15:00:00Z"`). Fires once and is done.

Each alarm is wired to a specific agent and carries a message — when it rings, the agent wakes up and receives that message as a prompt.

### Cron Job Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier |
| `projectId` | string | Which project this job belongs to |
| `agent` | string | Which agent receives the trigger |
| `name` | string | Human-readable job name |
| `cron` | string | Crontab expression (e.g., `0 */6 * * *`) |
| `every` | string | Interval shorthand (e.g., `30m`, `2h`) |
| `at` | string | ISO timestamp for one-shot triggers |
| `message` | string | The prompt sent to the agent when the job fires |
| `disabled` | boolean | Whether the job is currently active |
| `lastRunAt` | string | When the job last fired |
| `nextRunAt` | string | When the job will next fire |

## How It Works

### Three Scheduling Modes

**1. Cron Expression**

Standard Unix crontab syntax with five fields:

```
┌───────────── minute (0-59)
│ ┌───────────── hour (0-23)
│ │ ┌───────────── day of month (1-31)
│ │ │ ┌───────────── month (1-12)
│ │ │ │ ┌───────────── day of week (0-7, 0 and 7 = Sunday)
│ │ │ │ │
* * * * *
```

Examples:
- `0 9 * * *` — Every day at 9:00 AM
- `*/30 * * * *` — Every 30 minutes
- `0 9 * * 1-5` — Every weekday at 9:00 AM
- `0 0 1 * *` — First day of every month at midnight

**2. Interval (`--every`)**

A simpler alternative for regular intervals:
- `5m` — Every 5 minutes
- `30m` — Every 30 minutes
- `2h` — Every 2 hours
- `1d` — Every day

The interval starts from when the job is created or last ran.

**3. One-Shot (`--at`)**

An ISO 8601 timestamp for a single future execution:
- `2026-05-25T15:00:00Z` — Fire once at 3 PM UTC on May 25, 2026
- `2026-06-01T09:00:00Z` — Fire once at 9 AM UTC on June 1, 2026

After firing, the job remains in the system (for audit) but doesn't fire again.

### Creating Cron Jobs

Use `ad-cron-create` with the appropriate scheduling option:

```bash
# Recurring with cron expression
ad-cron-create \
  --project <projectId> \
  --agent learning-document-creator \
  --name "Heartbeat: learning-document-creator" \
  --cron "*/30 * * * *" \
  --message "Check your assigned tasks and mentions."

# Recurring with interval
ad-cron-create \
  --project <projectId> \
  --agent master-agent \
  --name "Board sweep" \
  --every "1h" \
  --message "Sweep the board for stale tasks and update priorities."

# One-shot with ISO timestamp
ad-cron-create \
  --project <projectId> \
  --agent learning-document-creator \
  --name "Reminder: submit weekly report" \
  --at "2026-05-23T17:00:00Z" \
  --message "Compile and submit the weekly progress report."
```

> **Critical rule:** Always use `ad-cron-create` for scheduling. Never use Claude Code's built-in `ScheduleWakeup` tool or scheduler skill — jobs created that way are invisible to AgentDesk, can't be paused/resumed from the dashboard, and don't appear on the project's Schedule page.

### Managing Cron Jobs

```bash
# List all cron jobs
ad-crons

# View one job's details
ad-cron <cronId>

# Disable a job without deleting it
ad-cron-update <cronId> --enabled false

# Re-enable
ad-cron-update <cronId> --enabled true

# Change the schedule
ad-cron-update <cronId> --every "1h"

# Change the message
ad-cron-update <cronId> --message "New prompt text"

# Delete a job permanently
ad-cron-delete <cronId>
```

### Manual Triggers

Sometimes you want to fire a job immediately without waiting for the next scheduled time:

```bash
ad-cron-run <cronId>
```

This triggers the job out-of-schedule. It doesn't affect the regular schedule — the next scheduled run still fires at its normal time.

### Run History

Every time a cron job fires (scheduled or manual), a run record is created:

```bash
ad-cron-runs <cronId>
```

This shows:
- When each run happened
- Whether it succeeded or failed
- Duration of the run
- Summary/output of what happened

Run history is valuable for debugging (why didn't my agent do X?) and auditing (how often is this job actually running?).

### Isolated Sessions

Cron-triggered sessions are **isolated** — they don't share context with the agent's main chat session. Each trigger starts a fresh session where:
- The agent receives the cron's `message` as its prompt
- It has no memory of previous chat interactions
- It must get all needed context from the message, the task board, and files

This isolation is intentional: it prevents cron jobs from polluting interactive chat history and ensures each trigger is self-contained.

## Role in the AgentDesk System

The scheduler is the **clock** that drives AgentDesk's autonomous operations:

1. **Agent heartbeats** — The primary use case. Regular cron jobs wake agents at fixed intervals to check their task queues.

2. **Periodic maintenance** — Scheduled sweeps for stale tasks, automated priority adjustments, or board health checks.

3. **Scheduled reports** — Weekly summaries, daily stand-up compilations, or monthly reviews.

4. **Delayed actions** — One-shot triggers for "remind me to do X in 2 hours" or "send the report at 5 PM."

5. **Workflow automation** — Chain cron jobs to create multi-step automated workflows (e.g., data collection at 8 AM, analysis at 9 AM, report at 10 AM).

### Why Not External Schedulers?

AgentDesk has its own scheduler for important reasons:
- **Visibility** — Jobs appear on the project's Schedule page in the dashboard
- **Pause/resume** — When a project or agent is paused, their cron jobs automatically pause too
- **Audit trail** — Run history is tracked and visible
- **Agent association** — Each job is linked to a specific agent and project

External schedulers (OS crontab, Claude Code's ScheduleWakeup, third-party tools) bypass all of these features.

## Key Commands / API Endpoints

### CLI Commands

| Command | Usage | Purpose |
|---------|-------|---------|
| `ad-crons` | `ad-crons` | List all cron jobs |
| `ad-cron` | `ad-cron <cronId>` | Get one job's details |
| `ad-cron-create` | `ad-cron-create --project <id> --agent <id> --name "..." [scheduling] [--message "..."]` | Create a new job |
| `ad-cron-update` | `ad-cron-update <cronId> [options]` | Update job settings |
| `ad-cron-delete` | `ad-cron-delete <cronId>` | Delete a job |
| `ad-cron-run` | `ad-cron-run <cronId>` | Manually trigger a job |
| `ad-cron-runs` | `ad-cron-runs <cronId>` | View run history |

### REST API Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/api/v1/crons` | List all cron jobs |
| `POST` | `/api/v1/crons` | Create job `{projectId, agent, cron/every/at, name?, message?}` |
| `GET` | `/api/v1/crons/:id` | Get job details |
| `PATCH` | `/api/v1/crons/:id` | Update job |
| `DELETE` | `/api/v1/crons/:id` | Delete job |
| `POST` | `/api/v1/crons/:id/run` | Manual trigger |
| `GET` | `/api/v1/crons/:id/runs` | Run history |

## Practical Example

### Scenario: Setting Up a Full Agent Scheduling System

You're setting up automation for a documentation project with two agents.

**Step 1: Create heartbeat crons**

```bash
# Worker heartbeat every 30 minutes
ad-cron-create \
  --project 26f3df50257a7c8b22ce12cc \
  --agent learning-document-creator \
  --name "Heartbeat: Doc Writer" \
  --every "30m" \
  --message "Check assigned tasks and mentions in the Learning project."

# Orchestrator heartbeat every hour
ad-cron-create \
  --project 26f3df50257a7c8b22ce12cc \
  --agent master-agent \
  --name "Heartbeat: Orchestrator" \
  --every "1h" \
  --message "Review task board, check for stale tasks, review submitted work."
```

**Step 2: Add a weekly report job**

```bash
ad-cron-create \
  --project 26f3df50257a7c8b22ce12cc \
  --agent master-agent \
  --name "Weekly Summary" \
  --cron "0 17 * * 5" \
  --message "Generate a weekly summary of all tasks completed, in progress, and blocked."
```

**Step 3: Schedule a one-time reminder**

```bash
ad-cron-create \
  --project 26f3df50257a7c8b22ce12cc \
  --agent learning-document-creator \
  --name "Deadline reminder" \
  --at "2026-05-25T09:00:00Z" \
  --message "Reminder: the architecture docs are due by end of day."
```

**Step 4: Check run history**

```bash
ad-cron-runs <heartbeatCronId>
```

Output shows each heartbeat firing, whether it succeeded, and how long each session lasted.

**Step 5: Temporarily disable during maintenance**

```bash
ad-cron-update <heartbeatCronId> --enabled false
# ... do maintenance ...
ad-cron-update <heartbeatCronId> --enabled true
```

## Quick-Reference Summary

| Aspect | Detail |
|--------|--------|
| **What** | Built-in job scheduler for recurring, interval, and one-shot triggers |
| **Modes** | Cron expression (`--cron`), interval (`--every`), one-shot (`--at`) |
| **Primary use** | Agent heartbeats, periodic reports, delayed actions |
| **Sessions** | Cron triggers create isolated sessions (no chat history sharing) |
| **Visibility** | Jobs appear on project Schedule page in dashboard |
| **Pause behavior** | Respects project/agent pause — jobs auto-suspend |
| **Run history** | `ad-cron-runs <id>` shows status, duration, summary per run |
| **Critical rule** | Always use `ad-cron-create`, never external schedulers |

> **Key takeaway:** The scheduler is what makes AgentDesk autonomous. Without it, agents would need manual prompting for every action. With it, agents wake up on their own, check their work, make progress, and report back — all without human intervention.
