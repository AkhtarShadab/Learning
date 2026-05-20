# Cline Built-in Tools Guide
## All Available Tools — When to Use Each, Patterns & Anti-Patterns

---

## The Mental Model: Tools as Atomic Primitives

Cline's built-in tools are **atomic primitives** — the smallest indivisible units of action the agent can take. Think of them like UNIX commands: each does one thing, they are composable, and you build complex workflows by chaining them.

Every Cline task is ultimately a sequence of tool calls. The LLM decides which tool to call at each step, you (or auto-approve) decide whether it can, and the result feeds back into the next decision. Understanding the tools is understanding the engine.

```
You give an instruction
       ↓
LLM thinks → selects a tool → proposes call
       ↓
You approve (or auto-approve fires)
       ↓
Tool executes → result returned to LLM
       ↓
LLM thinks again → next tool call
       ↓
... (10–40 cycles per complex task) ...
       ↓
LLM synthesizes final response
```

### The Two Risk Tiers

Every tool falls into one of two tiers based on reversibility:

```
READ-ONLY TIER                          WRITE/EXECUTE TIER
─────────────────                       ──────────────────
read_files                              bash
search                                  editor
ask_question                            apply_patch
fetch_web (read)                        fetch_web (side effects)

↑ Safe to auto-approve                  ↑ Require review or checkpoints
↑ No side effects                       ↑ Modify state
↑ Free to run multiple times            ↑ May be irreversible
```

**Practice:** Enable auto-approve for the read-only tier. Keep the write/execute tier manual until you understand the task scope — or use Checkpoints as your safety net.

---

## The 7 Core Built-in Tools

### 1. `bash` — Execute Shell Commands

**What it does:** Runs any shell command in your terminal. The single most powerful — and most dangerous — tool in Cline's kit.

**When to use:**
- Running tests (`npm test`, `pytest`, `cargo test`)
- Running linters and formatters
- Running build pipelines (`npm run build`)
- Git operations (`git status`, `git diff`, `git log`)
- Package management (`npm install`, `pip install`)
- Any executable that isn't covered by a dedicated tool

**The approval mental model — the stranger test:**
Before approving a `bash` call, ask: "Would I be comfortable if a stranger typed this command in my terminal?" If the answer is yes, approve. If not, read it carefully and understand it before approving.

```
SAFE bash calls:           REVIEW carefully:
✅ npm test               ⚠️  rm -rf ./dist
✅ git status             ⚠️  git reset --hard HEAD~3
✅ npm run lint           ⚠️  curl | bash
✅ cat package.json       ⚠️  chmod 777 /etc/passwd
✅ ls src/components/     ⚠️  sudo anything
```

**Patterns:**

```bash
# Pattern 1: Test-fix loop
# Let Cline run tests → see failures → fix code → run tests again
# This is the core development loop — let it run

# Pattern 2: Build verification
# Cline writes code → runs build → reads errors → fixes → builds again
# Better than reading code blindly — the compiler is the source of truth

# Pattern 3: Exploratory commands
# Cline uses bash to understand the project before writing code
# git log --oneline -10
# ls src/
# cat package.json
# These are pure reads — auto-approve is fine
```

**Anti-patterns:**
- Don't approve `bash` commands that delete files you haven't read
- Don't let Cline chain many destructive commands without reviewing them individually
- Don't approve `git push --force` without understanding the downstream impact
- Don't approve `npm install <unknown-package>` without knowing what it does

**The exit code contract:** Cline reads exit codes. Commands that exit non-zero signal failure. Always verify that commands Cline runs actually succeed — especially when chaining. Tell Cline: "check exit codes and confirm success before proceeding."

---

### 2. `editor` — View and Edit Files

**What it does:** Cline's primary file modification tool. Can view file contents and make targeted edits (inserting, replacing, deleting sections) or perform full file rewrites.

**When to use:**
- Modifying source code
- Creating new files
- Updating configuration files
- Fixing specific lines or sections in an existing file

**The diff mental model:** Before approving any `editor` call, Cline shows you a diff of the proposed change. Read this diff the way you'd review a pull request — look for:
- What is being added (green)
- What is being removed (red)
- Context: does the change make sense in context of surrounding lines?
- Scope: is the change localized or does it touch more than expected?

```
Good diff pattern:              Red flag pattern:
─────────────────               ──────────────────
+ one or two lines added        - 50 lines removed with no explanation
- one or two lines removed      + entirely different implementation
= rest unchanged                = almost nothing from original preserved
```

