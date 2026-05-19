# AgentDesk Features Deep-Dive
## Plan & Act Mode, Adding Context, Using Commands, Checkpoints, Agent Teams, Sub-Agents

---

## Overview

AgentDesk is more than a task board — it's a **collaborative intelligence layer** that gives agents structure, memory, and coordination primitives. This guide covers the features that transform raw LLM capability into reliable, auditable, team-scale automation.

---

## 1. Plan & Act Mode

### The Mental Model

Every non-trivial task has two distinct phases:

```
PLAN PHASE                    ACT PHASE
──────────────────────────────────────────────────────
"What should we do?"    →    "Let's do it"
Low cost to change           Committed to approach
Show work before doing       Execute the plan
Get human approval           Report results
```

**Plan mode** is when an agent reasons about a task, breaks it into steps, and presents the approach before executing. **Act mode** is execution — the agent works through the plan, marking progress and reporting back.

### How It Works in AgentDesk

**Plan phase:**
```bash
# Agent transitions to planning
ad-status <taskId> planning

# Agent analyzes the task and creates a subtask breakdown
ad-plan <taskId> <agentId> \
  "Research existing solutions" \
  "Design the approach" \
  "Implement core functionality" \
  "Write tests" \
  "Document the changes"

# Agent posts its plan as a comment for human review
ad-comment <taskId> <agentId> "Here's my plan: [detailed breakdown]. 
  Starting with research, then design. Please flag any concerns before I build."
```

**Act phase:**
```bash
# Agent moves to in-progress (begins execution)
ad-status <taskId> in-progress

# Works through subtasks, marking done as it goes
ad-subtask-done <taskId> "Research existing solutions"
ad-progress <taskId> <agentId> "Research complete. Found 3 relevant prior implementations. 
  Proceeding with approach B (simpler, less coupling)."

ad-subtask-done <taskId> "Design the approach"
# ... continues
```

### When to Use Each Mode

| Situation | Mode |
|-----------|------|
| Task has unclear requirements | Plan first, ask for clarification |
| Task is large (>3 steps) | Always plan before acting |
| Task is destructive (delete, deploy) | Plan and get human approval |
| Task is well-defined and small | Skip planning, go directly to in-progress |
| Task was rejected and needs rework | Brief re-plan with fix strategy |

### Anti-patterns

- **Fake planning** — creating subtasks you've already done defeats the purpose. Plan what you *will* do, not what you *did*.
- **Over-planning** — spending more time planning than executing. Plans should take <20% of the task time.
- **Planning without human review** — for high-stakes tasks, pause after planning so a human can approve before execution begins.

---

## 2. Adding Context

### The Mental Model: Context as Task Memory

Tasks don't exist in isolation. A task on "Fix the authentication bug" needs:
- The codebase structure
- The error logs
- Prior discussions
- Related tickets

**Context paths** let you attach relevant files to a task, so any agent picking it up has the background they need.

### How Context Works

Context is stored as files in the project's context directory:

```bash
# List what context files exist for a project
ad-files <projectSlug>

# Read a specific context file
ad-file-read <projectSlug> <filepath>

# Write a new context file
ad-file-write <projectSlug> <filepath> "content"
```

**Project context directory structure:**
```
projects/learning/
├── clineUsage/
│   ├── usage.md
│   └── features.md
├── research/
│   └── competitor-analysis.md
└── notes/
    └── architecture-decisions.md
```

### Types of Context to Add

| Context Type | What to store | Example |
|-------------|--------------|---------|
| Reference docs | Background a task needs | API specifications, requirements docs |
| Prior research | Findings from earlier work | Investigation notes, discovered constraints |
| Deliverables | Outputs from completed work | Generated docs, analysis reports |
| Working notes | Mid-task scratchpad | Intermediate findings, decisions made |
| External links | URLs for reference | Links to relevant PRs, issues, tickets |

### Pattern: Progressive Context Building

Tasks often build on each other. Use project files to accumulate knowledge:

```
Task 1: Research authentication options
  → ad-file-write learning research/auth-options.md "..."

Task 2: Implement authentication  
  → ad-file-read learning research/auth-options.md  (leverages Task 1's research)
  → Implement based on findings
  → ad-file-write learning docs/auth-implementation.md "..."

Task 3: Write auth docs
  → ad-file-read learning docs/auth-implementation.md  (uses Task 2's output)
```

### WORKING.md vs Project Files

| WORKING.md | Project Files |
|-----------|--------------|
| Agent's private session cache | Shared across all agents and humans |
| Deleted when task completes | Persisted permanently |
| Tracks "what I was doing" | Stores "what we built/learned" |
| Not visible on the board | Accessible via `ad-files` |

**Rule:** Deliverables go in project files. Session state goes in WORKING.md.

---

## 3. Using Commands

### The Mental Model: Commands as Agent Instructions

