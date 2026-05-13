# Cline Knowledge Base
> Comprehensive reference guide based on official Cline documentation (docs.cline.bot).
> Covers the full platform — SDK, CLI, VS Code extension, Kanban, and all integrations.

---

## Table of Contents

1. [What is Cline?](#1-what-is-cline)
2. [Platform Architecture](#2-platform-architecture)
3. [Installation & Setup](#3-installation--setup)
4. [Core Concepts](#4-core-concepts)
5. [Built-in Tools](#5-built-in-tools)
6. [Plan & Act Mode](#6-plan--act-mode)
7. [Checkpoints](#7-checkpoints)
8. [Subagents](#8-subagents)
9. [Cline Rules (.clinerules)](#9-cline-rules-clinerules)
10. [Skills](#10-skills)
11. [Hooks](#11-hooks)
12. [Plugins](#12-plugins)
13. [MCP — Model Context Protocol](#13-mcp--model-context-protocol)
14. [Auto-Approve & YOLO Mode](#14-auto-approve--yolo-mode)
15. [Kanban Board](#15-kanban-board)
16. [CLI Usage](#16-cli-usage)
17. [Supported Models & Providers](#17-supported-models--providers)
18. [Writing Effective Prompts](#18-writing-effective-prompts)
19. [Memory Bank Pattern](#19-memory-bank-pattern)
20. [Token Usage & Cost Control](#20-token-usage--cost-control)
21. [Common Pitfalls & Fixes](#21-common-pitfalls--fixes)
22. [Quick Reference Cheatsheet](#22-quick-reference-cheatsheet)

---

## 1. What is Cline?

**Cline** is an open-source AI coding agent that integrates with your editor and terminal. It can **read and write files, run terminal commands, use a browser, and help you build features through natural conversation** — with user approval required for all actions by default.

> *"Every action requires your explicit approval. You're always in control."* — Cline docs

### Key Differentiators

| Feature | Cline | GitHub Copilot | Cursor |
|---|---|---|---|
| Autonomous file edits | ✅ Full | ❌ Inline only | ✅ Partial |
| Terminal command execution | ✅ Yes | ❌ No | ✅ Yes |
| Bring your own API key | ✅ Yes | ❌ No | ✅ Yes |
| Open source | ✅ Yes | ❌ No | ❌ No |
| MCP tool support | ✅ Yes | ❌ No | ❌ No |
| Works with any LLM | ✅ Yes | ❌ No | ✅ Partial |
| SDK for custom agents | ✅ Yes | ❌ No | ❌ No |
| Kanban multi-agent board | ✅ Yes | ❌ No | ❌ No |
| Subagents (parallel research) | ✅ Yes | ❌ No | ❌ No |
| Checkpoints / undo | ✅ Yes | ❌ No | ✅ Partial |

### Supported Editors
VS Code, Cursor, Windsurf, JetBrains (IntelliJ, PyCharm, WebStorm, GoLand), Antigravity, Zed, Neovim (via ACP mode).

---

## 2. Platform Architecture

Cline is structured in two layers:

```
┌────────────────────────────────────────────────────────────┐
│                  AGENT CORE (SDK)                          │
│         @cline/sdk — npm install @cline/sdk                │
│   The same engine behind ALL Cline applications            │
│   Node.js 22+ required                                     │
│                                                            │
│  Packages:                                                 │
│  @cline/sdk      → public surface (re-exports all)         │
│  @cline/core     → Node.js runtime                         │
│  @cline/agents   → browser-compatible execution            │
│  @cline/llms     → provider gateway                        │
│  @cline/shared   → utilities and types                     │
└──────────────────────────┬─────────────────────────────────┘
                           │ Powers
          ┌────────────────┼────────────────┐
          ▼                ▼                ▼                ▼
   VS Code/JetBrains     CLI          Kanban Board     Your Custom App
     Extension        npm i -g cline  npx kanban      (via SDK)
   IDE integration    Terminal chat   Multi-agent     Build anything
   File/command       Headless CI     task board      on the same core
```

### SDK Quick Start
```typescript
import { ClineCore } from "@cline/sdk";

const agent = new ClineCore({
  provider: { type: "anthropic", apiKey: process.env.ANTHROPIC_API_KEY },
  model: "claude-sonnet-4-6"
});

agent.on("message", (msg) => console.log(msg));
await agent.run("Fix the auth bug in middleware.ts");
```

---

## 3. Installation & Setup

### VS Code / JetBrains Extension
1. Open VS Code → Extensions (`Ctrl+Shift+X`)
2. Search **"Cline"** → Install
3. Open Cline panel → Settings gear → Choose provider → Enter API key

### CLI (Terminal / Headless)
```bash
npm i -g cline        # Install globally
cline                 # Start interactive chat
cline "fix the bug"   # Headless one-shot
```

### Kanban (Multi-agent board)
```bash
npx kanban            # Launch the web-based task board
```

### SDK (Custom apps)
```bash
npm install @cline/sdk
```

### Supported Providers
```
Anthropic (Claude)    ← Recommended
OpenAI (GPT-4o, o1)
Google Gemini
AWS Bedrock
Azure OpenAI
Google Vertex AI
DeepSeek
MiniMax
Qwen
OpenRouter (aggregator — access 100+ models)
Ollama (local)
LM Studio (local)
30+ other compatible providers
```

---

## 4. Core Concepts

### 4.1 The Agentic Loop
```
You give instruction
        ↓
Cline thinks (LLM call)
        ↓
Cline proposes a tool (read file / run command / search)
        ↓
You approve (or auto-approve fires)
        ↓
Tool executes → result returned to Cline
        ↓
Cline thinks again → proposes next action
        ↓
... repeat (can be 10–20 tool calls per prompt) ...
        ↓
Cline responds with final summary (attempt_completion)
```

### 4.2 Context Window
Everything — prompt, file contents, tool results, conversation history — must fit in the LLM's context window. For Claude Sonnet: **200K tokens**.

Cline compacts old messages when nearing the limit. Skills use progressive loading (metadata → instructions → resources) to avoid wasting context on inactive capabilities.

### 4.3 System Prompt
Cline prepends a system prompt to every task containing:
- Available tools and their parameters
- Your OS, shell, working directory
- Content from `.clinerules` files
- Any global custom instructions

---

## 5. Built-in Tools

Cline ships with **7 core tools** via ClineCore:

| Tool | What It Does |
|---|---|
| `bash` | Execute shell commands in the terminal |
| `editor` | View and edit files (targeted or full rewrites) |
| `read_files` | Batch read multiple files at once |
| `apply_patch` | Apply unified diffs to files |
| `search` | Ripgrep-powered codebase search (regex) |
| `fetch_web` | HTTP requests with HTML-to-markdown conversion |
| `ask_question` | Ask the user for clarifying input mid-task |

> **Note:** Older docs reference XML-style names (`read_file`, `write_to_file`, `execute_command`). The current runtime tools use the names above.

### Additional Tool Sources
- **MCP servers** — tools from any configured MCP server appear alongside built-ins
- **Plugins** — custom tools added via the plugin system (SDK/CLI/Kanban only)

### Best Tool Usage Patterns
```
Exploring an unfamiliar codebase:
  search (find key patterns) → read_files (batch read relevant files)
  NOT: read each file one by one

Making a targeted edit:
  read_files → understand → editor (apply_patch for minimal diff)
  NOT: full file rewrite if only changing 3 lines

Running tests:
  bash("npm test") → read output → editor (fix) → bash again
```

---

## 6. Plan & Act Mode

Cline has a **dual-mode system** for structured development:

### Plan Mode
- Explore and strategize **without modifying files**
- Read codebases, run searches, discuss approaches
- Context stays focused on understanding, not implementation

### Act Mode
- File modifications and command execution enabled
- Conversation history from Plan mode is preserved when switching
- Implement what was planned

### When to Use Each

| Situation | Mode |
|---|---|
| Unfamiliar codebase | Plan first |
| Architectural decisions | Plan first |
| Edge case identification | Plan first |
| Code review | Plan first |
| Implementing a known solution | Act directly |
| Routine/small changes | Act directly |
| Quick bug fix | Act directly |

### Recommended Workflow
```
1. Start in Plan mode
2. "Explore the auth module and explain how it works"
3. "What's the best approach to add OAuth support?"
4. Switch to Act mode
5. "Implement the OAuth flow we discussed"
```

### Deep Planning
Use `/deep-planning` slash command for complex tasks — triggers extended analysis and creates a comprehensive implementation plan across multiple files before any code is written.

### Dual-Model Setup
Configure different models per mode:
- **Plan mode** → stronger reasoning model (Claude Opus) for architecture
- **Act mode** → faster model (Claude Sonnet) for implementation

---

## 7. Checkpoints

Checkpoints let you **undo file changes while keeping conversation history**.

### How It Works
- Cline maintains a **shadow Git repository** completely separate from your project's git
- A checkpoint is created **after every file edit or command execution**
- Your real git history stays clean and unaffected
- Checkpoints capture **all files**, including those not tracked by git

```
Your Project Git:    A ──── B ──── C          (your commits, untouched)
Cline Shadow Git:    ●──●──●──●──●──●──●      (checkpoint after every action)
                     ↑                  ↑
                  task start         rollback here
```

### Restoration Options

| Action | What It Does |
|---|---|
| **Restore Files** | Revert code changes, keep conversation history |
| **Restore Task Only** | Remove subsequent messages, keep file changes |
| **Restore Files & Task** | Reset both files and conversation simultaneously |

### Practical Use
- Makes **auto-approve safer** — failed experiments can be rolled back instantly
- Compare diffs before deciding to keep or revert changes
- Persists across multiple editor sessions

> **Performance note:** Large repositories may see slowdowns. Disable in Settings → Feature Settings if needed.

---

## 8. Subagents

Subagents let Cline **spawn parallel research agents** to explore your codebase without consuming your main context window.

### What Subagents Can Do
- ✅ Read files
- ✅ Search code (ripgrep)
- ✅ List directories
- ✅ Execute read-only commands
- ✅ Use Skills

### What Subagents Cannot Do
- ❌ Edit files
- ❌ Use browser
- ❌ Access MCP servers
- ❌ Create nested subagents

### When to Use
```
✅ Onboarding an unfamiliar project (explore in parallel)
✅ Investigating cross-cutting concerns simultaneously
✅ Pre-edit research across many related files
✅ Large codebase exploration without sequential context fill

❌ Small focused tasks (target files already known)
❌ Anything requiring file edits
```

### Triggering Subagents
Cline decides autonomously when parallel research helps. You can also request explicitly:
```
"Use subagents to explore how authentication works and where
the database models are defined."
```

### Permissions
Subagent launches follow your **"Read project files"** auto-approve setting — if enabled, they launch without prompting.

---

## 9. Cline Rules (.clinerules)

Cline Rules are markdown files that define **persistent instructions** loaded at the start of every task — without you having to repeat them.

### Storage Locations

| Type | Location | Scope |
|---|---|---|
| **Workspace rules** | `.clinerules/` folder at project root | Team / project |
| **Global rules** | `~/Documents/Cline/Rules/` (macOS/Linux) | All projects |
| **Single file** | `.clinerules` at project root | Legacy format |

> Workspace rules override global rules when conflicts occur.

### Supported Rule Formats (Auto-detected)

| Format | File/Folder | Purpose |
|---|---|---|
| Cline Rules | `.clinerules/` | Primary format |
| Cursor Rules | `.cursorrules` | Auto-detected |
| Windsurf Rules | `.windsurfrules` | Auto-detected |
| OpenAI Agents | `AGENTS.md` | Cross-tool compatibility |

### Creating Rules
Access via the **scale icon** in the Cline panel → create new rule files → write markdown → toggle rules on/off individually.

### Conditional Rules (Advanced)
Rules that activate **only for specific file paths** using YAML frontmatter:

```yaml
---
paths:
  - "src/components/**"
  - "*.test.ts"
---

# Component Rules
- Always use functional components
- Export component as default
- Co-locate tests with components
```

This prevents context bloat — irrelevant rules don't load unless you're working on matching files.

### Example .clinerules for BridgeOnline
```markdown
# BridgeOnline — Cline Rules

## Stack
- Next.js 15 (App Router), React 19, TypeScript strict
- PostgreSQL via Prisma ORM — import client from lib/prisma.ts ONLY
- Socket.io for real-time — events defined in types/socket.ts
- NextAuth.js v5 — userId lives at session.user.id

## Architecture Boundaries
- lib/game/ → pure functions ONLY (no DB calls, no socket emits)
- API routes → return { data, error } shape always
- Server socket → in server/index.js, NOT in Next.js API routes

## Forbidden Patterns
- Never: new PrismaClient() — use the singleton
- Never: .then() chains — use async/await
- Never: `any` type without explaining why in a comment

## Testing
- Run `npm test` before marking any task done
- Unit tests: Vitest in __tests__/
- E2E: Playwright in __tests__/e2e/
```

### Writing Effective Rules
- ✅ Be specific, not generic ("use async/await, never .then()" not "write clean code")
- ✅ Include the *why* alongside the *what*
- ✅ Keep under **5K tokens** per file — skills handle larger docs better
- ✅ Focus each file on a single concern
- ✅ Update when you discover new gotchas
- ❌ Don't put things in rules that Cline could infer from reading the code

---

## 10. Skills

Skills are **modular instruction sets** that extend Cline's capabilities for specific tasks. Unlike rules (always loaded), skills use **progressive loading** — only the metadata is always active; full instructions load on-demand.

### Loading Levels

| Level | Size | When Loaded |
|---|---|---|
| Metadata | ~100 tokens | Always (skill name + description) |
| Instructions | < 5K tokens | When skill is triggered |
| Resources | Varies | As needed during execution |

### Directory Structure
```
.cline/skills/              ← Project-scoped (team-shared via git)
  my-skill/
    SKILL.md                ← Required: manifest + instructions
    docs/                   ← Optional: extended documentation
    templates/              ← Optional: reusable templates
    scripts/                ← Optional: helper scripts

~/.cline/skills/            ← Global (available in all projects)
```

### SKILL.md Format
```yaml
---
name: git-helper            # Must match directory name (kebab-case)
description: |              # Max 1024 characters — this is what Cline reads
  Helps with git operations: creating branches, writing commit messages,
  reviewing diffs, and creating PRs. Trigger phrases: "commit this",
  "create a PR", "what changed", "git workflow".
---

# Git Helper

## Commands
- `git-status` — show working tree status with summary
- `git-commit` — stage and commit with generated message
- `git-pr` — create a pull request with auto-generated description

## Usage
Run any command via bash. Always check exit codes.
```

### Activating Skills
1. **Automatic** — Cline detects when your request matches the skill description
2. **Manual** — type `/` in chat to see available skills and invoke by slash command

### Creating a Simple Skill
```
.cline/skills/db-tools/
├── SKILL.md
└── scripts/
    ├── db-query.sh
    └── db-migrate.sh
```

`SKILL.md`:
```yaml
---
name: db-tools
description: |
  Database utilities for PostgreSQL. Trigger for: "run a query",
  "check the database", "migrate", "seed data". Works with psql and Prisma.
---

## db-query
Run: `bash scripts/db-query.sh "SELECT * FROM users LIMIT 10"`

## db-migrate
Run: `bash scripts/db-migrate.sh` — runs pending Prisma migrations
```

---

## 11. Hooks

Hooks are commands that **fire automatically at Cline lifecycle events** — configured in VS Code settings, not in `.clinerules`.

> **Key difference from rules:** Rules tell Cline what to do (LLM follows them). Hooks are infrastructure — they execute automatically regardless of what the LLM decides.

### Hook Points
| Event | When It Fires |
|---|---|
| `PreToolUse` | Before Cline executes any tool |
| `PostToolUse` | After a tool finishes executing |
| `OnError` | When a tool or LLM call fails |
| `Stop` | When a task completes |

### Configuration (VS Code settings.json)
```json
{
  "cline.hooks": {
    "PostToolUse": [
      {
        "matcher": { "tool": "editor", "path": "src/**/*.ts" },
        "command": "npx tsc --noEmit"
      },
      {
        "matcher": { "tool": "editor" },
        "command": "npx eslint --fix ${file}"
      }
    ],
    "Stop": [
      {
        "command": "osascript -e 'display notification \"Cline task done\" with title \"Cline\"'"
      }
    ]
  }
}
```

### Practical Hook Examples
```
After writing a TypeScript file → run tsc type check
After any file edit           → run eslint --fix
After any file edit           → run prettier --write
When task stops               → desktop notification
After writing test files      → run npm test automatically
```

### Advanced: Audit Hook
Log every file Cline touches:
```json
{
  "PostToolUse": [{
    "matcher": { "tool": "editor" },
    "command": "echo \"$(date): edited ${file}\" >> ~/.cline-audit.log"
  }]
}
```

---

## 12. Plugins

Plugins extend Cline with **custom tools, lifecycle hooks, slash commands**, and more.

> ⚠️ **Availability:** Plugins only work in **Cline SDK, CLI, and Kanban**. Not available in VS Code/JetBrains extensions currently.

### Installing Plugins
```bash
# From git repo
cline plugin install https://github.com/owner/repo.git
cline plugin install https://github.com/owner/repo.git@v1.2.0  # specific version

# From npm
cline plugin install npm:@scope/my-plugin

# From local path
cline plugin install ./my-plugin
cline plugin install /absolute/path/to/plugin.ts
```

### Plugin Directory Structure
```
~/.cline/plugins/           ← Global plugins (all sessions)
  _installed/
    npm/                    ← npm-sourced
    git/                    ← git-sourced
    local/                  ← local-sourced

.cline/plugins/             ← Project-scoped plugins
```

### Plugin Manifest (package.json)
```json
{
  "name": "my-cline-plugin",
  "version": "1.0.0",
  "cline": {
    "plugins": [
      {
        "paths": ["./index.ts"],
        "capabilities": ["tools", "hooks"]
      }
    ]
  },
  "peerDependencies": {
    "@cline/core": "*"
  }
}
```

### Reference Plugin
The **typescript-lsp-plugin** is a good reference implementation — adds a `goto_definition` tool using the TypeScript Language Service to resolve symbols through imports and re-exports (much more precise than text search):
```bash
cline plugin install https://github.com/cline/typescript-lsp-plugin.git
```

---

## 13. MCP — Model Context Protocol

**MCP** is an open standard by Anthropic that defines how AI models communicate with external tools and data sources — the **USB standard for AI tools**.

### Architecture
```
┌─────────────────┐     MCP Protocol      ┌──────────────────┐
│   Cline         │ ◄──────────────────► │  MCP Server      │
│  (MCP Client)   │   Tools/Resources/    │  (GitHub, DB,    │
│                 │   Prompts             │   Browser, etc.) │
└─────────────────┘                       └──────────────────┘
```

### Transport Types
| Type | Config Key | Best For |
|---|---|---|
| **STDIO** (local process) | `command` + `args` | Low latency, local tools |
| **Remote HTTP/SSE** | `url` + `headers` | Hosted servers, multi-client |

### Configuration (~/.cline/mcp.json or IDE settings)
```json
{
  "github": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-github"],
    "env": { "GITHUB_PERSONAL_ACCESS_TOKEN": "your-token" }
  },
  "postgres": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-postgres"],
    "env": { "POSTGRES_URL": "postgresql://localhost/mydb" }
  },
  "remote-tool": {
    "url": "https://my-mcp-server.com/mcp",
    "headers": { "Authorization": "Bearer token" }
  }
}
```

### CLI Management
```bash
cline mcp            # List, add, edit, enable/disable, delete servers
cline config mcp     # Show current MCP config
cline config mcp --json  # JSON output for scripting
```

### Popular MCP Servers
| Server | Capability |
|---|---|
| `@modelcontextprotocol/server-github` | Issues, PRs, repos, code |
| `@modelcontextprotocol/server-postgres` | Direct DB queries |
| `@modelcontextprotocol/server-brave-search` | Web search |
| `@modelcontextprotocol/server-filesystem` | Remote file systems |
| `@modelcontextprotocol/server-slack` | Send/read messages |
| `mcp-server-playwright` | Browser automation |

### MCP Primitives
- **Tools** — callable functions (like `get_issue`, `run_query`)
- **Resources** — readable data exposed as context (DB schemas, API specs, docs)
- **Prompts** — reusable prompt templates the AI can invoke

### Security Guidelines
- Install only trusted, verified servers
- Store secrets in environment variables (never hardcode)
- Limit `autoApprove` to genuinely safe operations
- Review tool calls before approving in sensitive contexts

---

## 14. Auto-Approve & YOLO Mode

### Permission Categories (8 types)
| Permission | What It Controls |
|---|---|
| Read project files | Files inside your workspace |
| Read outside workspace | Files anywhere on the system |
| Edit project files | Writes inside your workspace |
| Edit outside workspace | Writes anywhere on system |
| Terminal — safe commands | Build, test, read-only commands |
| Terminal — all commands | Any command including destructive ones |
| Browser access | All browser tool actions |
| MCP server access | All MCP tool calls |

> **Hierarchical:** Broader permissions (e.g. "Read all files") only work if their base toggle is enabled.

### Command Classification
Cline dynamically assigns a `requires_approval` flag per command — not a fixed list:
- **Auto-safe:** build commands, read-only queries, package installs
- **Requires approval:** deletions, in-place modifications, network requests, config changes

### Recommended Setup for Development
```
✅ Auto-approve: Read project files (safe — just reading)
⚠️  Manual:      Edit project files (review before landing)
⚠️  Manual:      Terminal commands (until you know what's running)
❌  Disabled:    Edit outside workspace (dangerous)
❌  Disabled:    Terminal — all commands (use with Checkpoints only)
```

### YOLO Mode
Auto-approves **all** actions with zero prompts — including destructive terminal commands, files anywhere on the system, and all MCP tools.

**Risks:** unintended deletion, system config changes, unauthorized network requests, git history modification.

**Safe YOLO usage:**
- Isolated/throwaway environments only
- Give very specific instructions (not vague ones)
- Monitor output actively
- Always have version control as a recovery mechanism
- Use Checkpoints before enabling

---

## 15. Kanban Board

The Cline Kanban is a **web-based task board for parallel multi-agent execution**.

```bash
npx kanban    # Launch the board
```

### Key Features
- **Per-card worktrees** — each task runs in an isolated git worktree
- **Auto-commit** — changes are committed automatically as agents work
- **Dependency chains** — define task order with dependencies
- **Parallel execution** — multiple agents work simultaneously on different cards
- **Remote access** — access the board from anywhere

### Workflow
```
Create cards (tasks) on the board
        ↓
Agents pick up cards (via dispatcher)
        ↓
Each agent works in its own git worktree
        ↓
Changes auto-committed as agent progresses
        ↓
Human reviews and merges when done
```

---

## 16. CLI Usage

### Interactive Mode
```bash
cline                           # Start conversational session
cline --model claude-sonnet-4-6 # Specify model
cline --cwd /path/to/project    # Set working directory
```

### Headless / Scripting Mode
```bash
cline "fix the failing tests"                    # One-shot task
cline "migrate the database" --yes               # Auto-approve all
cline "generate docs" --output-format json       # JSON output
```

### Agent Teams (CLI)
```bash
# Run multiple agents on different tasks in parallel
cline agent-teams --config teams.json
```

### Scheduling
```bash
# Schedule recurring tasks
cline schedule --cron "0 9 * * *" "run daily test suite and report failures"
```

### MCP Management
```bash
cline mcp                        # Interactive MCP management wizard
cline mcp add github             # Add from marketplace
cline mcp list                   # Show all configured servers
```

---

## 17. Supported Models & Providers

### Recommended Models

| Model | Best For | Context |
|---|---|---|
| `claude-sonnet-4-6` | General development, Act mode | 200K |
| `claude-opus-4` | Complex architecture, Plan mode | 200K |
| `claude-haiku-3-5` | Simple edits, fast iteration | 200K |
| `gpt-4o` | General use, web tasks | 128K |
| `gemini-2.0-flash` | Speed + cost balance | 1M |
| `deepseek-coder` | Code-focused, cost-efficient | 64K |
| Local (Ollama) | Privacy, offline, zero cost | Varies |

### Dual-Model Configuration (Plan & Act)
```
Plan mode  → claude-opus-4        (stronger reasoning for architecture)
Act mode   → claude-sonnet-4-6    (faster for implementation)
```

### Provider Setup
```bash
# Anthropic
API Key: console.anthropic.com → API Keys

# OpenRouter (access 100+ models with one key, with fallback routing)
API Key: openrouter.ai → Keys

# Ollama (local, free, private)
ollama pull llama3.2
ollama pull codellama
# Cline provider: "Ollama", URL: http://localhost:11434

# AWS Bedrock (three auth methods)
# 1. API key  2. CLI profile  3. IAM credentials
```

---

## 18. Writing Effective Prompts

### The Golden Rule
**Be specific about the outcome, not the method.** Cline decides how — you decide what.

### Prompt Structure
```
[Context]  — which file / feature / system
[Problem]  — what's wrong or what's needed
[Constraint] — rules to follow, what NOT to change
[Done looks like] — how you'll know it's complete
```

### Bad vs Good

| Bad | Good |
|---|---|
| "Fix the bug" | "Login throws 401 when email has uppercase — make auth case-insensitive" |
| "Make it better" | "Refactor fetchUserData() in src/api/users.ts to use async/await, add try/catch" |
| "Add tests" | "Add Vitest tests for calculateScore() in lib/scoring.ts — cover empty input, all trumps, passed-out hand" |

### Plan First for Complex Tasks
```
"Before writing any code, outline your implementation plan for [feature].
List the files you'll touch and the changes to each."
```
Review the plan → confirm → then let Cline implement.

### Use /deep-planning for Large Tasks
```
/deep-planning Implement OAuth2 login with Google and GitHub, including
session management, DB schema changes, and UI updates across the app.
```

---

## 19. Memory Bank Pattern

Because Cline starts fresh each task, a **Memory Bank** is a `.cline/` folder of markdown files that provides persistent project knowledge.

### Structure
```
.cline/
  memory-bank/
    projectbrief.md     — What the project is, goals, non-goals
    productContext.md   — Why it exists, user problems solved
    systemPatterns.md   — Architecture decisions, design patterns
    techContext.md      — Tech stack, setup, environment quirks
    activeContext.md    — Current WIP (updated each session)
    progress.md         — What's done, what's next, known issues
```

### Usage Pattern
**Start every task:**
```
Read all files in .cline/memory-bank/ for context, then [task].
```

**End every significant task:**
```
Update .cline/memory-bank/activeContext.md and progress.md
with what was completed and what's next.
```

---

## 20. Token Usage & Cost Control

### How Costs Grow
Every API call sends the **full conversation** — system prompt + all messages + tool results. A long task costs exponentially more than multiple short tasks.

### Cost Estimates
| Task | Typical Tokens | ~Cost (Sonnet) |
|---|---|---|
| Simple edit (1 file) | 5K–15K | $0.01–$0.05 |
| Feature implementation | 30K–80K | $0.10–$0.30 |
| Large refactor | 80K–200K | $0.30–$0.80 |
| Full codebase exploration | 100K–300K | $0.40–$1.20 |

### Cost Reduction Tips
1. **Reference specific files** — don't let Cline explore blindly
2. **Use Plan mode first** — cheaper to plan than to undo
3. **Start fresh tasks** — don't balloon one task with unrelated work
4. **Right model for the job** — Haiku for simple, Sonnet for complex, Opus for architecture
5. **Use Skills** — inactive skills cost ~100 tokens vs always-loaded rules
6. **Subagents for research** — offload exploration to parallel subagents without burning main context

---

## 21. Common Pitfalls & Fixes

| Problem | Fix |
|---|---|
| Cline reads wrong files | Be explicit: "Only look at `src/api/users.ts`" |
| Context fills up mid-task | Start a new task; summarize progress as the first message |
| Cline loops / can't finish | Stop it; ask "What's blocking you in one sentence?" |
| File write loses important code | Use Checkpoints; always start with clean git tree |
| .clinerules ignored | Confirm file is in workspace root; check if rules are toggled on |
| Terminal command fails silently | Ask Cline to "check exit codes and confirm success before proceeding" |
| Code doesn't match project style | Add concrete examples to .clinerules — not just rules, show patterns |
| API rate limits | Switch model or use OpenRouter with fallback routing |
| Cold start / slow first response | Provisioned concurrency (for Anthropic API) or use a faster model |
| Subagent not triggering | Request explicitly: "Use subagents to explore X and Y in parallel" |

---

## 22. Quick Reference Cheatsheet

```
┌─────────────────────────────────────────────────────────────────┐
│                    CLINE CHEATSHEET                             │
├─────────────────────────────────────────────────────────────────┤
│ START A TASK                                                     │
│   "Read .clinerules and .cline/memory-bank/, then [task]"       │
│                                                                  │
│ PLAN BEFORE ACTING                                               │
│   "Outline your plan before writing any code."                  │
│   /deep-planning [complex multi-file task]                       │
│                                                                  │
│ DEBUG                                                            │
│   "Here's the error: [paste]. Find root cause first."           │
│                                                                  │
│ PARALLEL EXPLORATION                                             │
│   "Use subagents to explore [area A] and [area B] in parallel." │
│                                                                  │
│ UNDO A MISTAKE                                                   │
│   Checkpoints → Restore Files                                   │
│                                                                  │
│ FINISH CLEANLY                                                   │
│   "Run tests. If passing, update .cline/memory-bank/."          │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│ MODES:  Plan (explore) → Act (implement) → /deep-planning       │
│ RULES:  .clinerules/ folder (conditional with YAML frontmatter) │
│ SKILLS: .cline/skills/ — progressive loading, slash commands    │
│ HOOKS:  VS Code settings.json — fires automatically             │
│ MCP:    ~/.cline/mcp.json — external tools via protocol         │
│ UNDO:   Checkpoints — shadow git repo, revert anytime           │
│ MULTI:  Kanban board — parallel agents, per-card worktrees      │
└─────────────────────────────────────────────────────────────────┘
```

---

*Last updated: 2026-05-13 | Based on official docs: docs.cline.bot*