**Patterns:**

```
Pattern 1: Read before write
Cline ALWAYS reads (or searches) files before editing them.
If Cline proposes an edit to a file it hasn't read yet — that's a red flag.
Good sequence: read_files → understand → editor (targeted diff)

Pattern 2: Targeted edit over full rewrite
Prefer editor diffs that change only what's needed.
A full file rewrite for a 3-line change wastes tokens and obscures the change.
If Cline is rewriting a 200-line file to change 2 lines, intervene.

Pattern 3: One file at a time (for complex refactors)
Approve changes file by file, not all at once.
This lets you catch cascading errors early before they propagate.
```

**Anti-patterns:**
- Don't approve edits to files you've never seen
- Don't let Cline rewrite configuration files (`.env`, `tsconfig.json`) without reviewing the full diff
- Don't approve edits that change the file structure significantly without understanding the old structure first

---

### 3. `read_files` — Batch Read Multiple Files

**What it does:** Reads multiple files at once and returns their contents to Cline's context. This is the primary discovery tool — Cline uses it constantly to understand the codebase.

**When to use:**
- Understanding existing code before modifying it
- Reading configuration files to understand project setup
- Batch-loading related files (e.g., all the files in a module)
- Cross-referencing types, interfaces, or schemas across files

**Why batch matters:** `read_files` reads multiple files in a single call, which is significantly more efficient than reading them one by one. Cline is optimized to load relevant context in batches before acting.

**The mental model — loading context before acting:**
```
WITHOUT reading:                WITH reading:
─────────────────               ────────────────────
Cline guesses at structure      Cline knows structure
Cline invents API signatures    Cline uses real signatures
Cline ignores edge cases        Cline sees actual edge cases
  → wrong implementation          → correct implementation
```

Reading is never wasted. The fastest path to a correct implementation is full upfront context, not iterative guessing.

**Patterns:**

```
Pattern 1: Read the related module first
Before adding to src/auth/, read all files in src/auth/ first.
Cline will naturally follow existing patterns rather than inventing new ones.

Pattern 2: Read the test file alongside the source file
Tests reveal the expected contract of the code. Reading both
gives Cline twice the signal about what the code is supposed to do.

Pattern 3: Read config before code
Read package.json, tsconfig.json, .env.example before writing code.
Stack versions, compiler options, and environment shape matter.
```

**Auto-approve?** Yes. `read_files` is pure read — no side effects. Auto-approving reads is safe and recommended. The only cost is tokens.

---

### 4. `apply_patch` — Apply Unified Diffs

**What it does:** Applies a unified diff (patch format) to an existing file. This is a more surgical alternative to `editor` — it's what gets used when Cline needs to make precise, minimal changes to a large file.

**When to use:**
- Making small, precise changes to large files where a full rewrite would be wasteful
- Applying changes from an external source (e.g., a suggested patch from a GitHub issue)
- Fixing a specific function without touching surrounding code

**The diff format mental model:**
```diff
--- a/src/auth.ts
+++ b/src/auth.ts
@@ -42,7 +42,7 @@
 function verifyToken(token: string) {
-  const decoded = jwt.verify(token, process.env.SECRET);
+  const decoded = jwt.verify(token, process.env.JWT_SECRET ?? '');
   if (!decoded) throw new Error('Invalid token');
   return decoded;
 }
```

Lines starting with `-` are removed. Lines starting with `+` are added. The `@@` context shows which part of the file. Review that context lines are correct — a misapplied patch can silently corrupt code.

**Anti-patterns:**
- Don't approve patches to files Cline hasn't read — verify the context lines match the actual file
- Don't approve patches that modify more context lines than they claim to

---

### 5. `search` — Ripgrep-Powered Codebase Search

**What it does:** Searches your entire codebase using ripgrep (regex-powered). Returns file paths and matching lines. This is how Cline explores unfamiliar code — it searches before it reads.

**Why ripgrep:** Ripgrep is significantly faster than `grep` and respects `.gitignore` by default. It handles large codebases (hundreds of thousands of files) quickly. Cline uses this as its primary codebase compass.

**When to use:**
- Finding where a function, class, or variable is defined
- Finding all usages of a specific identifier across the codebase
- Locating specific patterns (imports, API calls, error codes)
- Understanding how widely something is used before changing it

