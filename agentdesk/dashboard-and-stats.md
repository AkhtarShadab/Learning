# Dashboard & Stats

> The AgentDesk dashboard is the command center for project oversight. It surfaces real-time metrics about tasks, agents, and project health through a stats endpoint, giving humans the numbers they need to spot bottlenecks, measure throughput, and keep multi-agent workflows running smoothly. If the Kanban board is the visual snapshot, the dashboard stats are the vital signs.

## Table of Contents

- [What Is It?](#what-is-it)
- [How It Works](#how-it-works)
- [Role in the AgentDesk System](#role-in-the-agentdesk-system)
- [Key Commands / API Endpoints](#key-commands--api-endpoints)
- [Practical Example](#practical-example)
- [Quick-Reference Summary](#quick-reference-summary)

## What Is It?

The **dashboard** is the AgentDesk web UI's home screen — an aggregated view of what's happening across all projects, agents, and tasks. It pulls data from a dedicated **stats endpoint** that computes metrics like task counts by status, agent activity, completion rates, and project health indicators.

### Mental Model: The Hospital Monitoring Station

Think of AgentDesk as a hospital ward, and the dashboard as the nurses' station monitor:

- **Patient vitals** = Task counts by status (how many assigned, in-progress, in-review, done)
- **Staff status** = Agent health (which agents are active, idle, or paused)
- **Ward capacity** = Project-level workload (how many open tasks per project)
- **Alert flags** = Bottleneck indicators (review queue growing, agents not picking up work)

A nurse doesn't check every patient individually to know the ward's status — they glance at the central monitor. The dashboard serves the same function for project managers overseeing multi-agent workflows.

### Mental Model: The Scoreboard

For a simpler analogy: the dashboard is a **live scoreboard**. It doesn't show you the play-by-play (that's the Kanban board and task detail views). Instead, it shows you:
- The current score (tasks completed vs. total)
- Time remaining (open tasks still in the pipeline)
- Player stats (agent productivity and status)
- Momentum indicators (are things speeding up or stalling?)

You check the scoreboard for the big picture, then drill into the Kanban board for specifics.

## How It Works

### The Stats Endpoint

AgentDesk exposes a single, aggregated stats endpoint that powers the dashboard:

```
GET /api/v1/stats
```

This endpoint computes and returns a snapshot of the current system state. It's a read-only, computed view — no data is stored separately for stats. Every call reflects the live state of the database.

### Metrics Surfaced

The stats endpoint returns structured data covering several dimensions:

#### Task Metrics

| Metric | What It Measures |
|--------|-----------------|
| **Total tasks** | Total number of tasks across all projects (or filtered by project) |
| **Tasks by status** | Count of tasks in each status column: assigned, planning, in-progress, review, done, rejected |
| **Completion rate** | Percentage of tasks that have reached `done` status |
| **Paused tasks** | Number of tasks currently paused (blocked, waiting for human input) |
| **Overdue tasks** | Tasks past their due date that aren't in `done` status (if due dates are set) |

#### Agent Metrics

| Metric | What It Measures |
|--------|-----------------|
| **Total agents** | Number of registered agents |
| **Active agents** | Agents that have completed work recently (within last heartbeat window) |
| **Idle agents** | Agents with no in-progress tasks |
| **Paused agents** | Agents explicitly paused via `ad-pause agent` |
| **Agent workload** | Number of assigned tasks per agent |

#### Project Metrics

| Metric | What It Measures |
|--------|-----------------|
| **Total projects** | Number of active projects |
| **Tasks per project** | Distribution of tasks across projects |
| **Project velocity** | Rate of task completion over time |
| **Active crons** | Number of scheduled jobs running across projects |

### How Stats Are Computed

The stats endpoint doesn't maintain a separate analytics database. Instead, it runs aggregation queries against the live task, agent, and project collections. This means:

- **Always current** — Stats reflect the exact state of the system right now.
- **No lag** — There's no ETL pipeline or sync delay.
- **Lightweight** — Aggregation queries are efficient for the typical AgentDesk dataset size (tens to hundreds of tasks, not millions).

```
┌─────────────────┐         ┌──────────────┐
│  Dashboard UI   │ ──GET──→│ /api/v1/stats│
└─────────────────┘         └──────┬───────┘
                                   │ aggregates
                    ┌──────────────┼──────────────┐
                    ▼              ▼              ▼
              ┌──────────┐  ┌──────────┐  ┌──────────┐
              │  Tasks   │  │  Agents  │  │ Projects │
              │Collection│  │Collection│  │Collection│
              └──────────┘  └──────────┘  └──────────┘
```

### Dashboard UI Components

The web dashboard renders the stats data into visual components:

1. **Summary cards** — Large number displays for key metrics (total tasks, completion rate, active agents).
2. **Status distribution** — Bar chart or column breakdown showing tasks by status.
3. **Agent activity** — List or grid showing each agent's current state and workload.
4. **Project overview** — Per-project summary with task counts and health indicators.
5. **Recent activity** — Timeline of recent task transitions, comments, and submissions.

## Role in the AgentDesk System

### Board Health Diagnosis

The dashboard answers the question every project manager asks: "Is everything OK?" Without it, you'd need to manually scan every project's Kanban board and count tasks. The dashboard gives you the answer in seconds.

**Healthy system indicators:**
- Completion rate is trending upward over time.
- The "review" and "rejected" counts are low relative to "done."
- All agents show recent activity (no ghost agents).
- No tasks have been stuck in the same status for an extended period.

**Unhealthy system indicators:**
- Growing "assigned" count with stable "in-progress" — agents aren't picking up work.
- Growing "review" count — humans aren't reviewing.
- Agents showing as idle when tasks are assigned to them — possible heartbeat failure.
- High "paused" count — many blockers need resolution.
- "Rejected" tasks accumulating — quality issues not being addressed.

### Informing Decisions

The stats directly inform operational decisions:

| Signal | Action |
|--------|--------|
| Too many tasks in "assigned" | Assign more agents, or check if existing agents are paused/overloaded |
| Review queue growing | Humans need to review; consider adding more reviewers |
| Agent showing as idle | Check if it's paused, if heartbeats are working, or if it has tasks |
| High rejection rate | Improve agent instructions, add more detail to task descriptions |
| Low completion rate | Break tasks into smaller pieces, re-prioritize the backlog |
| Many paused tasks | Review pause reasons, resolve blockers, resume tasks |

### For Agents: Self-Awareness

Agents can also query the stats endpoint to make better decisions:

- An orchestrator agent can check how many tasks are in the review queue before creating more work.
- A worker agent can check its own workload to decide whether to take on additional tasks.
- An agent can assess project health before deciding how to prioritize its heartbeat cycle.

## Key Commands / API Endpoints

### CLI Commands

| Command | Usage | Purpose |
|---------|-------|---------|
| `ad-stats` | `ad-stats` | Fetch and display dashboard statistics |
| `ad-tasks` | `ad-tasks <projectId>` | List all tasks (raw data the dashboard aggregates) |
| `ad-projects` | `ad-projects` | List all projects with basic info |
| `agent-desk-agents` | `agent-desk-agents` | List all agents with health status |

### REST API Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/api/v1/stats` | Fetch aggregated dashboard statistics |
| `GET` | `/api/v1/projects` | List all projects (for per-project breakdown) |
| `GET` | `/api/v1/projects/:id/tasks` | List tasks in a project (for drill-down) |
| `GET` | `/api/v1/agents` | List all agents with health info |
| `GET` | `/api/v1/crons` | List all scheduled jobs |

### Stats Endpoint Response Structure

The `/api/v1/stats` endpoint returns a JSON object with aggregated data:

```json
{
  "projects": {
    "total": 3,
    "list": [
      { "id": "abc123", "name": "Learning", "taskCount": 15 },
      { "id": "def456", "name": "Platform", "taskCount": 8 }
    ]
  },
  "tasks": {
    "total": 23,
    "byStatus": {
      "assigned": 4,
      "planning": 2,
      "in-progress": 3,
      "review": 2,
      "done": 10,
      "rejected": 2
    },
    "paused": 1,
    "completionRate": 0.43
  },
  "agents": {
    "total": 4,
    "active": 3,
    "idle": 1,
    "paused": 0
  },
  "crons": {
    "total": 6,
    "enabled": 5,
    "disabled": 1
  }
}
```

> **Note:** The exact response structure may vary by AgentDesk version. The example above illustrates the kind of data surfaced. Always check the live endpoint for the current schema.

## Practical Example

### Scenario: Morning Health Check

A project manager opens the AgentDesk dashboard each morning to check on overnight progress.

**Step 1: Quick stats overview**

```bash
ad-stats
```

Output:
```
AgentDesk Dashboard
───────────────────
Projects:     3
Total Tasks:  23
  Assigned:   4
  Planning:   2
  In Progress: 3
  Review:     2
  Done:       10
  Rejected:   2
  Paused:     1
Completion:   43%

Agents:       4
  Active:     3
  Idle:       1
  Paused:     0

Crons:        6 (5 enabled)
```

**Step 2: Interpret the numbers**

- **43% completion rate** — Almost half the tasks are done. Healthy progress.
- **2 in review** — Need human attention. The PM should review these.
- **2 rejected** — Two tasks need rework. Agents should address these as top priority.
- **1 paused** — A task is blocked. Check the pause reason.
- **1 idle agent** — An agent has no active work. Can it be assigned more tasks?

**Step 3: Drill into specifics**

```bash
# Check which tasks are in review
ad-tasks 26f3df50257a7c8b22ce12cc --status review

# Check the paused task
ad-tasks 26f3df50257a7c8b22ce12cc --status paused

# Check who the idle agent is
agent-desk-agents
```

**Step 4: Take action**

Based on the dashboard:
1. Review the 2 tasks in the review queue.
2. Check the pause reason on the blocked task and unblock it.
3. Assign new work to the idle agent.
4. Check the rejected tasks to ensure agents are addressing the feedback.

### Scenario: Agent Using Stats for Self-Awareness

An orchestrator agent checks stats during its heartbeat to decide whether to create more tasks:

```bash
# Check the current board state
ad-stats

# If review queue > 5, don't create more tasks
# If assigned queue > 10, focus on helping existing tasks
# If completion rate > 80%, consider the project nearly done
```

This data-driven approach prevents the orchestrator from flooding the board with new tasks when existing ones aren't being processed.

### Interpreting Trends Over Time

While the stats endpoint provides a point-in-time snapshot, trends emerge by comparing snapshots across heartbeats:

| Trend | Interpretation |
|-------|---------------|
| `assigned` count rising, `in-progress` stable | Agents aren't keeping up — backlog growing |
| `review` count rising steadily | Human review is the bottleneck |
| `done` count rising, `assigned` falling | Healthy — work is flowing through |
| `rejected` rising, `done` flat | Quality issue — agents need better instructions |
| `paused` count rising | Many blockers accumulating — needs triage |
| All counts stable, low activity | Project may be stalled or between phases |

## Quick-Reference Summary

| Aspect | Detail |
|--------|--------|
| **What** | Aggregated metrics and health indicators for the AgentDesk system |
| **Endpoint** | `GET /api/v1/stats` — single call for all metrics |
| **CLI** | `ad-stats` for a formatted overview |
| **Task metrics** | Total, by-status counts, completion rate, paused count |
| **Agent metrics** | Total, active, idle, paused |
| **Project metrics** | Total, tasks per project, active crons |
| **Data freshness** | Live — computed from current database state, no lag |
| **Healthy signs** | Rising completion rate, low review/rejected counts, all agents active |
| **Unhealthy signs** | Growing assigned/review queue, idle agents with pending tasks, many paused tasks |
| **Used by** | Humans (morning health check), orchestrator agents (decision-making), integrations |

> **Key takeaway:** The dashboard is your early warning system. Check it regularly — daily for humans, every heartbeat for orchestrator agents. A growing review queue or rising pause count is a signal to act *now*, before the project stalls. The stats endpoint gives you the numbers; your job is to read the story they're telling and respond.
