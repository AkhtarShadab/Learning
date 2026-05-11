# Cline Knowledge Base
> A comprehensive reference guide for using Cline effectively as an AI coding assistant inside VS Code.

---

## Table of Contents

1. [What is Cline?](#1-what-is-cline)
2. [Installation & Setup](#2-installation--setup)
3. [Core Concepts](#3-core-concepts)
4. [How Cline Works — Under the Hood](#4-how-cline-works--under-the-hood)
5. [Cline's Tool Arsenal](#5-clines-tool-arsenal)
6. [Writing Effective Prompts](#6-writing-effective-prompts)
7. [Context Management](#7-context-management)
8. [Custom Instructions & .clinerules](#8-custom-instructions--clinerules)
9. [MCP — Model Context Protocol](#9-mcp--model-context-protocol)
10. [Modes: Auto-Approve vs Manual](#10-modes-auto-approve-vs-manual)
11. [Memory Bank Pattern](#11-memory-bank-pattern)
12. [Workflows & Best Practices](#12-workflows--best-practices)
13. [Token Usage & Cost Control](#13-token-usage--cost-control)
14. [Supported Models & Providers](#14-supported-models--providers)
15. [Common Pitfalls & Fixes](#15-common-pitfalls--fixes)
16. [Quick Reference Cheatsheet](#16-quick-reference-cheatsheet)

---

## 1. What is Cline?

**Cline** (formerly Claude Dev) is an open-source AI coding assistant that lives inside VS Code as an extension. Unlike GitHub Copilot (which autocompletes inline), Cline operates as an **autonomous agent** — it can read files, write code, run terminal commands, search the web, and interact with your entire codebase in a goal-directed way.

### Key Differentiators

| Feature | Cline | GitHub Copilot | Cursor |
|---|---|---|---|
| Autonomous file edits | ✅ Full | ❌ Inline only | ✅ Partial |
| Terminal command execution | ✅ Yes | ❌ No | ✅ Yes |
| Bring your own API key | ✅ Yes | ❌ No | ✅ Yes |
| Open source | ✅ Yes | ❌ No | ❌ No |
| MCP tool support | ✅ Yes | ❌ No | ❌ No |
| Works with any LLM | ✅ Yes | ❌ No | ✅ Partial |
| Context window control | ✅ Full | ❌ Managed | ✅ Partial |

### Core Philosophy
Cline follows a **human-in-the-loop** approach — it proposes actions (file writes, terminal commands) and asks for approval before executing, keeping you in control at every step (unless you enable auto-approve).

---

## 2. Installation & Setup

### Step 1: Install the Extension
1. Open VS Code
2. Go to Extensions (`Ctrl+Shift+X`)
3. Search for **"Cline"**
4. Install by **saoudrizwan**

### Step 2: Configure Your API Provider
Open the Cline panel (left sidebar robot icon) → click the **settings gear** → choose your provider:

```
Supported Providers:
- Anthropic (Claude models)         ← Most popular
- OpenAI (GPT-4o, o1, o3)
- Google Gemini
- AWS Bedrock
- Azure OpenAI
- Ollama (local models)
- OpenRouter (aggregator)
- LM Studio (local)
- Vertex AI
```

### Step 3: Set API Key
- For Anthropic: get key at [console.anthropic.com](https://console.anthropic.com)
- Paste into Cline settings → API Key field
- Select model (recommended: `claude-sonnet-4-5` for balance of power/cost)

### Step 4: Verify Setup
Open Cline panel → type a simple task like:
```
List all files in the current directory
```
If Cline responds and proposes a tool call → you're good to go.

---

## 3. Core Concepts

### 3.1 Tasks
A **task** is a single conversation thread with Cline. Each task has:
- A starting prompt (your instruction)
- A sequence of tool calls and responses
- A token counter (tracks cost)
- Full history saved to disk

### 3.2 The Agentic Loop
Cline operates in a loop:
```
You give instruction
        ↓
Cline thinks (LLM call)
        ↓
Cline proposes a tool (read file / write file / run command)
        ↓
You approve (or auto-approve fires)
        ↓
Tool executes → result returned to Cline
        ↓
Cline thinks again → proposes next action
        ↓
... repeat until task is complete ...
        ↓
Cline responds with final summary
```

### 3.3 Context Window
The context window is the LLM's "working memory". Everything — your prompt, file contents, tool results, conversation history — must fit inside it. For Claude Sonnet: **200K tokens**.

When the window fills up, Cline compacts old messages to preserve the most recent context. Understanding this is key to avoiding lost context.

### 3.4 System Prompt
Cline prepends a large system prompt to every task that tells the LLM:
- What tools are available and how to use them
- Your OS and shell
- The current working directory
- Any custom instructions or `.clinerules` content

---

## 4. How Cline Works — Under the Hood

```
┌─────────────────────────────────────────────────┐
│                    VS Code                       │
│  ┌──────────┐    ┌─────────────────────────┐   │
│  │  Cline   │    │    Extension Backend     │   │
│  │   Chat   │◄──►│  - Tool execution        │   │
│  │   Panel  │    │  - File R/W              │   │
│  └──────────┘    │  - Terminal commands     │   │
│                  │  - Browser (via MCP)     │   │
│                  └────────────┬────────────┘   │
└───────────────────────────────┼─────────────────┘
                                │ API calls
                    ┌───────────▼────────────┐
                    │     LLM Provider        │
                    │  (Anthropic / OpenAI    │
                    │   / Bedrock / Ollama)   │
                    └─────────────────────────┘
```

### Message Flow
1. User types prompt in Cline panel
2. Cline builds a messages array: `[system prompt, user msg, ...history]`
3. Sends to LLM API
4. LLM responds with either:
   - A **tool call** (XML tags like `<read_file>`, `<write_to_file>`)
   - A **text response** (task complete)
5. Cline parses the tool call, executes it, appends result to messages
6. Sends updated messages back to LLM
7. Repeat until LLM gives a text-only response

---

## 5. Cline's Tool Arsenal

Cline has a set of built-in tools the LLM can invoke:

### File Tools
| Tool | What It Does |
|---|---|
| `read_file` | Read full contents of a file |
| `write_to_file` | Create or overwrite a file completely |
| `replace_in_file` | Make targeted edits using search/replace blocks |
| `list_files` | List directory contents (recursive option) |
| `search_files` | Grep-like search across codebase (regex) |
| `list_code_definition_names` | List functions/classes in a file |

### Terminal Tools
| Tool | What It Does |
|---|---|
| `execute_command` | Run shell command (npm install, git, etc.) |

### Browser Tools (requires MCP or built-in)
| Tool | What It Does |
|---|---|
| `browser_action` | Launch browser, click, type, screenshot |

### MCP Tools
Any tools registered via Model Context Protocol (custom or third-party).

### Communication Tools
| Tool | What It Does |
|---|---|
| `ask_followup_question` | Ask you a clarifying question mid-task |
| `attempt_completion` | Signal the task is done with a summary |

### Best Tool Usage Patterns
```
Reading a file before editing:
  read_file → understand contents → replace_in_file (targeted edit)
  NOT: write_to_file (full overwrite — loses context)

Exploring a new codebase:
  list_files (recursive) → read_file (key files) → search_files (find patterns)

Running tests:
  execute_command("npm test") → read output → fix errors → re-run
```

---

## 6. Writing Effective Prompts

### The Golden Rule
**Be specific about what you want, not how to do it.** Cline figures out the how.

### Bad vs Good Prompts

```
❌ Bad: "Fix the bug"
✅ Good: "The login form throws a 401 when the email has uppercase letters.
          Fix it so authentication is case-insensitive."

❌ Bad: "Make it better"
✅ Good: "Refactor the fetchUserData() function in src/api/users.ts to use
          async/await instead of .then() chains, and add error handling."

❌ Bad: "Add tests"
✅ Good: "Add Vitest unit tests for the calculateScore() function in
          lib/scoring.ts. Cover edge cases: empty input, all trumps, and
          a passed-out hand."
```

### Prompt Structure Template
```
[Context] — what part of the codebase / what situation
[Problem] — what's wrong or what's needed
[Constraint] — any rules to follow (don't change the API, keep TypeScript strict)
[Expected outcome] — what done looks like
```

**Example:**
```
Context: The BridgeOnline project uses Socket.io for real-time game state.
Problem: When a player disconnects and reconnects, they lose their hand.
Constraint: Don't change the socket event names — clients depend on them.
Expected outcome: Player reconnects and receives their current hand within 2 seconds.
```

### Prompts for Common Tasks

**Explain code:**
```
Explain what the handleBid() function in lib/game/bidding.ts does,
focusing on how it validates bids and updates game state.
```

**Add a feature:**
```
Add a "spectator mode" to the game room. Spectators can join via a URL
param ?spectate=true, see all cards (but can't play), and receive
all game state updates via the existing socket events.
```

**Debug:**
```
The test in __tests__/scoring.test.ts line 42 is failing with:
"Expected 3, received 0". The test checks rubber bonus calculation.
Find and fix the bug.
```

**Refactor:**
```
The GameRoom component (app/room/[id]/page.tsx) is 800 lines. Extract
the bidding UI into a separate BiddingPanel component in components/game/.
Keep all existing props and socket handlers intact.
```

---

## 7. Context Management

### What Eats Your Context Window

| Source | Size | Notes |
|---|---|---|
| System prompt | ~8-12K tokens | Fixed, always present |
| `.clinerules` | Varies | Your custom instructions |
| File contents | Varies | Biggest variable |
| Tool results | Varies | Terminal output, search results |
| Conversation history | Grows | Compacted when near limit |

### Strategies to Preserve Context

**1. Be specific about files**
```
❌ "Look at the codebase and fix the auth bug"
✅ "Look at middleware.ts and app/api/auth/route.ts and fix the auth bug"
```
This prevents Cline from reading dozens of irrelevant files.

**2. Start new tasks for new problems**
Each task gets a fresh context. Don't try to fix 10 unrelated bugs in one task — split them up.

**3. Summarize before long operations**
Before Cline dives into a big refactor, ask it to:
```
First, summarize your plan in bullet points before making any changes.
```
This forces structured thinking and is cheaper than trial-and-error.

**4. Use `.clinerules` for persistent context**
Project-level rules that always load — saves re-explaining every task (see section 8).

### Context Window Indicator
Cline shows a token counter in the task header. Watch it — when it approaches the model's limit, consider:
- Starting a new task with a focused scope
- Asking Cline to summarize progress and continue fresh

---

## 8. Custom Instructions & .clinerules

### Global Custom Instructions
In Cline Settings → **Custom Instructions** — applies to ALL tasks:
```
- Always use TypeScript strict mode
- Prefer functional components over class components
- Write tests for any new functions you create
- Never use `any` type without a comment explaining why
- Follow the existing code style — check nearby files first
```

### .clinerules (Project-level)
Create a `.clinerules` file in your project root. Cline loads it automatically at the start of every task in that project.

**Example `.clinerules` for BridgeOnlineNEXTJS:**
```markdown
# BridgeOnline — Cline Rules

## Stack
- Next.js 15 (App Router), React 19, TypeScript strict
- PostgreSQL via Prisma ORM
- Socket.io for real-time
- NextAuth.js v5 for auth
- Tailwind CSS + shadcn/ui

## Code Style
- Use async/await, never .then() chains
- All API routes return { data, error } shape
- Socket events are defined in types/socket.ts — don't add new ones without updating types
- Game logic lives in lib/game/ — keep it pure (no DB calls, no socket emits)

## Testing
- Unit tests: Vitest in __tests__/
- E2E tests: Playwright in __tests__/e2e/
- Always run `npm test` before saying a task is done

## Common Gotchas
- Prisma client is a singleton — import from lib/prisma.ts, never new PrismaClient()
- Socket server is in server/index.js — Next.js API routes can't emit socket events directly
- Auth session uses JWT strategy — userId is in session.user.id
```

### .clinerules Best Practices
- Keep it under 2000 tokens (it loads on every task)
- Focus on project-specific facts Cline couldn't guess
- Update it when you discover new gotchas
- Include the tech stack, naming conventions, and forbidden patterns

---

## 9. MCP — Model Context Protocol

**MCP** is an open standard that lets Cline connect to external tools and data sources beyond its built-in toolkit.

### What MCP Enables
```
Cline + MCP Servers
├── Browser automation (Puppeteer, Playwright)
├── Database queries (PostgreSQL, SQLite)
├── File systems (remote / cloud)
├── APIs (GitHub, Slack, Linear, Notion)
├── Web search (Brave, Perplexity)
└── Custom tools (anything you build)
```

### Setting Up MCP
1. Open Cline Settings → **MCP Servers**
2. Click **Add Server**
3. Enter the server config (JSON):

```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "your-token-here"
      }
    },
    "postgres": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-postgres"],
      "env": {
        "POSTGRES_URL": "postgresql://localhost/mydb"
      }
    }
  }
}
```

### Popular MCP Servers
| Server | Use Case |
|---|---|
| `@modelcontextprotocol/server-github` | Read/write GitHub issues, PRs, code |
| `@modelcontextprotocol/server-postgres` | Query PostgreSQL directly |
| `@modelcontextprotocol/server-brave-search` | Web search |
| `@modelcontextprotocol/server-filesystem` | Access remote file systems |
| `@modelcontextprotocol/server-slack` | Send/read Slack messages |
| `mcp-server-playwright` | Browser automation |

### Building a Custom MCP Server
```typescript
// Simple MCP server in TypeScript
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const server = new Server({ name: "my-tool", version: "1.0.0" });

server.setRequestHandler("tools/list", async () => ({
  tools: [{
    name: "get_weather",
    description: "Get current weather for a city",
    inputSchema: {
      type: "object",
      properties: { city: { type: "string" } },
      required: ["city"]
    }
  }]
}));

server.setRequestHandler("tools/call", async (request) => {
  if (request.params.name === "get_weather") {
    const city = request.params.arguments.city;
    // fetch weather API...
    return { content: [{ type: "text", text: `Weather in ${city}: 72°F, sunny` }] };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
```

---

## 10. Modes: Auto-Approve vs Manual

### Manual Mode (Default — Recommended for beginners)
Cline proposes every action, you click **Approve** or **Reject** before it executes.

```
Cline: "I'll write the following to src/auth.ts: ..."
You: [Approve] → file is written
     [Reject]  → Cline tries a different approach
```

**Best for:** Learning, sensitive codebases, production files, any destructive operation.

### Auto-Approve Settings
In Cline settings you can enable auto-approval for specific action types:

| Setting | What Gets Auto-Approved |
|---|---|
| Read files | All `read_file` calls |
| Write files | All `write_to_file` / `replace_in_file` |
| Execute commands | All `execute_command` calls ⚠️ Dangerous |
| Browser actions | All browser interactions |
| MCP tools | All MCP tool calls |

**Recommended auto-approve config:**
```
✅ Auto-approve: read files (safe, just reading)
⚠️  Manual: write files (review before changes land)
❌ Never auto-approve: execute commands in production
```

### The `--dangerously-skip-permissions` Flag
Running Cline in headless/CLI mode for CI pipelines:
```bash
# Use only in sandboxed environments
cline --dangerously-skip-permissions "run all tests and fix failures"
```

---

## 11. Memory Bank Pattern

Because Cline starts fresh each task, a **Memory Bank** is a folder of markdown files that gives Cline persistent project knowledge.

### Standard Memory Bank Structure
```
.cline/memory-bank/
├── projectbrief.md       — What the project is, goals, non-goals
├── productContext.md     — Why it exists, user problems it solves
├── systemPatterns.md     — Architecture decisions, design patterns used
├── techContext.md        — Tech stack, setup, environment quirks
├── activeContext.md      — Current work in progress (updated each session)
└── progress.md           — What's done, what's next, known issues
```

### How to Use It
**Start every task with:**
```
Read all files in .cline/memory-bank/ to understand the project context,
then [actual task here].
```

**End every significant task with:**
```
Update .cline/memory-bank/activeContext.md and progress.md with what
was completed in this session and what's next.
```

### Example `activeContext.md`
```markdown
# Active Context — Last Updated: 2026-05-11

## Current Focus
Implementing spectator mode (GitHub issue #42)

## What Was Done Last Session
- Added `?spectate=true` URL param handling in middleware.ts
- Created SpectatorContext in app/room/[id]/layout.tsx
- Spectators now receive game-state socket events

## What's Next
- Hide the bidding controls for spectators
- Add spectator count display in the room header
- Test with Playwright (spectator joining mid-game)

## Known Issues
- Spectators briefly see their "hand" before the spectator guard fires — fix in next session
```

---

## 12. Workflows & Best Practices

### Workflow 1: Starting a New Feature
```
1. "Read .cline/memory-bank/ for context."
2. "Explain your implementation plan for [feature] before writing any code."
3. Review the plan → request changes if needed
4. "Implement the plan step by step."
5. "Run the tests and fix any failures."
6. "Update the memory bank with what was done."
```

### Workflow 2: Debugging a Bug
```
1. Share the exact error message + stack trace in your prompt
2. "Find the root cause in the codebase — don't fix yet, just diagnose."
3. Review diagnosis → confirm it's correct
4. "Now fix it with the minimal change needed."
5. "Write a regression test to cover this bug."
```

### Workflow 3: Code Review
```
"Review the changes in the following files for:
 - Logic errors
 - Missing error handling
 - Security issues (SQL injection, XSS, etc.)
 - TypeScript type safety
 - Test coverage gaps
Files: [list them]"
```

### Workflow 4: Learning a New Codebase
```
"List all files in the project recursively.
Then read the package.json, README, and main entry point.
Give me a 10-bullet summary of how this codebase is structured
and what it does."
```

### General Best Practices
- ✅ **One task per conversation** — scope tightly, start new tasks often
- ✅ **Approve file reads freely** — it's just reading
- ✅ **Review file writes carefully** — especially in shared/production files
- ✅ **Keep `.clinerules` updated** — it's your project's constitution
- ✅ **Use the Memory Bank** for any project longer than 1 session
- ✅ **Ask for a plan first** on large tasks
- ❌ **Don't give huge vague tasks** — "rewrite the whole app" never works well
- ❌ **Don't let context fill up** — split big tasks into smaller ones
- ❌ **Don't auto-approve terminal commands** unless you know what's running

---

## 13. Token Usage & Cost Control

### How Tokens Are Counted
Every API call sends the **entire conversation** — system prompt + all messages + tool results. Costs grow as a task gets longer.

### Cost Estimates (Claude Sonnet 3.5)
| Task Type | Typical Tokens | Approx Cost |
|---|---|---|
| Simple edit (1 file) | 5K–15K | $0.01–$0.05 |
| Feature implementation | 30K–80K | $0.10–$0.30 |
| Large refactor | 80K–200K | $0.30–$0.80 |
| Full codebase exploration | 100K–300K | $0.40–$1.20 |

### Cost Reduction Tips
1. **Use targeted prompts** — reference specific files instead of letting Cline explore
2. **Pick the right model** — use `claude-haiku` for simple tasks, `sonnet` for complex ones
3. **Start fresh tasks** — don't let one task balloon with unrelated work
4. **Use `replace_in_file`** — cheaper than `write_to_file` for small changes (less content in the response)
5. **Avoid redundant reads** — once a file is in context, Cline remembers it for the task

### Token Counter
Cline shows total tokens used per task in the task header. Track it to build intuition for what different tasks cost.

---

## 14. Supported Models & Providers

### Recommended Models

| Model | Best For | Context | Speed |
|---|---|---|---|
| `claude-sonnet-4-5` | General development, complex reasoning | 200K | Fast |
| `claude-opus-4` | Very complex architecture, analysis | 200K | Slower |
| `claude-haiku-3-5` | Simple edits, quick questions | 200K | Fastest |
| `gpt-4o` | General use, good for web tasks | 128K | Fast |
| `gemini-2.0-flash` | Speed + cost | 1M | Very fast |
| Local (Ollama) | Privacy, no cost, offline | Varies | Depends on GPU |

### Provider Setup Quick Reference
```bash
# Anthropic — best overall for coding
API Key: console.anthropic.com → API Keys

# OpenRouter — access many models with one key
API Key: openrouter.ai → Keys
Benefit: fallback routing, cheaper access to some models

# Ollama — local, free, private
ollama pull llama3.2
ollama pull codellama
# Then set Cline provider to "Ollama", URL: http://localhost:11434
```

---

## 15. Common Pitfalls & Fixes

### Cline keeps reading wrong files
**Fix:** Be explicit: *"Only look at src/api/users.ts — don't read other files"*

### Context fills up mid-task
**Fix:** Start a new task. Open the completed task → click "..." → "Copy as Markdown" → start new task with a summary.

### Cline loops and can't finish
**Fix:** Stop the task, ask: *"What's blocking you? Give me a one-line diagnosis."* Then address the specific blocker.

### File write overwrites something important
**Fix:** Use git. Always have a clean working tree before big Cline sessions. `git stash` or commit first.

### Cline ignores `.clinerules`
**Fix:** Check the file is in the **workspace root** (not a subfolder). Also check Cline settings that custom instructions loading is enabled.

### Terminal command fails silently
**Fix:** Ask Cline to always check exit codes: *"After running each command, confirm it succeeded before proceeding."*

### Cline generates code that doesn't match the project style
**Fix:** Update `.clinerules` with the specific style conventions and examples. The more concrete, the better.

### API errors / rate limits
**Fix:** Switch to a different model temporarily, or use OpenRouter with fallback routing enabled.

---

## 16. Quick Reference Cheatsheet

```
┌─────────────────────────────────────────────────────────────────┐
│                    CLINE CHEATSHEET                             │
├─────────────────────────────────────────────────────────────────┤
│ START A TASK                                                     │
│   "Read .clinerules and .cline/memory-bank/, then [task]"       │
│                                                                  │
│ GET A PLAN FIRST                                                 │
│   "Outline your approach before writing any code."              │
│                                                                  │
│ DEBUG                                                            │
│   "Here's the error: [paste]. Find the root cause first."       │
│                                                                  │
│ REFACTOR SAFELY                                                  │
│   "Make only the minimal change needed. Explain each edit."     │
│                                                                  │
│ ADD TESTS                                                        │
│   "Write tests for [function] covering: [edge cases]."          │
│                                                                  │
│ REVIEW CODE                                                      │
│   "Review [file] for bugs, type safety, and security."          │
│                                                                  │
│ FINISH CLEANLY                                                   │
│   "Run the tests. If they pass, update the memory bank."        │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│ AUTO-APPROVE: reads=✅  writes=⚠️  commands=❌(careful)         │
│ CONTEXT TIP: new task per problem, reference specific files      │
│ COST TIP:    haiku for simple, sonnet for complex                │
│ KEY FILES:   .clinerules (root), .cline/memory-bank/*.md        │
└─────────────────────────────────────────────────────────────────┘
```

---

*Last updated: 2026-05-11 | Cline version reference: v3.x*