**The search-first mental model:**

```
NAIVE approach:                 SEARCH-FIRST approach:
────────────────                ─────────────────────
Read random files               search("handleAuth")
Guess at structure              → finds: src/middleware/auth.ts:47
Get wrong answer                read_files(["src/middleware/auth.ts"])
                                → understands exactly what to change
```

Search narrows the scope. Reading fills in the details. Together, they replace the need to know the codebase in advance.

**Common search patterns:**

```bash
# Find where a function is defined
search("function handleAuth")
search("const handleAuth")

# Find all imports of a module
search("import.*from.*'./auth'")

# Find all usages of an API
search("prisma.user.findFirst")

# Find error messages for debugging
search("Invalid token")
search("cannot read property")

# Find configuration patterns
search("process.env.DATABASE_URL")

# Find all files that match a type
# (Cline uses glob patterns alongside regex)
```

**Anti-patterns:**
- Don't use search as a substitute for reading — search shows you where things are, reading shows you what they do
- Don't approve searches with overly broad patterns that will return thousands of results (wastes context)
- Don't run `bash grep` when `search` is available — search is permission-aware and faster

**Auto-approve?** Yes. `search` is read-only. Auto-approving is safe.

---

### 6. `fetch_web` — HTTP Requests & Web Content

**What it does:** Makes HTTP requests and returns the result with HTML converted to Markdown. Used for research, reading documentation, checking APIs, and fetching external content.

**When to use:**
- Reading online documentation while solving a problem
- Fetching API responses from an endpoint you're developing
- Checking library changelogs, release notes, or migration guides
- Reading a specific Stack Overflow answer or GitHub issue
- Verifying that a URL is accessible

**The research-in-context mental model:**

Without `fetch_web`, Cline relies entirely on training data — which has a knowledge cutoff and may be wrong. With `fetch_web`, Cline can read the actual current documentation while working. This is especially valuable for:
- Recently released libraries
- Breaking changes between versions
- Specific error messages that require looking up

**Patterns:**

```
Pattern 1: Look up the error
Cline hits a TypeScript error it doesn't understand.
→ fetch_web("https://typescript.org/tsconfig#strict") to read the exact flag docs
→ Understand the actual rule before guessing at the fix

Pattern 2: Check the current API
Cline is writing code against an external API.
→ fetch_web the API reference page for the specific endpoint
→ Verify the actual parameter names and response shape before writing

Pattern 3: Verify the migration path
Cline is upgrading a dependency.
→ fetch_web the CHANGELOG or migration guide
→ Read the actual breaking changes before modifying code
```

**Anti-patterns:**
- Don't use `fetch_web` to fetch URLs that require authentication (Gmail, Notion, private APIs) — those will fail; use MCP tools for those
- Don't approve fetching URLs you don't recognize without understanding why Cline needs them
- Don't let `fetch_web` replace reading files that are already in your codebase

---

### 7. `ask_question` — Request Clarifying Input

**What it does:** Pauses execution and asks you a question before proceeding. This is Cline's way of signaling that it cannot proceed safely without more information.

**When to use:**
- When requirements are ambiguous and the answer will significantly change the approach
- When Cline encounters conflicting constraints it cannot resolve
- When a decision has significant consequences (delete vs. migrate, refactor vs. replace)
- When Cline needs a credential, environment value, or context it doesn't have

**The mental model — clarify or guess:**

```
Two paths when Cline is uncertain:
─────────────────────────────────

Path A: Guess             Path B: ask_question
──────────────────        ─────────────────────
Assume an interpretation  Pause and ask you
Implement based on it     Get the right answer
You review the output     Implement correctly
Often wrong               Rarely needs rework
Wastes tokens on bad work Spends tokens wisely
```

`ask_question` is not a sign of weakness — it is Cline being disciplined. A question up front costs 200 tokens. A full wrong implementation costs 20,000.

**When to write rules to eliminate questions:** If Cline is asking the same question repeatedly across sessions (e.g., "should I use TypeScript strict mode?"), that question should be answered in `.clinerules` once so it never needs to be asked again.

**Patterns:**

```
Pattern 1: Let it ask
Don't be annoyed by questions. Cline asking a question is better than
Cline confidently doing the wrong thing. Answer fully.

Pattern 2: Pre-empt it in your prompt
If you know Cline will need to ask, answer it upfront:
"Refactor the auth module. Use JWT, not sessions. Keep the existing 
 API surface — don't change any exported function signatures."

Pattern 3: Turn questions into .clinerules
"After I answer this, I will add it to .clinerules so Cline never needs
to ask it again." This is how .clinerules gets smarter over time.
```

