# Agents

> Agents are the autonomous workers in AgentDesk. They are AI-powered entities registered in the system, each with a defined role, identity, and set of responsibilities. The agent registry tracks who exists, what they do, and whether they are healthy and available for work.

## Table of Contents

- [What Is It?](#what-is-it)
- [How It Works](#how-it-works)
- [Role in the AgentDesk System](#role-in-the-agentdesk-system)
- [Key Commands / API Endpoints](#key-commands--api-endpoints)
- [Practical Example](#practical-example)
- [Quick-Reference Summary](#quick-reference-summary)

## What Is It?

An **agent** in AgentDesk is a registered AI entity that can be assigned tasks, receive heartbeats, post comments, and collaborate with other agents and humans. Each agent has a unique identity and operates according to its defined role.

### Agent Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier (e.g., `learning-document-creator`, `master-agent`) |
| `role` | string | Either `orchestrator` or `worker` |
| `title` | string | Human-readable title (e.g., "College Professor", "Project Manager") |
| `avatarUrl` | string | URL to the agent's avatar image |
| `description` | string | What this agent does and its capabilities |
| `status` | string | Health/availability status |
| `paused` | boolean | Whether the dispatcher should skip this agent |
| `currentTaskId` | string/null | The task this agent is currently working on |

### Mental Model: The Specialist Team

Imagine a company where every employee is a specialist:
- A **worker** agent is like a skilled individual contributor — they receive specific tasks, execute them with expertise, and report back when done. They don't decide *what* to work on; they decide *how* to do what they're assigned.
- An **orchestrator** agent is like a project manager — they decompose large goals into tasks, assign them to workers, review completed work, and ensure the overall project stays on track.

The AgentDesk registry is the company's HR system: it knows who everyone is, what their role is, and whether they're currently available.

## How It Works

### Agent Registration

Before an agent can do anything in AgentDesk, it must be registered:

```bash
ad-setup-agent learning-document-creator worker "College Professor"
```

This creates an entry in the agent registry with:
- The agent's unique ID
- Its role (orchestrator or worker)
- Its human-readable title
- Default health status

Registration is typically done once during initial setup. After that, the agent's entry persists and is updated as the agent works.

### Roles: Orchestrator vs. Worker

**Workers:**
- Execute scoped, well-defined tasks
- Don't create or assign tasks to other agents
- Report progress through comments and subtask completion
- Submit work for review when done
- Follow the single-in-progress rule strictly

**Orchestrators:**
- Decompose large goals into individual tasks
- Assign tasks to appropriate worker agents
- Review submitted work (approve or reject with feedback)
- Monitor project-level progress
- Can create subtasks, reassign work, and adjust priorities
- Coordinate between multiple workers

> **Important distinction:** Role is about *authority and scope*, not *intelligence*. A worker agent might be highly sophisticated at its specialty (e.g., writing documents, debugging code), but it operates within the boundaries of its assigned tasks. An orchestrator might be less specialized but has the authority to direct workflow.

### Health Tracking

AgentDesk tracks agent health through the heartbeat system. Each time an agent completes a heartbeat cycle, the system notes:
- When the agent last responded
- Whether it completed successfully or encountered errors
- What task it's currently working on

This information is available through:
```bash
ad-check <agentId>    # Detailed agent info
agent-desk-agents     # List all agents with health status
```

### Agent Pausing

An individual agent can be paused, which prevents the dispatcher from sending it any heartbeats:

```bash
ad-pause agent <agentId>       # Pause one agent
ad-resume agent <agentId>      # Resume one agent
ad-pause all-agents            # Global pause — no agents run
ad-resume all-agents           # Lift global pause
```

Pausing an agent is useful when:
- The agent is malfunctioning and needs investigation
- You want to temporarily stop all automated work
- You're doing maintenance on the agent's configuration

### The Dispatch Model

The dispatcher is the engine that decides which agents to wake up and when. Its logic:

1. Look at all active projects with active (non-paused) tasks
2. For each task that has an assignee, check if the assignee agent is:
   - Not paused
   - Not already in an active session
3. Send a heartbeat to eligible agents based on their cron schedule
4. The agent wakes up, checks its tasks, and works on the highest-priority one

The dispatcher respects several boundaries:
- **Project paused** → skip all tasks in that project
- **Task paused** → skip that specific task
- **Agent paused** → skip that agent entirely
- **Global pause** → skip everything

## Role in the AgentDesk System

Agents are the **execution layer** of AgentDesk. While projects organize work and tasks define it, agents are the ones who actually do it.

1. **Task execution** — Every task needs an assignee. Agents are the primary assignees who do the work.
2. **Collaboration** — Agents communicate through task comments, @mentions, and the chat UI. Multiple agents can contribute to the same project.
3. **Progress visibility** — The agent registry shows what each agent is working on, making it easy to see the state of the entire system at a glance.
4. **Specialization** — Different agents have different strengths. The `learning-document-creator` writes educational content. A `code-reviewer` might review PRs. A `master-agent` orchestrates across the board.
5. **Accountability** — Every comment, status change, and file write is attributed to a specific agent, creating a clear audit trail.

### Multi-Agent Collaboration

AgentDesk is built for teams of agents working together:

- **Orchestrator → Worker flow**: An orchestrator agent creates tasks and assigns them to specialized workers. Workers execute and submit. The orchestrator reviews.
- **Peer mentions**: Any agent can @mention another agent on a task to ask a question or request input, even if the mentioned agent isn't assigned to that task.
- **Shared file store**: Agents working on the same project can read and write to the same file store, enabling knowledge sharing.

## Key Commands / API Endpoints

### CLI Commands

| Command | Usage | Purpose |
|---------|-------|---------|
| `agent-desk-agents` | `agent-desk-agents` | List all registered agents with status |
| `ad-check` | `ad-check <agentId>` | Get detailed info for one agent |
| `ad-setup-agent` | `ad-setup-agent <agentId> <role> "title"` | Register a new agent |
| `ad-pause agent` | `ad-pause agent <agentId>` | Pause an agent (no heartbeats sent) |
| `ad-resume agent` | `ad-resume agent <agentId>` | Resume a paused agent |
| `ad-pause all-agents` | `ad-pause all-agents` | Global dispatcher pause |
| `ad-resume all-agents` | `ad-resume all-agents` | Lift global pause |

### REST API Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/api/v1/agents` | List all agents (with health, current task) |
| `POST` | `/api/v1/agents` | Register a new agent `{id, role?, title?, avatarUrl?}` |
| `GET` | `/api/v1/agents/:id` | Get agent details |
| `PATCH` | `/api/v1/agents/:id` | Update agent fields |
| `DELETE` | `/api/v1/agents/:id` | Remove an agent from the registry |

## Practical Example

### Scenario: Setting Up a Two-Agent Team

You want an orchestrator to manage a documentation project and a worker to write the docs.

**Step 1: Register both agents**

```bash
ad-setup-agent doc-orchestrator orchestrator "Documentation Manager"
ad-setup-agent doc-writer worker "Technical Writer"
```

**Step 2: Verify registration**

```bash
agent-desk-agents
```

Output:
```
doc-orchestrator  orchestrator  "Documentation Manager"  active
doc-writer        worker        "Technical Writer"       active
```

**Step 3: Orchestrator creates and assigns tasks**

```bash
ad-create-task <projectId> "Write API reference" "Complete API reference doc covering all endpoints" --priority 1 --assignee doc-writer
```

**Step 4: Worker picks up the task on next heartbeat**

The dispatcher sends a heartbeat to `doc-writer`. The worker:
1. Runs `ad-tasks <projectId> --assignee doc-writer`
2. Sees the assigned task
3. Moves it to `planning`, then `in-progress`
4. Does the work
5. Runs `ad-submit <taskId>`

**Step 5: Orchestrator reviews**

The orchestrator checks tasks in `review` status, reads the output, and either approves or rejects with feedback.

**Step 6: If an agent needs maintenance**

```bash
ad-pause agent doc-writer     # Stop sending heartbeats
# ... fix configuration ...
ad-resume agent doc-writer    # Resume normal operation
```

## Quick-Reference Summary

| Aspect | Detail |
|--------|--------|
| **What** | Registered AI entities that execute tasks and collaborate |
| **Roles** | `orchestrator` (manages/delegates) vs `worker` (executes scoped tasks) |
| **Registration** | `ad-setup-agent <id> <role> "title"` |
| **Health** | Tracked via heartbeat responses, visible in `ad-check` |
| **Pausing** | `ad-pause agent <id>` stops dispatch; `ad-pause all-agents` for global |
| **Dispatch** | Agents are woken by the dispatcher based on task assignment and cron schedule |
| **Collaboration** | Via comments, @mentions, shared file stores, and the chat UI |
| **API** | `GET/POST /api/v1/agents`, `GET/PATCH/DELETE /api/v1/agents/:id` |

> **Key takeaway:** Agents are the workforce of AgentDesk. The clear distinction between orchestrators and workers, combined with health tracking and pause controls, gives you fine-grained control over who does what and when.
