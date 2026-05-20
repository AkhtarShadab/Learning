# Cline Features Deep-Dive
## Plan & Act Mode, Checkpoints, Context Management, Slash Commands, Auto-Approve, Kanban

---

## Overview

Cline is built on a small set of foundational features that, when understood deeply, make the difference between an AI that consistently produces working code and one that constantly surprises you. This guide covers the structural features — the ones that shape *how* Cline approaches work, not just *what* it does.

---

## 1. Plan & Act Mode

### The Mental Model

Plan and Act are two distinct cognitive modes for an agent working on your code. They serve fundamentally different purposes, and treating them as a deliberate two-phase workflow — rather than just a UI toggle — is what separates productive Cline usage from frustrating sessions.

```
PLAN MODE                        ACT MODE
──────────────────────────────   ──────────────────────────────
"Understand the problem"          "Solve the problem"
Explore, read, search             Write, edit, execute
No file modifications             Full write access
Ask clarifying questions          Implement what was planned
Surface edge cases                Follow the plan
Cheap to change course            Committed to the approach
```

The key constraint: **Plan mode cannot modify files or run commands that alter state.** This constraint is intentional. It forces a clean separation between understanding and doing. When Cline is in Plan mode, it cannot accidentally make changes — it can only look, think, and discuss.

### Why the Separation Matters

The most common failure mode in AI coding: Cline starts implementing immediately, builds something based on incomplete understanding, and you spend the next hour explaining why that was wrong.

Plan mode prevents this. It forces a "brief before build" phase:

```
WITHOUT Plan mode:
──────────────────
You: "Add OAuth login"
Cline: [immediately writes 200 lines of code]
Cline: [gets the auth flow wrong because it didn't read the existing session model]
You: [frustrated review + explanation + rework]

WITH Plan mode:
───────────────
You: "Add OAuth login" [in Plan mode]
Cline: [reads existing auth code, session model, user table]
Cline: "I see you're using JWT with a refresh token pattern. OAuth can slot in
        here at the /auth/callback route. The user table needs a new `oauth_provider`
        column. Here's my plan: [detailed plan]. Should I proceed?"
You: "Yes, but don't create the column — we'll do that in a separate migration."
Cline: [switches to Act mode with correct, constrained plan]
→ First implementation is right
```

### How to Use Plan & Act

**Starting in Plan mode:**
Use the Plan/Act toggle in the Cline panel. When Plan mode is active, start by giving Cline the task and relevant context. Cline will use `read_files` and `search` to explore the codebase. It will ask clarifying questions. It will summarize its understanding and proposed approach.

**Switching to Act mode:**
Once you've agreed on the plan, switch to Act mode. Cline carries the full conversation history from Plan mode — it knows exactly what was discussed and what was agreed. The switch is seamless. It picks up from the plan and begins implementation.

**Cycling back to Plan mode:**
If you're mid-implementation and Cline discovers something unexpected (a dependency it missed, a constraint that changes the approach), you can switch back to Plan mode to discuss the revised approach before continuing. This cycling is normal and healthy on complex tasks.

### When to Use Each Mode

| Situation | Mode | Why |
|---|---|---|
| Unfamiliar codebase / new area | Plan first | Prevents wrong assumptions |
| Feature that touches multiple files | Plan first | Understand blast radius |
| Architectural decision | Plan first | Get reasoning on record |
| High-stakes change (auth, billing) | Plan first | Verify understanding |
| Code review | Plan mode only | No modifications needed |
| Simple bug fix (you know exactly what) | Act directly | Fast and obvious |
| Routine change following established patterns | Act directly | Familiar territory |
| Typo fix | Act directly | No planning needed |

### Slash Commands for Planning

**`/deep-planning`** — the most powerful planning entry point:

Use `/deep-planning` when the task is large and multi-file. This command triggers extended exploration — Cline will investigate the codebase deeply, ask multiple clarifying questions, and generate a comprehensive implementation plan with specific subtasks before writing a single line of code.

