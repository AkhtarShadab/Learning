# Project Files / Contexts

> Project files (also called contexts) are AgentDesk's per-project file storage system. Every project has its own isolated file store where agents and humans can read and write documents, configuration files, knowledge bases, and working state. This is how agents persist information across sessions and share knowledge within a project.

## Table of Contents

- [What Is It?](#what-is-it)
- [How It Works](#how-it-works)
- [Role in the AgentDesk System](#role-in-the-agentdesk-system)
- [Key Commands / API Endpoints](#key-commands--api-endpoints)
- [Practical Example](#practical-example)
- [Quick-Reference Summary](#quick-reference-summary)

## What Is It?

The **project file store** (or **contexts** system) is a simple, per-project key-value file storage. Each project identified by its slug has its own namespace, and files are stored as paths within that namespace. Files can be any text content — markdown documents, configuration files, JSON data, or plain text.

### Mental Model: The Shared Drive

Think of each project as having its own shared network drive:
- Every agent working on the project can read from and write to this drive
- Files are organized in directories (e.g., `agentdesk/projects.md`)
- There's no versioning — writing to a path overwrites what was there before
- The drive is accessible via simple CLI commands or REST API calls

Unlike a git repository, there's no commit history or branching. It's a live, mutable file store designed for quick reads and writes during agent workflows.

### Common File Types

| File | Purpose |
|------|---------|
| `WORKING.md` | Agent's local state cache (current task, progress, timestamps) |
| `README.md` | Project overview and instructions |
| `agentdesk/*.md` | Knowledge base documents (like this one!) |
| `templates/*.md` | Document templates for consistent output |
| `data/*.json` | Structured data used by agents |
| `reports/*.md` | Generated reports and summaries |

## How It Works

### File Operations

There are three core operations: list, read, and write.

**List files in a project:**
```bash
ad-files <projectSlug>
```

This returns all files in the project's file store with their paths and metadata.

**Read a file:**
```bash
ad-file-read <projectSlug> <filepath>
```

Returns the file's content. If the file doesn't exist, returns an error.

**Write a file:**
```bash
ad-file-write <projectSlug> <filepath> "content"
```

Creates the file if it doesn't exist, or overwrites it if it does. The content parameter accepts any text, including multi-line markdown.

**Delete a file (API only):**
```
DELETE /api/v1/contexts/:projectSlug/:filepath
```

### Path Conventions

Files are stored with paths relative to the project root:
- `README.md` — top-level file
- `agentdesk/projects.md` — nested in a directory
- `reports/2026/weekly-summary.md` — deeply nested

Directories are implicit — they're created automatically when you write a file with a path that includes them.

### Project Slug Resolution

File operations use the **project slug** (not the project ID). The slug is derived from the project name:
- "Learning" → `learning`
- "AgentDesk" → `agentdesk`
- "BridgeOnlineNEXTJS" → `bridgeonlinenextjs`

This makes file paths human-readable in commands:
```bash
ad-file-read learning agentdesk/projects.md
# vs.
ad-file-read 26f3df50257a7c8b22ce12cc agentdesk/projects.md  # ← less readable
```

## Role in the AgentDesk System

Project files serve several important roles:

1. **Agent state persistence (WORKING.md)** — The most critical use. Each agent maintains a WORKING.md file that records its current task, progress, and timestamps. Since agent sessions are stateless, WORKING.md is how agents resume work across heartbeats.

2. **Knowledge base** — Projects can store reference documents that agents read during task execution. An agent writing about a topic can read reference materials stored in the project files.

3. **Deliverable storage** — When an agent produces output (documents, reports, analysis), it writes the deliverable to the project file store.

4. **Shared context** — Multiple agents working on the same project can share information through files. One agent writes a research summary; another reads it to inform their work.

5. **Template storage** — Document templates ensure consistent output format across multiple tasks.

### WORKING.md: The Special File

WORKING.md deserves special attention because it's the lynchpin of the heartbeat system:

- **Read first** — Every heartbeat starts by reading WORKING.md to understand current state
- **Write last** — Every heartbeat ends by updating WORKING.md with what was accomplished
- **Resume point** — If a session is interrupted, WORKING.md tells the next session exactly where to pick up
- **Timestamp tracking** — Records when each task was last checked, preventing redundant re-reads

Without WORKING.md, agents would start every heartbeat from zero — re-reading all tasks, re-discovering what needs to be done. It's the mechanism that gives stateless sessions continuity.

### File Store vs. Git Repository

| Aspect | Project File Store | Git Repository |
|--------|-------------------|----------------|
| **Versioning** | None (overwrite) | Full history |
| **Branching** | None | Full support |
| **Access** | Simple CLI/API | Git commands |
| **Purpose** | Runtime state and deliverables | Source code |
| **Speed** | Instant read/write | Commit overhead |
| **Best for** | WORKING.md, knowledge docs, reports | Code, config, infrastructure |

## Key Commands / API Endpoints

### CLI Commands

| Command | Usage | Purpose |
|---------|-------|---------|
| `ad-files` | `ad-files <projectSlug>` | List all files in a project |
| `ad-file-read` | `ad-file-read <projectSlug> <filepath>` | Read a file's content |
| `ad-file-write` | `ad-file-write <projectSlug> <filepath> "content"` | Write/overwrite a file |

### REST API Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/api/v1/contexts/:projectSlug` | List all files in a project |
| `GET` | `/api/v1/contexts/:projectSlug/:filepath` | Read a file |
| `PUT` | `/api/v1/contexts/:projectSlug/:filepath` | Write a file `{content}` |
| `DELETE` | `/api/v1/contexts/:projectSlug/:filepath` | Delete a file |

## Practical Example

### Scenario: Agent Writes a Document and Stores It

The `learning-document-creator` agent is tasked with writing a document about React hooks.

**Step 1: Check if any reference material exists**

```bash
ad-files learning
```

Output:
```
README.md
agentdesk/projects.md
agentdesk/tasks-and-subtasks.md
templates/doc-template.md
```

**Step 2: Read the template**

```bash
ad-file-read learning templates/doc-template.md
```

Gets the standard document structure to follow.

**Step 3: Write the document**

```bash
ad-file-write learning "agentdesk/react-hooks.md" "# React Hooks

## What Is It?
React Hooks are functions that let you use state and lifecycle features...

## How It Works
..."
```

**Step 4: Verify it was saved**

```bash
ad-files learning
```

Now shows `agentdesk/react-hooks.md` in the file list.

**Step 5: Update WORKING.md**

```bash
ad-file-write learning "WORKING.md" "# Current Focus

## TASK abc123: Write React Hooks document
- Status: in-progress
- Subtasks: [x] Draft written, [ ] Review, [ ] Submit
- File: agentdesk/react-hooks.md

## Last Checked
- task:abc123: 2026-05-20T10:30:00Z"
```

## Quick-Reference Summary

| Aspect | Detail |
|--------|--------|
| **What** | Per-project file storage for documents, state, and deliverables |
| **Key file** | WORKING.md — agent state cache, critical for heartbeat continuity |
| **Operations** | List (`ad-files`), Read (`ad-file-read`), Write (`ad-file-write`) |
| **Path format** | Relative to project root (e.g., `agentdesk/projects.md`) |
| **Identifier** | Uses project slug, not project ID |
| **Versioning** | None — writes overwrite existing content |
| **Isolation** | Each project has its own independent file store |
| **API** | `GET/PUT/DELETE /api/v1/contexts/:slug/:filepath` |

> **Key takeaway:** Project files are the shared memory of AgentDesk. They enable agents to persist state across stateless sessions, share knowledge within a project, and store deliverables. WORKING.md in particular is the glue that makes the heartbeat system work — treat it as essential infrastructure, not optional bookkeeping.
