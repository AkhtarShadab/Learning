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

## DSA Connections

### Hash Map — Endpoint Routing Table
A hash map stores key-value pairs with O(1) average-time lookup by hashing the key to a bucket index. Conceptually, an API server's routing table can be thought of as mapping each (HTTP method, URL path pattern) pair to a handler function — when a request arrives for `POST /api/v1/projects/:id/tasks`, the router would dispatch to the task-creation handler. With 30+ routes across projects, tasks, subtasks, comments, contexts, crons, and agents, a linear scan for every incoming request would be wasteful, while a hash-based approach would provide constant dispatch cost. In practice, frameworks implement routing differently: Express iterates through its `router.stack` array of Layer objects and tests each route's compiled RegExp (from `path-to-regexp`) in order using first-match semantics, while Fastify uses the `find-my-way` library with a radix tree (compressed prefix tree) for efficient path matching. The hash map analogy illustrates the conceptual goal of efficient route lookup, though actual implementation varies by framework.

### Request Queue — Managing Concurrent API Requests
A request queue is a FIFO data structure that buffers incoming work items and processes them in order, decoupling arrival rate from processing rate. When multiple agents fire their heartbeats simultaneously — say, three agents all calling `ad-tasks`, `ad-comment`, and `ad-status` within the same minute — the API server processes these requests concurrently. The Node.js event loop that AgentDesk runs on schedules incoming HTTP request handling, with I/O operations (database reads, file writes) handled asynchronously. However, the event loop and HTTP request queuing only schedule request handling and do not guarantee per-record serialization. If two agents try to update the same task's status concurrently, avoiding race conditions requires database or application-level concurrency controls such as database transactions, SELECT FOR UPDATE or row-level locks, optimistic concurrency with version checks, or application-level mutexes. Without these explicit controls, concurrent writes to the same resource may lead to lost updates or inconsistent state.

### Consistent Hashing — Horizontal Load Distribution
Consistent hashing maps both servers and request keys onto a virtual ring, so each request is routed to the nearest server clockwise on the ring — adding or removing a server only redistributes a fraction of requests. If AgentDesk were scaled horizontally to handle many projects and agents, consistent hashing would distribute API requests across multiple server instances based on a key like the project ID. A request to `/projects/abc123/tasks` would always land on the same server instance that holds the hot cache for project `abc123`, avoiding redundant database queries. The critical advantage over naive modular hashing (`hash(key) % N`) is that when a server is added or removed, only ~1/N of the keys need to be remapped rather than nearly all of them. For AgentDesk's architecture — where project-scoped operations (task lists, comment threads, file reads) dominate the API traffic — consistent hashing by project ID would be the natural sharding strategy for a multi-node deployment.

### Trie — URL Path Matching and Parameter Extraction
A trie (prefix tree) is a tree structure where each node represents a character or path segment, and paths from root to leaf spell out complete keys, enabling O(k) lookup where k is the key length. Some REST API routers use a radix trie (compressed trie) to match incoming URL paths against registered route patterns. Consider AgentDesk's nested routes: `/api/v1/projects/:id`, `/api/v1/projects/:id/tasks`, and `/api/v1/projects/:id/tasks/:id/comments` share a common prefix, and conceptually a trie structure would avoid redundant prefix comparisons. When a request for `/api/v1/tasks/abc123/subtasks` arrives, a trie-based router would walk the tree — `api` → `v1` → `tasks` → `:id` (captures `abc123`) → `subtasks` — and arrive at the handler in O(depth) time while extracting the `:id` parameter along the way. In practice, Express iterates its `router.stack` and tests each route's compiled RegExp from `path-to-regexp` using first-match semantics, while Fastify uses `find-my-way` with a radix tree. The trie description represents one possible implementation strategy rather than a universal framework behavior.

### Middleware Chain — Chain of Responsibility Pattern
The chain of responsibility pattern passes a request through a sequence of handlers, each of which can process it, modify it, or pass it along to the next handler. AgentDesk's API processes every request through a middleware pipeline: first, JSON body parsing; then, authentication and token validation (checking `AGDESK_TOKEN`); then, request logging; then, the actual route handler; and finally, error formatting (returning `{error: "description"}` with appropriate status codes like 400 or 500). Each middleware is a link in the chain — it either handles the request (e.g., the auth middleware rejects an unauthorized call with a 401) or calls `next()` to pass it downstream. This architecture is why the API's conventions are so uniform: content-type enforcement, error response format, and status code mapping are all handled once in shared middleware rather than duplicated across 30+ endpoint handlers. Adding cross-cutting concerns like rate limiting or request logging requires inserting a single new link in the chain.
