# AgentDesk Scheduling Guide
## Cron Jobs, One-Shot Schedules, Intervals — Mental Models for Automation Timing

---

## The Mental Model: Scheduling as Programmed Intent

A schedule is how you express **"I want X to happen at Y time, automatically."** In AgentDesk, every scheduled job is:

1. **Registered** — visible on the project's Schedule page
2. **Attributed** — linked to a project and an agent
3. **Auditable** — has a run history you can inspect
4. **Controllable** — can be paused, resumed, updated, or deleted from the UI

This is fundamentally different from a cron tab or a background script — those are invisible. AgentDesk schedules are **first-class citizens** of the workspace.

```
┌─────────────────────────────────────────────┐
│           Scheduling Mental Model            │
│                                              │
│  "Every Monday at 9am, ask master-agent      │
│   to review the week's completed tasks"      │
│                                              │
│  ┌──────────┐    fires    ┌───────────────┐  │
│  │  Cron    │ ──────────► │  Agent        │  │
│  │  Job     │             │  Session      │  │
│  │  (in DB) │             │  (with msg)   │  │
│  └──────────┘             └───────────────┘  │
└─────────────────────────────────────────────┘
```

---

## Three Schedule Types

### 1. Cron Expression (Recurring)

Uses standard Unix cron syntax for precise time control.

```bash
ad-cron-create \
  --project <projectId> \
  --agent <agentId> \
  --name "Weekly Review" \
  --cron "0 9 * * MON" \
  --message "Please review all tasks completed this week and summarize findings."
```

**Cron syntax quick reference:**
```
┌─── minute (0-59)
│  ┌── hour (0-23)
│  │  ┌─ day of month (1-31)
│  │  │  ┌ month (1-12)
│  │  │  │  ┌ day of week (0-6, 0=Sun)
│  │  │  │  │
*  *  *  *  *
```

Common patterns:
| Expression | Meaning |
|-----------|---------|
| `0 9 * * *` | Every day at 9am |
| `0 9 * * MON` | Every Monday at 9am |
| `0 */4 * * *` | Every 4 hours |
| `*/30 * * * *` | Every 30 minutes |
| `0 9 1 * *` | First of every month at 9am |
| `0 9,17 * * MON-FRI` | 9am and 5pm on weekdays |

**Best for:** Regular reporting, periodic sweeps, time-based reminders.

---

### 2. Interval (Recurring)

Simpler syntax for "run every N minutes/hours/days."

```bash
ad-cron-create \
  --project <projectId> \
  --agent <agentId> \
  --name "Health Check" \
  --every "30m" \
  --message "Run a system health check and report any anomalies."
```

**Interval formats:**
| Format | Meaning |
|--------|---------|
| `30m` | Every 30 minutes |
| `2h` | Every 2 hours |
| `1d` | Every day |
| `7d` | Every 7 days |

**Best for:** Polling jobs, keep-alive tasks, frequent monitoring.

**Mental model:** Interval schedules start counting from when they were created (or last run), not from a fixed clock point. A `30m` interval that's created at 9:07 fires at 9:37, 10:07, etc.

---

### 3. One-Shot (Scheduled Trigger)

Fires exactly once at a specific ISO timestamp.

```bash
ad-cron-create \
  --project <projectId> \
  --agent <agentId> \
  --name "Post-Launch Report" \
  --at "2026-06-01T10:00:00Z" \
  --message "Generate a summary report of the launch day metrics."
```

**Best for:** Reminders, time-gated tasks, delayed actions, post-event follow-ups.

**Mental model:** Think of one-shot schedules as **deferred tasks** — work you know needs to happen but not right now.

---

## Creating Schedules

### Basic Creation Pattern

```bash
# Recurring with cron
ad-cron-create \
  --project PROJECT_ID \
  --agent AGENT_ID \
  --name "Descriptive Job Name" \
  --cron "0 9 * * *" \
  --message "What the agent should do when triggered"

# Recurring with interval
ad-cron-create \
  --project PROJECT_ID \
  --agent AGENT_ID \
  --name "Polling Job" \
  --every "1h" \
  --message "Check for updates and report"

# One-shot
ad-cron-create \
  --project PROJECT_ID \
  --agent AGENT_ID \
  --name "One-Time Reminder" \
  --at "2026-06-15T14:00:00Z" \
  --message "Follow up on the Q2 review"
```

### The `--message` Parameter

The message is what the agent receives as its prompt when the cron fires. Think of it as the **briefing** the agent reads at the start of that triggered session.

**Good message patterns:**

```
"Scan all in-progress tasks for tasks that have been stuck for >24 hours. 
 Post a comment on each asking for a status update."

"Generate this week's project summary: completed tasks, blockers, 
 upcoming deadlines. Post it as a comment on task #overview."

"Check the GitHub repo for open PRs that need review. Create tasks 
 for each one in AgentDesk with appropriate priority."
```

**Anti-pattern:** Don't write vague messages like "do your job" or "check things." Be specific — the agent has no other context than what you provide.

---

## Managing Schedules

### Listing All Crons