```
/deep-planning Implement a subscription billing system with Stripe,
including webhook handling, customer creation, plan changes, and
cancellation flows. Update the user schema and add the API routes.
```

Cline will then:
1. Explore the existing codebase (user model, existing routes, config)
2. Ask for clarification (which Stripe API version? existing payment data?)
3. Generate a phased plan (schema migration → Stripe client → API routes → webhooks → UI)
4. Create specific subtasks for each phase

This is significantly better than a direct Act mode prompt for large features.

### Dual-Model Configuration

You can configure separate LLMs for Plan and Act mode:

```
Plan mode  → Claude Opus  (stronger reasoning, better at architecture)
Act mode   → Claude Sonnet (faster, more cost-efficient for writing code)
```

This makes sense because planning is reasoning-heavy (you want the best model) while implementation is pattern-matching-heavy (a fast model is fine). Configure this in Cline Settings → API Configuration.

### Best Practices

1. **Document the plan in Markdown.** When Cline proposes a plan, ask it to write it to a temporary `.cline/plan.md` file. This creates a reference you can return to, and Cline can check off items as it works.

2. **Use file mentions to focus planning.** In Plan mode, reference specific files with `@`:
   ```
   Look at @src/auth/middleware.ts and @src/api/routes/auth.ts and plan
   how to add rate limiting to the login endpoint.
   ```

3. **Ask for the plan to be explicit about scope.** "List exactly which files you will modify and what you will change in each." This surfaces scope issues early.

4. **Return to Plan mode when complexity grows.** If Cline is mid-Act and discovers something that changes the approach — switch back to Plan, discuss, then continue. Don't let Act-mode complexity compound.

---

## 2. Checkpoints

### The Mental Model: The Shadow Git Repository

Checkpoints give you undo for Cline's actions — but they work differently from your project's git history.

Cline maintains a **shadow git repository** that is completely separate from your project's `.git`. This shadow repo:
- Captures the full state of all files after **every tool use** (every file write, every command execution)
- Never shows up in your `git log` — your project's history is untouched
- Persists across editor sessions
- Captures files even if they're in your `.gitignore`

```
Your project git:   A ──────── B ──────── C          ← your commits, clean
Cline shadow git:   ●─●─●─●─●─●─●─●─●─●─●─●─●      ← checkpoint after every action
                    ↑                          ↑
                task starts               rollback here
```

The result: you can experiment with full auto-approve, let Cline make sweeping changes, and if something goes wrong, roll back any or all of it — without touching your git history at all.

### Three Restoration Modes

| Mode | What it restores | What it keeps |
|---|---|---|
| **Restore Files** | File changes (code back to checkpoint state) | Conversation history |
| **Restore Task Only** | Conversation (removes subsequent messages) | File changes |
| **Restore Files & Task** | Both files and conversation simultaneously | Nothing after the checkpoint |

**When to use each:**

- **Restore Files:** The conversation was fine — Cline had the right idea — but the implementation went wrong. Keep the discussion, revert the code, let Cline try again with more specific guidance.
- **Restore Task Only:** The files are fine — you may want to keep the changes — but you want to re-run the conversation from a specific point with a different instruction.
- **Restore Files & Task:** Start over entirely from a specific point. Clean slate on both sides.

### Why Checkpoints Change the Risk Equation

Without Checkpoints:
```
Risky action → must review carefully → slow and cautious
Auto-approve → could go badly → anxiety
Large refactor → what if it's wrong? → hesitate
```

With Checkpoints:
```
Risky action → Checkpoint first → rollback costs nothing
Auto-approve → Checkpoint active → mistakes are cheap
Large refactor → any state can be restored → move fast
```

The key insight from the Cline docs: **"The cost of a mistake drops to nearly zero."** When rollback is trivial, you can experiment, move faster, and iterate more freely — because failure has no permanent cost.

### Practical Usage

**Before any risky operation:**
Enable Checkpoints in Feature Settings, then let Cline proceed. If you want to be extra cautious, ask Cline to "checkpoint before making changes" — it will confirm a checkpoint exists before proceeding.

