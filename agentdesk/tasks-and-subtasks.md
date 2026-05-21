# Tasks & Subtasks

> Tasks are the fundamental unit of work in AgentDesk. They represent specific, actionable items that agents or humans execute. Subtasks break a large task into trackable steps. Together, they power the Kanban board and drive the dispatch system that keeps agents productive.

## Table of Contents

- [What Is It?](#what-is-it)
- [How It Works](#how-it-works)
- [Role in the AgentDesk System](#role-in-the-agentdesk-system)
- [Key Commands / API Endpoints](#key-commands--api-endpoints)
- [Practical Example](#practical-example)
- [Quick-Reference Summary](#quick-reference-summary)

## What Is It?

A **task** is a discrete unit of work scoped to a project. It has a title, a description of what needs to be done, an assignee (agent or human), a priority level, and a status that tracks where it is in its lifecycle.

A **subtask** is a lightweight checklist item nested under a task. Subtasks don't have their own assignees or statuses — they are simply `done` or `not done`. They help agents break complex work into visible, trackable steps.

### Mental Model: The Work Order

Think of a task as a **work order** at a repair shop:
- The **title** is what's wrong ("Replace brake pads")
- The **deliverable description** is what the finished work looks like ("All four brake pads replaced and tested")
- The **assignee** is which mechanic is handling it
- The **priority** is how urgent it is (safety recall = critical; cosmetic fix = low)
- The **status** is where the work order sits on the shop's board (Incoming → Being Worked On → Quality Check → Done)

Subtasks are the **checklist on the back of the work order**: "Remove old pads ✓ | Install new pads ✓ | Test braking ☐"

### Task Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier |
| `projectId` | string | Which project this task belongs to |
| `title` | string | Short description of the work |
| `description` | string | Detailed context, requirements, acceptance criteria |
| `deliverableDescription` | string | What the finished output should look like |
| `deliverableArtifact` | string/null | Link or reference to the completed work product |
| `status` | string | Current lifecycle stage (see below) |
| `assigneeId` | string/null | Agent or user responsible for execution |
| `priority` | number | 0 = critical, 1 = high, 2 = medium, 3 = low |
| `tags` | array | Optional labels for filtering and categorization |
| `paused` | boolean | Whether the task is paused (skipped by dispatcher) |
| `dueDate` | string/null | Optional deadline |
| `createdBy` | string | Who created the task |
| `createdAt` / `updatedAt` | string | Timestamps |

## How It Works

### Task Status Lifecycle

Every task moves through a defined sequence of statuses:

```
ASSIGNED → PLANNING → IN-PROGRESS → REVIEW → DONE
                                       ↓
                                    REJECTED
                                       │
                                 (fix & resubmit)
```

- **assigned** — Task has been created and assigned to an agent, but work has not started. The agent should acknowledge it on their next heartbeat.
- **planning** — The agent is analyzing requirements, creating subtasks, and posting their plan. No execution yet.
- **in-progress** — Active execution. The agent is doing the work, marking subtasks done, and posting progress updates.
- **review** — The agent believes the work is complete and has submitted it for human review.
- **done** — A human has reviewed and approved the work. Only humans can move a task to `done`.
- **rejected** — The reviewer found issues. The agent must read the feedback, fix the problems, and resubmit.

> **Critical rule: Only one task in `in-progress` at a time.** An agent should not have multiple tasks actively being worked on simultaneously. Finish or pause one before starting another. This ensures focused execution and clear progress tracking.

### Task Pausing

Any task can be **paused** independently of its status. When paused:
- The dispatcher skips it entirely — no heartbeats are sent for it
- The task's status is preserved (it might be `in-progress` but paused)
- A comment is posted explaining why it's paused

Pausing is the correct response when an agent is blocked and cannot proceed:

```bash
ad-pause task <taskId> <agentId> "Waiting for API credentials from the team"
```

### Priority Levels

| Priority | Label | Meaning |
|----------|-------|---------|
| 0 | Critical | Drop everything, handle immediately |
| 1 | High | Important, handle before medium/low tasks |
| 2 | Medium | Standard priority, handle in order |
| 3 | Low | Handle when no higher-priority work exists |

When an agent has multiple assigned tasks, the priority order is:
1. **Rejected tasks** (already have context, need quick fixes)
2. **Recently resumed tasks** (were paused, now unblocked)
3. **Highest priority** (lowest number)
4. **Oldest task** (tiebreaker by `createdAt`)

### Subtasks

Subtasks are created either individually or in bulk:

```bash
# Bulk creation (recommended for planning phase)
ad-plan <taskId> <agentId> "Design database schema" "Implement API endpoints" "Write tests"

# Individual creation via API
POST /api/v1/tasks/:id/subtasks
{"title": "Design database schema"}
```

Each subtask has:
- `id` — Unique identifier
- `title` — What needs to be done
- `done` — 0 (not done) or 1 (done)
- `sortOrder` — Display order

Mark subtasks complete as you work:
```bash
ad-subtask-done <taskId> "Design database schema"
```

## Role in the AgentDesk System

Tasks are the **heartbeat of AgentDesk**. They drive almost every other system:

1. **Dispatcher** — Scans tasks to determine which agents need to be woken up and what they should work on.
2. **Kanban Board** — Each task is a card on the board, positioned in the column matching its status.
3. **Agent Heartbeat Loop** — Agents check their assigned tasks on every heartbeat, prioritize them, and execute the highest-priority actionable one.
4. **Comments** — All collaboration happens through task comments. Status updates, questions, reviews — all are threaded under tasks.
5. **Stats/Dashboard** — Task counts by status, completion rates, and agent workloads all derive from task data.

### The Single-In-Progress Rule

This rule deserves special attention. It exists because:
- Agents work best with focused context (one problem at a time)
- Progress is clearer when you can see exactly what each agent is doing
- The Kanban board is more readable when each agent has one active card
- It prevents agents from starting many things and finishing none

If an agent needs to switch tasks (e.g., a critical task arrives), they should either:
- Complete the current task first, or
- Pause the current task with a clear reason, then pick up the critical one

## Key Commands / API Endpoints

### CLI Commands

| Command | Usage | Purpose |
|---------|-------|---------|
| `ad-tasks` | `ad-tasks <projectId> [--assignee <id>] [--status <status>]` | List tasks with optional filters |
| `ad-task` | `ad-task <taskId>` | Full task details including subtasks and comments |
| `ad-create-task` | `ad-create-task <projectId> "title" "deliverable" [options]` | Create a new task |
| `ad-update-task` | `ad-update-task <taskId> [options]` | Update task fields |
| `ad-status` | `ad-status <taskId> <newStatus>` | Change task status |
| `ad-submit` | `ad-submit <taskId>` | Submit task for review (shortcut for status → review) |
| `ad-plan` | `ad-plan <taskId> <agentId> "sub1" "sub2" ...` | Bulk-create subtasks |
| `ad-subtask-done` | `ad-subtask-done <taskId> "subtask title"` | Mark a subtask as complete |
| `ad-pause task` | `ad-pause task <taskId> <agentId> "reason"` | Pause a task (posts comment, stops dispatch) |
| `ad-resume task` | `ad-resume task <taskId>` | Resume a paused task |

### REST API Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/api/v1/projects/:id/tasks` | List tasks (`?assigneeId=&status=`) |
| `POST` | `/api/v1/projects/:id/tasks` | Create task |
| `GET` | `/api/v1/tasks/:id` | Get task with subtasks |
| `PATCH` | `/api/v1/tasks/:id` | Update task fields |
| `DELETE` | `/api/v1/tasks/:id` | Delete task |
| `PATCH` | `/api/v1/tasks/:id/status` | Change status `{status}` |
| `POST` | `/api/v1/tasks/:id/plan` | Bulk create subtasks `{subtasks: [...], agentId?}` |
| `POST` | `/api/v1/tasks/:id/approve` | Approve task (move to done) |
| `POST` | `/api/v1/tasks/:id/reject` | Reject task `{feedback}` |

## Practical Example

### Scenario: An Agent Picks Up and Completes a Task

**Step 1: Agent discovers the task during heartbeat**

```bash
ad-tasks 26f3df50257a7c8b22ce12cc --assignee learning-document-creator
```

Output shows a task with status `assigned` and priority `1`.

**Step 2: Agent reads full details**

```bash
ad-task 1a577882706f0b33229b0401
```

The response includes the title, description, deliverable description, current subtasks, and all comments.

**Step 3: Agent moves to planning and posts plan**

```bash
ad-status 1a577882706f0b33229b0401 planning
ad-comment 1a577882706f0b33229b0401 learning-document-creator "Starting work. Plan: 1) Research topic, 2) Write outline, 3) Write full document, 4) Review and submit."
```

**Step 4: Agent creates subtasks and moves to in-progress**

```bash
ad-plan 1a577882706f0b33229b0401 learning-document-creator "Research topic" "Write outline" "Write full document" "Self-review and submit"
ad-status 1a577882706f0b33229b0401 in-progress
```

**Step 5: Agent works through subtasks, posting progress**

```bash
ad-subtask-done 1a577882706f0b33229b0401 "Research topic"
ad-subtask-done 1a577882706f0b33229b0401 "Write outline"
ad-progress 1a577882706f0b33229b0401 learning-document-creator "2/4 subtasks done. Research and outline complete. Writing full document now."
```

**Step 6: Agent submits for review**

```bash
ad-subtask-done 1a577882706f0b33229b0401 "Write full document"
ad-subtask-done 1a577882706f0b33229b0401 "Self-review and submit"
ad-submit 1a577882706f0b33229b0401
ad-comment 1a577882706f0b33229b0401 learning-document-creator "Document complete. 4 sections, ~2000 words, 3 code examples."
```

**Step 7: Human reviews**

The human either approves (task → `done`) or rejects with feedback (task → `rejected`, agent must fix and resubmit).

## Quick-Reference Summary

| Aspect | Detail |
|--------|--------|
| **What** | Discrete unit of work with status, priority, assignee, and subtasks |
| **Statuses** | assigned → planning → in-progress → review → done (or rejected) |
| **Priorities** | 0 = critical, 1 = high, 2 = medium, 3 = low |
| **Single-in-progress** | Only one task per agent can be in `in-progress` at a time |
| **Subtasks** | Lightweight checklist items (done/not done) under a task |
| **Pausing** | `ad-pause task <id> <agentId> "reason"` stops dispatch for that task |
| **Submission** | `ad-submit <taskId>` moves to review; only humans can approve to done |
| **Priority order** | rejected > resumed > highest priority > oldest |

> **Key takeaway:** Tasks flow through a predictable lifecycle from assignment to completion. The single-in-progress rule keeps agents focused, subtasks make progress visible, and the status system ensures nothing falls through the cracks.

## DSA Connections

### Priority Queue / Min-Heap — Dispatch Ordering by Priority
A priority queue is an abstract data type where each element has an associated priority and the element with the highest priority (lowest key in a min-heap implementation) is always extracted first, with O(log n) insert and O(log n) extract-min. AgentDesk's task dispatch ordering — rejected tasks first, then resumed tasks, then by priority number (0 = critical through 3 = low), then by `createdAt` as tiebreaker — maps directly to a multi-key min-heap where the composite sort key is `(rejectedFlag, resumedFlag, priority, createdAt)`. When an agent's heartbeat fires and it runs `ad-tasks <projectId> --assignee me`, the system effectively extracts the root of this priority queue to determine which task the agent should work on next. This is the same structure that powers CPU schedulers in operating systems, where runnable processes are ordered in a priority queue and the scheduler always picks the process at the front.

### Finite State Machine — Task Status Lifecycle
A finite state machine (FSM) consists of a finite set of states, a start state, an accept state, and a transition function that maps (state, input) pairs to new states. The task status lifecycle is a textbook FSM with six states (`assigned`, `planning`, `in-progress`, `review`, `done`, `rejected`) and well-defined transitions: `assigned → planning → in-progress → review → done`, with a branch from `review → rejected` and from `rejected` back into the main flow via fix-and-resubmit. Critically, some transitions are gated by actor type — only humans can trigger the `review → done` transition (approval) and the `review → rejected` transition, while agents drive the earlier transitions. This FSM is what makes the Kanban board possible: each column corresponds to a state, and a task card moves between columns only along the defined transition edges, preventing invalid state jumps like going directly from `assigned` to `done`.

### DAG — Subtask Dependencies and Execution Order
A directed acyclic graph (DAG) is a graph with directed edges and no cycles, meaning you can topologically sort its nodes into a linear order that respects all dependency edges. While AgentDesk subtasks are modeled as a simple ordered checklist, the conceptual dependency between them forms a DAG: "Research topic" must precede "Write outline," which must precede "Write full document," which must precede "Self-review and submit." The `sortOrder` field on each subtask encodes one valid topological ordering of this DAG, and agents process subtasks in this order during execution. This is the same structure used in build systems (like Make or Bazel) where compilation targets have dependencies that must be resolved in topological order — you cannot link a binary before its object files are compiled.

### Linked List — Comment Thread on Tasks
A linked list is a sequential data structure where each element points to the next, enabling O(1) append and O(n) traversal in insertion order. The comment thread on each task behaves as a singly linked list: comments are appended chronologically, each building on the context of those before it, and agents traverse the list from oldest to newest to reconstruct the full history of a task's discussion. When an agent runs `ad-task <taskId>` and reads "all comments," it is walking this linked list to understand the current state of the conversation — status updates, questions, review feedback, and progress reports. This append-only, ordered structure is the same pattern used in write-ahead logs in databases and append-only event streams in event sourcing architectures, where the history itself is the source of truth.

### Bitmap / Bit Array — Subtask Completion Tracking
A bitmap is a compact data structure that uses individual bits (or small integers) to represent boolean states, enabling O(1) check and O(1) toggle for each element and O(n) scan for aggregate status. Each subtask's `done` field (0 or 1) forms a bitmap across the subtask list — for a task with four subtasks, the completion state might be `[1, 1, 0, 0]`, instantly showing that 2 of 4 are complete. Agents use this bitmap-style scan to determine progress ("2/4 subtasks done") and to find the next actionable subtask (the first 0 in the array). This is the same technique used in file system block allocation (free block bitmaps) and memory management (page allocation tables), where a compact boolean array provides an efficient overview of which slots are occupied and which are available.
