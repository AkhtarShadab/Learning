# AgentDesk Tools Guide
## All Available Tools — When to Use Each, Patterns & Anti-Patterns

---

## The Mental Model: Tools as a Layered Stack

AgentDesk tools form a **layered stack**, each layer building on the one below:

```
┌─────────────────────────────────────────┐
│  ad-* CLI scripts (convenience wrappers) │  ← You use these most
├─────────────────────────────────────────┤
│  AgentDesk REST API                      │  ← When CLI doesn't cover it
├─────────────────────────────────────────┤
│  Claude Code built-in tools             │  ← File ops, web, code execution
├─────────────────────────────────────────┤
│  MCP tools (chrome-devtools, etc.)       │  ← Browser automation, specialized
└─────────────────────────────────────────┘
```

Pick the **highest layer** that covers your need. The lower you go, the more you're working around abstractions — do that only when necessary.

---

## Layer 1: AgentDesk CLI Tools (ad-*)

### Browse & Discovery

#### `ad-projects`
Lists all projects with ID, name, slug, and mission.

**Use when:** Starting a session and need to orient to the workspace, or when you need a project ID/slug for other commands.

```bash
ad-projects
# → [{ id, name, slug, mission, status }]
```

**Anti-pattern:** Don't run this every heartbeat if you already know your project IDs — cache them in WORKING.md.

---

#### `ad-tasks <projectId> [--assignee <id>] [--status <status>]`
Lists tasks in a project, optionally filtered.

**Use when:** Scanning for work, checking what's assigned to you, or auditing the board state.

```bash
ad-tasks abc123 --assignee master-agent --status assigned
```

**Pattern:** Filter by both `--assignee` and `--status assigned` to find your next task. Unfiltered output can be large in active projects.

---

#### `ad-task <taskId>`
Fetches full task details: description, deliverable, subtasks, AND complete comment thread.

**Use when:** Before starting any work on a task. This is your brief.

**Anti-pattern:** Don't skim the comments — the most actionable information (rejection feedback, human clarifications) is often in the thread, not the original description.

---

#### `ad-mentions <agentId> [--since <epoch_ms>]`
Returns tasks where your agent ID is @-mentioned in comments.

**Use when:** Checking for requests, escalations, or questions directed at you from other agents or humans.

```bash
ad-mentions master-agent --since 1716000000000
```

**Pattern:** Always check mentions early in your heartbeat loop. A mention on someone else's task may be more urgent than your own assigned work.

---

#### `ad-stats`
Dashboard statistics: task counts by status, project health indicators.

**Use when:** Getting a bird's-eye view, reporting to humans, or checking if the board is getting backed up.

---

#### `agent-desk-agents`
Lists all registered agents with their roles, status, and current task.

**Use when:** Checking who's available to delegate to, or verifying an agent is healthy before routing work.

---

### Task Lifecycle Tools

#### `ad-status <taskId> <newStatus>`
Transitions a task to a new status.

Valid transitions:
```
assigned → planning → in-progress → (ad-submit moves to review)
Any status → paused (via ad-pause, not ad-status)
```

**Use when:** Moving your task forward through the lifecycle.

**Anti-pattern:** Don't jump from `assigned` directly to `in-progress` without posting a planning comment — the team needs to know what you're going to do before you do it.

---

#### `ad-comment <taskId> <agentId> "message" [--reply-to <commentId>]`
Posts a comment on a task, optionally threaded as a reply.

**Use when:** Acknowledging a task, posting progress, asking questions, or explaining decisions.

**Pattern:** Use `--reply-to` when answering a specific question in the thread — keeps context clear.

**Anti-pattern:** Don't post "check-in" or "still waiting" comments with no new information. Every comment should advance the reader's understanding.

---

#### `ad-plan <taskId> <agentId> "sub1" "sub2" ...`
Creates multiple subtasks in bulk.

**Use when:** You've analyzed a task and can see its distinct work chunks clearly.

```bash
ad-plan abc123 master-agent "Research existing implementations" "Write draft" "Review and polish" "Upload to project files"
```

**Pattern:** Name subtasks as actionable verbs ("Write X", "Test Y", "Review Z"), not vague nouns ("Draft", "Testing").

---

#### `ad-subtask-done <taskId> "subtask title"`
Marks a specific subtask as complete.

**Use when:** You've finished a discrete chunk of work and want to signal progress.

**Anti-pattern:** Don't batch-mark everything done at the end — mark each subtask as you complete it so the board reflects reality in real time.

---

#### `ad-progress <taskId> <agentId> "update"`
Posts a formatted progress update comment.

**Use when:** Providing mid-task status without a specific question or decision to communicate.

**Pattern:** Use every 2–3 subtasks. Keep it under 200 words. Focus on what's done, what's next, and any surprises.

---

#### `ad-submit <taskId>`
Submits a task for review (moves status to `review`).

**Use when:** Your work is complete and ready for human approval.

**Pattern:** Always follow `ad-submit` with a summary comment explaining what was built and where to find the deliverables.

---

### Pause / Resume Tools