**Reviewing a checkpoint:**
Click the Compare button on any checkpoint to see a diff of the changes made since that point. This is useful for code review — see exactly what Cline changed in aggregate.

**Performance note:**
Checkpoints require git operations on every tool call. For very large repositories (100k+ files), this can be slow. Disable in Feature Settings for projects where performance matters more than the rollback safety net.

---

## 3. Context Management

### The Core Problem

Cline starts every task with a fresh context window. It doesn't remember your last session. It doesn't know what you agreed on last week. Without explicit context management, every task starts from zero.

The tools for solving this:
1. **@ references** — point Cline to specific files in-chat
2. **Memory Bank** — a persistent project knowledge folder
3. **`.clinerules`** — standing instructions loaded every session
4. **`/newtask`** — carry context across context window boundaries

### The @ Syntax — Directing Cline's Attention

The `@` syntax is the primary mechanism for pointing Cline to specific resources in your task prompt:

**Reference a specific file:**
```
@src/auth/middleware.ts
```

**Reference an entire directory:**
```
@src/components/
```
(The trailing `/` references the entire directory)

**Reference multiple files in one prompt:**
```
Review the relationship between @src/services/billing.ts and 
@src/api/routes/payment.ts — are they consistent?
```

**In practice — a well-formed task with @ references:**
```
Following the workflow in @docs/workflows/new-api-route.md:

Existing routes for reference: @src/api/routes/
Existing schemas: @src/schemas/
API spec to update: @docs/API_SPEC.md

Task:
- Method: POST
- Path: /api/v1/users/:id/subscribe
- Auth: authenticated users only
- Body: { planId: string }
```

**Three ways to add files to a task:**
1. `@` in the prompt — type it directly
2. The `+` button in the Cline panel — file picker
3. Drag and drop a file into the chat (hold Shift in VS Code to add without immediately sending)

**What file types Cline can read:**
- Any text file (source code, configs, Markdown)
- Images (for visual context — screenshots, diagrams)
- PDFs
- CSVs
- Excel files

### Memory Bank — Persistent Project Knowledge

Because Cline starts fresh every task, a Memory Bank is a `.cline/` folder of Markdown files that provides persistent context about your project. The pattern:

```
.cline/
  memory-bank/
    projectbrief.md     — What this project is, goals, non-goals
    productContext.md   — Why it exists, what problems it solves
    systemPatterns.md   — Architecture decisions, design patterns used
    techContext.md      — Tech stack, setup quirks, environment notes
    activeContext.md    — Current WIP — what's in progress right now
    progress.md         — What's done, what's next, known issues
```

**Using it:**

Start every task:
```
Read all files in .cline/memory-bank/ for context, then [task].
```

End every significant task:
```
Update .cline/memory-bank/activeContext.md and progress.md
with what was completed, decisions made, and what's next.
```

Over time, the Memory Bank accumulates your project's institutional knowledge. Each session starts with a full briefing — no re-explaining the architecture, no re-explaining decisions that were already made.

### `.clinerules` — Standing Instructions

`.clinerules` files define persistent instructions that Cline loads at the start of every task — without you having to repeat them. See `clinerules.md` for the full guide.

The key pattern: any instruction you find yourself repeating to Cline across sessions belongs in `.clinerules`. `/newrule` is the shortcut to capture it there immediately.

### `/newtask` — Cross-Context-Window Continuity

Context windows have limits. Long tasks fill them. When you're deep in a session and Cline starts losing track of earlier decisions, `/newtask` is the right move:

```
You: /newtask
Cline: [summarizes: what was accomplished, open decisions, exact next steps]
       [creates a new task with that summary as its starting context]
```

This is different from just starting a fresh chat. `/newtask` packages the essential carry-forward information — decisions made, files changed, what's next — so the new session continues without re-explaining everything.

---

## 4. Built-in Slash Commands

Slash commands are Cline's built-in workflow primitives. Type `/` in chat to see and invoke them.