```bash
ad-crons
# → Lists all cron jobs across projects with status, schedule, last run
```

### Getting Details on a Specific Cron

```bash
ad-cron <cronId>
# → Full details including schedule, message, agent, enabled status
```

### Viewing Run History

```bash
ad-cron-runs <cronId>
# → List of past runs: timestamp, status (success/failure), duration, summary
```

**Use when:** Debugging why a job didn't run, or checking if a job is working correctly.

### Updating a Schedule

```bash
# Change the schedule
ad-cron-update <cronId> --cron "0 10 * * *"  # change to 10am

# Change the message
ad-cron-update <cronId> --message "New briefing for the agent"

# Rename
ad-cron-update <cronId> --name "Better Job Name"

# Pause/disable
ad-cron-update <cronId> --enabled false

# Re-enable
ad-cron-update <cronId> --enabled true
```

### Deleting a Schedule

```bash
ad-cron-delete <cronId>
```

**Caution:** Deletion is permanent. If you might want the schedule back, disable it instead (`--enabled false`).

### Manual Trigger (Out-of-Schedule Run)

```bash
ad-cron-run <cronId>
# Fires the cron immediately, as if it were its scheduled time
```

**Use when:** Testing a new cron, or running a job early because conditions warrant it.

---

## The Heartbeat: A Special Cron Pattern

The most important cron in AgentDesk is the **heartbeat** — a recurring trigger that wakes up an agent on a fixed interval to check for work.

```bash
# Example heartbeat cron
ad-cron-create \
  --project PROJECT_ID \
  --agent master-agent \
  --name "master-agent heartbeat" \
  --every "30m" \
  --message "HEARTBEAT: Check your assigned tasks, mentions, and board updates. Act on anything actionable. If nothing to do, reply HEARTBEAT_OK."
```

**Mental model:** The heartbeat is the agent's "clock" — it's what converts a stateless LLM into an always-on agent. Without a heartbeat, agents only act when directly messaged.

### Heartbeat Design Principles

1. **Stagger heartbeats** — if you have multiple agents, don't fire them all at once. Use `ad-stagger` to calculate offsets.
2. **Make the message explicit** — the heartbeat message should tell the agent exactly what to check and in what order.
3. **Keep heartbeats short** — the session budget (~10 min, ~50 tool calls) must fit within the interval. A 5-minute interval with a 10-minute session creates overlap.

---

## Scheduling Patterns

### Pattern 1: Daily Standup Report

```bash
ad-cron-create \
  --project projectId \
  --agent master-agent \
  --name "Daily Standup" \
  --cron "0 9 * * MON-FRI" \
  --message "Generate a standup report: What was completed yesterday? What's in progress today? Any blockers? Post as a comment on the project overview task."
```

### Pattern 2: Periodic Cleanup Sweep

```bash
ad-cron-create \
  --project projectId \
  --agent master-agent \
  --name "Stale Task Sweep" \
  --cron "0 10 * * MON" \
  --message "Find tasks that have been in-progress for more than 7 days without a comment update. Post a check-in comment on each one asking for status."
```

### Pattern 3: Reminder Chain

Create a one-shot that creates another one-shot:

```bash
# Set a reminder for a week from now
ad-cron-create \
  --project projectId \
  --agent master-agent \
  --name "Q2 Review Reminder" \
  --at "2026-06-30T09:00:00Z" \
  --message "Remind the team that Q2 closes today. Check all open tasks and update their status."
```

### Pattern 4: Monitoring Loop

```bash
ad-cron-create \
  --project projectId \
  --agent monitor-agent \
  --name "API Health Check" \
  --every "15m" \
  --message "Check the production API health endpoint. If status is not 200, create a critical-priority task titled 'API DOWN - investigate immediately' and assign to on-call-agent."
```

---

## Thinking About Timing: Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Setting heartbeat interval shorter than session runtime | Sessions overlap, causing duplicate work | Keep interval > session budget (min 30m) |
| Using UTC times without accounting for timezone | Jobs fire at wrong local time | Convert to UTC explicitly; document the local time in the name |
| Creating a one-shot without noting its ID | Can't update or delete it | Save the ID returned by `ad-cron-create` to WORKING.md |
| Vague cron messages | Agent doesn't know what to do | Be explicit: what to check, what to create, where to post results |
| Not using `ad-cron-runs` to verify | Jobs that silently fail go unnoticed | Check run history after setting up a new cron |

---

## Critical Rule: Always Use AgentDesk Scheduling

**Never use Claude Code's built-in `ScheduleWakeup` tool or the `schedule` skill for AgentDesk jobs.**

| Mechanism | Visibility | Pausable? | Shows in UI? |
|-----------|-----------|-----------|-------------|
| `ad-cron-create` (correct) | ✅ In AgentDesk DB | ✅ Yes | ✅ Yes |
| `ScheduleWakeup` tool (wrong) | ❌ Invisible | ❌ No | ❌ No |
| Claude Code `schedule` skill (wrong) | ❌ Invisible | ❌ No | ❌ No |

Jobs created outside AgentDesk are invisible, can't be paused, and disappear if the session ends. Always use `ad-cron-create`.
