# Subagents — Parallel Research Workers in Cline

---

## Table of Contents

1. [What Is This Exactly?](#1-what-is-this-exactly)
2. [Mental Models](#2-mental-models)
3. [Technical Architecture](#3-technical-architecture)
4. [Capabilities & Limitations](#4-capabilities--limitations)
5. [Triggering Subagents](#5-triggering-subagents)
6. [Permissions & Auto-Approve](#6-permissions--auto-approve)
7. [Optimal Use Cases](#7-optimal-use-cases)
8. [Usage Patterns](#8-usage-patterns)
9. [Anti-Patterns](#9-anti-patterns)
10. [Advanced Usage](#10-advanced-usage)
11. [Quick Reference](#11-quick-reference)

---

## 1. What Is This Exactly?

Subagents are **parallel research workers** that Cline spawns to explore your codebase concurrently with the main agent, each operating in its own isolated context window with a separate token budget.

When a task requires understanding multiple, independent areas of a codebase at once — how authentication works *and* how the session model is structured *and* how the API is routed — doing this sequentially in one context window is slow and expensive. Each investigation fills the window a little more. By the end, there may not be enough room left for the actual implementation.

Subagents break this bottleneck. Instead of one agent exploring sequentially:
```
Main agent: reads auth module... reads session model... reads API routes...
            [uses 40K tokens just for exploration]
            [finally starts implementing with 160K tokens left]
```

Multiple subagents explore in parallel:
```
Subagent A: reads auth module → reports findings
Subagent B: reads session model → reports findings  
Subagent C: reads API routes → reports findings
            [each uses ~10K tokens in its own isolated window]
Main agent: receives all three reports → implements with full context budget
```

The key properties:
- **Parallel**: subagents run concurrently, not sequentially
- **Isolated**: each subagent has its own context window — their work doesn't fill yours
- **Read-only**: subagents can only gather information, never modify files
- **Focused**: each subagent receives a specific, scoped investigation prompt

---

## 2. Mental Models

### Mental Model 1: Fork/Join Parallelism

If you've worked with concurrent programming (threads, async/await, Promise.all), you already understand the structural pattern:

```
Main agent (the coordinator)
     │
     ├─── fork ──► Subagent A ("investigate auth")
     │
     ├─── fork ──► Subagent B ("investigate session model")
     │
     └─── fork ──► Subagent C ("investigate API routing")
                                        │
                                        │ all three complete concurrently
                                        │
     ◄──────────── join ────────────────┘
     
Main agent receives: [Report A, Report B, Report C]
Main agent synthesizes → implements → delivers result
```

This is exactly how `Promise.all()` works in JavaScript, or `asyncio.gather()` in Python. You dispatch multiple independent tasks simultaneously, wait for all to complete, then process the combined results. The speedup is proportional to how parallel the subtasks are.

**The critical constraint:** Just like you'd never let a worker thread write to shared state without synchronization, subagents never write to files. They are read-only workers. The main agent is the only writer.

### Mental Model 2: The Expedition Scouts

Imagine you're planning a route through unknown territory. You could walk the entire territory yourself, one section at a time — slow and sequential. Or you could dispatch scouts:

- Scout A: "Explore the northern route — report back on terrain and obstacles"
- Scout B: "Explore the eastern valley — report on river crossings and settlements"
- Scout C: "Climb the ridge to the south — map what you can see from elevation"

Each scout covers their area independently. They return with reports. You synthesize all three and plan the optimal route. You never left base camp while they worked.

This is precisely how subagents work. The main agent is the expedition commander. Subagents are scouts. The main agent never loses its base camp (its context window remains available for planning and implementation). The scouts bring back the territory knowledge.

**The mental shift this requires:** You don't think "how do I explore this codebase?" You think "how do I structure the exploration tasks so they can run in parallel?"

### Mental Model 3: MapReduce for Codebases

MapReduce is a programming model for processing large data sets in parallel:
- **Map phase**: distribute the work across many workers, each processes a subset
- **Reduce phase**: one reducer collects and aggregates all results

Subagents implement this pattern for codebase exploration:
- **Map phase**: each subagent explores a different area of the codebase (a module, a concern, a data flow)
- **Reduce phase**: the main agent receives all findings and synthesizes them into a coherent understanding

```
CODEBASE (large, complex)
      │
      │  Partition by concern:
      ├──────────────────────────────────┐
      │                                  │
      ▼                                  ▼
[Auth concern]          [Data model concern]     [API concern]
      │                                  │            │
      ▼                                  ▼            ▼
Subagent A              Subagent B           Subagent C
reads auth files        reads DB schemas     reads route files
returns: findings       returns: findings    returns: findings
      │                                  │            │
      └──────────────────────────────────┘────────────┘
                         │
                         ▼
                   Main Agent (Reduce)
                   synthesizes all findings
                   builds complete understanding
                   implements the feature
```

The reduce step is where intelligence lives. The main agent doesn't just concatenate the reports — it synthesizes, resolves inconsistencies, identifies dependencies between the areas, and forms a coherent understanding that no single subagent had.

### Mental Model 4: Specialist Research Assistants

Picture a senior engineer assigning research tasks to junior engineers before a design meeting:

"I need to understand three things before we design this feature:
1. How does our current caching layer work? (assign to junior A)
2. What are the database performance characteristics of the user table? (assign to junior B)
3. What do our API contracts say about the affected endpoints? (assign to junior C)

Meet back here in 30 minutes with your findings."

The junior engineers work in parallel. The senior engineer stays available for other tasks. When they return, the senior synthesizes everything and makes the architectural decision.

Subagents are those junior researchers. They are not deciders, not implementors. They are fast, focused information gatherers operating under the direction of the main agent.

**The important implication:** Subagents should receive narrow, specific investigation prompts — not broad, open-ended ones. "Read all of src/" is a poor subagent task. "Find all the files that write to the users table and summarize what each one does" is a good subagent task.

### Mental Model 5: The Database Index

When you query a database without an index, it scans every row. With an index, it jumps directly to the relevant rows. The index trades upfront preparation for lookup speed.

Without subagents, the main agent has to read its way through the codebase like a full table scan — it processes files sequentially until it finds what it needs. With subagents, the exploration is like having multiple indexes active simultaneously — each subagent quickly finds and surfaces the relevant information for its domain.

The main agent doesn't scan. It queries. The subagents return the indexed results.

### Mental Model 6: The Context Window is Real Estate

A context window is finite real estate. Every file you read, every search result you process, every tool output you consume takes up space. Once the window is full, earlier context gets compressed or dropped — and that's when Cline starts losing track of important decisions made earlier in the session.

Subagents are **context isolation**. When a subagent reads 15 files to investigate an area of the codebase, those reads happen in the subagent's context window — not yours. The subagent delivers a synthesized report (maybe 500 tokens) back to the main agent. The 15 files' worth of content (maybe 20,000 tokens) never touched the main context window.

```
WITHOUT subagents:
Main context window: [task prompt] + [reads: 15 files × 1000 tokens each] = 15K tokens used
→ less room for implementation, planning, and conversation

WITH subagents:
Main context window: [task prompt] + [subagent report: ~500 tokens] = 500 tokens used
→ full room for implementation, planning, and conversation
Subagent context window: [investigation prompt] + [reads: 15 files] → report
                         (used and discarded after report delivered)
```

The main context window is precious. Subagents protect it.

---

## 3. Technical Architecture

### What Happens When a Subagent Is Spawned

1. The main agent determines that parallel research would be beneficial (or you explicitly request it)
2. Cline spawns one or more subagent instances — separate agent processes with their own context windows and token budgets
3. Each subagent receives an investigation prompt (what to look for, where to look, what to report)
4. Subagents run concurrently, using their allotted tools (read, search, list, run read-only commands)
5. Each subagent completes its investigation and returns a synthesized report to the main agent
6. The subagent's context window is released — it no longer exists
7. The main agent receives all reports and continues from there

### Execution Model

```
Main Agent Session
     │
     │   t=0: spawn all subagents simultaneously
     │   ┌─────────────────────────────────────────────┐
     │   │                                             │
     ▼   ▼                             ▼               ▼
[Subagent A]               [Subagent B]           [Subagent C]
 investigating               investigating          investigating
 auth module                 data layer             API layer
      │                           │                      │
      │ t=variable (runs until done)                      │
      ▼                           ▼                      ▼
 [Report A]               [Report B]             [Report C]
      │                           │                      │
      └───────────────────────────┘──────────────────────┘
                                  │
                                  ▼
                        Main Agent receives all reports
                        → synthesizes → implements → responds
```

### Separate Context Windows

Each subagent has its own token budget and context window. The subagent's investigation — all the files it reads, all the searches it runs, all the output it processes — happens in its private window. None of this consumes the main agent's context budget.

The **only thing** that flows from the subagent back to the main agent is the report — a synthesized summary of findings. This report should be compact (hundreds of tokens, not thousands).

### Cost Tracking

The Cline interface shows per-subagent cost statistics. Each subagent's token usage is tracked separately and visible in the chat interface. This lets you assess whether subagents are working efficiently — if a subagent is using 50,000 tokens to report 100 tokens of useful findings, the investigation prompt was probably too broad.

---

## 4. Capabilities & Limitations

### What Subagents CAN Do

| Capability | Description |
|---|---|
| `read_files` | Read any file in the workspace |
| `search` | Search across the codebase with regex |
| List directories | Enumerate directory structures |
| Read-only commands | `git log`, `git diff`, `grep`, `ls`, `cat`, `find` |
| Activate Skills | Use project-scoped and global skills |
| Run `ask_question` | Ask the main agent (or user) a clarifying question if blocked |

### What Subagents CANNOT Do

| Limitation | Why |
|---|---|
| ❌ Write or edit files | Would create race conditions; main agent is the sole writer |
| ❌ Run destructive commands | No `rm`, `mv`, `chmod`, writes of any kind |
| ❌ Access MCP servers | MCP tools are reserved for the main agent |
| ❌ Access browser | Browser interactions are stateful; subagents are ephemeral |
| ❌ Create nested subagents | No recursive spawning; avoids uncontrolled depth |
| ❌ Modify the main agent's context | Subagents are isolated — they can't inject anything into the main context except their final report |

### The Read-Only Contract

The read-only constraint is architectural, not just a policy. It's what makes the parallel model safe:

- No two agents can conflict on a file write (no race conditions)
- The main agent's state is authoritative and consistent
- Rollback via Checkpoints is predictable (only main agent writes)
- The user only has to approve writes in one place

Think of subagents as parallel readers and the main agent as the sole writer. This is the readers-writer lock pattern from concurrent programming applied to AI agents.

---

## 5. Triggering Subagents

### Automatic Triggering

Subagents are **enabled by default** and Cline autonomously decides when to use them. Cline deploys subagents when it recognizes that:
- A task has multiple independent investigation areas
- The codebase is large enough that sequential exploration would be costly
- Parallel exploration would meaningfully reduce time to implementation

You don't need to do anything to enable this behavior — it happens automatically when the task warrants it.

### Explicit Requesting

You can always explicitly request subagent usage in your prompt:

```
"Use subagents to explore how authentication and authorization work
in this codebase. I want to understand both before changing anything."
```

```
"Use subagents to simultaneously investigate:
1. How the current caching layer is implemented
2. Where the database performance bottlenecks are  
3. What the existing API error handling patterns look like"
```

```
"Before implementing multi-tenancy, use subagents to map:
- The current user model and all tables that reference it
- The existing permission checking logic
- The places in the codebase that make tenant assumptions"
```

### Disabling Subagents

If you want to disable subagents entirely:
- Go to Settings → Features → Agent → toggle off subagents

This is rarely necessary but can be useful if you prefer to control all exploration yourself or if you're working on a very small project where subagents add overhead without benefit.

---

## 6. Permissions & Auto-Approve

Subagent launch follows the **"Read project files"** auto-approve setting:

- If "Read project files" is auto-approved → subagents launch without prompting
- If "Read project files" requires manual approval → Cline will ask before spawning a subagent

**Recommendation:** Auto-approve reads. Subagents are pure readers — there's no risk in letting them run without manual approval. The only cost is tokens.

If you're on a tight token budget and want to control subagent usage carefully, keep reads as manual. You'll see the subagent launch request and can decide per-task whether the parallel exploration is worth the token cost.

---

## 7. Optimal Use Cases

### When Subagents Are High-Value

```
✅ Onboarding to an unfamiliar codebase
   → Explore entry points, core modules, and data flows simultaneously
   → Get a complete picture in one round instead of sequential reads

✅ Cross-cutting concern tracing
   → "How is authentication checked?" may involve auth middleware,
     route guards, session handling, and token validation — all in
     different parts of the codebase
   → Three subagents explore three areas in parallel

✅ Pre-edit research on a large feature
   → Implementing a feature that touches auth, billing, and API
   → Three subagents investigate each area; main agent implements
     knowing all three dimensions

✅ Large codebase exploration
   → A 500-file codebase is expensive to explore sequentially
   → Subagents divide and conquer — each covers a domain

✅ Understanding dependencies before changing something
   → "What will break if I change this interface?"
   → Subagent A: "Find all callers of this function"
   → Subagent B: "Find all types that depend on this interface"
   → Subagent C: "Check tests that cover this code"

✅ Architecture documentation / system mapping
   → Before writing any code, map the whole system
   → Multiple subagents map different layers simultaneously
```

### When Subagents Are Low-Value

```
❌ Small, focused tasks where the target files are already known
   → "Fix the typo in src/auth.ts line 42"
   → Subagents would just add overhead

❌ Tasks that require writing
   → Subagents can't write; no benefit to spawning them

❌ Tasks where the investigation is inherently sequential
   → "Find the bug — if you find X, then look at Y, if not look at Z"
   → Branches depend on results; can't parallelize

❌ Very small projects (< 20 files)
   → Sequential reads are fast; subagent overhead not worth it

❌ When you already have full context
   → If you've been working in this area for hours, you know it
   → No discovery to parallelize
```

---

## 8. Usage Patterns

### Pattern 1: The Full Onboarding Sweep

New to a codebase? Commission a complete parallel mapping before touching anything:

```
"I'm new to this codebase. Use subagents to simultaneously map:
1. The entry points and main application flow (where does execution start?)
2. The data model (what are the main entities and their relationships?)
3. The API surface (what routes/endpoints exist and what do they do?)
4. The auth/session system (how are users identified and authorized?)
5. The test setup (what testing frameworks, where are tests, how to run them?)

Give me a comprehensive architecture summary from all five investigations."
```

Without subagents, this exploration might take 45,000 tokens sequentially. With 5 subagents running in parallel, the main agent receives 5 compact reports — maybe 5,000 tokens total — and has a complete picture of the system.

### Pattern 2: Impact Analysis Before Refactoring

Before making a significant change, understand the blast radius:

```
"Before I refactor the User model, use subagents to map:
1. Every file that imports or uses the User model (find all callers)
2. Every database query that reads or writes the users table
3. Every test that covers User model behavior
4. Every API endpoint that returns user data

I need to understand the full impact before changing anything."
```

The main agent receives 4 reports about impact. It can now tell you exactly which files will need updating, which tests will need fixing, and which API contracts might change. The refactor becomes a deliberate, scoped operation instead of a discovery process.

### Pattern 3: Parallel Deep-Dives for Feature Planning

Before implementing a major feature, investigate all relevant areas simultaneously:

```
"I'm planning to add OAuth2 login. Before I write any code, use subagents to:
1. Investigate the existing auth system (how does current auth work?)
2. Investigate the session/token model (how are sessions managed?)
3. Investigate the user registration flow (what happens when a user is created?)
4. Check if there are any existing OAuth-related files or dependencies

Report your findings from each area so I can design the OAuth integration correctly."
```

### Pattern 4: Cross-System Consistency Check

Verify that multiple parts of the system are consistent with each other:

```
"Use subagents to check consistency between:
1. The TypeScript types in src/types/ — what shapes are defined?
2. The Zod schemas in src/schemas/ — what validation schemas exist?
3. The Prisma schema in prisma/schema.prisma — what's in the DB?

Report any mismatches or gaps between the three."
```

Three subagents read three different areas. The main agent receives reports and can immediately identify the inconsistencies — without loading all three into a single context window.

### Pattern 5: Parallel Test Investigation

Before fixing a flaky test suite:

```
"Use subagents to investigate:
1. The 5 slowest test files (run 'npx jest --verbose' and report results)
2. The test configuration (jest.config.ts, vitest.config.ts — what's configured?)
3. The test utilities and fixtures (src/__tests__/helpers/ — what shared helpers exist?)

I want to understand the test infrastructure before optimizing it."
```

### Pattern 6: Security Audit

Parallel security scanning across different vulnerability categories:

```
"Use subagents to audit for security issues simultaneously:
1. Scan for hardcoded secrets or credentials in any source file
2. Find all places where user input is used in SQL or shell commands (injection risks)
3. Find all endpoints that don't check authentication/authorization
4. Find all places where sensitive data (passwords, tokens, PII) is logged

Report everything found in each category."
```

### Pattern 7: Dependency Mapping

Understanding relationships before doing surgical changes:

```
"Before I change the PaymentService interface, use subagents to:
1. Find every file that imports PaymentService (direct consumers)
2. Find every file that uses payment-related types (indirect dependencies)
3. Find all tests that mock or test PaymentService behavior

Map the full dependency graph so I know what might break."
```

---

## 9. Anti-Patterns

### Anti-pattern 1: Asking Subagents to Write

```
❌ "Use a subagent to add error handling to src/api/routes.ts"
```

Subagents cannot write. This will either fail or the subagent will just read the file and report what it sees. If you want parallel writing, use the Kanban board with separate agent worktrees.

```
✅ "Use a subagent to read src/api/routes.ts and identify every place
    that needs error handling. Report the line numbers and what type
    of error handling is needed at each."
    [then the MAIN agent makes the changes based on the report]
```

### Anti-pattern 2: Spawning a Subagent for a Task the Main Agent Could Do in 2 Tool Calls

```
❌ "Use a subagent to check if src/config.ts uses a singleton pattern"
```

This is a single `read_files` call. Subagent overhead isn't worth it for trivial lookups.

```
✅ Use subagents when there are at least 2-3 independent areas
   to investigate, each requiring multiple tool calls.
```

### Anti-pattern 3: Giving Subagents Dependent Tasks

```
❌ "Subagent A: find all auth-related files.
    Subagent B: read the files that Subagent A found."
```

Subagent B depends on Subagent A's results. These can't run in parallel. Sequential tasks belong in the main agent.

```
✅ Subagents should receive tasks that can start immediately
   with no dependency on another subagent's output.
```

### Anti-pattern 4: Too-Broad Investigation Prompts

```
❌ "Use a subagent to read everything in src/"
```

This subagent will burn thousands of tokens reading files that aren't relevant. It will produce a bloated, unfocused report.

```
✅ Be specific. "Use a subagent to find all files that define
   Express route handlers in src/ and summarize what route
   each one handles and what middleware it uses."
```

Good subagent prompts are **narrow in scope** and **specific about the report format**.

### Anti-pattern 5: Not Specifying the Report Format

```
❌ "Use a subagent to investigate the caching layer"
```

The subagent will return whatever it thinks is relevant — which may not be what you need.

```
✅ "Use a subagent to investigate the caching layer. Report:
   - Which caching library is used
   - Where caches are initialized
   - Which data is cached (keys and TTLs)
   - Where cache invalidation happens
   Format as a bulleted list with file:line references."
```

Tell subagents what to return, not just what to look at.

### Anti-pattern 6: Treating Subagents as a Substitute for `/deep-planning`

Subagents explore. `/deep-planning` plans and reasons. They're complementary:

```
✅ The right sequence:
   1. Use subagents to gather information (read-only exploration)
   2. Use /deep-planning to reason about what to build (planning)
   3. Switch to Act mode to implement (execution)

❌ Wrong:
   "Use subagents to plan the architecture."
   → Subagents can only read; they can't reason about tradeoffs
   → Planning is a main-agent responsibility
```

---

## 10. Advanced Usage

### Composing Subagent Findings with Your Own Analysis

The most powerful usage: subagents gather raw information, then you ask the main agent to synthesize it with additional reasoning:

```
Step 1: "Use subagents to investigate [three areas]. Report raw findings."
→ Receive three reports

Step 2: "Based on the subagent findings above, what are the top 3 risks
        in implementing [feature]? What should I prioritize fixing first?"
→ Main agent reasons over the subagent findings + your question
→ Produces prioritized, reasoned recommendations
```

Subagents are information gatherers. The main agent is the analyst. Use them in sequence for best results.

### Iterative Subagent Investigation

Some investigations need multiple rounds:

```
Round 1: "Use subagents to find all auth-related files."
→ Receive a list of files

Round 2: "Use subagents to deep-read these specific files and report
          on the auth flow in detail: [files from round 1]"
→ Receive detailed analysis
```

The first round narrows the scope. The second round goes deep on the relevant targets. This is more efficient than a single broad investigation.

### Combining Subagents with Checkpoints

For high-risk exploration tasks (e.g., understanding a complex system before making a large change):

```
1. Enable Checkpoints
2. Use subagents to fully map the system
3. Main agent implements based on the complete picture
4. If anything goes wrong → Checkpoint rollback
```

The subagent exploration phase has zero risk (read-only). The implementation phase has a Checkpoint safety net. The combination gives you maximum confidence in the implementation.

### Structured Report Templates

For repeated investigation patterns (e.g., security audits, dependency checks), standardize the report format in your prompt:

```
"Use a subagent to audit src/api/ for missing authentication checks.
Report in this format:

## Files Audited
[list of files checked]

## Missing Auth Checks
[For each issue: FILE_PATH:LINE_NUMBER — DESCRIPTION — SEVERITY]

## Recommendations
[Prioritized list of fixes]"
```

Consistent report formats make it easier for the main agent to synthesize across multiple subagent reports.

---

## DSA Connections

### DAG (Directed Acyclic Graph) — Task Dependency Resolution

A directed acyclic graph is a graph where edges have direction and no cycles exist, making it the canonical structure for representing dependency relationships. In the subagent model, the main agent implicitly constructs a DAG when it decides which investigations can run in parallel versus which depend on prior results. Each subagent task is a node; an edge from node A to node B means "B needs A's output." The anti-pattern of giving subagents dependent tasks (Subagent B reading files that Subagent A found) is precisely the mistake of ignoring a DAG edge — you scheduled two nodes in parallel that had a dependency between them. Topological sorting of a DAG yields a valid execution order, which is why the iterative subagent pattern (round 1 narrows scope, round 2 goes deep) works: it respects the topological order of the investigation DAG.

### Producer-Consumer Queue — Report Aggregation

A producer-consumer queue is a thread-safe data structure where producer threads enqueue items and consumer threads dequeue them, typically backed by a bounded buffer with blocking semantics. In the subagent architecture, each subagent is a producer that generates a synthesized report upon completing its investigation, while the main agent is the sole consumer that dequeues all reports before proceeding to synthesis and implementation. The fork/join model described in the document maps directly: the "join" barrier is the point where the consumer has drained all items from the queue. This pattern also explains why subagent reports should be compact — a bounded buffer overflows if producers write too much, just as an oversized report wastes the main agent's precious context window.

### Work-Stealing Deque — Parallel Exploration Balancing

A work-stealing deque is a double-ended queue used in parallel runtimes where idle threads steal tasks from the bottom of busy threads' deques, enabling dynamic load balancing without centralized coordination. Although Cline's subagents do not literally steal work from each other, the concept illuminates why well-scoped subagent prompts matter: if one subagent's investigation is trivially small (checking a single config file) while another must traverse hundreds of files, the overall wall-clock time is dominated by the slowest subagent — the same "straggler problem" that work-stealing solves. The document's advice to partition investigation areas by comparable scope is the manual equivalent of what a work-stealing scheduler does automatically: balancing workload across parallel workers so no single worker becomes the bottleneck.

### Readers-Writer Lock — The Read-Only Contract

A readers-writer lock is a synchronization primitive that allows unlimited concurrent readers but grants exclusive access to a single writer, preventing data races while maximizing read throughput. The subagent architecture enforces this pattern at an architectural level: all subagents hold the "read lock" concurrently (they can read any file in the workspace simultaneously), while only the main agent ever acquires the "write lock" to modify files. This design eliminates race conditions — no two agents can produce conflicting edits — and makes rollback via Checkpoints deterministic, since the write history is a single serial stream. The document explicitly names this as the "readers-writer lock pattern from concurrent programming," and it is the foundational safety guarantee that makes subagent parallelism viable without complex conflict resolution.

---

## 11. Quick Reference

### When to Use Subagents

```
Ideal:
✅ 3+ independent areas to investigate
✅ Large codebase (50+ relevant files)
✅ Cross-cutting concerns (tracing something across many files)
✅ Impact analysis before major changes
✅ Parallel documentation mapping

Not ideal:
❌ Single file inspection
❌ Writing or modifying code
❌ Sequential investigations (A depends on B)
❌ Very small projects
```

### Triggering

```
Automatic:  Cline decides when beneficial (default, no action needed)
Manual:     "Use subagents to explore X and Y in parallel."
Disable:    Settings → Features → Agent → toggle off
```

### What Subagents Can/Cannot Do

```
CAN:                        CANNOT:
✅ read_files               ❌ edit files
✅ search (regex)           ❌ bash (write/destructive)
✅ list directories         ❌ access MCP tools
✅ read-only bash commands  ❌ access browser
✅ use skills               ❌ create nested subagents
```

### The Core Mental Models Summary

```
Fork/Join:     Dispatch independent tasks in parallel, collect results
Scouts:        Read-only explorers that report back to base camp
MapReduce:     Distribute exploration work, reduce to synthesized findings
Specialists:   Narrow-focused researchers, main agent is the synthesizer
Context Budget: Subagents protect the main context window from exploration cost
```

### Explicit Request Template

```
"Use subagents to simultaneously investigate:
1. [SPECIFIC AREA] — report: [WHAT YOU NEED TO KNOW]
2. [SPECIFIC AREA] — report: [WHAT YOU NEED TO KNOW]
3. [SPECIFIC AREA] — report: [WHAT YOU NEED TO KNOW]

Format each report as: [SPECIFY IF NEEDED]"
```

The more specific the investigation scope and the more explicit the report format, the better the subagent results.
