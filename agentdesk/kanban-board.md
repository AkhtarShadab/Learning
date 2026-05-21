# Kanban Board

> The Kanban board is the visual interface for AgentDesk's task management system. It organizes tasks into columns by status, giving humans and agents an at-a-glance view of what's happening across a project. Every task transition — from assigned to done — is reflected as a card moving across the board.

## Table of Contents

- [What Is It?](#what-is-it)
- [How It Works](#how-it-works)
- [Role in the AgentDesk System](#role-in-the-agentdesk-system)
- [Key Commands / API Endpoints](#key-commands--api-endpoints)
- [Practical Example](#practical-example)
- [Quick-Reference Summary](#quick-reference-summary)

## What Is It?

A **Kanban board** is a visual workflow management tool that represents work items (tasks) as cards in columns, where each column represents a stage in the workflow. AgentDesk implements a Kanban board for each project, with columns corresponding to task statuses.

### Mental Model: The Factory Floor

Imagine a factory assembly line with clearly marked stations:
- **Incoming** (assigned) — Raw materials arrive here. Work hasn't started.
- **Design** (planning) — Engineers are analyzing and planning the approach.
- **Assembly** (in-progress) — Active construction is happening.
- **Quality Control** (review) — Finished product is being inspected.
- **Shipping** (done) — Approved and delivered.
- **Returns** (rejected) — QC found issues; sent back to assembly with notes.

Each task card moves from left to right as it progresses. At any moment, looking at the board tells you: how much work is waiting, how much is active, and how much is done.

### Column Layout

The AgentDesk Kanban board has these columns, in order:

| Column | Status | Description |
|--------|--------|-------------|
| **Assigned** | `assigned` | Task created and assigned, not yet started |
| **Planning** | `planning` | Agent is analyzing requirements and creating a plan |
| **In Progress** | `in-progress` | Active work is happening |
| **Review** | `review` | Work submitted, awaiting human review |
| **Done** | `done` | Reviewed and approved |
| **Rejected** | `rejected` | Review found issues; needs rework |

There is no "backlog" or "unassigned" column — in AgentDesk, every task has an assignee from creation. If a task isn't ready to be worked on, it stays in the `assigned` column until the agent's next heartbeat picks it up.

## How It Works

### Task Flow Across Columns

Tasks move across the board following the standard lifecycle:

```
┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐
│ ASSIGNED │ → │ PLANNING │ → │IN-PROGRESS│ → │  REVIEW  │ → │   DONE   │
└──────────┘   └──────────┘   └──────────┘   └──────────┘   └──────────┘
                                                  │
                                                  ↓
                                            ┌──────────┐
                                            │ REJECTED │ ──→ (back to IN-PROGRESS)
                                            └──────────┘
```

Each transition is triggered by a specific action:

| Transition | Triggered By | Command |
|-----------|-------------|---------|
| assigned → planning | Agent acknowledges task | `ad-status <id> planning` |
| planning → in-progress | Agent starts execution | `ad-status <id> in-progress` |
| in-progress → review | Agent submits work | `ad-submit <id>` |
| review → done | Human approves | `POST /tasks/:id/approve` |
| review → rejected | Human rejects with feedback | `POST /tasks/:id/reject` |
| rejected → in-progress | Agent picks up rejection and starts fixing | `ad-status <id> in-progress` |

### Card Information

Each card on the Kanban board displays:
- **Title** — The task's title
- **Assignee** — Which agent (shown as avatar/name)
- **Priority** — Visual indicator (critical, high, medium, low)
- **Subtask progress** — e.g., "3/5 subtasks done"
- **Tags** — Optional labels for categorization
- **Last updated** — When the card was last modified
- **Paused indicator** — If the task is paused, it's visually marked

### Board Interactions (UI)

From the AgentDesk dashboard, humans can:
- **View task details** — Click a card to see full description, comments, and subtasks
- **Drag cards** — Move tasks between columns (triggers status change)
- **Filter by assignee** — Show only one agent's tasks
- **Filter by priority** — Focus on critical/high items
- **Filter by tag** — Group related tasks
- **Create tasks** — Add new cards directly to the board

### Paused Tasks on the Board

Paused tasks remain in their current column but are visually distinguished (e.g., dimmed or flagged). They don't move and aren't dispatched until resumed. This makes it easy to see what's blocked without removing it from the board.

## Role in the AgentDesk System

The Kanban board serves as the **single source of truth** for project status:

1. **Visibility** — Anyone (human or agent) can see the state of all tasks at a glance. No need to ask "what are you working on?" — look at the board.

2. **Flow management** — The board reveals bottlenecks. If the "Review" column is overflowing, humans need to review faster. If "In Progress" is empty, agents might be stuck or paused.

3. **WIP limits** — The single-in-progress rule acts as a natural WIP (Work In Progress) limit. Each agent can have at most one card in the "In Progress" column.

4. **Coordination** — When multiple agents work on the same project, the board shows who is doing what, preventing duplicate work and enabling parallel execution.

5. **Progress tracking** — Over time, the flow of cards from left to right tells the story of project progress. Cards that sit in one column too long signal problems.

### Board Health Indicators

A healthy board looks like:
- **Steady left-to-right flow** — Cards move from assigned → done at a regular pace
- **Small "In Progress" column** — Only active work is here (WIP limit in effect)
- **Empty or small "Rejected" column** — Few items need rework
- **"Review" column doesn't grow unbounded** — Humans are reviewing promptly

An unhealthy board shows:
- **Cards stuck in "Assigned"** — Agents aren't picking up work (heartbeat issues? all paused?)
- **Cards stuck in "Review"** — Humans aren't reviewing (bottleneck alert)
- **Many paused tasks** — Lots of blockers that need resolution
- **Multiple in-progress per agent** — The single-in-progress rule is being violated

## Key Commands / API Endpoints

### CLI Commands for Board Interaction

| Command | Usage | Purpose |
|---------|-------|---------|
| `ad-tasks` | `ad-tasks <projectId>` | List all tasks (equivalent to reading the board) |
| `ad-tasks` | `ad-tasks <projectId> --status in-progress` | Filter by column |
| `ad-tasks` | `ad-tasks <projectId> --assignee <id>` | Filter by agent |
| `ad-status` | `ad-status <taskId> <status>` | Move a card to a different column |
| `ad-submit` | `ad-submit <taskId>` | Move card to Review column |

### REST API Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/api/v1/projects/:id/tasks` | List all tasks (the full board) |
| `GET` | `/api/v1/projects/:id/tasks?status=in-progress` | Filter by column |
| `GET` | `/api/v1/projects/:id/tasks?assigneeId=<id>` | Filter by assignee |
| `PATCH` | `/api/v1/tasks/:id/status` | Move card `{status: "new-status"}` |

## Practical Example

### Scenario: Reading the Board to Understand Project State

A project manager wants to understand the state of the "Learning" project.

**Step 1: View all tasks**

```bash
ad-tasks 26f3df50257a7c8b22ce12cc
```

Output shows tasks organized by their status:
```
[assigned]     "Set up project README" → doc-writer (priority 2)
[planning]     "Design learning path" → master-agent (priority 1)
[in-progress]  "Write architecture docs" → learning-document-creator (priority 1)
[review]       "Create onboarding guide" → doc-writer (priority 2)
[done]         "Initialize project structure" → master-agent (priority 1)
```

**Reading the board:**
- 1 task waiting to be started (assigned)
- 1 task being planned (planning)
- 1 task actively being worked on (in-progress)
- 1 task waiting for human review (review) ← action needed from humans
- 1 task completed (done)

**Step 2: Check for bottlenecks**

The "Review" column has a task. If this persists across multiple heartbeats, it's a sign that human reviewers need to act.

**Step 3: Check specific agent's workload**

```bash
ad-tasks 26f3df50257a7c8b22ce12cc --assignee learning-document-creator
```

Shows only the `learning-document-creator`'s tasks, helping determine if the agent is overloaded or has capacity.

## Quick-Reference Summary

| Aspect | Detail |
|--------|--------|
| **What** | Visual task board with columns for each status |
| **Columns** | Assigned → Planning → In Progress → Review → Done (+ Rejected) |
| **Card info** | Title, assignee, priority, subtask progress, tags, timestamps |
| **WIP limit** | One in-progress task per agent (single-in-progress rule) |
| **Paused tasks** | Stay in their column but are visually flagged |
| **Health signs** | Steady flow, small in-progress, responsive review, few rejections |
| **Bottleneck signs** | Stuck cards, growing review queue, many paused tasks |
| **CLI** | `ad-tasks <projectId> [--status X] [--assignee Y]` |

> **Key takeaway:** The Kanban board is not just a UI — it's a diagnostic tool. A quick look at the board tells you the health of the project, where bottlenecks exist, and what needs attention. Keep the board flowing smoothly and the project moves forward.

## DSA Connections

### Queue / FIFO — Column Ordering and Task Pickup

A queue is a first-in, first-out (FIFO) data structure where elements are enqueued at the rear and dequeued from the front, guaranteeing that the earliest arrival is served first. Each column on the Kanban board — Assigned, Planning, In Progress, Review, Done, Rejected — functions as a FIFO queue: tasks enter the column when their status changes and are processed in priority-then-arrival order. When an agent's heartbeat fires and it checks the Assigned column via `ad-tasks <projectId> --status assigned`, the task it picks up is the highest-priority, oldest-arriving task, exactly the behavior of a priority-augmented FIFO queue. The "Review" column is the clearest example: submitted tasks queue up waiting for human approval, and the board health indicators warn when this queue grows unbounded — a classic backpressure signal. This is the same queuing discipline that operating system schedulers and message broker consumers use to ensure fair, ordered processing.

### Finite State Machine — Status Transitions as Column Moves

A finite state machine (FSM) is a computational model with a finite set of states, a set of transitions between those states triggered by events, and exactly one active state at any time. The Kanban board's column structure is a direct visualization of a six-state FSM: Assigned, Planning, In Progress, Review, Done, and Rejected. Each task card is an instance of this FSM, and every column move corresponds to a state transition triggered by a specific command — `ad-status <id> planning` fires the assigned-to-planning transition, `ad-submit <id>` fires in-progress-to-review, and `POST /tasks/:id/reject` fires review-to-rejected. The transition diagram shown in the document (with its forward path and the rejected-to-in-progress loop) is literally an FSM state diagram. Invalid transitions are implicitly prevented — you cannot move a card from Assigned directly to Done without passing through the intermediate states, just as an FSM rejects input sequences that don't follow valid transition arcs. This formalization is what makes the single-in-progress rule enforceable: the FSM ensures an agent can only have one task in the In Progress state.

### Doubly Linked List — Drag Reorder Within and Between Columns

A doubly linked list is a linear data structure where each node has pointers to both its predecessor and successor, enabling O(1) insertion, deletion, and reordering when you have a reference to the target node. When a human drags a card to reorder it within a column (e.g., moving a high-priority task to the top of the Assigned column) or between columns (dragging from Assigned directly to In Progress), the operation is equivalent to unlinking a node from one position and relinking it at another — exactly a doubly linked list splice. The doubly linked structure is necessary because reordering requires updating both the previous and next neighbors of the removed node, and the neighbors at the insertion point. This is more efficient than an array representation where moving a card from position 3 to position 1 in a 50-card column would require shifting 47 elements. The same data structure powers reorderable lists in tools like Trello, Jira, and Notion's kanban views.

### Array-Based Partitioning — Column Buckets for Board Rendering

An array partition divides a single collection into contiguous sub-arrays based on a key, enabling grouped access without separate data structures for each group. The Kanban board partitions the project's task array into six column buckets by the `status` field: every task returned by `GET /api/v1/projects/:id/tasks` is slotted into its corresponding column array based on its current status value. This is analogous to the partition step in a counting sort or a bucket sort — tasks are distributed into a fixed number of buckets (six statuses), and within each bucket they maintain their internal ordering by priority and creation time. The filtering commands (`ad-tasks <projectId> --status in-progress` and the API's `?status=in-progress` query parameter) perform a direct bucket lookup rather than scanning the full task list, giving O(1) access to any single column. This partitioning is what makes the board renderable in constant time relative to column count, regardless of total task volume.

### Graph — Task Dependency and Bottleneck Detection

A directed graph is a collection of nodes connected by edges with direction, enabling traversal, cycle detection, and flow analysis. The Kanban board's health indicators implicitly model task flow as a directed acyclic graph: tasks flow from left (Assigned) to right (Done), with the Rejected column creating a back-edge to In Progress. The board health analysis described in the document — detecting stuck cards, growing review queues, and WIP limit violations — is essentially a flow-network analysis: identifying nodes (columns) where throughput drops below intake, which is the graph-theoretic definition of a bottleneck. When the document warns that "cards stuck in Review" signals a bottleneck, it is describing a node in the flow graph whose outgoing edge capacity (human review bandwidth) is less than its incoming edge flow (agent submission rate). This is the same analysis used in network capacity planning and manufacturing throughput optimization.
