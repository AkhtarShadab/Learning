# Hooks — Automating Actions Around Cline Events

---

## 1. What Is This Exactly?

Hooks are lifecycle event handlers that Cline fires **automatically** at specific points in its execution pipeline — without you asking, without a prompt, without relying on Cline remembering to do it.

There are **two distinct hook systems** depending on which surface of Cline you are using:

1. **Plugin Hooks** — for the SDK, CLI, and Kanban. Defined in an `AgentPlugin` and fire at agent lifecycle events.
2. **VS Code Settings Hooks** — for the VS Code extension only. Configured in `settings.json` under the `cline.hooks` key and run shell commands.

You configure them once. After that, they run on every matching event, every time, forever — until you remove them.

---

### Hook System 1: VS Code Settings Hooks (Extension)

These are the hooks most users encounter first. Configured in your VS Code `settings.json` under `cline.hooks`, they run shell commands at tool-use boundaries.

#### The four VS Code hook events

| Hook event    | When it fires                                              |
|---------------|------------------------------------------------------------|
| `PreToolUse`  | Just before Cline calls a tool (read, write, execute, etc.)|
| `PostToolUse` | Immediately after a tool call completes                    |
| `OnError`     | When Cline encounters an error during a task               |
| `Stop`        | After the entire task ends (Cline has finished)            |

#### What context each hook receives

When a hook fires, Cline passes structured context to your script as shell variable substitutions in the command string:

- `${path}` — absolute path of the file involved
- `${tool}` — name of the tool that fired (e.g. `write_to_file`, `execute_command`)
- `${output}` — the tool's output/result
- `${workspaceFolder}` — absolute path to the VS Code workspace root
- `${command}` — the shell command (for `execute_command` hooks)

---

### Hook System 2: Plugin Hooks (SDK/CLI/Kanban)

When you build with the Cline SDK or run the CLI, you define an `AgentPlugin` with a `hooks` object. These fire at agent lifecycle events — not tool-use events.

#### Official Plugin Hook Types

```typescript
hooks: {
  beforeRun()    // fires at execution start — setup, logging
  afterRun()     // fires after completion — metrics, cleanup
  beforeModel()  // fires before each LLM call — prompt inspection
  afterModel()   // fires after each LLM response — response inspection
  beforeTool()   // fires before tool execution — policy checks, logging
  afterTool()    // fires after tool execution — result inspection
  onEvent()      // fires on external events
}
```

#### Hook Policies — controlling execution behaviour

Each plugin hook can be configured with a policy object:

```typescript
{
  mode: "blocking" | "async",   // blocking waits for the hook to finish; async fires and forgets
  timeoutMs: 5000,               // how long to wait before timing out
  retries: 2,                    // retry count on failure
  failureMode: "fail_open" | "fail_closed"  // fail_open = continue on hook error; fail_closed = abort
}
```

Use `fail_open` for logging and observability hooks (a logging failure should not crash the agent). Use `fail_closed` for policy and security hooks (a policy check failure should abort execution).

---

### Hooks vs. asking Cline to run a command

This distinction matters. A lot.

```
WITHOUT hooks                          WITH hooks
--------------------                   --------------------
You: "After you edit files,            settings.json:
      run the tests"                   PostToolUse → run tests

Cline: *edits file*                    Cline: *edits file*
Cline: *sometimes forgets tests*       [hook fires automatically]
Cline: *moves on*                      [tests run]
                                       [output fed back to Cline]
```

When you put an instruction in `.clinerules` ("always run tests after edits"), you are asking the LLM to remember and comply. The LLM might comply 95% of the time. Hooks comply 100% of the time — they are enforced at the infrastructure level, not the model level.

---

## 2. Mental Model

### Mental Model 1: Git Hooks

If you've used Git hooks (`pre-commit`, `post-commit`, `pre-push`), you already understand Cline hooks. The concept is identical:

```
Git hooks                              Cline hooks
-------------------------              -------------------------
pre-commit   → runs before commit      PreToolUse  → runs before tool
post-commit  → runs after commit       PostToolUse → runs after tool
post-merge   → runs after merge        Stop        → runs after task ends
```

Git doesn't ask your permission each time — `pre-commit` just runs. You configured it once. Same with Cline hooks.