---

## Tool Composition Patterns

The real power of Cline's tools is how they chain together. These are the core compositional loops:

### The Explore Loop (before any implementation)

```
search("target pattern") → find relevant files
       ↓
read_files([file1, file2, ...]) → understand context
       ↓
search("related patterns") → find dependencies
       ↓
read_files([dependency files]) → complete picture
       ↓
[LLM now has full context → ready to implement]
```

### The Implement Loop

```
editor OR apply_patch → make the change
       ↓
bash("run tests") → verify correctness
       ↓
[if fails] → read error output → editor fix
       ↓
bash("run tests") → verify again
       ↓
bash("run type-check") → verify types
       ↓
[repeat until all checks pass]
```

### The Research Loop (for unfamiliar terrain)

```
search("error message or concept") → narrow the target
       ↓
fetch_web(documentation URL) → read the actual docs
       ↓
read_files([relevant source files]) → understand current state
       ↓
[LLM synthesizes research + codebase context → implementation plan]
       ↓
editor → implement based on real information
```

### The Debugging Loop

```
bash("run failing test") → reproduce the failure
       ↓
read_files([test file, source file]) → understand both sides
       ↓
search("related patterns") → check for similar code
       ↓
bash("git log --oneline -10") → what changed recently?
       ↓
[form hypothesis] → editor fix
       ↓
bash("run failing test") → verify the fix
       ↓
bash("run full test suite") → verify nothing else broke
```

---

## Tool Selection Decision Tree

```
What do you need to do?
│
├── Find something in the codebase
│   ├── Know the file? → read_files
│   └── Don't know where it is? → search first, then read_files
│
├── Understand something in the codebase
│   └── read_files (batch — read all related files at once)
│
├── Change a file
│   ├── Small, precise change? → apply_patch
│   └── Larger edit? → editor
│
├── Run something
│   └── bash (test, build, lint, git, etc.)
│
├── Get external information
│   └── fetch_web (docs, APIs, changelogs)
│
└── Need human input?
    └── ask_question
```

---

## Additional Tool Sources

Cline's 7 built-in tools are the floor, not the ceiling. Two sources extend the toolset:

### MCP Servers
External processes that expose additional tools via the Model Context Protocol. Examples:
- `@modelcontextprotocol/server-github` → adds GitHub tools (issues, PRs, repos)
- `@modelcontextprotocol/server-postgres` → adds database query tools
- `@playwright/mcp` → adds browser automation tools

When MCP servers are connected, their tools appear alongside built-ins in Cline's available toolset. See `mcp.md` for full details.

### Plugins (SDK/CLI/Kanban only)
Custom tools added via the Cline plugin system. Available in SDK, CLI, and Kanban mode. Not available in the VS Code extension. See the Cline SDK docs for plugin development.

---

## Anti-Patterns Reference

| Anti-pattern | Why it's bad | Better approach |
|---|---|---|
| Approving `bash` commands without reading them | You don't know what's running | Read every `bash` call before approving |
| Approving `editor` diffs on files you haven't seen | No reference point to evaluate the change | Ask Cline to show you the file first |
| Running `bash grep` instead of `search` | Not permission-aware, slower, may miss things | Use `search` tool |
| Using `bash cat` instead of `read_files` | Bypasses Cline's batch loading and context management | Use `read_files` |
| Approving `rm -rf` without understanding scope | Irreversible deletion | Enable Checkpoints first; review carefully |
| Not using `ask_question` enough | Cline guesses and gets it wrong | Encourage Cline to ask; answer fully |
| Not reading first, writing second | Wrong implementation built on wrong assumptions | Always search + read before edit |
| Using `bash` for file operations that have dedicated tools | Less context-aware, slower to review | Use `editor`, `read_files`, `apply_patch` |

---

## Permissions & Auto-Approve Configuration

Cline has 8 permission categories. The right default setup for development:

