# 💬 Doubts & Q&A — Cline

---

## Q: How do I invoke a built-in skill (like `/smol`) from inside my own custom skill?

### The key distinction first: two separate layers

Cline has two separate execution layers, and this matters for how you compose skills:

| Layer | What lives here | Can call... |
|---|---|---|
| **Instruction layer** | SKILL.md text, .clinerules, chat | Other skills, slash commands, anything Cline can do |
| **Script layer** | `scripts/*.sh` files | Shell commands, other skills' bash scripts — **not slash commands** |

`/smol`, `/newtask`, `/deep-planning`, etc. are **slash commands processed by Cline's reasoning layer**, not shell commands. You cannot `bash /smol` from a script. They're invoked by Cline itself, not by the shell.

---

### Method 1 — Instruction-based invocation (correct way for slash commands)

Write a step in your `SKILL.md` body that explicitly tells Cline to invoke the slash command. Cline reads your SKILL.md as instructions to follow — so if you write "invoke `/smol` at the end", Cline will call it via its internal `use_skill` tool.

```markdown
---
name: my-feature-builder
description: |
  Build a new feature end-to-end: scaffold, implement, test. Use when
  starting a new feature from scratch or implementing a spec.
---

# my-feature-builder

Builds a complete feature: file scaffold → implementation → tests → docs.

## Steps

1. Read the feature spec or description provided
2. Run `scripts/scaffold.sh <feature-name>` to create the file structure
3. Implement the feature following project conventions in `.clinerules`
4. Run `scripts/run-tests.sh` to validate
5. Update relevant docs

## Context Cleanup (important)

After completing all steps above, invoke `/smol` to condense the
conversation context. The execution flow for feature building accumulates
a lot of intermediate output (scaffold output, test runs, diffs) that
pollutes future reasoning. `/smol` trims this back to just the key
decisions and outcomes before returning to the user.
```

Cline reads step 5 and executes `/smol` itself — you don't wire anything programmatically.

**Why this works**: Cline's skill system loads your SKILL.md as a set of instructions it must follow. When those instructions say "invoke `/smol`", Cline treats it as a directive and issues the slash command via its internal `use_skill` mechanism — the same way it would if the user had typed `/smol` in chat.

---

### Method 2 — Script-level composition (for script-backed skills only)

If the "other skill" you want to call is a user-created skill with bash scripts (not a built-in slash command), you can call its scripts directly using the `SKILL_ROOT` path pattern:

```bash
#!/bin/bash
# .cline/skills/my-feature-builder/scripts/build-feature.sh

set -euo pipefail
SKILL_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# Step 1: scaffold using our own script
bash "$SKILL_ROOT/my-feature-builder/scripts/scaffold.sh" "$1"

# Step 2: run tests using the test-runner skill's script
bash "$SKILL_ROOT/test-runner/scripts/run-tests.sh" --coverage

# Step 3: check logs using the monitoring skill's script
bash "$SKILL_ROOT/monitoring/scripts/get-errors.sh" 5
```

This is **script-to-script** composition. It works for user skills. It does NOT work for built-in slash commands (`/smol`, `/newtask`, etc.) because those are not shell executables.

---

### The `/smol` use case specifically

`/smol` condenses conversation history while preserving key decisions — useful mid-task when your execution flow has produced a lot of output (test runs, file listings, diffs) that bloat context without adding future value.

**The recommended pattern** — add a `## Context Cleanup` section at the bottom of your SKILL.md:

```markdown
## Context Cleanup

After completing this workflow, invoke `/smol` to trim the accumulated
execution history. This skill generates significant intermediate output
(build logs, test results, file diffs) that is not needed for subsequent
tasks. Compressing now keeps the context window healthy.
```

**When to use `/smol` vs `/newtask`:**

| Situation | Use |
|---|---|
| Mid-task, still working, context getting heavy | `/smol` — trims history, stays in current session |
| Task is done, starting something unrelated | `/newtask` — carries forward only key decisions, opens fresh task |
| Context window nearly full, must continue | `/newtask` — `/smol` alone may not reclaim enough budget |

**The rule of thumb**: use `/smol` as a routine end-of-workflow hygiene step in complex skills. Use `/newtask` when you're crossing a task boundary.

---

### What you CANNOT do

```bash
# ❌ This does not work — /smol is not a shell command
bash /smol

# ❌ This does not work — Cline slash commands aren't executables
/path/to/cline /smol

# ❌ This does not work — there's no API to call slash commands from scripts
curl http://localhost:PORT/slash/smol
```

Slash commands only work when Cline's reasoning layer executes them — either because the user typed one in chat, or because Cline's instructions (your SKILL.md) told it to.

---

### Summary

```
Want to invoke /smol from your skill?
  └── Add an explicit instruction in your SKILL.md:
        "After completing these steps, invoke /smol to compact context."
      Cline reads the instruction and calls /smol itself. Done.

Want to call another user-created skill's logic from a script?
  └── Use the SKILL_ROOT path pattern in bash:
        bash "$SKILL_ROOT/other-skill/scripts/command.sh"
      Works for any script-backed user skill.

Want to call a built-in slash command from a bash script?
  └── You can't. Slash commands run at Cline's reasoning layer,
      not the shell layer. Use Method 1 (SKILL.md instructions) instead.
```