| Command | What it does | When to use |
|---|---|---|
| `/newtask` | Packages context from current conversation into a new task | Context window nearly full; long multi-session task |
| `/smol` | Compresses conversation history while keeping key insights | Mid-task trim; want to continue without starting over |
| `/deep-planning` | Architect mode: explore → questions → plan → tasks | Complex multi-file feature; architectural decisions |
| `/newrule` | Captures a preference and saves it to `.clinerules` | You find yourself repeating the same instruction |
| `/explain-changes` | AI explanation of git diffs (VS Code only) | Understanding a PR; writing a clear commit message |
| `/reportbug` | Gathers diagnostics for filing a Cline issue | Cline behaved unexpectedly; want to report it |

### `/deep-planning` in Detail

`/deep-planning` is the highest-leverage slash command. Use it whenever a task:
- Touches more than 3 files
- Involves architectural decisions
- Has unclear requirements that need exploration first
- Could have multiple valid implementations worth comparing

What it does:
1. Cline investigates the codebase (reads, searches, understands)
2. Asks clarifying questions (one round of refinement)
3. Generates a detailed implementation plan
4. Creates subtask breakdown
5. Only then begins implementation (after your approval)

```
/deep-planning Add multi-tenant support to the existing single-tenant
SaaS app. Users should belong to organizations. Billing is per-org.
Existing users should be migrated into a default organization.
```

Cline will not start writing code until it has:
- Read the existing user model and auth flow
- Understood the current billing integration
- Proposed the schema changes
- Described the migration strategy
- Listed which files will change and how
- Gotten your agreement on the approach

This upfront investment in planning almost always saves time overall.

### `/smol` vs `/newtask`

Both manage context length, but differently:

| | `/smol` | `/newtask` |
|---|---|---|
| Current task | Stays in same task | Creates a new task |
| History | Compressed in-place | Carried forward as summary |
| When to use | You're mid-task, not done yet | You've hit the context limit |
| Token cost | Low | Medium (creates a summary) |

Use `/smol` for "I'm in the middle of something and want to reclaim context budget." Use `/newtask` for "I've filled the window and need to continue in a fresh session."

---

## 5. Auto-Approve & Permissions

### The 8 Permission Categories

```
Permission Category              What it controls
────────────────────────────     ────────────────────────────────────
Read project files               Files inside your workspace
Read outside workspace           Files anywhere on the system
Edit project files               Writes inside your workspace
Edit outside workspace           Writes anywhere on the system
Terminal — safe commands         Build, test, lint (Cline-assessed "safe")
Terminal — all commands          Any command including destructive ones
Browser access                   All browser tool actions
MCP server access                All MCP tool calls
```

Permissions are **hierarchical** — broader permissions only apply if their base toggle is enabled.

### Command Classification

Cline dynamically assigns each `bash` command as safe or requiring approval — it's not a fixed list. The heuristic:

- **Auto-safe:** `npm test`, `npm run build`, `npm run lint`, `git status`, `git log`, `cat`, `ls`, read-only queries
- **Approval required:** `rm`, `git push`, `git reset`, in-place modifications, network requests with side effects, config file changes

### Recommended Setup

```
Read project files          ✅ Auto-approve
Read outside workspace      ✅ Auto-approve
Edit project files          ⚠️  Manual review (you want to see diffs)
Edit outside workspace      ❌ Disabled (no reason to edit outside workspace)
Terminal — safe commands    ✅ Auto-approve
Terminal — all commands     ⚠️  Manual only  
Browser access              ⚠️  Manual (context-dependent)
MCP server access           ⚠️  Depends on the MCP server
```

### YOLO Mode

YOLO mode auto-approves **everything** — including destructive terminal commands, files anywhere on the system, and all MCP tools. Zero prompts.

**When to consider it:** Isolated, throwaway environments (Docker containers, VMs) where you want maximum autonomy and you've scoped Cline's instructions very precisely.

**When not to use it:** Production systems, machines with important data, whenever you haven't thought carefully about what Cline might do.

