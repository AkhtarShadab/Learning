# Cline / Claude Code Access Guide
## CLI vs VS Code Extension vs MCP vs API/SDK vs AgentDesk

> **What this document is for:** Before diving into the numbered docs (01-usage through 14-cline_knowledge_base), you need to answer one question: *"Am I using the right interface to access this feature?"* This guide maps every major Cline / Claude Code capability to the interface(s) that expose it, so you always know where to go.

---

## Table of Contents

1. [Overview of Access Methods](#1-overview-of-access-methods)
2. [Master Feature Access Table](#2-master-feature-access-table)
3. [CLI — What's Exclusively or Best Here](#3-cli--whats-exclusively-or-best-here)
4. [VS Code Extension — What's Exclusively or Better Here](#4-vs-code-extension--whats-exclusively-or-better-here)
5. [MCP Servers — How They Bridge Both](#5-mcp-servers--how-they-bridge-both)
6. [API / SDK — Programmatic Access](#6-api--sdk--programmatic-access)
7. [AgentDesk — The Orchestration Layer](#7-agentdesk--the-orchestration-layer)
8. [Quick Decision Guide](#8-quick-decision-guide)
9. [DSA Connections](#9-dsa-connections)

---

## 1. Overview of Access Methods

There are five distinct ways to interact with Cline / Claude Code. Each serves a different use case, and many features are available through more than one interface. Understanding the landscape prevents the common mistake of fighting the wrong tool for the job.

### Claude Code CLI (`claude` command)

The **terminal-first** interface. You run `claude` in any shell — bash, zsh, fish, inside tmux, over SSH. It's scriptable, pipeable, and designed for power users who live in the terminal.

- **Best for:** Headless automation, CI/CD pipelines, scripting, non-interactive batch jobs, full control over session flags and model parameters.
- **Invocation:** `claude` (interactive) or `claude -p "prompt"` (non-interactive, prints result and exits).
- **Key flags:** `--print`, `--output-format`, `--model`, `--resume`, `--continue`, `--worktree`, `--permission-mode`, `--allowedTools`, `--mcp-config`, `--plugin-dir`.

### VS Code Extension

The **GUI-integrated** interface. Cline lives inside VS Code as a sidebar panel, with inline diff views, command palette actions, file tree integration, and a chat experience tightly coupled to your editor workspace.

- **Best for:** Interactive coding sessions, reviewing inline diffs, using Plan/Act mode with visual feedback, workspace-level configuration.
- **Invocation:** Open the Cline panel in the VS Code sidebar, or trigger via Command Palette (`Ctrl+Shift+P` → "Cline").

### MCP Servers (Model Context Protocol)

MCP is a **capability extension protocol** — it lets you plug external tools into Cline's tool-use pipeline. MCP servers aren't an interface you "use" directly; they're services that both the CLI and the VS Code extension can connect to, exposing new tools like browser automation, database queries, or third-party API integrations.

- **Best for:** Extending Cline with external capabilities (browser control, Notion, Telegram, custom APIs).
- **Configuration:** `.mcp.json` in your project root, `~/.claude/settings.json`, or via `--mcp-config` flag.

### API / SDK (`@anthropic-ai/sdk`)

The **programmatic** interface. Use the Anthropic SDK to build your own applications on top of Claude — custom chatbots, data pipelines, automated reviewers, or entirely new products. This is Claude-the-model, not Cline-the-agent.

- **Best for:** Building products, custom integrations, batch processing, programmatic access to Claude's capabilities without the agent framework.
- **Languages:** Python (`anthropic`), TypeScript/Node (`@anthropic-ai/sdk`).

### AgentDesk

The **orchestration layer** built on top of Claude Code CLI. AgentDesk provides a web dashboard with a Kanban board, multi-agent coordination, scheduled jobs (cron), persistent task management, file/context management, and human-in-the-loop workflows. It wraps Claude Code — it doesn't replace it.

- **Best for:** Multi-agent projects, recurring automated jobs, task tracking with audit trails, team collaboration between humans and AI agents.
- **Access:** Web UI at `http://localhost:3737` + `ad-*` CLI commands from within agent sessions.

---

## 2. Master Feature Access Table

This table maps every major feature to the interface(s) through which it's accessible. Use it as a quick lookup when you're wondering "Can I do X from Y?"

> **How to read:** ✅ = fully supported, ⚡ = supported but different mechanism/config, ❌ = not available, 🔌 = available via MCP server (not built-in).

### Core Interaction

| Feature | CLI | VS Code Ext | MCP | API/SDK | AgentDesk |
|---------|:---:|:-----------:|:---:|:-------:|:---------:|
| Chat / conversation | ✅ | ✅ | ❌ | ✅ | ✅ |
| File read/edit | ✅ | ✅ | ❌ | ❌ | ✅ |
| Terminal/bash execution | ✅ | ✅ | ❌ | ❌ | ✅ |
| Plan mode (read-only exploration) | ✅ | ✅ | ❌ | ❌ | ❌ |
| Thinking / extended reasoning | ✅ | ✅ | ❌ | ✅ | ✅ |
| Session resume/continue | ✅ | ✅ | ❌ | ❌ | ❌ |

### Agent & Automation

| Feature | CLI | VS Code Ext | MCP | API/SDK | AgentDesk |
|---------|:---:|:-----------:|:---:|:-------:|:---------:|
| Subagents / Agent tool | ✅ | ✅ | ❌ | ❌ | ✅ |
| Worktree isolation (`--worktree`) | ✅ | ❌ | ❌ | ❌ | ✅ |
| Non-interactive / headless (`--print`) | ✅ | ❌ | ❌ | ❌ | ✅ |
| Scheduling / cron jobs | ❌ | ❌ | ❌ | ❌ | ✅ |
| Multi-agent coordination | ❌ | ❌ | ❌ | ❌ | ✅ |
| Task board / Kanban | ❌ | ❌ | ❌ | ❌ | ✅ |

### Extension Systems

| Feature | CLI | VS Code Ext | MCP | API/SDK | AgentDesk |
|---------|:---:|:-----------:|:---:|:-------:|:---------:|
| Skills (`/skill-name`) | ✅ | ✅ | ❌ | ❌ | ✅ |
| MCP tool use | ✅ | ✅ | ✅ | ❌ | ✅ |
| Hooks (lifecycle events) | ✅ | ⚡ | ❌ | ❌ | ✅ |
| Plugins | ✅ | ✅ | ❌ | ❌ | ❌ |
| Connectors (Notion, Telegram) | ✅ | ✅ | 🔌 | ❌ | ✅ |

### Context & Configuration

| Feature | CLI | VS Code Ext | MCP | API/SDK | AgentDesk |
|---------|:---:|:-----------:|:---:|:-------:|:---------:|
| CLAUDE.md context loading | ✅ | ✅ | ❌ | ❌ | ✅ |
| `.clinerules` rules | ✅ | ✅ | ❌ | ❌ | ❌ |
| Memory / knowledge base | ✅ | ✅ | ❌ | ❌ | ✅ |
| Custom system prompt (`--system-prompt`) | ✅ | ❌ | ❌ | ✅ | ❌ |
| Model selection (`--model`) | ✅ | ✅ | ❌ | ✅ | ✅ |

### External Capabilities (via MCP)

| Feature | CLI | VS Code Ext | MCP | API/SDK | AgentDesk |
|---------|:---:|:-----------:|:---:|:-------:|:---------:|
| Web search | ✅ | ✅ | 🔌 | ❌ | ✅ |
| Browser automation | ✅ | ✅ | 🔌 | ❌ | ✅ |
| Code review (`ultrareview`) | ✅ | ❌ | ❌ | ❌ | ❌ |

### Notes on the Table

- **Hooks ⚡ in VS Code:** Both CLI and VS Code support hooks, but they use **different hook systems**. CLI uses Plugin Hooks (`AgentPlugin.hooks` — `beforeRun`, `afterRun`, `beforeModel`, `afterModel`, `beforeTool`, `afterTool`). VS Code uses Settings Hooks (configured in `settings.json` under `cline.hooks` — `PreToolUse`, `PostToolUse`, `OnError`, `Stop`). Same concept, different APIs. See `07-hooks.md` for the full breakdown.
- **File read/edit in API/SDK:** The API gives you raw Claude model access. File operations are Cline-agent features — the API/SDK doesn't have a file system agent built in; you'd implement that yourself.
- **Web search / browser automation:** These are built-in tools in Cline (CLI + VS Code), but the underlying mechanism uses MCP servers. The 🔌 in the MCP column indicates the MCP server is what makes them work.

---

## 3. CLI — What's Exclusively or Best Here

The CLI is where Cline's full power is most directly accessible. Several features are CLI-only or significantly more capable from the terminal.

### CLI-Exclusive Features

**Non-interactive / headless mode (`--print`)**
Run Claude as a Unix tool — pipe in a prompt, get structured output back. Essential for scripting, CI/CD, and automation.

```bash
# One-shot: get a code review as JSON
claude -p "Review this diff for bugs" --output-format json < diff.patch

# Pipe output to another tool
claude -p "Generate test cases for auth.ts" --output-format text >> tests.md

# Set a budget cap for batch jobs
claude -p "Analyze all TODO comments" --max-budget-usd 0.50
```

**Worktree isolation (`--worktree`)**
Spin up an isolated git worktree per session. The agent works on a separate branch without touching your working tree — critical for parallel agent work.

```bash
claude --worktree feature-auth "Implement OAuth2 login flow"
```

**Session management flags**
Full control over session lifecycle from the command line:

```bash
claude --resume <session-id>      # Resume a specific session
claude --continue                  # Continue the most recent session
claude --session-id <uuid>         # Use a specific session ID
claude --fork-session --resume ... # Fork from an existing session
```

**`ultrareview` — cloud-hosted multi-agent code review**
```bash
claude ultrareview           # Review current branch vs main
claude ultrareview 42        # Review PR #42
```

**Bare mode (`--bare`)**
Minimal mode that skips hooks, LSP, plugin sync, attribution, auto-memory, and CLAUDE.md auto-discovery. Useful for controlled environments where you want predictable, stripped-down behavior.

```bash
claude --bare -p "Quick calculation: 2^32"
```

**Custom tool control**
Whitelist or blacklist specific tools for a session:

```bash
claude --allowedTools "Bash(git *) Read" -p "Show me recent commits"
claude --disallowedTools "Edit Write" -p "Analyze but don't modify anything"
```

### CLI Advantages (Available Elsewhere, but Better Here)

- **Model override per session:** `claude --model opus` — instant model switching without changing global config.
- **MCP config override:** `claude --mcp-config custom-servers.json` — load different MCP server sets per session.
- **Plugin loading:** `claude --plugin-dir ./my-plugin` — load plugins from arbitrary directories or URLs for a single session.
- **Effort level:** `claude --effort max` — control reasoning depth per session.

---

## 4. VS Code Extension — What's Exclusively or Better Here

The VS Code extension trades scriptability for **visual integration**. Some features are only meaningful in a GUI context.

### VS Code-Exclusive Features

**Inline diff views and gutter decorations**
When Cline edits a file, VS Code shows the changes as an inline diff — green for additions, red for deletions — directly in the editor. You can accept or reject individual hunks visually. This is fundamentally impossible in a terminal.

**Command Palette integration**
Trigger Cline actions from `Ctrl+Shift+P`:
- Open Cline panel
- Start a new task
- Toggle Plan/Act mode
- Configure settings

**File tree context menu**
Right-click a file or folder in VS Code's explorer to send it directly to Cline as context: "Ask Cline about this file," "Add to Cline context."

**Extension settings UI**
Configure Cline through VS Code's graphical settings panel — model selection, auto-approve rules, API keys, hook configuration — without editing JSON files directly.

**Workspace-level configuration**
VS Code's multi-root workspace support means Cline can pick up different `.clinerules`, CLAUDE.md, and `.mcp.json` configurations per workspace folder automatically.

### VS Code Advantages (Available Elsewhere, but Better Here)

- **Plan/Act mode toggle:** Available in CLI via `--permission-mode plan`, but VS Code gives you a visual toggle with clear mode indication in the panel.
- **Chat history:** VS Code maintains a visual chat history in the sidebar — scrollable, searchable, with clear message boundaries. CLI has session resume, but the visual experience is richer.
- **Auto-approve configuration:** VS Code offers a granular UI for auto-approve rules (which tools, which directories, read-only vs write). CLI achieves similar via `--allowedTools` and `--dangerously-skip-permissions`, but the UI makes it more discoverable.

---

## 5. MCP Servers — How They Bridge Both

MCP (Model Context Protocol) is the **universal extension point**. An MCP server exposes tools that Cline can call — and both the CLI and the VS Code extension can connect to the same servers.

### What MCP Servers Expose

An MCP server is a process (local or remote) that speaks a standard protocol and advertises **tools** (functions Cline can call), **resources** (data Cline can read), and **prompts** (templates Cline can use). When connected, Cline treats MCP tools exactly like its built-in tools — they appear in the tool list and can be called during any conversation.

### Configuration: CLI vs Extension

Both interfaces read MCP configuration from the same sources, in this priority order:

| Source | CLI | VS Code Ext | Scope |
|--------|:---:|:-----------:|-------|
| `.mcp.json` in project root | ✅ | ✅ | Project-specific servers |
| `~/.claude/settings.json` | ✅ | ✅ | User-global servers |
| `--mcp-config` flag | ✅ | ❌ | Session-override (CLI only) |
| `--strict-mcp-config` flag | ✅ | ❌ | Ignore all other MCP configs |

This means a single `.mcp.json` file in your project root configures MCP for both CLI and VS Code — you don't need to set it up twice.

### Common MCP Server Examples

| MCP Server | What It Does | Example Use Case |
|------------|-------------|------------------|
| `chrome-devtools` | Browser automation via Chrome DevTools Protocol | Screenshot, click, fill forms, navigate pages |
| Camoufox (custom) | Stealth Firefox browser for web tasks | Scraping, authenticated sessions |
| Notion | Read/write Notion pages and databases | Sync tasks, pull documentation |
| Telegram | Send/receive Telegram messages | Notifications, bot interactions |
| Database servers | Query SQL/NoSQL databases | Data exploration, schema inspection |

### The Bridge Mental Model

```
┌──────────────┐     ┌──────────────┐
│  Claude CLI  │     │  VS Code Ext │
└──────┬───────┘     └──────┬───────┘
       │                    │
       │  MCP Protocol      │  MCP Protocol
       │                    │
       └────────┬───────────┘
                │
       ┌────────▼────────┐
       │   MCP Server    │
       │  (browser, DB,  │
       │   Notion, etc.) │
       └─────────────────┘
```

MCP is the **adapter layer**. The CLI and extension don't need to know how to drive a browser or query Notion — they just call MCP tools. This is why the Master Feature Access Table marks browser automation and web search with 🔌 in the MCP column: the capability exists in CLI and VS Code, but MCP is the mechanism that delivers it.

---

## 6. API / SDK — Programmatic Access

The Anthropic API and SDK give you direct access to Claude **the model**, not Cline **the agent**. This is an important distinction.

### What You Get

| Capability | API/SDK | Notes |
|-----------|:-------:|-------|
| Conversational chat | ✅ | Messages API with system prompts |
| Streaming responses | ✅ | Token-by-token streaming |
| Tool use / function calling | ✅ | Define and call custom tools |
| Extended thinking | ✅ | Budget tokens for chain-of-thought |
| Prompt caching | ✅ | Cache long system prompts for cost savings |
| Batch API | ✅ | 50% cheaper, async processing |
| Vision (image input) | ✅ | Analyze images in conversation |
| PDF processing | ✅ | Extract and analyze PDF content |
| Citations | ✅ | Source-grounded responses |
| Managed Agents | ✅ | Pre-built agent capabilities |

### What You Don't Get

The API/SDK gives you the **raw model**. It does **not** include:
- File system access (Read, Edit, Write tools)
- Terminal/bash execution
- MCP server integration
- Skills, hooks, plugins, or `.clinerules`
- CLAUDE.md context loading
- Session management
- Subagent spawning

These are all Cline-agent features layered on top of the model. If you need them programmatically, you're building your own agent framework — or using Claude Code CLI in `--print` mode as a subprocess.

### When to Use API/SDK vs CLI

| Scenario | Use |
|----------|-----|
| Build a chatbot product | API/SDK |
| Batch-process 1000 documents | API/SDK (Batch API) |
| Automate code review in CI | CLI (`--print`) |
| Custom tool-use agent | API/SDK with tool definitions |
| One-off coding task | CLI (interactive) |
| Agent that reads/writes files | CLI — it has the tools built in |

---

## 7. AgentDesk — The Orchestration Layer

AgentDesk sits **on top of** Claude Code CLI. It doesn't replace any of the interfaces above — it wraps the CLI into a managed, multi-agent system with persistence, scheduling, and human oversight.

### What AgentDesk Adds

| Feature | Without AgentDesk | With AgentDesk |
|---------|-------------------|----------------|
| Task tracking | Manual / ad-hoc | Kanban board with lifecycle states |
| Agent coordination | Run separate CLI sessions | Centralized board, mentions, comments |
| Scheduling | OS cron / manual | Managed cron with run history, pause/resume |
| Persistence | Session files on disk | Database-backed tasks, files, audit trail |
| Human-in-the-loop | Manual review | Review/approve/reject workflow |
| Heartbeats | N/A | Periodic agent wake-ups to check for work |
| Progress visibility | Check terminal output | Comments, status transitions, dashboard |

### Features Only Available via AgentDesk

- **Scheduling / cron jobs:** `ad-cron-create` registers jobs visible on the project's Schedule page. Run history is tracked, jobs can be paused/resumed from the UI.
- **Multi-agent Kanban:** Multiple agents (and humans) share a board. Tasks flow through `assigned → planning → in-progress → review → done`.
- **Persistent task management:** Tasks survive across sessions, reboots, and agent restarts. Every comment and status change is logged.
- **Agent health monitoring:** `ad-stats`, `ad-check` — see which agents are active, their current tasks, and health status.
- **Project-level file/context management:** `ad-files`, `ad-file-read`, `ad-file-write` — a shared file store scoped to projects.
- **Integrations:** Notion sync, Telegram bots — configured and managed through AgentDesk.

### How to Think About It

```
┌─────────────────────────────────────────────┐
│               AgentDesk                      │
│  ┌──────────┐  ┌─────────┐  ┌────────────┐  │
│  │  Kanban   │  │  Crons  │  │  Files /   │  │
│  │  Board    │  │  & Jobs │  │  Contexts  │  │
│  └────┬─────┘  └────┬────┘  └─────┬──────┘  │
│       │              │             │          │
│       └──────────┬───┘─────────────┘          │
│                  │                            │
│         ┌───────▼────────┐                    │
│         │  Claude Code   │                    │
│         │  CLI Sessions  │                    │
│         │  (per agent)   │                    │
│         └───────┬────────┘                    │
│                 │                             │
│         ┌───────▼────────┐                    │
│         │  MCP, Skills,  │                    │
│         │  Hooks, Plugins│                    │
│         └────────────────┘                    │
└─────────────────────────────────────────────┘
```

AgentDesk wraps CLI. CLI wraps the model. MCP/Skills/Hooks extend the CLI. Each layer adds capabilities without replacing the layer below.

---

## 8. Quick Decision Guide

> **"I want to do X — which interface should I use?"**

| I want to... | Use | Why |
|--------------|-----|-----|
| Get coding help while working in my editor | **VS Code Extension** | Inline diffs, file context, visual Plan/Act |
| Run a one-off task from the terminal | **CLI** (`claude`) | Fast, no GUI overhead |
| Script Claude into a bash pipeline | **CLI** (`claude -p`) | Headless, pipeable, structured output |
| Automate a recurring job (daily review, weekly report) | **AgentDesk** (`ad-cron-create`) | Managed scheduling with audit trail |
| Coordinate multiple AI agents on a project | **AgentDesk** | Kanban board, mentions, task assignment |
| Extend Claude with browser control or external APIs | **MCP** (`.mcp.json`) | Universal extension protocol for both CLI and VS Code |
| Build a product or chatbot on top of Claude | **API/SDK** | Raw model access, custom tool definitions |
| Batch-process hundreds of documents cheaply | **API/SDK** (Batch API) | 50% cost reduction, async processing |
| Do a cloud-hosted multi-agent code review | **CLI** (`claude ultrareview`) | CLI-exclusive command |
| Run an agent in an isolated git branch | **CLI** (`claude --worktree`) | Parallel work without touching your tree |
| Set up lifecycle hooks for tool events | **CLI** (Plugin Hooks) or **VS Code** (Settings Hooks) | Both support hooks, different configuration |

### The Two-Question Shortcut

```
Q1: Am I building something WITH Claude, or ON TOP OF Claude?
    WITH Claude  → CLI or VS Code Extension
    ON TOP OF    → API/SDK

Q2: Do I need persistence, scheduling, or multi-agent coordination?
    Yes → AgentDesk (which uses CLI underneath)
    No  → CLI or VS Code Extension directly
```

---

## 9. DSA Connections

Three data structure and algorithm concepts that illuminate the architecture of Cline's access methods:

### 1. Strategy Pattern → Interface Selection as Runtime Dispatch

The five access methods implement the same abstract capability (interact with Claude) through different concrete strategies. This mirrors the **Strategy Pattern**: a family of algorithms (CLI, VS Code, API, MCP, AgentDesk) that are interchangeable at the interface boundary. The "Quick Decision Guide" above is effectively a **dispatch table** — a function that maps an input (your goal) to the correct strategy (which interface to use).

```
interface ClaudeAccess {
    chat(prompt: string): Response
}

class CLIAccess implements ClaudeAccess { ... }
class VSCodeAccess implements ClaudeAccess { ... }
class APIAccess implements ClaudeAccess { ... }

// The decision guide is the dispatcher:
function selectStrategy(goal: string): ClaudeAccess { ... }
```

### 2. Adapter Pattern → MCP as Universal Adapter

MCP servers are a textbook implementation of the **Adapter Pattern**. Each MCP server adapts an external system's API (Chrome DevTools, Notion, Telegram) into a uniform tool interface that Cline can call. The MCP protocol is the **target interface**; each server is an adapter that translates between that interface and the external service's native API.

```
┌────────────┐    MCP Protocol    ┌────────────────┐    Native API    ┌──────────┐
│   Cline    │ ←───────────────── │  MCP Server    │ ───────────────→ │ External │
│ (client)   │    (uniform)       │  (adapter)     │    (varied)      │ Service  │
└────────────┘                    └────────────────┘                  └──────────┘
```

This is why MCP is so powerful: Cline doesn't need a custom integration for every external tool. One protocol, many adapters.

### 3. Layered Architecture → Feature Access as Stack Depth

The access methods form a **layered stack**, where each layer wraps and extends the one below:

```
Layer 4:  AgentDesk    (scheduling, kanban, multi-agent)
Layer 3:  CLI Agent    (file tools, bash, sessions, skills, hooks)
Layer 2:  MCP          (external tool adapters)
Layer 1:  Claude API   (raw model — chat, thinking, tool use)
```

Features at higher layers depend on lower layers but not vice versa. This is the **Dependency Inversion Principle** in action: the API doesn't know about the CLI, the CLI doesn't know about AgentDesk, but AgentDesk depends on the CLI which depends on the API. The Master Feature Access Table directly reflects this stack — API/SDK features are available everywhere, while AgentDesk features are only at the top.

---

## Further Reading

| Resource | What It's Good For |
|----------|-------------------|
| `01-usage.md` | AgentDesk CLI commands and Kanban board workflows |
| `02-features.md` | Deep dive into Plan/Act mode, checkpoints, context management |
| `03-tools.md` | Complete reference for Cline's built-in tools |
| `04-mcp.md` | Comprehensive MCP server setup, configuration, and troubleshooting |
| `05-skills.md` | How skills work, progressive loading, creating custom skills |
| `06-workflows.md` | Multi-step workflow patterns and automation |
| `07-hooks.md` | Both hook systems (VS Code Settings Hooks + Plugin Hooks) |
| `08-scheduling.md` | AgentDesk cron jobs, intervals, and one-shot schedules |
| `09-connectors.md` | Notion, Telegram, and other external service integrations |
| `10-plugins.md` | Plugin system architecture and usage |
| `11-subagents.md` | Spawning and managing subagents |
| `12-agents.md` | Agent architecture, registration, and coordination |
| `13-clinerules.md` | Rule-based context loading and configuration |
| `14-cline_knowledge_base.md` | Knowledge base management and retrieval |
| [Anthropic API Docs](https://docs.anthropic.com) | Official API reference, model capabilities, pricing |
| [Claude Code CLI docs](https://docs.anthropic.com/en/docs/claude-code) | Official CLI reference and configuration guide |