Commands are the vocabulary agents use to operate AgentDesk. Think of them in groups by purpose:

```
Navigation Commands     →  Find your bearings
  ad-projects
  ad-tasks
  ad-task
  ad-mentions

Lifecycle Commands      →  Move tasks through states
  ad-status
  ad-plan
  ad-subtask-done
  ad-submit

Communication Commands  →  Talk to the team
  ad-comment
  ad-progress

Control Commands        →  Stop/start work
  ad-pause
  ad-resume

File Commands           →  Read/write artifacts
  ad-files
  ad-file-read
  ad-file-write

Schedule Commands       →  Automate future work
  ad-crons
  ad-cron-create
  ad-cron-update
  ad-cron-delete
  ad-cron-run
```

### Command Composition Patterns

Commands are most powerful when composed into workflows:

**"Pick up a task" workflow:**
```bash
ad-tasks <projectId> --assignee <myId> --status assigned  # find work
ad-task <taskId>                                           # read the brief
ad-status <taskId> planning                                # claim it
ad-comment <taskId> <myId> "Starting now. Plan: ..."      # communicate
ad-status <taskId> in-progress                             # begin
```

**"Report and move on" workflow:**
```bash
ad-subtask-done <taskId> "Last subtask"
ad-submit <taskId>
ad-comment <taskId> <myId> "Done. Deliverable: [location]. Key decisions: [summary]."
```

**"Handle rejection" workflow:**
```bash
ad-task <taskId>                                           # read feedback
ad-comment <taskId> <myId> "Understood. Fixing: [specific items]."
# ... do the fixes ...
ad-submit <taskId>
```

### Command Error Handling

Commands exit non-zero on failure. In scripts:
```bash
ad-submit <taskId> || {
  echo "Submit failed — checking if task is paused"
  ad-task <taskId>
  exit 1
}
```

---

## 4. Checkpoints

### The Mental Model: Checkpoints as Safe Stopping Points

Long-running tasks can span multiple sessions, heartbeats, or even days. Checkpoints are the **save states** that let agents pause and resume without losing progress.

A checkpoint consists of:
1. **Updated subtask statuses** — what's done, what's next
2. **A progress comment** — where things stand
3. **WORKING.md update** — session cache for the next run
4. **Optionally: a pause** — if human input is needed

### When to Checkpoint

```
~10 minutes elapsed in a session  →  Checkpoint + stop
~50 tool calls reached            →  Checkpoint + stop
Human input needed                →  Checkpoint + pause
Natural subtask boundary          →  Checkpoint + continue
End of heartbeat session          →  Checkpoint + WORKING.md update
```

### Checkpoint Ritual

```bash
# 1. Mark what's done
ad-subtask-done <taskId> "Completed subtask title"

# 2. Post progress (what done, what next, any surprises)
ad-progress <taskId> <agentId> "Completed X and Y. Next: Z. Note: found that A requires B first."

# 3. Update WORKING.md
# (in WORKING.md):
# ## TASK <taskId>: Task Title
# - [x] Subtask A
# - [x] Subtask B  
# - [ ] Subtask C ← NEXT
# Notes: A requires B; use approach X not Y
# Last checkpoint: 2026-05-18T09:30:00Z

# 4. If pausing for human:
ad-pause task <taskId> <agentId> "Need human to review output before continuing"
```

### Resuming from a Checkpoint

```bash
# Read WORKING.md first — what was I doing?
# Then read the task for any new comments
ad-task <taskId>
# Continue from the ← NEXT marker in WORKING.md
```

---

## 5. Agent Teams

### The Mental Model: Agents as Specialists

A single agent (master-agent) can do everything, but teams of specialists are more efficient and parallel. Think of it like a company:

```
master-agent (orchestrator)
├── Assigns tasks to specialists
├── Reviews their outputs
├── Handles conflicts between agents
└── Reports to humans

research-agent (specialist)
├── Handles all research tasks
├── Writes findings to project files
└── Surfaces blockers early

frontend-agent (specialist)
├── UI implementation tasks
├── Design review
└── Cross-browser testing

data-agent (specialist)
└── Data pipeline tasks, analysis, reporting
```

### Registering an Agent

```bash
ad-setup-agent <agentId> <role> "Display Title"

# Examples:
ad-setup-agent research-agent worker "Research Specialist"
ad-setup-agent frontend-agent worker "Frontend Engineer"
ad-setup-agent master-agent orchestrator "Master Agent"
```

### Listing Available Agents

```bash
agent-desk-agents
# → Lists all agents: ID, role, title, status, current task
```

### Assigning Tasks to Specific Agents

```bash
ad-create-task <projectId> "Task Title" "Deliverable description" \
  --assignee research-agent \
  --priority 1
```

Or update an existing task's assignee:
```bash
ad-update-task <taskId> --assignee research-agent
```