#### `ad-pause task <taskId> <agentId> "reason"`
Pauses a task and posts a comment with the reason.

**Use when:** You cannot proceed without human input, external data, or another task completing first.

**Critical:** This is the ONLY mechanism that actually stops the dispatcher. Saying "I'm pausing" in a comment does nothing.

---

#### `ad-resume task <taskId>`
Resumes a paused task (typically done by humans from UI, but agents can also resume tasks they paused).

---

#### `ad-pause project <projectId>` / `ad-resume project <projectId>`
Pauses/resumes all tasks in a project. Use when a project is on hold for external reasons.

---

#### `ad-pause agent <agentId>` / `ad-resume agent <agentId>`
Pauses/resumes an agent entirely. The dispatcher will skip the agent until resumed.

---

### File / Context Tools

#### `ad-files <projectSlug>`
Lists all files stored in the project's context directory.

**Use when:** Checking what reference material exists before starting work.

---

#### `ad-file-read <projectSlug> <filepath>`
Reads a project file.

**Use when:** Accessing reference docs, previous outputs, or project context before executing.

---

#### `ad-file-write <projectSlug> <filepath> "content"`
Writes content to a project file.

**Use when:** Storing deliverables, updating documentation, or saving intermediate artifacts.

```bash
ad-file-write learning clineUsage/notes.md "# My Notes\n..."
```

**Pattern:** Use project files for durable deliverables. Use WORKING.md for your own session state.

---

## Layer 2: REST API (Direct)

Use the REST API directly when:
- The CLI script doesn't expose a parameter you need
- You're building a script that calls multiple endpoints in sequence
- You need fine-grained error handling

```bash
TOKEN=$(cat ~/.claude/skills/agent-desk/.token)
curl -s -H "x-agdesk-token: $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"content":"My comment"}' \
  http://localhost:PORT/api/v1/tasks/TASKID/comments
```

**Anti-pattern:** Don't bypass the CLI for common operations — the scripts handle auth, URL resolution, and error formatting for you.

---

## Layer 3: Claude Code Built-in Tools

| Tool | Best used for |
|------|--------------|
| `Read` | Reading local files for context |
| `Write` | Creating new deliverable files |
| `Edit` | Making targeted changes to existing files |
| `Bash` | Running commands, scripts, git operations |
| `Grep` | Searching code/content across files |
| `Glob` | Finding files by pattern |
| `WebFetch` | Fetching URLs for research |
| `WebSearch` | Searching the web for information |
| `Agent` | Spawning sub-agents for parallel or specialized work |

**Pattern:** Use `Read` before `Edit` — the Edit tool requires you to have read the file first.

**Pattern:** Use `Grep` and `Glob` instead of `bash find/grep` — they're faster and permission-aware.

**Anti-pattern:** Don't use `Bash` for file operations that have dedicated tools (`cat` → `Read`, `grep` → `Grep`, `find` → `Glob`).

---

## Layer 4: MCP Tools (chrome-devtools)

Browser automation for authenticated sessions or visual inspection:

| Tool | Use case |
|------|----------|
| `mcp__chrome-devtools__take_screenshot` | Visual verification of UI state |
| `mcp__chrome-devtools__navigate_page` | Loading a URL in a browser session |
| `mcp__chrome-devtools__click` | Clicking elements |
| `mcp__chrome-devtools__fill` | Filling form fields |
| `mcp__chrome-devtools__evaluate_script` | Running JS in the browser context |

**When to use MCP vs Camoufox:**
- **Camoufox** (`http://localhost:9377`): Default for web tasks. Stealth Firefox. Use for general browsing, scraping, form filling.
- **MCP chrome-devtools**: For tasks that need an authenticated browser session (Gmail, LinkedIn) or specific DevTools features.

**Anti-pattern:** Don't use `take_screenshot` when `take_snapshot` (aria tree) gives you the text data you need — screenshots consume more context budget.

---

## Tool Selection Decision Tree

```
Need to work on a task? 
├── Task management action → ad-* CLI tools
├── Read/write files on disk → Read / Write / Edit
├── Search code/content → Grep / Glob
├── Run a shell command → Bash
├── Browse the web (no auth) → WebFetch / Camoufox API
├── Browse the web (with auth) → MCP chrome-devtools
├── Spawn parallel work → Agent tool
└── AgentDesk API edge case → curl with $TOKEN
```

---

## Anti-Patterns Reference

| Anti-pattern | Problem | Better approach |
|-------------|---------|----------------|
| Using `bash grep` instead of `Grep` tool | Permission issues, slower | Use `Grep` tool |
| Using `bash cat` instead of `Read` tool | Bypasses line-limit safety | Use `Read` tool |
| Taking screenshots for text content | Wastes context budget | Use aria snapshot or `Read` |
| Calling `ad-status` to pause a task | Doesn't actually pause dispatcher | Use `ad-pause task` |
| Polling a background task with sleep loop | Wastes budget | Use `Monitor` tool or `run_in_background` |
| Hardcoding the AgentDesk port | Breaks when port changes | Read from `.url` file |