### Mental Model 2: Express.js Middleware

In Express, middleware runs on every request regardless of which route handles it:

```javascript
app.use(logRequest);     // fires for every request
app.use(authenticate);   // fires for every request
app.use(rateLimit);      // fires for every request

app.get('/users', handler);   // only fires for this route
```

Cline hooks are middleware for Cline's tool calls. You register them once and they intercept every matching event — you don't have to wire them into each task individually.

```
Every file write Cline does
        ↓
  [PostToolUse hook]     ← your middleware
        ↓
  eslint --fix runs
        ↓
  result logged
        ↓
  Cline sees the result (if you feed it back)
```

### Mental Model 3: Security Camera with Motion Detection

Imagine a security camera. You could hire someone to watch the live feed 24/7 and call the police if something looks wrong. Or you configure motion detection — the alarm fires automatically whenever the sensor trips.

`.clinerules` = hiring someone to watch the feed (depends on attention, judgment, compliance)

Hooks = motion detection (fires unconditionally when the event occurs)

**The key insight:** Hooks let you enforce rules that cannot be forgotten or bypassed. If Cline is modifying 40 files in a refactor, every single write will trigger your lint hook — even if Cline "forgot" to mention it would lint, even if the task prompt never mentioned linting.

**Key design principle:** Use hooks for **OBSERVING** (logging, metrics, auditing). Modify agent behaviour via system prompts instead — hooks should not change agent decisions.

---

## 3. How to Integrate It in Your Projects

### VS Code Settings Hooks

#### Where to configure hooks

**Option A: User-level settings** (applies to all your projects)

File: `~/.config/Code/User/settings.json` (Linux/Mac) or `%APPDATA%\Code\User\settings.json` (Windows)

**Option B: Workspace settings** (applies only to this project)

File: `<project-root>/.vscode/settings.json`

Workspace settings override user settings, so you can have global defaults and per-project overrides.

#### Hook configuration format

```json
{
  "cline.hooks": {
    "PostToolUse": [{
      "matcher": { "tool": "editor", "path": "src/**/*.ts" },
      "command": "npx tsc --noEmit"
    }],
    "Stop": [{
      "command": "osascript -e 'display notification \"Done\" with title \"Cline\"'"
    }]
  }
}
```

The structure is:

```
cline.hooks
  └── <HookEvent>          (PreToolUse | PostToolUse | OnError | Stop)
        └── [ array of hook objects ]
              ├── matcher  (optional — filters which events trigger this hook)
              │     ├── tool    (glob matching tool name)
              │     └── path    (glob matching file path)
              └── command  (shell command to run; ${path}, ${tool}, ${output} available)
```

#### Example hooks

##### Auto-run tests after TypeScript writes

```json
{
  "cline.hooks": {
    "PostToolUse": [
      {
        "matcher": {
          "tool": "write_to_file",
          "path": "**/*.ts"
        },
        "command": "cd ${workspaceFolder} && npm test -- --testPathPattern=${path} --passWithNoTests"
      }
    ]
  }
}
```

This runs Jest (or your test runner) scoped to the file Cline just edited. Fast, targeted, automatic.

##### Auto-fix ESLint issues after writes to src/

```json
{
  "cline.hooks": {
    "PostToolUse": [
      {
        "matcher": {
          "tool": "write_to_file",
          "path": "src/**"
        },
        "command": "eslint --fix ${path}"
      }
    ]
  }
}
```

##### Auto-format with Prettier after any file edit

```json
{
  "cline.hooks": {
    "PostToolUse": [
      {
        "matcher": {
          "tool": "write_to_file"
        },
        "command": "prettier --write ${path}"
      }
    ]
  }
}
```

No `path` matcher here — matches all file writes.

##### Show git diff after every tool use (great for debugging/auditing)

```json
{
  "cline.hooks": {
    "PostToolUse": [
      {
        "command": "git diff --stat"
      }
    ]
  }
}
```

Output appears in Cline's tool result feed, so you can watch the diff accumulate as Cline works.

##### Desktop notification when task completes

```json
{
  "cline.hooks": {
    "Stop": [
      {
        "command": "notify-send --urgency=normal 'Cline Task Done' 'Your task has completed. Review the output.'"
      }
    ]
  }
}
```