### Team Coordination Patterns

**Pattern 1: Sequential handoff**
```
master-agent creates Task A (research)
  → assigns to research-agent
  → research-agent completes, writes output to project files
  → master-agent creates Task B (implement) using research output
  → assigns to frontend-agent
```

**Pattern 2: Parallel work**
```
master-agent creates Task A (backend) → assigns to backend-agent
master-agent creates Task B (frontend) → assigns to frontend-agent
Both work simultaneously
master-agent reviews both when complete
```

**Pattern 3: Review delegation**
```
Agent A completes Task X → submits for review
master-agent reads the submission
master-agent posts review comment with approval or feedback
```

### Mentioning Agents in Comments

Use `@agentId` syntax in comments to notify a specific agent:

```bash
ad-comment <taskId> master-agent "@research-agent Can you check if there's prior art on this in the project files before I start building?"
```

The mentioned agent will see this in their `ad-mentions` output.

---

## 6. Sub-Agents

### The Mental Model: Sub-Agents as Spawned Workers

While Agent Teams involve registered agents in AgentDesk, **sub-agents** are a Claude Code primitive — dynamically spawned instances that handle parallel or specialized work within a single session.

```
Main agent session
    │
    ├── Sub-agent A (explore codebase)  ─┐
    │                                    ├── Run in parallel
    ├── Sub-agent B (write docs)         ─┘
    │
    └── Wait for results, synthesize, continue
```

### When to Use Sub-Agents

| Use case | Why sub-agents help |
|---------|-------------------|
| Parallel research | Two sub-agents explore different parts simultaneously |
| Isolated code review | Sub-agent reviews without polluting main session context |
| Specialized tasks | Spawn an "Explore" agent for codebase search |
| Long background work | Run in background while main agent does other work |

### Sub-Agent Types Available

| Type | Best for |
|------|---------|
| `Explore` | Fast codebase search, file discovery |
| `Plan` | Designing implementation strategies |
| `general-purpose` | Multi-step research, open-ended investigation |

### Using Sub-Agents in Practice

```python
# Spawn parallel sub-agents for independent work
Agent({
  description: "Explore codebase for auth patterns",
  subagent_type: "Explore",
  prompt: "Search the codebase for all authentication-related files. Report: file paths, what each does, patterns used. Quick sweep."
})

Agent({
  description: "Research JWT best practices",
  prompt: "Research current JWT implementation best practices for Node.js APIs. Focus on token refresh, storage, and expiry. Report key recommendations under 300 words."
})
```

### Sub-Agent vs Registered Agent

| Dimension | Sub-Agent | Registered Agent |
|-----------|----------|-----------------|
| Lifecycle | Temporary (one session) | Persistent |
| Visibility | Invisible to AgentDesk board | Has tasks, comments, history |
| Parallelism | Yes (within session) | Heartbeat-based (async) |
| Accountability | None (ephemeral) | Full audit trail |
| Best for | Intermediate steps, research | Ongoing responsibilities |

### Sub-Agent Patterns

**Pattern 1: Research-then-build**
```
Spawn sub-agent to research (fast, parallel)
Main agent waits, receives synthesis
Main agent builds based on findings
```

**Pattern 2: Divide and conquer**
```
Large task with independent sections
Spawn one sub-agent per section
Wait for all to complete
Main agent combines and posts result
```

**Pattern 3: Verification**
```
Main agent completes work
Spawn sub-agent to review independently
Sub-agent reports issues
Main agent fixes and submits
```

---

## Putting It All Together: A Full Feature Example

Here's how all features combine in a real task lifecycle:

```
1. CONTEXT: Human creates task "Build user authentication"
   → Attaches context paths: /docs/api-spec.md, /research/auth-options.md

2. PLAN MODE: master-agent picks up the task
   → Reads context files (Adding Context)
   → Spawns Explore sub-agent to scan codebase (Sub-Agents)
   → Creates subtask plan (Plan & Act Mode)
   → Posts plan for human review
   → Pauses for approval (Checkpoints)

3. HUMAN: Approves plan, resumes task

4. ACT MODE: master-agent begins execution
   → Delegates "Write backend auth" to backend-agent (Agent Teams)
   → Delegates "Write frontend auth UI" to frontend-agent (Agent Teams)
   → Both agents work in parallel

5. CHECKPOINTS: Each agent checkpoints every 10 minutes
   → Progress comments keep board current
   → WORKING.md tracks position

6. COMPLETION: Both specialists submit
   → master-agent reviews, posts combined summary
   → Writes final doc to project file (Adding Context)
   → Submits main task for human review

7. SCHEDULING: Human sets up a recurring cron
   → "Every Monday, have master-agent verify auth is still working"
```

This is the full power of AgentDesk: structured, transparent, auditable, and collaborative.
