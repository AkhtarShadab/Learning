# Agents — The Claude Code Agent Model

---

## Table of Contents

1. [What Is an Agent in Claude Code?](#1-what-is-an-agent-in-claude-code)
2. [The Agent Tool](#2-the-agent-tool)
3. [Available Agent Types](#3-available-agent-types)
4. [Agents vs Subagents](#4-agents-vs-subagents)
5. [Orchestration Patterns](#5-orchestration-patterns)
6. [Writing Effective Agent Prompts](#6-writing-effective-agent-prompts)
7. [Isolation & Safety](#7-isolation--safety)
8. [Practical Examples](#8-practical-examples)
9. [DSA Connections](#9-dsa-connections)
10. [Quick Reference](#10-quick-reference)

---

## 1. What Is an Agent in Claude Code?

An **agent** in Claude Code is an isolated Claude instance with its own context window, tool access, and task scope. When you interact with Claude Code normally, you're talking to the **main agent** — the primary Claude instance that sees your conversation, reads your files, edits your code, and runs your commands. But the main agent isn't the only game in town.

Claude Code can spin up additional agents — separate Claude instances that operate independently, each with their own context window and token budget. These agents receive a task, do their work, and return a result. They don't see your conversation history. They don't share your context window. They are standalone workers dispatched to handle a piece of work.

### The Three Tiers of Agency

To understand the agent model, you need to distinguish three tiers:

```
┌──────────────────────────────────────────────────────────┐
│                     MAIN AGENT                           │
│  Your primary Claude Code instance                       │
│  - Sees your full conversation                           │
│  - Has access to ALL tools                               │
│  - Can read AND write files                              │
│  - Can spawn other agents                                │
│  - Persists across your entire session                   │
│                                                          │
│       ┌──────────────┐     ┌──────────────┐              │
│       │  AGENT (A)   │     │  AGENT (B)   │              │
│       │  Typed agent │     │  Background  │              │
│       │  (e.g. Plan) │     │  worker      │              │
│       │  Own context │     │  Own context  │              │
│       │  Own tools   │     │  Own tools    │              │
│       └──────────────┘     └──────────────┘              │
│                                                          │
│       ┌──────────────┐                                   │
│       │  SUBAGENT    │  ← Read-only parallel explorer    │
│       │  (Legacy)    │     (covered in subagents.md)     │
│       └──────────────┘                                   │
└──────────────────────────────────────────────────────────┘
```

1. **Main Agent** — The Claude instance you talk to. It orchestrates everything. It's the only agent that persists across your full conversation. It has access to all tools and can read and write files.

2. **Typed Agents** (via the Agent tool) — Specialized Claude instances spawned by the main agent using the `Agent` tool. Each has a specific type (`Explore`, `Plan`, `general-purpose`, etc.) that determines which tools it can access. They receive a self-contained prompt, do their work, and return a result. They can be foreground (blocking) or background (non-blocking).

3. **Subagents** (legacy parallel explorers) — Read-only parallel workers that Cline auto-spawns for codebase exploration. These are covered extensively in `subagents.md` and are a more specialized, automated version of the agent concept. This document focuses on the broader Agent tool model.

### When Does Claude Code Spin Up an Agent?

Claude Code spawns an agent in two scenarios:

**Automatic spawning:** The main agent decides, based on the complexity of your request, that delegating part of the work to a specialist agent would be more efficient. For example, if you ask "find all the files that reference the UserService," the main agent might spawn an `Explore` agent rather than doing the search itself — freeing its own context window for the actual implementation work.

**Explicit invocation:** You can instruct the main agent to spawn an agent, or the main agent's system prompt may include instructions to use specific agent types for specific tasks. For example: "Launch a Plan agent to design the implementation strategy, then use the plan to implement it."

The key insight: **agents are the unit of delegation in Claude Code.** The main agent is a coordinator that can dispatch work to specialists. Each specialist operates in isolation, does its job, and reports back. This is how Claude Code scales beyond the limitations of a single context window.

---

## 2. The Agent Tool

The **Agent tool** is the mechanism through which the main agent (or any agent with the `Agent` tool in its toolset) spawns a new agent. It's a first-class tool in Claude Code, just like `Read`, `Edit`, or `Bash`.

### Parameters

The Agent tool accepts these parameters:

| Parameter | Required | Type | Description |
|-----------|----------|------|-------------|
| `description` | ✅ | string | Short (3–5 word) label for the task. Shown in the UI and used for tracking. |
| `prompt` | ✅ | string | The complete task brief. This is the ONLY context the agent receives — it has no access to your conversation history. |
| `subagent_type` | ❌ | string | Which agent type to use (`claude`, `general-purpose`, `Explore`, `Plan`, etc.). Defaults to `general-purpose` if omitted. |
| `model` | ❌ | string | Override the model (`sonnet`, `opus`, `haiku`). If omitted, inherits from the parent agent. |
| `isolation` | ❌ | `"worktree"` | When set to `"worktree"`, the agent operates on an isolated git worktree — a separate copy of the repo. |
| `run_in_background` | ❌ | boolean | If `true`, the agent runs non-blocking. The caller continues working and is notified when the agent completes. |

### What Happens Under the Hood

When the main agent calls `Agent()`, this sequence unfolds:

```
1. SPAWN
   Main agent invokes Agent({description, prompt, subagent_type, ...})
   → Claude Code creates a new Claude instance
   → The agent type determines which tools are loaded
   → The prompt becomes the agent's initial task

2. EXECUTE
   The new agent begins working with its own context window
   → It can use whatever tools its type permits
   → It has NO access to the parent's conversation or context
   → It works independently, making its own tool calls

3. RETURN
   The agent completes its work
   → It produces a final result message
   → That message is returned to the calling agent
   → The spawned agent's context window is released

4. RESUME
   The calling agent receives the result
   → It can use the result in its ongoing work
   → It can spawn additional agents based on what it learned
```

### Foreground vs Background Agents

This is a critical architectural decision:

**Foreground agents** (default) block the calling agent until they complete. The caller waits for the result before continuing.

```
Main Agent                     Spawned Agent
    │                               │
    │── Agent({...}) ──────────────►│
    │   [BLOCKED - waiting]         │ working...
    │                               │ working...
    │                               │ working...
    │◄── result ───────────────────│
    │                               │ (released)
    │ continues with result
    ▼
```

**Use foreground when:** The result is needed before the caller can proceed. Research findings that inform implementation. A plan that must exist before coding begins.

**Background agents** (`run_in_background: true`) are non-blocking. The caller continues working immediately and receives a notification when the agent finishes.

```
Main Agent                     Background Agent
    │                               │
    │── Agent({run_in_background}) ►│
    │ continues working...          │ working...
    │ continues working...          │ working...
    │ continues working...          │ working...
    │◄── notification ─────────────│ (done)
    │ processes result              │ (released)
    ▼
```

**Use background when:** The work is independent. You can make progress without the result. Long-running tasks that would waste time blocking. Multiple independent investigations.

> **Key rule:** Do NOT poll or sleep-wait for background agents. Claude Code automatically notifies you when they complete. Polling wastes turns and context.

### The Prompt Is Everything

The most important concept about the Agent tool: **the agent has NO prior context.** It doesn't see your conversation. It doesn't know what you've tried. It doesn't know why this task matters. The `prompt` parameter is the agent's entire universe.

This means the prompt must be **self-contained** — it must include:
- What the goal is and why it matters
- What the agent should know about the surrounding problem
- What has already been tried or ruled out
- What format the result should take
- Enough context for the agent to make judgment calls

Bad prompt: `"Fix the auth bug."`
Good prompt: `"The login endpoint at src/api/auth.ts returns 500 when the session cookie is expired instead of redirecting to /login. The session middleware at src/middleware/session.ts checks cookie validity but doesn't distinguish between missing and expired cookies. Investigate both files and propose a fix that handles expired cookies with a redirect while keeping the existing behavior for missing cookies. Report your findings and proposed changes."`

---

## 3. Available Agent Types

Each agent type is a pre-configured Claude instance with specific tools, behaviors, and use-case profiles. Choosing the right type is like choosing the right tool for a job — a wrench can hammer a nail, but a hammer does it better.

### `claude` — The Generalist

**Purpose:** Catch-all agent for any task that doesn't fit a more specific type. This is Claude Code's default when no agent name is typed.

**Tools available:** All tools (Read, Edit, Write, Bash, Grep, Glob, Agent, and all others)

**When to use:**
- General-purpose tasks that need full tool access
- Tasks that might involve reading AND writing files
- When you're unsure which specialist to use

**When NOT to use:**
- When a specialist type exists for your task — specialists have optimized tool sets and behaviors
- For pure search/exploration tasks (use `Explore` instead)
- For architectural planning (use `Plan` instead)

```
Agent({
  description: "Fix auth redirect",
  prompt: "The login flow has a bug where expired sessions get a 500...",
  subagent_type: "claude"
})
```

### `general-purpose` — Multi-Step Research & Execution

**Purpose:** The default agent type when `subagent_type` is omitted. Designed for complex, multi-step tasks that involve both research and execution.

**Tools available:** All tools

**When to use:**
- Tasks requiring multiple rounds of search → read → analyze → implement
- When you need an agent that can both research and act on findings
- Open-ended investigations that might require code changes

**When NOT to use:**
- Simple lookups (use `Explore` — it's faster)
- Pure planning with no execution (use `Plan`)

```
Agent({
  description: "Refactor payment module",
  prompt: "Research the payment module in src/payments/, identify all..."
})
// subagent_type defaults to "general-purpose"
```

### `Explore` — Fast Read-Only Code Search

**Purpose:** A speed-optimized, read-only agent for locating code. It finds files by pattern, greps for symbols or keywords, and answers "where is X defined?" or "which files reference Y?"

**Tools available:** All tools EXCEPT `Agent`, `ExitPlanMode`, `Edit`, `Write`, `NotebookEdit`. It is a **read-only** agent — it cannot modify any files.

**Search breadth control:** When calling Explore, you specify how broadly it should search:
- `"quick"` — Single targeted lookup. "Find where `UserService` is defined."
- `"medium"` — Moderate exploration. "Find all files that import `UserService`."
- `"very thorough"` — Search across multiple locations and naming conventions. "Find every reference to user authentication in the codebase."

**When to use:**
- Finding file locations by pattern (`src/components/**/*.tsx`)
- Grepping for symbols or keywords
- Answering "where is X defined?" / "which files reference Y?"
- Quick codebase orientation

**When NOT to use:**
- Code review or design-doc auditing (reads excerpts, may miss content past its read window)
- Cross-file consistency checks
- Open-ended analysis requiring full-file reads
- Any task that requires writing or modifying files

```
Agent({
  description: "Find auth middleware",
  subagent_type: "Explore",
  prompt: "Find all authentication middleware files in this codebase. 
           Search breadth: medium. Report file paths and a one-line 
           summary of what each does."
})
```

> **Important limitation:** Explore reads excerpts rather than whole files. It's designed for speed, not completeness. If you need full-file analysis, use `general-purpose` or `claude`.

### `Plan` — Software Architect

**Purpose:** Designs implementation strategies. Produces step-by-step plans, identifies critical files, and considers architectural trade-offs. It is a **planning-only** agent — it cannot write code.

**Tools available:** All tools EXCEPT `Agent`, `ExitPlanMode`, `Edit`, `Write`, `NotebookEdit`. Like Explore, it is read-only.

**When to use:**
- Designing the implementation approach before coding
- Evaluating architectural trade-offs
- Creating step-by-step implementation plans
- Identifying which files need to change and in what order

**When NOT to use:**
- Actually implementing the plan (Plan can't write files)
- Simple tasks that don't need an architectural strategy
- Pure code search (use Explore)

```
Agent({
  description: "Plan auth refactor",
  subagent_type: "Plan",
  prompt: "Design an implementation plan for adding OAuth2 support.
           The current auth system uses session cookies (see src/auth/).
           Consider: backward compatibility, migration path, and 
           which files need to change. Return a step-by-step plan."
})
```

**Common workflow:** Plan → Implement

```
Step 1: Agent({subagent_type: "Plan", prompt: "Design the approach..."})
        → Returns: implementation plan

Step 2: Main agent implements the plan using the returned strategy
```

### Custom / Registered Agents

Beyond the built-in types, Claude Code supports **custom agents** — agents defined in your project's `.claude/agents/` directory or registered in orchestration systems like AgentDesk.

**Examples from a typical setup:**

- **`Learning Document Creator`** — Creates structured learning documents with mental models, code examples, and pedagogical scaffolding
- **`Master Agent`** — Top-level orchestrator that decomposes tasks, delegates to workers, reviews results, and resumes paused work

Custom agents are defined as Markdown files (`.md`) that specify the agent's identity, workflows, tools, and conventions. When the main agent spawns a custom agent by name, Claude Code loads that agent's definition and configures the instance accordingly.

```
Agent({
  description: "Create learning doc",
  subagent_type: "Learning Document Creator",
  prompt: "Create a comprehensive learning document on React hooks..."
})
```

### Agent Type Comparison Table

| Type | Can Write? | Can Spawn Agents? | Speed | Best For |
|------|-----------|------------------|-------|----------|
| `claude` | ✅ | ✅ | Medium | General tasks needing full access |
| `general-purpose` | ✅ | ✅ | Medium | Multi-step research + execution |
| `Explore` | ❌ | ❌ | Fast | Finding files, grepping symbols |
| `Plan` | ❌ | ❌ | Medium | Architecture, implementation plans |
| Custom agents | Varies | Varies | Varies | Domain-specific workflows |

---

## 4. Agents vs Subagents

If you've read `subagents.md`, you know about subagents — the read-only parallel explorers that Cline auto-spawns for codebase research. Agents (via the Agent tool) are a different, more general mechanism. Here's how they compare:

### The Distinction

| Dimension | Agent Tool | Subagents (Classic) |
|-----------|-----------|-------------------|
| **Invocation** | Explicit `Agent()` call with typed parameters | Auto-spawned by Cline when it detects parallel research would help |
| **Types** | Multiple specialized types (`Explore`, `Plan`, `claude`, custom) | Single type: read-only explorer |
| **Can write?** | Depends on type (`claude` and `general-purpose` can write) | Never — strictly read-only |
| **Tool access** | Type-dependent (some have all tools, some are restricted) | Read, Search, List, read-only Bash only |
| **Context** | Receives a self-contained prompt; no conversation history | Receives an investigation prompt from the main agent |
| **Lifecycle** | Can be foreground or background; can be resumed with `SendMessage` | Fire-and-forget; returns report and terminates |
| **Isolation** | Optional worktree isolation for git safety | Context-window isolation only |
| **Spawning** | Can be nested (agents spawning agents, if their type permits) | Cannot spawn nested subagents |
| **Model choice** | Can override model per-agent (`sonnet`, `opus`, `haiku`) | Inherits main agent's model |
| **Primary use** | Delegation of complex, typed tasks | Parallel codebase exploration |

### Mental Model: Subagents Are Scouts, Agents Are Specialists

Think of it this way:

- **Subagents** are like scouts you send ahead to map the terrain. They're all the same type — fast, read-only observers. They bring back reports. They can't change anything.

- **Agents** are like hiring a specialist contractor. You choose the type of specialist (architect, builder, researcher), give them a complete brief, and they execute the job with whatever tools their specialty requires. An architect (Plan) designs but doesn't build. A builder (claude) designs and builds. A surveyor (Explore) maps and reports.

```
SUBAGENT MODEL (covered in subagents.md):
  Main Agent ─── spawns ─── [Scout A] ──► report
              ├── spawns ─── [Scout B] ──► report
              └── spawns ─── [Scout C] ──► report
  All scouts are identical. All read-only. Auto-triggered.

AGENT MODEL (this document):
  Main Agent ─── Agent(Plan) ──────► architectural plan
              ├── Agent(Explore) ──► file locations
              ├── Agent(claude) ───► implemented feature
              └── Agent(custom) ───► domain-specific output
  Each agent is typed. Different capabilities. Explicitly invoked.
```

### When to Use Which

**Use subagents when:**
- You need parallel codebase exploration
- All investigation areas are independent and read-only
- You want automatic triggering (let Cline decide)
- The task is pure information gathering

**Use the Agent tool when:**
- You need a specific agent type (planner, coder, specialist)
- The task requires writing or modifying files
- You want explicit control over what type of worker handles the job
- You need background execution with notification
- You need worktree isolation for safe parallel writes
- You want to specify a different model for cost optimization

**Use both together:**
- Spawn an Explore agent to find relevant files → use findings to write an implementation plan with Plan agent → implement with the main agent

---

## 5. Orchestration Patterns

Orchestration is how you compose multiple agents to accomplish complex work. Claude Code supports several patterns, each suited to different scenarios.

### Pattern 1: Parallel Fan-Out

Launch multiple independent agents simultaneously by including multiple `Agent` calls in a single message. They run concurrently.

```
// In a single message, the main agent calls:

Agent({
  description: "Research auth system",
  subagent_type: "Explore",
  prompt: "Find all authentication-related files..."
})

Agent({
  description: "Research data layer",
  subagent_type: "Explore",
  prompt: "Find all database models and migrations..."
})

Agent({
  description: "Research API routes",
  subagent_type: "Explore",
  prompt: "Find all API route definitions..."
})
```

```
Main Agent
    │
    ├──► [Explore: auth]     ──► findings A
    ├──► [Explore: data]     ──► findings B     All run concurrently
    └──► [Explore: routes]   ──► findings C
    │
    │◄── all results collected
    │
    ▼ synthesize and proceed
```

**Key rule:** Multiple `Agent` calls in a single message = parallel execution. Sequential messages = sequential execution.

### Pattern 2: Sequential Pipeline

Chain agents where each step depends on the previous one's output.

```
Step 1: Agent(Explore) → "Find all files related to payment processing"
        Result: [list of files and their roles]

Step 2: Agent(Plan)    → "Given these payment files: [results from step 1],
                          design a plan to add Stripe integration"
        Result: [implementation plan]

Step 3: Main agent implements the plan using the returned strategy
```

```
Main Agent
    │
    │──► [Explore] ──► file map
    │                    │
    │◄───────────────────┘
    │
    │──► [Plan] ──► implementation plan (uses file map from step 1)
    │                    │
    │◄───────────────────┘
    │
    │ implements plan
    ▼
```

**When to use:** When later steps genuinely need earlier results. Don't artificially sequence things that could run in parallel.

### Pattern 3: Background Workers + Notification

Launch long-running agents in the background and continue working. You're notified when they complete.

```
Agent({
  description: "Run full test suite",
  subagent_type: "general-purpose",
  prompt: "Run the full test suite and report any failures...",
  run_in_background: true
})

// Main agent continues with other work immediately
// Gets notified when the test run completes
```

```
Main Agent                          Background Agent
    │                                      │
    │──► launch (background) ─────────────►│
    │                                      │ running tests...
    │ continues other work...              │ running tests...
    │ continues other work...              │ running tests...
    │                                      │ running tests...
    │◄── notification: "tests complete" ──│
    │                                      │ (released)
    │ processes test results
    ▼
```

> **Critical:** Do NOT sleep or poll for background agents. Do NOT call `sleep 60` waiting for results. The harness notifies you automatically. Polling wastes turns.

### Pattern 4: Specialist Routing

Route different parts of a task to the agent type best suited for each part.

```
"I need to add a new API endpoint for user preferences."

Main Agent's strategy:
1. Route to Explore: "Find existing preference-related code"
2. Route to Plan:    "Design the endpoint given what Explore found"
3. Execute:          Main agent implements the plan itself

OR for complex features:
1. Route to Plan:    "Design the full feature"
2. Route to claude:  "Implement the database migration" (background)
3. Route to claude:  "Implement the API endpoint" (background)
4. Synthesize when both complete
```

### Pattern 5: Agent Resumption with SendMessage

When you spawn an agent (foreground or background), you can resume it later using `SendMessage` with the agent's ID or name. This continues the agent with full context of its previous work — unlike a new `Agent` call which starts fresh.

```
// Initial spawn returns agent ID
agent_result = Agent({
  description: "Long research task",
  prompt: "Research the entire authentication system..."
})

// Later, if you need to follow up:
SendMessage({
  to: "agent-id-or-name",
  message: "Also check the OAuth integration files I forgot to mention"
})
// This resumes the SAME agent with its existing context intact
```

**When to use:** Follow-up questions to a previously spawned agent. Providing additional context mid-task. Course-correcting an agent that's gone off-track.

**When NOT to use:** Starting a completely new task — just spawn a new agent instead.

### Choosing the Right Pattern

```
Decision tree:

Are the tasks independent?
├── YES → Can they run concurrently?
│         ├── YES → Pattern 1: Parallel Fan-Out
│         └── NO  → Pattern 3: Background Workers (stagger launches)
│
└── NO  → Does each step need the previous result?
          ├── YES → Pattern 2: Sequential Pipeline
          └── NO  → Pattern 4: Specialist Routing (route by capability)

Do you need to follow up with an agent?
└── YES → Pattern 5: Agent Resumption (SendMessage)
```

---

## 6. Writing Effective Agent Prompts

The prompt is the single most important factor in agent performance. An agent with a bad prompt and the right type will produce worse results than an agent with a great prompt and a suboptimal type.

### The Self-Contained Prompt Principle

Every agent prompt must be **self-contained**. The agent has zero context from your conversation. Imagine you're briefing a smart colleague who just walked into the room — they haven't seen the conversation, don't know what you've tried, don't understand why this task matters.

### What to Include

**1. The Goal — What are you trying to accomplish?**
```
✅ "Find all files that define Express route handlers and report 
    which authentication middleware each route uses."

❌ "Look at the routes."
```

**2. The Background — Why does this matter?**
```
✅ "We're adding rate limiting to all public API routes. Before 
    implementing, I need to know which routes currently lack 
    authentication — those are the highest priority for rate limiting."

❌ (no context given — the agent can't prioritize)
```

**3. What You've Already Learned — Don't make the agent repeat work**
```
✅ "I've already checked src/api/v1/ and found 12 route files. 
    I need you to check src/api/v2/ and src/internal/ for any 
    additional routes I might have missed."

❌ "Find all the route files." (might re-scan v1/ unnecessarily)
```

**4. Constraints — What should the agent NOT do?**
```
✅ "Report your findings but do NOT modify any files. 
    I want to review the plan before any changes are made."

❌ (agent might start editing files if its type permits)
```

**5. Output Format — What should the result look like?**
```
✅ "Report as a table with columns: File Path | Route | 
    HTTP Method | Auth Middleware | Rate Limited?"

❌ "Tell me what you find." (unstructured dump)
```

### The Prompt Quality Ladder

From worst to best:

```
Level 1 (Terrible):
  "Fix the bug."
  
Level 2 (Vague):
  "There's a bug in the auth system. Fix it."
  
Level 3 (Specific but lacking context):
  "Fix the 500 error in src/api/auth.ts when sessions expire."
  
Level 4 (Good):
  "The login endpoint at src/api/auth.ts returns 500 when the 
   session cookie is expired. The session middleware at 
   src/middleware/session.ts checks cookie validity but doesn't 
   distinguish between missing and expired cookies. Investigate 
   both files and propose a fix."

Level 5 (Excellent):
  "The login endpoint at src/api/auth.ts returns 500 when the 
   session cookie is expired instead of redirecting to /login. 
   The session middleware at src/middleware/session.ts checks 
   cookie validity but doesn't distinguish between missing and 
   expired cookies. I've verified this is reproducible — an 
   expired cookie triggers the catch block at line 47 which throws
   a generic SessionError. The fix should handle expired cookies 
   with a redirect while keeping the existing behavior for missing 
   cookies. Report your findings and proposed changes — include 
   file paths, line numbers, and the specific code changes needed."
```

### Anti-Patterns in Agent Prompts

**Anti-pattern 1: Delegating Understanding**
```
❌ "Based on your findings, fix the bug."
❌ "Based on the research, implement it."
```
These phrases push synthesis onto the agent instead of doing it yourself. Write prompts that prove you understood: include file paths, line numbers, what specifically to change.

**Anti-pattern 2: Assuming Shared Context**
```
❌ "Now do the same thing for the other module."
```
The agent doesn't know what "the same thing" is or what "the other module" refers to. Be explicit.

**Anti-pattern 3: Over-Prescribing Steps**
```
❌ "Step 1: Open src/auth.ts. Step 2: Go to line 42. Step 3: 
    Change the if statement. Step 4: Save the file."
```
If you know exactly what to do, just do it yourself. Agents are useful when you want to delegate judgment, not just key presses. Give the goal and let the agent figure out the steps.

**Anti-pattern 4: Terse Command-Style Prompts**
```
❌ "Search for UserService"
```
This works for a tool call, but it's a waste of an agent's capabilities. Agents can reason, plan, and make judgment calls — but only if the prompt gives them enough context to do so.

---

## 7. Isolation & Safety

When multiple agents operate on the same codebase, safety mechanisms prevent them from stepping on each other's toes.

### Worktree Isolation

**What it is:** When you set `isolation: "worktree"`, the agent operates on a **separate git worktree** — a completely independent copy of the repository at a separate filesystem path, on its own branch. Changes made in the worktree don't affect your working directory.

**How it works:**

```
Your working directory:     /home/user/project/          (branch: main)
Agent's worktree:           /tmp/worktree-abc123/        (branch: agent/task-xyz)

Agent edits files in its worktree → your working directory is untouched
If agent makes no changes → worktree is automatically cleaned up
If agent makes changes → worktree path and branch name are returned in the result
```

**When to use worktree isolation:**
- Multiple agents writing to the same repo simultaneously
- Experimental changes you want to review before merging
- Background agents that might conflict with your current work
- Any agent task where you want a "sandbox" guarantee

**When NOT to use:**
- Read-only agents (Explore, Plan) — they can't write, so there's nothing to isolate
- Simple, fast tasks where the overhead isn't worth it
- When you need the agent to see your uncommitted local changes

**Configuration:** The `worktree.bgIsolation` setting controls default behavior:
- `"worktree"` (default) — Background sessions automatically use worktree isolation
- `"none"` — Background jobs can edit the working copy directly

The `worktree.baseRef` setting controls what the worktree branches from:
- `"fresh"` (default) — Branches from `origin/<default-branch>` for a clean tree
- `"head"` — Branches from current local HEAD, so unpushed commits are visible

### Tool Restrictions by Agent Type

Not every agent gets every tool. This is an intentional safety mechanism:

```
┌─────────────────────┬───────────────────────────────────────────────┐
│ Agent Type          │ Restricted Tools (CANNOT use)                │
├─────────────────────┼───────────────────────────────────────────────┤
│ Explore             │ Agent, ExitPlanMode, Edit, Write, NotebookEdit│
│ Plan                │ Agent, ExitPlanMode, Edit, Write, NotebookEdit│
│ claude              │ (none — full access)                         │
│ general-purpose     │ (none — full access)                         │
│ Custom agents       │ Defined in agent configuration               │
└─────────────────────┴───────────────────────────────────────────────┘
```

The restriction pattern: **agents designed for research and planning cannot write.** This is the same read-only safety contract that subagents enforce, applied to typed agents. An Explore agent physically cannot call `Edit` — the tool isn't in its toolset.

### Context Leakage Prevention

Each agent has its own context window. Information doesn't leak between agents unless explicitly passed through prompts or results:

```
Agent A's context:          Agent B's context:
┌──────────────────┐        ┌──────────────────┐
│ Prompt from       │        │ Prompt from       │
│ main agent        │        │ main agent        │
│                   │        │                   │
│ Files it read     │        │ Files it read     │
│                   │        │                   │
│ Tool outputs      │        │ Tool outputs      │
│                   │        │                   │
│ Its reasoning     │        │ Its reasoning     │
└──────────────────┘        └──────────────────┘
       │                           │
       ▼                           ▼
   Result A                    Result B
       │                           │
       └───────────┬───────────────┘
                   ▼
            Main Agent Context
            (sees only the results,
             not the full context of
             either agent)
```

**Why this matters:** Agents working on security-sensitive code don't expose findings to agents working on unrelated features. Each agent sees only what it's explicitly given in its prompt and what it discovers through its own tool calls.

---

## 8. Practical Examples

### Example 1: Parallel Research + Implementation

You need to add a new feature that touches authentication, database, and API layers.

```
// Step 1: Launch parallel research agents (single message = concurrent)

Agent({
  description: "Research auth layer",
  subagent_type: "Explore",
  prompt: "Find all authentication-related files in this project. 
           Search breadth: medium. For each file, report: path, 
           what it does (1 sentence), and what auth middleware 
           or patterns it uses. Focus on src/auth/, src/middleware/, 
           and any route files that reference auth."
})

Agent({
  description: "Research data models",
  subagent_type: "Explore",
  prompt: "Find all database model definitions and migration files. 
           Search breadth: medium. Report: model name, file path, 
           key fields, and relationships to other models. Check 
           src/models/, prisma/schema.prisma, and any migration 
           directories."
})

// Step 2: After both return, synthesize findings
// Step 3: Plan implementation based on combined research
// Step 4: Implement
```

### Example 2: Routing to a Specialist

You need an architectural plan before making a significant change.

```
// Step 1: Get an architectural plan
plan_result = Agent({
  description: "Design caching strategy",
  subagent_type: "Plan",
  prompt: "Design a caching strategy for our API. Current state: 
           - Express app in src/api/
           - PostgreSQL database with ~50 tables
           - No caching currently implemented
           - 95th percentile response time is 800ms, target is 200ms
           
           Consider: Redis vs in-memory, cache invalidation strategy, 
           which endpoints to cache first (highest traffic), and 
           cache key design. Return a step-by-step implementation plan 
           with file paths for each change."
})

// Step 2: Main agent reviews the plan
// Step 3: Main agent implements step by step
```

### Example 3: Background Agent for Long-Running Work

You want to continue working while a long analysis runs.

```
// Launch a background agent for comprehensive analysis
Agent({
  description: "Full security audit",
  subagent_type: "general-purpose",
  prompt: "Perform a security audit of this codebase. Check for:
           1. Hardcoded secrets or API keys in any source file
           2. SQL injection vulnerabilities (raw queries with user input)
           3. Missing input validation on API endpoints
           4. Endpoints without authentication checks
           5. Sensitive data in logs (passwords, tokens, PII)
           
           For each finding, report: severity (critical/high/medium/low), 
           file path, line number, description, and recommended fix.
           Format as a structured report with findings grouped by severity.",
  run_in_background: true
})

// Main agent continues with other work immediately
// When the background agent completes, the notification arrives
// Main agent reviews the security report and addresses findings
```

### Example 4: Worktree-Isolated Experimental Change

You want an agent to prototype a change without touching your working directory.

```
Agent({
  description: "Prototype GraphQL layer",
  subagent_type: "claude",
  isolation: "worktree",
  prompt: "Prototype a GraphQL layer on top of our existing REST API.
           
           Current state:
           - Express REST API in src/api/ with 15 endpoints
           - TypeScript with Zod validation schemas in src/schemas/
           - Prisma ORM with models in prisma/schema.prisma
           
           Create:
           1. A GraphQL schema that mirrors our REST endpoints
           2. Resolvers that call the existing service layer
           3. A basic Apollo Server setup
           
           Install necessary dependencies. Make it compile. Don't worry 
           about production-readiness — this is a prototype to evaluate 
           whether GraphQL is worth adopting.
           
           Report what you created and any issues encountered."
})

// Result includes the worktree path and branch name
// You can review the changes: git diff main..agent/prototype-graphql
// If you like it: git merge agent/prototype-graphql
// If not: the worktree is just deleted
```

### Example 5: Cost-Optimized Agent Selection

Use cheaper models for simpler tasks:

```
// Use haiku (cheapest) for simple search tasks
Agent({
  description: "Find config files",
  subagent_type: "Explore",
  model: "haiku",
  prompt: "Find all configuration files (.env, .config.ts, .json 
           configs) in this project. Report file paths only."
})

// Use sonnet (balanced) for moderate analysis
Agent({
  description: "Analyze test coverage",
  subagent_type: "general-purpose",
  model: "sonnet",
  prompt: "Analyze test coverage gaps. Run the test suite and 
           identify which modules have no test files."
})

// Use opus (most capable) for complex reasoning
Agent({
  description: "Design migration strategy",
  subagent_type: "Plan",
  model: "opus",
  prompt: "Design a zero-downtime migration strategy for splitting 
           our monolithic user table into separate auth, profile, 
           and preferences tables..."
})
```

---

## 9. DSA Connections

### DAG (Directed Acyclic Graph) — Agent Dependency Chains

A **directed acyclic graph** is a graph where edges have direction and no cycles exist, making it the canonical structure for representing dependency relationships. Agent orchestration naturally forms a DAG: each agent is a node, and a directed edge from agent A to agent B means "B depends on A's output." When the main agent launches three Explore agents in parallel and then feeds their results to a Plan agent, the implicit DAG looks like this:

```
[Explore: auth] ───┐
                    ├──► [Plan: design] ──► [Main: implement]
[Explore: data] ───┤
                    │
[Explore: routes] ─┘
```

**Topological sorting** of this DAG yields a valid execution order — you must run all Explore agents before the Plan agent, and the Plan agent before implementation. The parallel fan-out pattern (Pattern 1) works precisely because the three Explore nodes have no edges between them — they're independent in the DAG and can execute concurrently. The sequential pipeline (Pattern 2) exists because some edges in the DAG are mandatory — you can't plan without findings. Misidentifying a DAG edge (launching the Plan agent before Explore agents complete) produces the same class of error as executing a build step before its dependencies: the input doesn't exist yet.

### Producer-Consumer Queue — Background Agent Results

A **producer-consumer queue** is a concurrent data structure where producers enqueue items and consumers dequeue them, typically with blocking semantics on both sides. Background agents implement this pattern: each background agent is a producer that generates a result upon completion, while the main agent is the consumer that processes results as notifications arrive.

The notification model makes this concrete — when a background agent finishes, Claude Code enqueues a notification that the main agent dequeues on its next turn. The main agent doesn't poll (no busy-waiting on the queue); it's notified (the queue signals the consumer). This is the efficient variant of producer-consumer where the consumer blocks until an item is available, rather than spinning in a loop checking `queue.isEmpty()`.

The bounded-buffer analogy applies to context windows: if a producer (background agent) generates a massive result, it overflows the consumer's (main agent's) context window — just like a producer overwhelming a bounded buffer. This is why agent prompts should specify compact output formats.

### Work-Stealing Deque — Parallel Agent Load Balancing

A **work-stealing deque** is a double-ended queue used in parallel runtimes (like Java's ForkJoinPool or Go's goroutine scheduler) where idle threads steal tasks from busy threads' deques to balance load dynamically. While Claude Code agents don't literally steal work from each other, the concept illuminates a critical performance concern: **straggler mitigation.**

When you launch three parallel agents, your overall completion time is `max(agent_A_time, agent_B_time, agent_C_time)`. If one agent takes 10x longer than the others (because its search space is larger or its task is harder), you're bottlenecked on the straggler — the same problem work-stealing solves in thread pools. The manual equivalent: scope your agent prompts so each agent has roughly comparable work. If one investigation is trivially small and another spans hundreds of files, rebalance — split the large task across two agents, or combine the small task with another.

### Fork-Join Pattern — Parallel Fan-Out and Aggregation

The **fork-join pattern** is a parallel computing model where a task forks into subtasks that execute concurrently, then joins (waits for all subtasks to complete) before proceeding. It's the foundation of Pattern 1 (Parallel Fan-Out) and the structural basis of the entire agent orchestration model.

```
FORK:   Main agent spawns N agents in a single message
        Each agent runs concurrently in its own context
        
JOIN:   Main agent blocks until ALL agents return
        All results are collected into the main agent's context
        
AFTER:  Main agent synthesizes all results and proceeds
```

This maps directly to `Promise.all()` in JavaScript, `asyncio.gather()` in Python, or `ForkJoinTask` in Java. The key property that makes it safe: each forked agent operates on its own data (its own context window, potentially its own worktree). There's no shared mutable state between agents, so no synchronization is needed — the fork-join model is embarrassingly parallel. The join barrier (waiting for all results) is the only synchronization point, and Claude Code handles it automatically.

### Finite State Machine — Agent Lifecycle

A **finite state machine (FSM)** is a model of computation where a system exists in exactly one of a finite number of states at any time, transitioning between states based on inputs. Each agent's lifecycle is a simple FSM:

```
         ┌────────────────────────────────────────────────┐
         │                                                │
         ▼                                                │
    ┌─────────┐    prompt     ┌─────────┐   complete   ┌──────┐
    │  IDLE   │ ────────────► │ RUNNING │ ───────────► │ DONE │
    └─────────┘               └─────────┘              └──────┘
                                   │                      │
                                   │ error                │
                                   ▼                      │
                              ┌─────────┐                 │
                              │ FAILED  │                 │
                              └─────────┘                 │
                                                          │
    States: {IDLE, RUNNING, DONE, FAILED}                 │
    Transitions:                                          │
      IDLE → RUNNING   (agent receives prompt)            │
      RUNNING → DONE   (agent completes successfully)     │
      RUNNING → FAILED (agent encounters fatal error)     │
      DONE → IDLE      (agent released, ready for reuse)  │
         ▲                                                │
         └────────────────────────────────────────────────┘
```

For background agents, the FSM extends with an additional observation: the main agent doesn't observe the RUNNING → DONE transition directly. Instead, the notification system acts as an **event emitter** that signals state transitions to interested observers. The main agent registers as a listener when it spawns the background agent, and the DONE transition fires the notification event.

The FSM model also explains why `SendMessage` works: it's a transition from DONE back to RUNNING (the agent resumes with additional input), which is valid in the FSM. A new `Agent()` call, by contrast, creates an entirely new FSM instance — it doesn't resume an existing one.

---

## 10. Quick Reference

### Agent Types at a Glance

```
claude            All tools. General-purpose. Default when no type specified in UI.
general-purpose   All tools. Default for Agent() calls. Multi-step research + execution.
Explore           Read-only. Fast file search, grep, symbol lookup. No writes.
Plan              Read-only. Architecture & design. Produces implementation plans.
Custom            Defined in .claude/agents/. Capabilities vary by definition.
```

### Agent Tool Parameters

```
Agent({
  description:      "Short task label (3-5 words)",       // REQUIRED
  prompt:           "Full self-contained task brief",     // REQUIRED
  subagent_type:    "Explore" | "Plan" | "claude" | ...,  // optional, default: general-purpose
  model:            "sonnet" | "opus" | "haiku",          // optional, inherits parent
  isolation:        "worktree",                           // optional, git worktree isolation
  run_in_background: true | false                         // optional, default: false (foreground)
})
```

### Orchestration Patterns

```
Pattern 1: Parallel Fan-Out
  → Multiple Agent() calls in ONE message = concurrent execution
  → Use for independent research tasks

Pattern 2: Sequential Pipeline
  → Agent A result feeds into Agent B prompt
  → Use when steps have true dependencies

Pattern 3: Background Workers
  → run_in_background: true, notification on completion
  → Use for long-running tasks, continue other work

Pattern 4: Specialist Routing
  → Route different subtasks to appropriate agent types
  → Explore for search, Plan for design, claude for implementation

Pattern 5: Agent Resumption
  → SendMessage to resume a previously spawned agent
  → Use for follow-up questions with maintained context
```

### Agents vs Subagents

```
AGENTS (this doc):                   SUBAGENTS (subagents.md):
✅ Multiple specialized types        ✅ Single type (read-only explorer)
✅ Some can write files               ❌ Never writes
✅ Explicitly invoked                 ✅ Auto-triggered by Cline
✅ Foreground or background           ✅ Always concurrent, fire-and-forget
✅ Optional worktree isolation        ✅ Context-window isolation only
✅ Model override per agent           ❌ Inherits main agent's model
✅ Can be resumed (SendMessage)       ❌ Fire-and-forget only
```

### Prompt Writing Checklist

```
□ Goal: What should the agent accomplish?
□ Background: Why does this matter? What's the surrounding problem?
□ Prior work: What has been tried or ruled out?
□ Constraints: What should the agent NOT do?
□ Output format: What should the result look like?
□ Self-contained: Could a stranger execute this with no other context?
```

### When to Use Each Type

```
"Find where X is defined"          → Explore (quick)
"Which files reference Y?"         → Explore (medium)
"Map the entire auth system"       → Explore (very thorough)
"Design an implementation plan"    → Plan
"Implement this feature"           → claude or general-purpose
"Research + implement"             → general-purpose
"Domain-specific workflow"         → Custom agent
"I don't know what type"           → general-purpose (safe default)
```
