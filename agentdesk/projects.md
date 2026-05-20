# Projects

> Projects are the top-level organizational container in AgentDesk. Every task, file, schedule, and agent assignment lives under a project. Understanding projects is the first step to understanding how AgentDesk structures work.

## Table of Contents

- [What Is It?](#what-is-it)
- [How It Works](#how-it-works)
- [Role in the AgentDesk System](#role-in-the-agentdesk-system)
- [Key Commands / API Endpoints](#key-commands--api-endpoints)
- [Practical Example](#practical-example)
- [Quick-Reference Summary](#quick-reference-summary)

## What Is It?

A **project** in AgentDesk is the highest-level organizational unit. Think of it as a workspace or a mission folder — everything else (tasks, files, cron jobs, agent assignments) is scoped to a project.

Every project has:

- **`id`** — A unique identifier (MongoDB ObjectId string) used in all API calls.
- **`name`** — A human-readable label (e.g., "Learning", "AgentDesk", "BridgeOnlineNEXTJS").
- **`mission`** — A short description of what the project is about and what it aims to accomplish. This is the project's north star — agents and humans refer to it to understand the project's purpose.
- **`slug`** — A URL-safe, lowercase version of the project name, used in file/context operations (e.g., `learning`, `agentdesk`).
- **`status`** — The project's lifecycle state: `active` or `paused`.
- **`createdAt` / `updatedAt`** — Timestamps for auditing and sorting.

### Mental Model: The Filing Cabinet

Imagine AgentDesk as a filing cabinet. Each **drawer** is a project. Inside each drawer you find:
- **Task cards** pinned to a Kanban board
- **Files** (the project's knowledge base and working documents)
- **Schedules** (cron jobs tied to this project)
- **Agent assignments** (who is working on what within this drawer)

You cannot create a task without putting it in a drawer. You cannot store a file without choosing which drawer it belongs to. The project is the boundary that keeps everything organized.

## How It Works

### Creating a Project

Projects are typically created by humans through the AgentDesk dashboard or via the API. When a project is created, AgentDesk:

1. Assigns it a unique `id`
2. Derives a `slug` from the name (lowercase, URL-safe)
3. Sets status to `active`
4. Creates an empty task board and file store

### Project Lifecycle

```
Created → Active → (optionally) Paused → Active → ...
```

- **Active**: All tasks are dispatchable. Agents receive heartbeats for this project's tasks. Cron jobs fire normally.
- **Paused**: The dispatcher skips all tasks in this project. No heartbeats are sent for its tasks. Cron jobs are suspended. This is useful when a project is on hold or being reorganized.

Pausing is done via:
```bash
ad-pause project <projectId>
```

Resuming:
```bash
ad-resume project <projectId>
```

### Project Slug and Files

The slug is particularly important for the **file/context system**. All file operations use the slug (not the id) to identify which project's file store to access:

```bash
ad-files learning              # List all files in the Learning project
ad-file-read learning README.md  # Read a specific file
ad-file-write learning notes.md "content here"  # Write a file
```

## Role in the AgentDesk System

Projects serve several critical roles:

1. **Scoping** — Tasks, files, and cron jobs are always scoped to a project. This prevents cross-contamination between unrelated workstreams.

2. **Dispatch boundary** — The dispatcher uses project membership to route tasks to agents. When an agent checks its assigned tasks, it queries per-project.

3. **Pause boundary** — Pausing a project freezes all its tasks at once, which is cleaner than pausing tasks individually.

4. **File namespace** — Each project has its own isolated file store. Two projects can each have a `README.md` without conflict.

5. **Dashboard grouping** — The dashboard organizes metrics and Kanban boards by project, giving each project its own view.

### How Agents Interact with Projects

Agents discover projects during their heartbeat loop:

```
1. ad-projects           → list all projects
2. ad-tasks <projectId>  → list tasks in each project
3. Filter by assignee, status, priority
4. Work on the highest-priority actionable task
```

An agent is not "assigned to a project" directly — it is assigned to **tasks within projects**. However, an agent might work across multiple projects if tasks are assigned to it in different projects.

## Key Commands / API Endpoints

### CLI Commands

| Command | Usage | Purpose |
|---------|-------|---------|
| `ad-projects` | `ad-projects` | List all projects with id, name, mission, status |
| `ad-pause project` | `ad-pause project <projectId>` | Pause all dispatch for a project |
| `ad-resume project` | `ad-resume project <projectId>` | Resume a paused project |
| `ad-tasks` | `ad-tasks <projectId>` | List all tasks in a project |
| `ad-files` | `ad-files <projectSlug>` | List files in a project's file store |

### REST API Endpoints

| Method | Endpoint | Body | Purpose |
|--------|----------|------|---------|
| `GET` | `/api/v1/projects` | — | List all projects |
| `POST` | `/api/v1/projects` | `{name, description?}` | Create a new project |
| `GET` | `/api/v1/projects/:id` | — | Get a single project's details |
| `PATCH` | `/api/v1/projects/:id` | `{name?, description?, status?}` | Update project fields |
| `DELETE` | `/api/v1/projects/:id` | — | Delete a project (and all its tasks, files, crons) |

### Response Shape

```json
{
  "id": "26f3df50257a7c8b22ce12cc",
  "name": "Learning",
  "mission": "Central learning repository — notes, docs, and explorations across various topics.",
  "status": "active",
  "createdAt": "2026-05-19T16:52:20.485Z",
  "updatedAt": "2026-05-19T16:52:20.485Z"
}
```

## Practical Example

### Scenario: Setting Up a New Documentation Project

A team wants to create a dedicated project for all their internal documentation.

**Step 1: Create the project**

```bash
# Via the REST API
curl -X POST http://localhost:3737/api/v1/projects \
  -H "Content-Type: application/json" \
  -d '{"name": "Internal Docs", "description": "Company-wide documentation and knowledge base"}
