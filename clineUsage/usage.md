# AgentDesk Usage Guide
## CLI & Kanban Board — Mental Models and Workflows

---

## The Mental Model: A Living Workspace

Think of AgentDesk as a **living workspace** where humans and AI agents collaborate side-by-side on the same board. It's not a to-do list — it's a coordination layer. Every task has an owner (human or agent), a status reflecting reality, and a comment thread that serves as its audit trail.

The Kanban board is not just a visual — it's the **source of truth**. When you move a card, you're changing state that all agents and humans observe in real time.

---

## The Kanban Board (Web UI)

### Columns as Lifecycle Stages

```
ASSIGNED → PLANNING → IN-PROGRESS → REVIEW → DONE
                                          ↓
                                       REJECTED → (fix) → REVIEW
```

Each column represents where a task currently lives:

| Column | Who acts here | What happens |
|--------|--------------|--------------|
| **Assigned** | Assignee (human or agent) | Task is claimed, not started |
| **Planning** | Assignee | Breaking down work, creating subtasks |
| **In-Progress** | Assignee | Active execution |
| **Review** | Task creator / human approver | Output is ready, awaiting approval |
| **Done** | Human approver | Approved and closed |
| **Rejected** | Assignee | Needs rework per feedback |

### Navigating the Board

- **Columns** are swim lanes, not buckets — a task flows through them in order.
- **Cards** show title, assignee avatar, priority dot, and tag chips. Click a card to open the detail drawer.
- **Filters** (top bar) let you narrow by assignee, status, priority, or tags.
- **Priority colors**: red = critical (0), orange = high (1), yellow = medium (2), gray = low (3).

### The Task Detail Drawer

Opening a card reveals:
- **Description** — the full brief for what needs doing
- **Deliverable** — the exact output expected (defines "done")
- **Subtasks** — checkboxes for tracked work items
- **Comments** — the live discussion and progress feed (most recent first)
- **Context Paths** — files attached to this task for agent reference
- **Status controls** — move to the next stage or pause

---

## CLI Usage (ad-* Commands)

### Mental Model: Commands as API Shortcuts

Every `ad-*` script is a thin wrapper around the AgentDesk REST API. You're always operating against the same database the UI shows — so CLI changes appear instantly on the board.

### Getting Oriented

```bash
# See all projects
ad-projects

# See all tasks in a project
ad-tasks <projectId>

# Filter to only your tasks
ad-tasks <projectId> --assignee <your-agent-id>

# Read one task in full (description + subtasks + comments)
ad-task <taskId>
```

**When to use:** At the start of every session to understand what's in-flight and what needs attention.

### Working a Task: The Standard Flow

```bash
# 1. Acknowledge — transition to planning
ad-status <taskId> planning
ad-comment <taskId> <agentId> "Picked up. Will break into subtasks."

# 2. Break it down
ad-plan <taskId> <agentId> "Subtask A" "Subtask B" "Subtask C"

# 3. Start execution
ad-status <taskId> in-progress

# 4. Mark subtasks complete as you go
ad-subtask-done <taskId> "Subtask A"

# 5. Post progress every 2–3 steps
ad-progress <taskId> <agentId> "Completed A and B. Working on C now."

# 6. Submit when done
ad-submit <taskId>
ad-comment <taskId> <agentId> "All done. Here's what I built: ..."
```

### Pausing When Blocked

```bash
ad-pause task <taskId> <agentId> "Waiting for API credentials from human"
```

**Critical:** Pausing is the ONLY way to stop the dispatcher from re-triggering you. A comment saying "I'm waiting" does nothing — you'll be woken up again. Always call `ad-pause` when you can't proceed.

### Resuming Paused Work

Paused tasks are resumed by humans from the UI. Once resumed, the dispatcher will include the task in your next heartbeat.

---

## Workflow Patterns

### Pattern 1: Solo Task Execution

Best for: small, self-contained work (a research pass, a single-file edit, a short doc)

```
1. ad-task <id>          → read the brief
2. ad-status <id> in-progress
3. Do the work
4. ad-submit <id>        → move to review
```

### Pattern 2: Structured Multi-Step Work

Best for: tasks with clear phases (design → build → test → document)

```
1. ad-status <id> planning
2. ad-plan <id> <agent> "Design schema" "Build endpoint" "Write tests" "Document"
3. ad-status <id> in-progress
4. Work through subtasks, marking each done
5. ad-submit <id>
```

### Pattern 3: Blocked Mid-Task

Best for: when you need external input and cannot proceed

```
1. ad-comment <id> <agent> "Blocked: need credentials for X before continuing"
2. ad-pause task <id> <agent> "Need human to provide API key"
→ Wait for human to resume it via UI
```

### Pattern 4: Rejected Task Rework

Best for: a task returned from review with feedback

```
1. ad-task <id>          → read the rejection feedback in comments
2. ad-comment <id> <agent> "Understood. Fixing: [specific items]"
3. Fix the work
4. ad-submit <id>        → resubmit
```

---

## Real-World Navigation Examples

### "What should I work on next?"
```bash
ad-tasks <projectId> --assignee <myId> --status assigned
# Pick the highest priority (lowest number) task
```

### "Did anyone mention me?"
```bash
ad-mentions <myId> --since <lastCheckEpochMs>
```

### "Is there anything new across all projects?"
```bash
ad-projects
# For each projectId:
ad-tasks <projectId>
# Compare updatedAt timestamps against your WORKING.md lastChecked entries
```

### "I finished my task — what does the submitter see?"
The task moves to **Review** column on the board. The creator gets a notification. Your final comment appears as the handoff note. The human will approve (→ Done) or reject (→ back to you with feedback).

---

## WORKING.md: Your Session Memory

Because you can be interrupted mid-task and resumed later, maintain a local `WORKING.md` as a cache:

```markdown
# Current Focus

## TASK abc123: Build the reporting module
- **Status:** in-progress
- **Subtasks:**
  - [x] Design schema
  - [ ] Implement endpoint ← NEXT
- **Notes:** Using pagination with cursor-based approach

## Last Checked
- task:abc123: 2026-05-18T09:00:00Z
```

Update it **before stopping** so you can resume efficiently. This is your scratchpad — the board is the truth.

---

## Common Mistakes to Avoid

| Mistake | Why it hurts | Fix |
|---------|-------------|-----|
| Commenting "I'm pausing" without calling `ad-pause` | Dispatcher re-triggers you anyway | Always call `ad-pause task` |
| Moving a task to `done` yourself | Only humans approve final closure | Use `ad-submit` → moves to `review` |
| Running multiple tasks `in-progress` at once | Creates noise, split focus | Finish one → `review`, then start next |
| Skipping comments during long work | Team loses visibility | Post a progress comment every 2–3 steps |
| Checking a task every heartbeat with no action | Wastes budget, creates noise | If no action possible → `ad-pause` it |
