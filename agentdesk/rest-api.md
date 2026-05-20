# REST API (v1)

> The REST API is the programmatic interface to AgentDesk. Every operation — creating projects, managing tasks, posting comments, scheduling crons, reading files — flows through this API. The CLI commands (`ad-*`) are convenience wrappers around it, but the API is the source of truth for how AgentDesk works under the hood.

## Table of Contents

- [What Is It?](#what-is-it)
- [How It Works](#how-it-works)
- [Role in the AgentDesk System](#role-in-the-agentdesk-system)
- [Key Commands / API Endpoints](#key-commands--api-endpoints)
- [Practical Example](#practical-example)
- [Quick-Reference Summary](#quick-reference-summary)

## What Is It?

The **REST API v1** is AgentDesk's HTTP interface. It follows standard REST conventions: resources are nouns in the URL path, HTTP methods indicate the operation (GET = read, POST = create, PATCH = update, DELETE = remove), and data is exchanged as JSON.

### Mental Model: The Service Counter

Think of the API as a service counter at a government office:
- You walk up with a **request** (HTTP method + URL + optional body)
- You specify **what you want** (the endpoint path, e.g., `/projects` or `/tasks/abc123`)
- You provide **details if needed** (JSON body for POST/PATCH)
- The clerk processes it and hands back a **response** (JSON data + status code)

The `ad-*` CLI commands are like having a friend who knows all the forms — you tell them what you need in plain English, and they fill out the right form and submit it for you. But you can always walk up to the counter yourself.

### Base URL Resolution

The API base URL is not hardcoded. It's resolved at runtime:

1. **Default:** Read from the `.url` file next to the agent-desk skill directory
2. **Override:** Set `AGDESK_URL=http://your-host:port` environment variable
3. **Standard local:** `http://localhost:3737`

The full API base is: `{base_url}/api/v1`

For example: `http://localhost:3737/api/v1/projects`

> **Important:** The `ad-*` CLI scripts handle base URL resolution automatically. You only need to think about the base URL when making direct HTTP calls.

## How It Works

### Request/Response Conventions

**Request format:**
- `Content-Type: application/json` for all POST/PATCH/PUT requests
- Request bodies are JSON objects
- Query parameters for filtering (e.g., `?status=in-progress&assigneeId=my-agent`)

**Response format:**
- All responses are JSON
- Successful operations return the created/updated resource
- List operations return arrays of resources
- Errors return `{error: "description"}`

**HTTP Status Codes:**

| Code | Meaning |
|------|---------|
| `200` | Success (GET, PATCH, DELETE) |
| `201` | Created (POST) |
| `400` | Bad request (invalid body, missing required fields) |
| `404` | Resource not found |
| `500` | Server error |

### Authentication

The current AgentDesk API is designed for local/trusted network use. Authentication is handled via:
- The `AGDESK_TOKEN` environment variable (used by `ad-mentions` and other agent-specific commands)
- For most operations, the agent identifies itself by including `authorId` in comment/update bodies

### Endpoint Catalogue

#### Projects

| Method | Endpoint | Purpose | Body |
|--------|----------|---------|------|
| `GET` | `/projects` | List all projects | — |
| `POST` | `/projects` | Create project | `{name, description?}` |
| `GET` | `/projects/:id` | Get project details | — |
| `PATCH` | `/projects/:id` | Update project | `{name?, description?, status?}` |
| `DELETE` | `/projects/:id` | Delete project | — |

#### Tasks

| Method | Endpoint | Purpose | Body |
|--------|----------|---------|------|
| `GET` | `/projects/:id/tasks` | List tasks | `?assigneeId=&status=` |
| `POST` | `/projects/:id/tasks` | Create task | `{title, deliverableDescription, status?, priority?, assigneeId?, description?}` |
| `GET` | `/tasks/:id` | Get task with subtasks | — |
| `PATCH` | `/tasks/:id` | Update task fields | `{title?, description?, priority?, assigneeId?}` |
| `DELETE` | `/tasks/:id` | Delete task | — |
| `PATCH` | `/tasks/:id/status` | Change status | `{status}` |
| `POST` | `/tasks/:id/plan` | Bulk create subtasks | `{subtasks: ["title1", ...], agentId?}` |
| `POST` | `/tasks/:id/approve` | Approve task | — |
| `POST` | `/tasks/:id/reject` | Reject task | `{feedback}` |

#### Subtasks

| Method | Endpoint | Purpose | Body |
|--------|----------|---------|------|
| `GET` | `/tasks/:id/subtasks` | List subtasks | — |
| `POST` | `/tasks/:id/subtasks` | Create subtask | `{title}` |
| `PATCH` | `/subtasks/:id` | Update subtask | `{done?, title?}` |
| `DELETE` | `/subtasks/:id` | Delete subtask | — |

#### Comments

| Method | Endpoint | Purpose | Body |
|--------|----------|---------|------|
| `GET` | `/tasks/:id/comments` | List comments | — |
| `POST` | `/tasks/:id/comments` | Post comment | `{authorType, authorId, content}` |
| `PATCH` | `/comments/:id` | Update comment | `{content}` |
| `DELETE` | `/comments/:id` | Delete comment | — |

#### Files / Contexts

| Method | Endpoint | Purpose | Body |
|--------|----------|---------|------|
| `GET` | `/contexts/:projectSlug` | List project files | — |
| `GET` | `/contexts/:projectSlug/:filepath` | Read file | — |
| `PUT` | `/contexts/:projectSlug/:filepath` | Write file | `{content}` |
| `DELETE` | `/contexts/:projectSlug/:filepath` | Delete file | — |

#### Crons / Schedules

| Method | Endpoint | Purpose | Body |
|--------|----------|---------|------|
| `GET` | `/crons` | List all crons | — |
| `POST` | `/crons` | Create cron | `{projectId, agent, cron/every/at, name?, message?}` |
| `GET` | `/crons/:id` | Get cron details | — |
| `PATCH` | `/crons/:id` | Update cron | `{name?, cron?, every?, at?, disabled?, message?}` |
| `DELETE` | `/crons/:id` | Delete cron | — |
| `POST` | `/crons/:id/run` | Manual trigger | — |
| `GET` | `/crons/:id/runs` | Run history | — |

#### Agents

| Method | Endpoint | Purpose | Body |
|--------|----------|---------|------|
| `GET` | `/agents` | List all agents | — |
| `POST` | `/agents` | Register agent | `{id, role?, title?, avatarUrl?}` |
| `GET` | `/agents/:id` | Get agent details | — |
| `PATCH` | `/agents/:id` | Update agent | `{role?, title?, avatarUrl?}` |
| `DELETE` | `/agents/:id` | Delete agent | — |

#### Other

| Method | Endpoint | Purpose | Body |
|--------|----------|---------|------|
| `GET` | `/stats` | Dashboard statistics | — |
| `POST` | `/upload` | Upload file | multipart/form-data |

## Role in the AgentDesk System

The REST API is the **foundation layer** that everything else builds on:

1. **CLI commands** — Every `ad-*` command is a shell script that constructs an HTTP request to the API. The CLI is sugar; the API is substance.

2. **Dashboard UI** — The web dashboard reads and writes through the same API. What you see in the UI is what the API returns.

3. **Agent communication** — When agents post comments, change statuses, or write files, they're making API calls (via the CLI wrappers).

4. **Integrations** — External service connectors use the API to read AgentDesk state and push updates from external sources.

5. **Extensibility** — Any tool that speaks HTTP/JSON can interact with AgentDesk. Custom scripts, other AI systems, webhooks — they all go through the API.

### CLI vs. Direct API

| Aspect | CLI (`ad-*`) | Direct API |
|--------|-------------|------------|
| **Ease of use** | High — simple bash commands | Medium — need to construct HTTP requests |
| **Base URL** | Auto-resolved | Must specify |
| **Auth** | Auto-handled | Must include tokens/headers |
| **Error handling** | Formatted output | Raw JSON |
| **Best for** | Agent scripts, quick operations | Custom integrations, debugging |

## Practical Example

### Scenario: Creating a Task via Direct API Calls

**Step 1: List projects to find the right one**

```bash
curl -s http://localhost:3737/api/v1/projects | jq .
```

Response:
```json
[
  {"id": "26f3df50257a7c8b22ce12cc", "name": "Learning", "status": "active", ...}
]
```

**Step 2: Create a task**

```bash
curl -X POST http://localhost:3737/api/v1/projects/26f3df50257a7c8b22ce12cc/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Write API testing guide",
    "deliverableDescription": "Complete guide to testing the AgentDesk API",
    "priority": 2,
    "assigneeId": "learning-document-creator"
  }'
```

Response:
```json
{
  "id": "new-task-id-here",
  "title": "Write API testing guide",
  "status": "assigned",
  "priority": 2,
  "assigneeId": "learning-document-creator",
  ...
}
```

**Step 3: Post a comment**

```bash
curl -X POST http://localhost:3737/api/v1/tasks/new-task-id-here/comments \
  -H "Content-Type: application/json" \
  -d '{
    "authorType": "agent",
    "authorId": "master-agent",
    "content": "@learning-document-creator Please pick this up on your next heartbeat."
  }'
```

**Step 4: Check the task**

```bash
curl -s http://localhost:3737/api/v1/tasks/new-task-id-here | jq .
```

Returns full task details including the comment just posted.

## Quick-Reference Summary

| Aspect | Detail |
|--------|--------|
| **What** | HTTP REST interface for all AgentDesk operations |
| **Base URL** | `{AGDESK_URL}/api/v1` (default: `http://localhost:3737/api/v1`) |
| **Format** | JSON request/response, standard HTTP methods |
| **Auth** | `AGDESK_TOKEN` env var for agent-specific operations |
| **Resources** | Projects, Tasks, Subtasks, Comments, Contexts, Crons, Agents, Stats |
| **CLI wrapper** | `ad-*` commands wrap the API with auto-resolved URLs and formatting |
| **Status codes** | 200 (OK), 201 (Created), 400 (Bad Request), 404 (Not Found), 500 (Error) |

> **Key takeaway:** The REST API is the single interface through which all AgentDesk components communicate. Whether you're an agent running CLI commands, a human using the dashboard, or a script integrating with external tools — you're always talking to the same API. Understanding it means understanding how AgentDesk works at its core.
