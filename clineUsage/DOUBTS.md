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

---

## Q: I created workspace skills but the `/` command can't find them — why?

This is almost always a **wrong folder path** issue. Both Cline and Claude Code require skills to be in a very specific hidden directory. A plain `skills/` folder at your project root is invisible to the `/` command.

---

### The exact path each tool requires

| Tool | Workspace (project-level) skills | Global (all projects) skills |
|---|---|---|
| **Cline** (VS Code extension) | `.cline/skills/<name>/SKILL.md` | `~/.cline/skills/<name>/SKILL.md` |
| **Claude Code** | `.claude/skills/<name>/SKILL.md` | `~/.claude/skills/<name>/SKILL.md` |

Note the **dot prefix** on both `.cline/` and `.claude/`. A folder named `skills/` (no dot) at your project root is completely ignored by both tools.

---

### Common wrong locations people use

```
❌  skills/my-skill/SKILL.md              ← plain folder, not hidden
❌  .skills/my-skill/SKILL.md             ← wrong prefix
❌  .cline/my-skill/SKILL.md              ← missing the "skills" subfolder
❌  src/skills/my-skill/SKILL.md          ← nested in src, not root-level
❌  my-skill/SKILL.md                     ← no parent skills folder at all
```

```
✅  .cline/skills/my-skill/SKILL.md       ← correct for Cline
✅  .claude/skills/my-skill/SKILL.md      ← correct for Claude Code
```

---

### The 5 reasons skills don't show up in `/` even with the right path

**1. The `.cline/skills/` (or `.claude/skills/`) directory was created after the session started**

Both tools set up a file watcher for the skills directory **at session startup**. If the directory didn't exist when the session began, the watcher is never attached — so new files in it are invisible until you restart.

```
Fix: Restart Cline / reload the VS Code window / restart your Claude Code session.
```

**2. The `name` field in SKILL.md frontmatter doesn't match the folder name**

The skill directory name and the `name` in the YAML frontmatter must be **identical**.

```
❌  Folder: .cline/skills/my-tool/
    Frontmatter: name: mytool        ← mismatch — tool vs my-tool

✅  Folder: .cline/skills/my-tool/
    Frontmatter: name: my-tool       ← exact match
```

**3. Skill name violates naming rules**

Skill names must be:
- All **lowercase**
- Only **letters, numbers, and hyphens** (`-`)
- **Max 64 characters**

```
❌  MyTool       ← uppercase
❌  my tool      ← space
❌  my_tool      ← underscore
✅  my-tool      ← correct
```

**4. The SKILL.md frontmatter is missing or malformed**

The file must start with a valid YAML frontmatter block — three dashes, `name:`, `description:`, three dashes. If the frontmatter is missing or the YAML is invalid, the skill is silently skipped.

```yaml
---
name: my-tool        ← must match folder name exactly
description: |
  What this skill does. Use when...   ← keep under 1024 chars
---

# Rest of SKILL.md...
```

**5. Skill conflicts with a global skill of the same name**

Global skills (`~/.cline/skills/` or `~/.claude/skills/`) take precedence over workspace skills on name conflicts. If you have a global `deploy` skill AND a workspace `deploy` skill, the global one wins and the workspace one is silently shadowed.

```
Fix: Rename the workspace skill to something unique,
     or remove the global one if the workspace version replaces it.
```

---

### Step-by-step fix checklist

```
1. Is the folder path correct?
   → Cline:       .cline/skills/<name>/SKILL.md
   → Claude Code: .claude/skills/<name>/SKILL.md
   (dot prefix, "skills" subfolder, skill folder, SKILL.md file)

2. Does the folder name match the `name:` in frontmatter exactly?
   → Both must be lowercase-hyphenated and identical

3. Did the .cline/skills/ directory exist before you started the session?
   → If you just created it: restart Cline / reload VS Code window

4. Is the frontmatter valid YAML?
   → Must start with --- and end with --- before the body

5. Is there a global skill with the same name shadowing this one?
   → Check ~/.cline/skills/ (Cline) or ~/.claude/skills/ (Claude Code)
```

---

### Verifying discovery worked

After fixing the path and restarting, type `/` in the chat input. Your skill should appear in the list with its description. If it still doesn't appear, check the tool's output/logs for "skill load error" messages — a malformed frontmatter will produce a silent skip, but some versions log a warning.

For Claude Code specifically, you can also ask directly: "What skills are available?" and it will list all discovered skills with their descriptions.

---

### Quick structure reference

```
your-project/
├── .cline/                      ← Cline workspace config
│   └── skills/
│       └── my-tool/             ← folder name = skill name
│           ├── SKILL.md         ← required, frontmatter name: my-tool
│           ├── scripts/
│           │   └── run.sh
│           └── docs/
│               └── reference.md
├── .claude/                     ← Claude Code workspace config
│   └── skills/
│       └── my-tool/
│           └── SKILL.md
└── src/
```

Both `.cline/skills/` and `.claude/skills/` can coexist in the same project — one for Cline, one for Claude Code.