**Rule:** If you use YOLO mode, enable Checkpoints first. YOLO + Checkpoints = fast iteration with a rollback safety net.

---

## 6. Kanban Board — Multi-Agent Parallel Execution

### What It Is

The Cline Kanban is a web-based task board for running multiple Cline agents simultaneously on different tasks, each in its own isolated git worktree.

```bash
npx kanban    # Launch the Kanban board
```

### Key Features

- **Per-card worktrees** — each task runs in its own isolated git worktree (no cross-contamination between agents)
- **Auto-commit** — changes are automatically committed as agents work
- **Dependency chains** — define task order (Task B can't start until Task A completes)
- **Parallel execution** — multiple agents work simultaneously
- **Remote access** — view the board from any device

### When to Use Kanban

Kanban makes sense when:
1. The work can be parallelized into independent subtasks
2. Each subtask is large enough that one context window isn't enough
3. You want visibility into multiple tasks simultaneously
4. You need auto-commit and persistent task tracking

### Single-Agent vs Kanban

```
Single Cline session          Kanban multi-agent
──────────────────────        ────────────────────────
One task at a time            Multiple tasks in parallel
One context window            One context window per card
No auto-commit                Auto-commits as work progresses
Good for focused work         Good for sprint-level parallelism
Simpler setup                 Higher overhead, more powerful
```

For most individual developers, single-agent sessions with subagents (see `subagents.md`) handle the majority of parallelism needs. Kanban is for team-scale or when you need persistent multi-task tracking.

---

## Putting It All Together

### The Recommended Workflow for Any Non-Trivial Task

```
1. SETUP
   ├── Enable Checkpoints (safety net)
   ├── Read memory-bank/ for project context
   └── Check .clinerules for any relevant standing rules

2. PLAN (in Plan mode or with /deep-planning)
   ├── Give Cline the task + relevant @ references
   ├── Let Cline explore (read_files, search)
   ├── Answer clarifying questions
   └── Agree on the approach before switching to Act

3. IMPLEMENT (in Act mode)
   ├── Cline follows the plan
   ├── Approve file edits by reviewing diffs
   ├── Let test runs complete (bash)
   └── Use /smol if the conversation gets long mid-task

4. VERIFY
   ├── Run the full test suite manually
   ├── Review the git diff of everything Cline changed
   └── Check for any unexpected changes outside the planned scope

5. WRAP UP
   ├── Update .cline/memory-bank/progress.md
   └── Update .clinerules with any new rules discovered
```

### Layer Map: How the Features Interact

```
┌──────────────────────────────────────────────────────────┐
│              .clinerules/ (standing context)              │
│   Always loaded • Project rules • Encoding past lessons  │
└────────────────────────────┬─────────────────────────────┘
                             │ loaded every session
                             ▼
┌──────────────────────────────────────────────────────────┐
│                 Plan Mode / Act Mode toggle                │
│   Plan: explore safely • Act: implement with confidence   │
└────────────────────────────┬─────────────────────────────┘
                             │ structures each task
                             ▼
┌──────────────────────────────────────────────────────────┐
│              Slash Commands as workflow tools             │
│   /deep-planning • /newtask • /smol • /newrule           │
└────────────────────────────┬─────────────────────────────┘
                             │ triggered within tasks
                             ▼
┌──────────────────────────────────────────────────────────┐
│                  Checkpoints (safety net)                 │
│   Shadow git • Rollback anytime • Enables auto-approve   │
└────────────────────────────┬─────────────────────────────┘
                             │ protects every action
                             ▼
┌──────────────────────────────────────────────────────────┐
│              Context Management (@ + Memory Bank)         │
│   @ references • .cline/memory-bank/ • /newtask          │
└──────────────────────────────────────────────────────────┘
```

Each layer is independent but complementary. `.clinerules` gives standing context. Plan/Act structures the approach. Slash commands enable specific capabilities. Checkpoints protect against mistakes. Context management ensures Cline always has the information it needs.

Used together, these features give you AI-assisted development that is **deliberate** (planned before acted), **safe** (rollback always available), **consistent** (rules enforced every session), and **contextually aware** (no re-explaining the project every time).

---

## DSA Connections

### Trie — Slash Command Lookup and Prefix Matching

A **trie** (prefix tree) is a tree-shaped data structure where each node represents a character of a key, enabling O(k) lookup, insertion, and prefix-based search where k is the key length. In Cline's slash command system, when a user types `/` followed by characters like `/dee`, the UI must instantly narrow the candidate list from all commands (`/deep-planning`, `/newtask`, `/newrule`, `/smol`, `/explain-changes`, `/reportbug`) to only those matching the prefix — exactly the operation a trie optimizes. Each typed character walks one level deeper in the trie, pruning non-matching branches, so autocomplete suggestions appear in O(k) time regardless of how many commands are registered. This same structure extends to `@` file-path references, where the user progressively types a path like `@src/auth/mid...` and the system narrows from the full directory tree at each `/`-delimited segment. Real-world command palette implementations in VS Code and similar editors use trie variants (often compressed as radix trees) for exactly this interactive prefix-matching use case.

### Hash Map — Feature Flag Configuration and Permission Lookup

A **hash map** stores key-value pairs with O(1) average-time lookups by hashing the key to a bucket index. Cline's auto-approve permission system maps each of its 8 permission categories (e.g., `"read_project_files"`, `"terminal_safe_commands"`, `"mcp_server_access"`) to a configuration value (`auto-approve`, `manual`, `disabled`), which is a direct hash map from permission name to policy. When Cline proposes a tool call, the engine hashes the permission category string to look up whether approval is required — an O(1) check that executes on every single tool invocation across those 10-40 cycles per task. The same pattern applies to `.clinerules` rule lookups, Memory Bank file indexing, and the Kanban board's per-card worktree registry where card IDs map to isolated git worktree paths. Without hash maps, every tool call would require a linear scan of permission rules, adding latency to the tight LLM-tool-approval loop that drives Cline's core execution cycle.

### State Machine — Plan/Act Mode Transitions and Checkpoint Restoration

A **finite state machine** (FSM) defines a system as a set of discrete states with explicit transitions triggered by events. Cline's Plan/Act toggle is a two-state FSM: the system is always in exactly one of `{PLAN, ACT}`, and transitions are triggered by the user flipping the toggle or by Cline's internal logic when it discovers unexpected complexity mid-implementation. The transition from PLAN to ACT carries the accumulated conversation context as state, while the reverse transition (ACT back to PLAN) preserves file changes but re-enters the exploration-only mode where writes are prohibited. Checkpoint restoration extends this to a three-branch state machine: from any checkpoint, the user can transition to `RESTORE_FILES` (revert code, keep conversation), `RESTORE_TASK` (revert conversation, keep code), or `RESTORE_BOTH` (revert everything) — three distinct transitions from a single checkpoint state, each producing a different system state. This FSM formalization is why these features compose cleanly: the system is always in a well-defined state, illegal transitions (like writing files in Plan mode) are structurally impossible, and rollback is deterministic.

### Directed Acyclic Graph — Feature Layer Dependencies

A **directed acyclic graph** (DAG) models dependencies where nodes have directed edges but no cycles, enabling topological ordering to determine a valid execution sequence. The "Layer Map" at the end of this document reveals a five-node DAG: `.clinerules` feeds into Plan/Act mode, which feeds into Slash Commands, which feeds into Checkpoints, which feeds into Context Management — each layer depends on the one above it but never creates a circular dependency. This DAG structure means you can adopt the layers incrementally in topological order: you cannot meaningfully use `/deep-planning` (a slash command) without understanding Plan/Act mode, and Checkpoints only become valuable once you are using the write-tier tools that slash commands trigger. The Kanban board's dependency chains between task cards are also a DAG — Task B depends on Task A, Task C depends on Task B — and the system uses topological sort to determine which cards can run in parallel versus which must wait, preventing circular task deadlocks.