On macOS replace `notify-send` with `osascript -e 'display notification "Task completed" with title "Cline"'`.

##### Auto type-check after TypeScript writes

```json
{
  "cline.hooks": {
    "PostToolUse": [
      {
        "matcher": {
          "tool": "write_to_file",
          "path": "**/*.ts"
        },
        "command": "cd ${workspaceFolder} && npx tsc --noEmit 2>&1 | head -50"
      }
    ]
  }
}
```

The `head -50` prevents flooding Cline's context with hundreds of type errors at once.

#### Passing hook context to your scripts

For more complex scripts, write a standalone bash script and call it:

```json
{
  "cline.hooks": {
    "PostToolUse": [
      {
        "matcher": { "tool": "write_to_file" },
        "command": "${workspaceFolder}/scripts/cline-post-write.sh ${path}"
      }
    ]
  }
}
```

```bash
#!/bin/bash
# scripts/cline-post-write.sh
FILE_PATH="$1"

echo "[hook] PostToolUse fired for: $FILE_PATH"

# Run lint
eslint --fix "$FILE_PATH" 2>&1

# Run type check
npx tsc --noEmit 2>&1 | head -30

# Log to audit file
echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) WRITE $FILE_PATH" >> .cline-audit.log
```

#### Enabling vs. disabling hooks per workspace

To disable hooks for a workspace without deleting the config, add:

```json
{
  "cline.hooksEnabled": false
}
```

To disable a single hook temporarily, comment it out or move it to a `_disabled_hooks` key (which Cline ignores).

---

### Plugin Hooks (SDK/CLI/Kanban)

#### Writing a Plugin with Hooks

```typescript
import { AgentPlugin } from "@cline/sdk";

const myPlugin: AgentPlugin = {
  name: "audit-logger",
  manifest: { capabilities: ["hooks"] },
  setup() {},  // keep fast and synchronous — runs before first LLM call
  hooks: {
    beforeTool({ tool, input }) {
      console.log(`[audit] Tool: ${tool.name}`, input);
    },
    afterRun({ usage }) {
      console.log(`[metrics] Tokens: ${usage.totalTokens}`);
    }
  }
};
```

#### Best practices for Plugin Hooks