```
Permission                      Recommended setting
────────────────────────────    ──────────────────
Read project files              ✅ Auto-approve (pure read, no risk)
Read outside workspace          ✅ Auto-approve (still pure read)
Edit project files              ⚠️  Manual review (you want to see diffs)
Edit outside workspace          ❌ Disabled (no reason to write outside workspace)
Terminal — safe commands        ✅ Auto-approve (build, test, lint are safe)
Terminal — all commands         ⚠️  Manual only (destructive ops require review)
Browser access                  ⚠️  Manual (depending on context)
MCP server access               ⚠️  Manual (per-server, per-tool policy)
```

> **Checkpoints + auto-approve:** If you enable auto-approve for edits, always enable Checkpoints first. The Checkpoint shadow git repo is your rollback safety net when approvals are bypassed.

---

## DSA Connections

### Strategy Pattern — Tool Selection and Dispatch

The **strategy pattern** defines a family of interchangeable algorithms, encapsulates each one behind a common interface, and lets the client select among them at runtime. Cline's seven built-in tools (`bash`, `editor`, `read_files`, `apply_patch`, `search`, `fetch_web`, `ask_question`) are concrete strategies that all conform to a single interface: accept parameters, execute an action, and return a result to the LLM's next reasoning step. The LLM acts as the strategy selector — at each step in the 10-40 cycle tool loop, it evaluates the current task state and dispatches to the appropriate strategy without the surrounding orchestration code needing to know which tool was chosen. The Tool Selection Decision Tree in this document is literally a decision procedure for choosing a strategy: "Need to find something? → `search`. Need to change a file? → `editor` or `apply_patch`. Need external info? → `fetch_web`." This is why new tools (MCP servers, plugins) can be added without modifying the core loop — they are new strategies that plug into the same dispatch interface, exactly as the pattern intends.

### Hash Map — Tool Registry and Permission Lookup

A **hash map** provides O(1) average-time key-value lookup by hashing keys to array indices. Cline maintains a tool registry that maps tool names (e.g., `"bash"`, `"editor"`, `"search"`) to their implementations and metadata — a classic hash map where the key is the tool name string and the value is the tool's handler, parameter schema, and permission tier. When the LLM emits a tool call like `{"tool": "read_files", "params": {...}}`, the runtime hashes the tool name to find the handler in O(1) rather than iterating through all registered tools. The same hash map pattern appears in the permission system: the 8 permission categories are keyed by name (e.g., `"terminal_safe_commands" → "auto-approve"`, `"edit_project_files" → "manual"`), and every tool invocation performs an O(1) permission lookup before execution. MCP server tools extend this registry dynamically — when `@modelcontextprotocol/server-github` connects, its tools are inserted into the same hash map, making them discoverable alongside built-ins with identical O(1) lookup cost.

### Adapter Pattern — MCP Server Integration and Tool Unification

The **adapter pattern** wraps an incompatible interface so it conforms to the interface a client expects, enabling integration without modifying either side. MCP (Model Context Protocol) servers are external processes that expose tools through their own protocol — a GitHub MCP server speaks GitHub's API, a Postgres MCP server speaks SQL — but Cline's LLM expects every tool to follow the same interface: receive parameters, execute, return a result string. The MCP adapter translates between these: it takes Cline's standardized tool call, converts it into the MCP server's native protocol, executes the request, and converts the response back into Cline's expected result format. This is why the document says MCP tools "appear alongside built-ins in Cline's available toolset" — the adapter makes a GitHub PR creation tool indistinguishable from the native `bash` tool from the LLM's perspective. Without this adaptation layer, every new external tool source would require changes to the core tool dispatch loop, violating the open-closed principle.

### Two-Tier Classification as a Binary Search Partition

**Binary partitioning** divides a set into exactly two subsets based on a predicate, enabling O(1) classification of any element once the predicate is evaluated. Cline's "Two Risk Tiers" system partitions all tools into a read-only tier (`read_files`, `search`, `ask_question`, `fetch_web` for reads) and a write/execute tier (`bash`, `editor`, `apply_patch`, `fetch_web` with side effects) based on a single predicate: "does this tool modify state?" This partition drives the auto-approve decision in O(1) — the runtime checks which tier a tool belongs to and either auto-approves or prompts for review, without analyzing the tool call's content. The `bash` tool further applies a dynamic classification heuristic that partitions individual commands into "safe" versus "approval required" based on whether the command has side effects (`npm test` is safe; `rm -rf` requires review). This two-level partitioning — first by tool tier, then by command content — mirrors how binary search trees partition data at each level to reduce decision complexity from linear scanning to logarithmic or constant-time classification.