- Keep `setup()` synchronous and fast — it runs before the first LLM call
- Register tools only in `setup()`, not inside hook handlers
- Handle errors in hooks to prevent observation code from crashing the agent
- Use `fail_open` for logging hooks (don't abort if logging fails)
- Use `fail_closed` for policy/security hooks (abort if the policy check fails)
- Use `mode: "async"` for fire-and-forget side effects (metrics, analytics)
- Use `mode: "blocking"` when the hook result must complete before execution continues

#### Full Plugin example with policies

```typescript
import { AgentPlugin } from "@cline/sdk";

const securityPlugin: AgentPlugin = {
  name: "security-policy",
  manifest: { capabilities: ["hooks"] },
  setup() {},
  hooks: {
    beforeTool: {
      handler({ tool, input }) {
        // Block writes to protected paths
        if (tool.name === "write_to_file" && input.path?.includes("/etc/")) {
          throw new Error(`[security] Write to ${input.path} is not permitted.`);
        }
      },
      policy: {
        mode: "blocking",
        timeoutMs: 2000,
        failureMode: "fail_closed"   // abort if this hook errors
      }
    },
    afterRun: {
      handler({ usage }) {
        fetch("https://metrics.internal/cline", {
          method: "POST",
          body: JSON.stringify({ tokens: usage.totalTokens, ts: Date.now() })
        }).catch(() => {});          // swallow errors — metrics are optional
      },
      policy: {
        mode: "async",               // don't wait for this
        failureMode: "fail_open"     // continue even if metrics call fails
      }
    }
  }
};
```

---

## 4. Advanced Use Cases

### Running tests and feeding failures back to Cline automatically

The power move: run tests in a hook, write failures to a file, and let Cline read that file on its next turn.

```json
{
  "cline.hooks": {
    "PostToolUse": [
      {
        "matcher": { "tool": "write_to_file", "path": "src/**/*.ts" },
        "command": "cd ${workspaceFolder} && npm test -- --json --outputFile=.cline-test-results.json 2>&1; node scripts/summarize-test-failures.js"
      }
    ]
  }
}
```

```javascript
// scripts/summarize-test-failures.js
const results = JSON.parse(require('fs').readFileSync('.cline-test-results.json'));
const failures = results.testResults
  .flatMap(suite => suite.testResults.filter(t => t.status === 'failed'))
  .map(t => `FAIL: ${t.fullName}\n  ${t.failureMessages[0]?.split('\n')[0]}`);

if (failures.length > 0) {
  require('fs').writeFileSync('.cline-test-failures.md', failures.join('\n'));
  console.log(`[hook] ${failures.length} test(s) failed. See .cline-test-failures.md`);
} else {
  console.log('[hook] All tests passing.');
}
```

Now tell Cline in your `.clinerules`: "After writing code, check `.cline-test-failures.md` for failures and fix them." The hook produces the failures file; Cline reads and acts on it.

### Enforcing no-direct-commit rules (branch name checks)

```bash
#!/bin/bash
# scripts/cline-pre-execute.sh
COMMAND="$1"

# If Cline tries to run a git commit, check the branch
if echo "$COMMAND" | grep -q "git commit"; then
  BRANCH=$(git branch --show-current)
  if [[ "$BRANCH" == "main" || "$BRANCH" == "master" ]]; then
    echo "ERROR: Direct commits to $BRANCH are not allowed. Create a feature branch first."
    exit 1
  fi
fi
```

```json
{
  "cline.hooks": {
    "PreToolUse": [
      {
        "matcher": { "tool": "execute_command" },
        "command": "${workspaceFolder}/scripts/cline-pre-execute.sh '${command}'"
      }
    ]
  }
}
```

### Logging all Cline file changes to an audit log

```bash
#!/bin/bash
# scripts/cline-audit.sh
AUDIT_FILE="${WORKSPACE}/.cline-audit.log"
TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)
TOOL="$1"
PATH_ARG="$2"

echo "$TIMESTAMP | TOOL=$TOOL | PATH=$PATH_ARG" >> "$AUDIT_FILE"
```

```json
{
  "cline.hooks": {
    "PostToolUse": [
      {
        "command": "${workspaceFolder}/scripts/cline-audit.sh ${tool} ${path}"
      }
    ]
  }
}
```

The `.cline-audit.log` becomes your change log. You can review it at the end of a session to see everything Cline touched.

### Auto-creating git commits after successful task completion

```bash
#!/bin/bash
# scripts/cline-auto-commit.sh

# Only commit if there are staged/unstaged changes
if git diff --quiet && git diff --cached --quiet; then
  echo "[hook] No changes to commit."
  exit 0
fi

# Stage all changes
git add -A

# Commit with a timestamped message
TIMESTAMP=$(date +%Y%m%d-%H%M)
git commit -m "cline: auto-commit after task [$TIMESTAMP]"
echo "[hook] Auto-committed changes."
```

```json
{
  "cline.hooks": {
    "Stop": [
      {
        "command": "${workspaceFolder}/scripts/cline-auto-commit.sh"
      }
    ]
  }
}
```

Be cautious with this — you probably only want it on feature branches, not main.

### Chaining hooks: write → lint → test → if passing, commit

This is the full pipeline. One hook, one script, total automation:

```
File Write (Cline)
      │
      ▼
[PostToolUse hook fires]
      │
      ▼
  eslint --fix            ← fix style issues first
      │
      ▼
  tsc --noEmit            ← catch type errors
      │
      ├─ ERRORS → write to .cline-errors.md, stop, let Cline fix
      │
      ▼
  npm test                ← run tests
      │
      ├─ FAILURES → write to .cline-test-failures.md, stop
      │
      ▼
  git add + git commit    ← everything green, commit
```

```bash
#!/bin/bash
# scripts/cline-pipeline.sh
FILE="$1"
WORKSPACE="$2"
cd "$WORKSPACE"

echo "=== [pipeline] Running for: $FILE ==="

# Step 1: Lint
echo "[1/4] Running ESLint..."
eslint --fix "$FILE" 2>&1
if [ $? -ne 0 ]; then
  echo "ESLint failed" >> .cline-errors.md
  exit 1
fi

# Step 2: Type check
echo "[2/4] Running TypeScript check..."
TSC_OUT=$(npx tsc --noEmit 2>&1)
if [ $? -ne 0 ]; then
  echo "$TSC_OUT" | head -30 > .cline-errors.md
  echo "[pipeline] Type errors found. See .cline-errors.md"
  exit 1
fi

# Step 3: Tests
echo "[3/4] Running tests..."
TEST_OUT=$(npm test -- --passWithNoTests 2>&1)
if [ $? -ne 0 ]; then
  echo "$TEST_OUT" | tail -40 > .cline-test-failures.md
  echo "[pipeline] Test failures. See .cline-test-failures.md"
  exit 1
fi

# Step 4: Commit (only on clean branch)
echo "[4/4] All checks passed. Committing..."
BRANCH=$(git branch --show-current)
if [[ "$BRANCH" != "main" && "$BRANCH" != "master" ]]; then
  git add -A && git commit -m "cline: pipeline pass [$(date +%H:%M)]"
fi

echo "=== [pipeline] Done. ==="
```

### Using hooks to maintain a live "what changed" log

```bash
#!/bin/bash
# scripts/cline-changelog.sh
FILE="$1"
CHANGELOG="${2}/.cline-changes.md"

# Get the diff for this file
DIFF=$(git diff "$FILE" 2>/dev/null || echo "new file")

# Append to the live changelog
cat >> "$CHANGELOG" <<EOF

## $(date +%H:%M:%S) — $FILE

\`\`\`diff
$DIFF
\`\`\`

EOF
```

Cline can then read `.cline-changes.md` at any point to understand its own progress. This is useful for long multi-file tasks where Cline needs to refer back to what it already changed.

### Security hooks: scanning for secrets before saving

```bash
#!/bin/bash
# scripts/cline-secret-scan.sh
FILE="$1"

# Check for common secret patterns
PATTERNS=(
  "AKIA[0-9A-Z]{16}"              # AWS Access Key
  "sk-[a-zA-Z0-9]{48}"           # OpenAI key
  "ghp_[a-zA-Z0-9]{36}"         # GitHub personal token
  "xoxb-[0-9]+-[a-zA-Z0-9]+"   # Slack bot token
  "password\s*=\s*['\"][^'\"]+['\"]"  # Hardcoded password
  "api_key\s*=\s*['\"][^'\"]+['\"]"   # Generic API key
)

for PATTERN in "${PATTERNS[@]}"; do
  if grep -qE "$PATTERN" "$FILE" 2>/dev/null; then
    echo "SECURITY WARNING: Possible secret detected in $FILE"
    echo "Pattern matched: $PATTERN"
    echo "Review the file before proceeding."
    # Optionally: git checkout -- "$FILE" to revert
    exit 1
  fi
done

echo "[security] No secrets detected in $FILE"
```

```json
{
  "cline.hooks": {
    "PreToolUse": [
      {
        "matcher": { "tool": "write_to_file" },
        "command": "${workspaceFolder}/scripts/cline-secret-scan.sh ${path}"
      }
    ]
  }
}
```

Because this is a `PreToolUse` hook, it runs before the write completes — Cline cannot accidentally save a file containing a secret without the hook seeing it first.

---

## DSA Connections

### Observer Pattern (Event Emitter) — Hook Registration and Dispatch

The observer pattern maintains a list of subscribers for each event type; when an event fires, the emitter iterates the subscriber list and invokes each callback. Cline's hook system is a direct implementation: `PostToolUse`, `PreToolUse`, `OnError`, and `Stop` are named event channels, and each hook object you register in `cline.hooks` is a subscriber with an optional matcher predicate that further filters which events it responds to. When Cline calls `write_to_file`, the internal emitter publishes a `PostToolUse` event, iterates all registered hooks, evaluates each matcher against the tool name and file path, and invokes the matching commands. This is why hooks "fire 100% of the time" — the emitter is infrastructure, not an LLM decision — and why adding a new hook requires zero changes to the core pipeline, just appending to the subscriber list.

### Linked List — Hook Chain Execution Order

A linked list is a sequence of nodes where each node points to the next, enabling O(1) insertion at either end and guaranteed traversal in insertion order. The array of hook objects under each event key (`PostToolUse: [{...}, {...}, {...}]`) forms a logical linked list: Cline traverses it head to tail, executing each hook in the order it was registered. The chaining pipeline described in the document — `write → eslint --fix → tsc --noEmit → npm test → git commit` — is a singly linked list of processing stages where each node's successful completion triggers traversal to the next. If any node fails (returns non-zero), traversal halts, mirroring how a linked-list search terminates when it finds its target. The Plugin hook's `failureMode: "fail_closed"` is the "halt on match" semantic; `fail_open` is "skip this node, continue traversal."

### Interceptor Stack (Decorator/Chain of Responsibility) — PreToolUse Gating

The chain of responsibility pattern passes a request through a sequence of handlers, each of which can process, modify, or reject the request before forwarding it to the next handler. `PreToolUse` hooks implement exactly this: before a tool executes, the request passes through every registered `PreToolUse` hook in order. The secret-scanning hook in the document is a handler that inspects the file content for credential patterns and either allows the write to proceed (passes to next handler) or exits with code 1 (rejects the request). In data-structure terms, this is a stack of interceptors — each `PreToolUse` entry is pushed onto the stack at configuration time, and at runtime the stack is unwound top-to-bottom. The Plugin hook's `mode: "blocking"` ensures the interceptor completes before the request proceeds, which is critical for security gates where asynchronous execution would defeat the purpose.

### Pub-Sub with Topic Filtering — Matcher-Based Event Routing

A publish-subscribe system with topic filtering allows subscribers to receive only messages matching a declared pattern, avoiding the overhead of processing irrelevant events. The `matcher` object in VS Code hooks (`{ "tool": "write_to_file", "path": "src/**/*.ts" }`) is a topic filter: the publisher (Cline's tool-use pipeline) emits all events, and the subscriber (your hook command) only receives events whose tool name and file path glob match the declared filter. This is more efficient than registering a catch-all hook and filtering inside your script, just as topic-filtered pub-sub avoids delivering messages to uninterested subscribers. The document's example of scoping a TypeScript type-check hook to `**/*.ts` rather than all files demonstrates the performance benefit — the hook command never runs for `.css` or `.json` writes, reducing unnecessary subprocess spawns.

---

## Quick Reference

```
Hook timing (VS Code extension):

  Cline decides to call a tool
          │
          ▼
  [PreToolUse hook]       ← intercept before, can block
          │
          ▼
  Tool executes (read / write / execute_command / etc.)
          │
          ▼
  [PostToolUse hook]      ← react after, can inspect output
          │
          ▼
  Cline processes result
          │
          ▼  (if error occurred)
  [OnError hook]          ← handle errors, log, alert
          │
          ▼  (when entire task done)
  [Stop hook]             ← cleanup, notify, commit, report


Plugin hook order (SDK/CLI):

  Agent starts
      └─► beforeRun()
              └─► [loop: for each LLM call]
                      └─► beforeModel()
                              └─► LLM called
                                      └─► afterModel()
                                              └─► [if tool call]
                                                      ├─► beforeTool()
                                                      │       └─► tool executes
                                                      └─► afterTool()
      └─► afterRun()
```

### Hook configuration cheat sheet (VS Code)

```json
{
  "cline.hooks": {
    "PostToolUse": [
      {
        "matcher": {
          "tool": "write_to_file",     // exact tool name or glob
          "path": "src/**/*.ts"        // file path glob (optional)
        },
        "command": "your-command ${path}"
      }
    ],
    "PreToolUse": [],
    "OnError":    [],
    "Stop":       []
  }
}
```

### Plugin Hook policy cheat sheet

```typescript
{
  mode: "blocking",          // "blocking" | "async"
  timeoutMs: 5000,
  retries: 2,
  failureMode: "fail_open"   // "fail_open" | "fail_closed"
}
```

### Available substitutions in VS Code hook command strings

| Variable             | Value                                       |
|----------------------|---------------------------------------------|
| `${path}`            | Absolute path of the file being operated on |
| `${tool}`            | Tool name (e.g. `write_to_file`)            |
| `${output}`          | Tool's output/result text                   |
| `${workspaceFolder}` | Absolute path to the VS Code workspace      |
| `${command}`         | The shell command (for `execute_command`)   |
