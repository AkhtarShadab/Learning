# Workflows — Structured Task Patterns in Cline

---

## 1. What Is This Exactly?

Workflows are not a built-in Cline feature with a special file format or magic folder name. They are a **practice** — a convention your team adopts to make AI-assisted development repeatable, predictable, and auditable.

A **workflow** is a documented, repeatable sequence of prompts, context-setting instructions, and expected outputs that you use every time you perform a specific type of task with Cline.

> **Key design principle from the official docs:**
> "Cline works best when it has the right context, not just more context."
>
> This principle applies directly to workflows: they exist to give Cline precisely the context it needs for a given task type — no more, no less. A good workflow template is a distillation of "what does Cline need to know to do this well?"

### The problem workflows solve

Ad-hoc prompting — typing whatever feels right each time — produces ad-hoc results. You might write a perfect prompt for "add a new API route" on Tuesday, get great output, and then write a completely different (worse) prompt for the same task on Thursday, miss a step, and introduce a bug. The knowledge of "how to prompt this well" lives only in your head, in that one conversation that will scroll off and be forgotten.

Workflows capture that knowledge in a reusable artifact.

### How workflows are typically stored

There is no single convention — different teams use what fits their tooling:

```
your-project/
├── .clinerules
├── src/
├── docs/
│   └── workflows/           ← option 1: inside docs
│       ├── new-api-route.md
│       ├── debug-test.md
│       └── db-migration.md
├── .cline/
│   └── workflows/           ← option 2: in a hidden .cline folder
│       ├── new-feature.md
│       └── refactor.md
└── workflows/               ← option 3: top-level (visible, explicit)
    └── ...
```

Any of these works. The key is consistency — pick a location, add it to `.clinerules` so Cline knows where to find them, and check it into git.

### Ad-hoc prompting vs. structured workflow prompting

| Dimension | Ad-hoc prompting | Workflow prompting |
|---|---|---|
| **Consistency** | Varies per session, per developer | Same steps, every time |
| **Quality floor** | As good as your memory | As good as your best prompt |
| **Transferability** | Lives in one person's head | Checked into git, shared by all |
| **Reviewability** | Hard to audit "how Cline did this" | You can review the workflow template |
| **Onboarding** | New devs figure it out themselves | New devs run the workflow |
| **Improvability** | Hard to systematically improve | Iterate the template, everyone benefits |

### Slash-command-style prompt templates

Some teams format workflows as slash-command templates that read like fill-in-the-blank forms:

```
/new-route
  method: POST
  path: /api/users/:id/promote
  auth: required (admin only)
  body: { role: string }
  effect: updates user.role in DB, sends email notification
```

You paste this into the Cline chat, fill in the blanks, and the rest of the workflow template provides the standing instructions for how to implement it.

---

## 2. Official Built-in Slash Commands

Cline ships with a set of built-in slash commands. These are first-class, official workflow primitives — not conventions you invent, but features Cline provides out of the box. Think of them as the "stdlib" of Cline workflows; your custom workflow templates build on top of them.

Type `/` in the Cline chat input to see and invoke any of these commands.

### The full built-in command set

| Command | What it does |
|---|---|
| `/newtask` | Packages essential context and decisions from the current conversation into a fresh task, for when the context window is nearly full |
| `/smol` | Condenses conversation history while maintaining key insights — cheaper than `/newtask`, good for mid-task context trimming |
| `/deep-planning` | Transforms Cline into a detailed architect: investigates the codebase, asks clarifying questions, generates a plan, creates tasks |
| `/newrule` | Establishes a preference or convention and saves it to `.clinerules` for all future sessions |
| `/explain-changes` | (VS Code only) AI explanation of git diffs — great for understanding what a PR or commit actually did |
| `/reportbug` | Gathers diagnostics and formats them for filing an issue against Cline |

### When to use each

**`/newtask` — use when context is nearly full**

The context window has a limit. When you're deep in a long session and Cline starts losing track of earlier decisions, `/newtask` is the right move. It doesn't just start a blank chat — it packages the essential information (decisions made, files changed, next steps) so the new task can continue without re-explaining everything.

```
You: /newtask
Cline: [summarizes what's been accomplished, open decisions, recommended next steps]
      [creates a new task with that summary as its starting context]
```

**`/smol` — use for mid-task context trimming**

Lighter than `/newtask`. If the conversation is getting long but you're not done with the current task, `/smol` compresses the history into a tighter summary without ending the session. Use it when you're in the middle of a workflow and want to reclaim context budget without losing your place.

**`/deep-planning` — use before complex multi-file work**

This is the most powerful command for structured development. When you have a non-trivial task (a new feature that touches multiple files, a refactor with architectural implications), `/deep-planning` causes Cline to:

1. Investigate the relevant parts of the codebase
2. Ask clarifying questions before assuming
3. Generate a detailed plan
4. Create tasks for each piece of the plan

This is the official equivalent of the "Plan mode → Act mode" workflow pattern (covered in section 3). Use `/deep-planning` before writing any code on complex tasks.

**`/newrule` — use when you discover a convention**

When you find yourself repeating the same instruction to Cline across sessions, that's a signal: this should be a rule, not a prompt. Use `/newrule` and Cline will capture the preference into `.clinerules` so it applies automatically going forward.

```
You: /newrule — always use `const` over `let` unless reassignment is necessary
Cline: [saves this to .clinerules]
```

This is how your `.clinerules` file gets smarter over time — not through manual editing alone, but through accumulated `/newrule` invocations as you work.

**`/explain-changes` — use for code review and understanding**

In VS Code, after a git diff, `/explain-changes` gives you a plain-language explanation of what changed and why. Useful for understanding a PR you're reviewing, or for writing a clear commit message for changes you made with Cline's help.

---

## 3. Mental Models

### Mental Model 1: Standard Operating Procedures (SOPs)

In any serious operation — a hospital, a restaurant kitchen, a flight crew — there are SOPs. An SOP is not a suggestion. It's the documented, tested, approved way to do a specific type of task. When a nurse hangs an IV drip, she follows the same checklist every time. Not because she's not competent, but because consistency is itself the safety property.

Workflows are SOPs for AI-assisted development. "When we add a new API route, we always: (1) check the API spec, (2) write the route handler, (3) add a Zod schema for validation, (4) write an integration test, (5) update the API spec document." That's the SOP. Follow it every time. The workflow file is where it's written down.

```
         ┌─────────────────────────────────────────┐
         │         Standard Workflow SOP           │
         │                                         │
         │  Step 1: Review API spec                │
         │  Step 2: Write route handler            │
         │  Step 3: Add Zod validation schema      │
         │  Step 4: Write integration test         │
         │  Step 5: Update API spec document       │
         │  Step 6: Verify no existing tests broke │
         └─────────────────────────────────────────┘
                            │
          Applied consistently across ALL instances:
                            │
         ┌──────────────────┼──────────────────────┐
         │                  │                      │
   [POST /users]    [GET /orders/:id]    [DELETE /sessions]
```

### Mental Model 2: The Recipe

A skilled baker doesn't guess the recipe for sourdough each time. They follow the same recipe — same flour ratio, same hydration, same fermentation time — and get the same reliable result. The recipe is the accumulated knowledge of what works. If they discover an improvement (longer autolyse makes for better crumb), they update the recipe, and every future bake benefits.

Workflows are recipes. Your "add a new database table" workflow is the accumulated knowledge of your team's best practice for that task. When it works well, you don't lose that knowledge — it's in the recipe file. When you find an improvement, you update the recipe.

### Mental Model 3: Git Workflow Applied to AI-Assisted Development

You already use a workflow for code collaboration. You probably don't ask "should we use a feature branch or just push to main?" every time a new task starts. It's settled: feature branch → PR → review → merge. That's the git workflow, and everyone on the team follows it automatically.

Workflows apply the same thinking to the prompting layer. For a given task type, the steps are settled. You don't redesign the approach each time from scratch. You follow the workflow:

```
Git workflow analog:

  feature branch → commit → PR → review → merge
        │              │         │           │
        ↓              ↓         ↓           ↓

Cline workflow:

  set context → cline implements → review output → apply/iterate
```

The value is the same: predictable process, reviewable steps, improvable over time, shared across the team.

### Mental Model 4: Plan & Act

Cline operates in two distinct modes, and treating them as a deliberate workflow pattern — not just a UI toggle — changes how you work:

- **Plan mode:** Cline explores, reads files, asks questions, and generates a plan. It does NOT modify files. Use this to think through a task before committing to an implementation.
- **Act mode:** Cline implements. It writes code, runs commands, modifies files.

The recommended workflow pattern is:

```
Plan mode                    Act mode
─────────────────────────    ─────────────────────────
Cline reads codebase         Cline writes code
Cline asks questions         Cline runs commands
You review the plan          You review diffs
You say "go ahead"      →    Cline implements
```

For complex multi-file tasks, always start in Plan mode (or use `/deep-planning`). Let Cline understand the landscape before touching anything. This prevents the most common Cline mistake: confidently implementing the wrong thing because it didn't read enough first.

---

## 4. Giving Cline the Right Context

### Working with Files: The @ Syntax

The official way to point Cline to specific files or directories is the `@` syntax. This is more precise than saying "look at the auth module" — it tells Cline exactly what to read.

**Reference a specific file:**
```
@/src/routes/users.ts
```

**Reference an entire directory (note the trailing slash):**
```
@/src/components/
```

**In practice — a well-formed workflow invocation with @ references:**
```
Following docs/workflows/new-api-route.md

Context:
- Read the existing routes: @/src/routes/
- Read the API spec: @/docs/API_SPEC.md
- Read the Zod schemas: @/src/schemas/

Task:
  Method: POST
  Path: /api/v1/users/:userId/promote
  Auth: admin-only
  Body: { role: "admin" | "moderator" }
```

### Three ways to add files to a Cline session

1. **`@` in the chat input** — type `@` followed by the path directly in your message
2. **The `+` button** — browse and select files from the file picker in the Cline UI
3. **Drag and drop** — drag files directly into the chat panel (hold Shift in VS Code to add without immediately sending)

### What file types Cline can work with

- Text files of any kind (source code, configs, Markdown, etc.)
- Images (for visual context — UI screenshots, diagrams)
- PDFs
- CSVs
- Excel files

### VS Code Context Menu Integration

In VS Code, right-clicking on any code selection or file opens Cline-specific options:

| Menu item | When to use it |
|---|---|
| **Add to Cline** | Start or continue a conversation with the selected code as context |
| **Fix with Cline** | Address a specific error — Cline sees the error and the code together |
| **Explain with Cline** | Understand complex or unfamiliar logic |
| **Improve with Cline** | Get refactoring suggestions for the selected code |

Terminal output and source control diffs also have right-click shortcuts. This means you can:
- Right-click a failing test's output in the terminal → "Fix with Cline"
- Right-click a diff in the Source Control panel → "/explain-changes"

These are the official "quick entry points" into Cline from within your editor, rather than switching to the Cline panel and typing from scratch.

---

## 5. How to Integrate Workflows in Your Projects

### Step 1: Create the workflows folder

```bash
mkdir -p docs/workflows
```

Add a reference in `.clinerules` so Cline always knows where to find them:

```markdown
## Workflows
For standard task types, follow the workflow templates in `docs/workflows/`.
Always check if a workflow exists before starting a complex task.
```

### Step 2: Anatomy of a workflow template

Every workflow file should answer these questions:

```
# Workflow: [Task Type Name]

## Goal
What is the end state when this workflow is done? (1-2 sentences)

## Required Context (Before Starting)
What does Cline need to know / read / be told before starting the task?

## Steps
1. Step one (what Cline should do)
2. Step two
3. ...

## Expected Output
What files will be created/modified? What should the output look like?

## Verification
How do you confirm the task was completed correctly?
(Commands to run, things to check manually, tests to pass)

## Common Mistakes to Avoid
List of things that go wrong if the workflow isn't followed precisely.
```

### Step 3: Example workflow library

---

#### Workflow 1: Add a new API route

```markdown
# Workflow: Add a New API Route

## Goal
Add a fully tested, validated, and documented API route to the Express/Next.js backend.

## Required Context
Before starting, provide:
- HTTP method: [GET / POST / PUT / PATCH / DELETE]
- Route path: [e.g. /api/v1/users/:id/settings]
- Auth requirement: [none / authenticated / admin-only]
- Request body/params shape: [describe or paste schema]
- Response shape: [describe what success looks like]
- Side effects: [DB writes, emails sent, events emitted, etc.]

Reference files for Cline:
- @/src/routes/          (existing route patterns)
- @/src/schemas/         (existing Zod schemas)
- @/docs/API_SPEC.md     (API spec to update)

## Steps

1. **Check the API spec first**
   Read `docs/API_SPEC.md` to confirm this route doesn't already exist
   and to understand the conventions for response shapes and error codes.

2. **Create the Zod validation schema**
   In `src/schemas/`, create or update the relevant domain schema file.
   Validate: request body, path params, and query params separately.

3. **Write the route handler**
   In `src/routes/[domain].ts`, add the route.
   - Validate input with the Zod schema first
   - Call the service layer — no direct DB calls in the route file
   - Use the standard response helpers from `src/lib/response.ts`
   - Add JSDoc comment above the function with the route signature

4. **Write the integration test**
   In `src/__tests__/routes/[domain].test.ts`:
   - Happy path: correct input → expected output + status code
   - Validation failure: missing/wrong fields → 400 with error details
   - Auth failure (if applicable): missing token → 401
   - Not found case (if applicable): invalid ID → 404

5. **Register the route**
   In `src/routes/index.ts`, add the new route. Check ordering matters
   for routes with overlapping patterns.

6. **Update the API spec**
   Add the new route to `docs/API_SPEC.md` with full request/response documentation.

7. **Verify**
   Run: `npm test -- --testPathPattern=routes/[domain]`
   Run: `npm run type-check`
   Confirm no existing tests broke.

## Expected Output
- New or updated file in `src/schemas/`
- Updated `src/routes/[domain].ts`
- New test file in `src/__tests__/routes/`
- Updated `src/routes/index.ts`
- Updated `docs/API_SPEC.md`

## Verification Checklist
- [ ] All new tests pass
- [ ] No existing tests fail
- [ ] TypeScript reports zero errors
- [ ] API spec is updated
- [ ] Route handles auth correctly (test the 401 case)

## Common Mistakes
- Putting DB calls directly in the route file (violates architecture boundary)
- Forgetting to register the route in index.ts
- Not updating the API spec (causes future confusion and spec drift)
- Writing the happy-path test only (the error cases are where bugs live)
```

---

#### Workflow 2: Debug a failing test

```markdown
# Workflow: Debug a Failing Test

## Goal
Identify the root cause of a failing test and fix it without masking the failure.

## Required Context
Provide:
- The test file path: [e.g. src/__tests__/billing/invoice.test.ts]
- The test name: [exact `it(...)` or `test(...)` description]
- The error output: [paste the full error, including stack trace]
- When it started failing: [after which commit / change?]

## Steps

1. **Reproduce the failure**
   Run the specific failing test in isolation:
   `npm test -- --testPathPattern=[test-file] --testNamePattern="[test name]"`
   Confirm it fails consistently before doing anything else.

2. **Read the test first, then the implementation**
   - What is the test actually asserting?
   - What does it mock, what does it leave real?
   - What is the function under test supposed to do?

3. **Check recent changes**
   Run `git log --oneline -10` and `git diff HEAD~5 -- [relevant-files]`
   to identify what changed near the time the test started failing.

4. **Form a hypothesis**
   Write out in one sentence: "I think this test is failing because ___"
   Only proceed to fix after the hypothesis is clear.

5. **Fix the root cause — not the symptom**
   - If the implementation is wrong: fix the implementation
   - If the test expectation is wrong (e.g. requirement changed): update the test and document why
   - If the test setup is wrong (stale mock, wrong fixture): fix the setup
   - NEVER skip or comment out the test as a "fix"

6. **Verify the fix**
   Run the single test: confirm it passes.
   Run the full test suite: confirm nothing else broke.

## Expected Output
- A code fix in the implementation file, OR
- An updated test with a comment explaining why the expectation changed
- Ideally: a brief git commit message that explains root cause, not just "fix test"

## Verification
- [ ] The specific failing test now passes
- [ ] The full test suite passes
- [ ] The fix addresses the root cause, not a symptom
- [ ] If a bug was found: is there a regression test for this specific case?

## Common Mistakes
- Changing the assertion to match wrong behavior (makes test pass, masks the bug)
- Fixing the mock without fixing the real implementation
- Fixing in isolation without running the full suite (fix breaks something else)
```

---

#### Workflow 3: Add a new database table with migration

```markdown
# Workflow: Add a New Database Table with Migration

## Goal
Add a new table to the database with a proper migration, updated ORM schema,
type-safe query functions, and seed data if applicable.

## Required Context
Provide:
- Table name: [e.g. subscription_plans]
- Columns: [name, type, nullable?, default?, index?]
- Relationships: [foreign keys to existing tables]
- Indexes needed: [beyond the primary key]
- Seed data needed? [yes/no — if yes, describe]

## Steps

1. **Review existing schema**
   Read `prisma/schema.prisma` (or your ORM's schema file) to understand
   current naming conventions and relationship patterns.

2. **Add the model to the schema**
   Follow the existing naming conventions exactly.
   Add all columns, relationships, and indexes.
   Double-check: is the new table soft-deletable? (add `deletedAt DateTime?`)

3. **Create the migration**
   `npx prisma migrate dev --name add_[table_name]`
   Review the generated SQL in `prisma/migrations/` before proceeding.
   Confirm the migration is additive (no destructive changes).

4. **Regenerate the Prisma client**
   `npx prisma generate`
   This updates the TypeScript types — required before any query code.

5. **Write the query functions**
   In `src/lib/db/[domain].ts`, add typed query functions:
   - `findById(id: string)`
   - `findMany(filters: ...)`
   - `create(data: ...)`
   - `update(id: string, data: ...)`
   - `softDelete(id: string)` (if applicable)

6. **Add seed data (if needed)**
   In `prisma/seed.ts`, add seed records. Run: `npx prisma db seed`
   Confirm the seed runs cleanly on a fresh DB.

7. **Write tests for the query functions**
   In `src/__tests__/db/[domain].test.ts`.
   Use the test DB (configured in `jest.config.ts` / `vitest.config.ts`).
   Each test should clean up its own data with `afterEach`.

8. **Update documentation**
   Add the new table to `docs/DB_DECISIONS.md` with:
   - Why this table exists
   - Key design decisions
   - Any non-obvious constraints

## Expected Output
- Updated `prisma/schema.prisma`
- New migration file in `prisma/migrations/`
- New or updated `src/lib/db/[domain].ts`
- New test file in `src/__tests__/db/`
- Updated `prisma/seed.ts` (if applicable)
- Updated `docs/DB_DECISIONS.md`

## Verification
- [ ] `npx prisma migrate dev` runs cleanly
- [ ] `npx prisma generate` runs cleanly  
- [ ] `npx prisma db seed` runs cleanly on a fresh DB
- [ ] All new query function tests pass
- [ ] Full test suite still passes

## Common Mistakes
- Writing query code before running `prisma generate` (TypeScript errors on the new model)
- Not documenting the design decision in DB_DECISIONS.md
- Missing a needed index (add `@@index([columnName])` if the column will be queried frequently)
- Not handling soft-delete in `findMany` queries (accidentally returning deleted records)
```

---

#### Workflow 4: Refactor a component

```markdown
# Workflow: Refactor a React Component

## Goal
Improve a component's structure, readability, or performance without
changing its external behavior (same props API, same rendered output).

## Required Context
Provide:
- Component path: [e.g. src/components/UserProfile.tsx]
- Reason for refactor: [too large / mixing concerns / performance / extracting reusable logic]
- Constraints: [props API must stay identical / must remain a client component / etc.]

## Steps

1. **Understand the current component before touching it**
   Read the component fully. Identify:
   - What it renders (the structure)
   - What state it manages
   - What side effects it has
   - What it receives as props

2. **Write a characterization test (if none exists)**
   Before refactoring, write a snapshot or behavioral test that captures
   the current output. This is your safety net.
   `npm test -- --testPathPattern=[component-name]`
   Confirm it passes before starting.

3. **Plan the refactor — state it explicitly**
   Write out: "I will extract ___ into a custom hook / sub-component / utility."
   Don't start the refactor until the plan is clear.

4. **Refactor incrementally**
   Make one change at a time. After each change:
   - Run TypeScript: `npm run type-check`
   - Run the component's tests
   If it breaks, revert that step — don't compound changes on a broken state.

5. **Verify behavioral equivalence**
   After refactoring, run the full test suite.
   If you have Storybook, check the component visually in all its variants.
   The external behavior must be identical.

6. **Clean up**
   Remove any dead code, unused imports, leftover comments.
   Final run: linter + type-check + tests.

## Expected Output
- Refactored component file (same public API)
- Possibly new sub-component files or a new custom hook file
- All tests green

## Verification
- [ ] Props API unchanged (no breaking changes to consumers)
- [ ] All existing tests pass
- [ ] TypeScript reports zero errors
- [ ] No linting errors
- [ ] Component behavior is visually identical (manual check or Storybook)
```

---

### Step 4: How to invoke a workflow

Invoking a workflow is simple: paste the template into the Cline chat, fill in the blanks in the "Required Context" section, and send. Cline will follow the steps.

**Example invocation (Add a new API route):**

```
Following the workflow at docs/workflows/new-api-route.md:

Goal: Add a route to promote a user to admin.

Context:
- Method: POST
- Path: /api/v1/users/:userId/promote
- Auth: admin-only (require isAdmin: true on the requesting user's token)
- Body: { role: "admin" | "moderator" }
- Response: { success: true, user: { id, email, role } }
- Side effects: update user.role in DB, send "role changed" email to the promoted user

Reference files:
- @/src/routes/users.ts
- @/src/schemas/user.ts
- @/docs/API_SPEC.md

Please follow all steps in the workflow exactly.
```

That's the entire prompt. The workflow template provides all the structure; you provide only the task-specific details. The `@` references ensure Cline reads the right files before writing anything.

### Step 5: Reference workflows from `.clinerules`

Add a table to your `.clinerules` so Cline always knows which workflow to follow for which task type:

```markdown
## Workflows

For standard tasks, always use the workflow template in `docs/workflows/`:

| Task type | Workflow file |
|---|---|
| Add a new API route | `docs/workflows/new-api-route.md` |
| Debug a failing test | `docs/workflows/debug-test.md` |
| Add a DB table + migration | `docs/workflows/db-migration.md` |
| Refactor a component | `docs/workflows/refactor-component.md` |
| Code review a PR | `docs/workflows/code-review.md` |
| Add a new feature end-to-end | `docs/workflows/new-feature.md` |

Before starting any of these task types, read the relevant workflow first.
Use /deep-planning for any task that touches more than 3 files.
```

---

## 6. Advanced Use Cases

### Chained workflows

Some tasks are multi-stage: the output of one workflow becomes the input of the next. You can make this explicit:

```markdown
# Workflow Chain: New Feature End-to-End

This chain covers taking a feature from ticket to production.

Stage 1 → run: docs/workflows/new-feature-design.md
  Output: agreed technical design document
  ↓
Stage 2 → run: docs/workflows/db-migration.md  (if schema changes needed)
  Output: migration file + schema update
  ↓
Stage 3 → run: docs/workflows/new-api-route.md  (for each new endpoint)
  Output: route handler + tests + spec update
  ↓
Stage 4 → run: docs/workflows/new-ui-component.md  (for frontend work)
  Output: component + Storybook story + tests
  ↓
Stage 5 → run: docs/workflows/code-review.md
  Output: review checklist completed, issues noted
  ↓
Stage 6 → run: docs/workflows/deploy-checklist.md
  Output: deployment confirmed, monitoring checked
```

You can run these as separate Cline sessions, or as a single session where you invoke each stage in sequence. The key is that each stage has a defined "done" state (its Output) before the next stage starts.

For complex chains like this, start with `/deep-planning` to let Cline map out which stages apply and in what order, before committing to any implementation.

### Conditional workflows

Real work branches. Make the branching logic explicit in your workflow:

```markdown
# Workflow: Test Run and Remediation

## Step 1: Run the test suite
`npm test`

## Decision point: Did all tests pass?

### Branch A: Tests passed
→ Proceed to docs/workflows/code-review.md
→ Then proceed to docs/workflows/deploy-checklist.md

### Branch B: Tests failed
→ Run docs/workflows/debug-test.md for EACH failing test
→ After all fixes, return to Step 1 of this workflow
→ Do NOT proceed to review until the test suite is fully green

## Note
If you cannot fix a failing test within 2 debugging cycles, stop and
escalate by creating a GitHub issue with the error output and your hypothesis.
Do not merge with known failing tests.
```

### Workflow versioning

Workflows improve over time. Track that improvement by versioning them:

```markdown
# Workflow: Add a New API Route
Version: 2.3
Last updated: 2024-09-15
Changed from 2.2: Added Step 6 (update API spec) — this was being skipped,
  causing spec drift that caused two bugs in September.
Changed from 2.1: Added auth failure test case to Step 4 — found via audit
  that 40% of routes were missing 401 test coverage.

## Changelog
- v2.3 (2024-09-15): Added mandatory spec update step
- v2.2 (2024-08-01): Added auth failure test requirement
- v2.1 (2024-06-12): Added Zod schema step (replaced manual validation)
- v2.0 (2024-04-01): Major rewrite for App Router migration
- v1.0 (2023-11-01): Initial workflow
```

This makes it easy to see what changed and why, and it gives you a history of your team's accumulated learning about how to do this task well.

### Agent Teams (CLI/SDK feature)

For large, parallelizable tasks, Cline supports agent teams: a coordinator agent that manages specialist agents working in parallel. This is an advanced workflow pattern for complex projects.

```bash
cline --team-name auth-sprint "Plan and implement user auth with tests"
```

What this does:
- Spins up one **coordinator agent** that owns the plan and task board
- Spawns **specialist agents** for scoped subtasks (e.g. "implement password hashing", "write auth middleware", "write integration tests")
- Maintains **persistent state** at `~/.cline/data/teams/[team-name]/` — the team can be resumed across sessions
- Provides a **task board** with current tasks and status for each agent

**When agent teams make sense:**
- The feature requires multiple independent pieces that can be worked in parallel
- The work would fill a single context window many times over
- You want to see progress on a task board, not just in a linear conversation

**Current availability:** Agent teams work via the Cline SDK and CLI. They are not yet available in the VS Code extension.

**Resuming a team across sessions:**
```bash
# Pick up where you left off
cline --team-name auth-sprint --resume
```

Contrast this with `/newtask` and `/smol`, which are single-agent context management tools. Agent teams are for true parallelism, not just context trimming.

### Team-shared workflow libraries in git

Because workflows are just Markdown files, they are:

- **Versionable:** `git log docs/workflows/` shows the full history of how your SOPs evolved.
- **Diffable:** `git diff` on a workflow file clearly shows what changed when you update a process.
- **PR-reviewable:** When someone proposes improving a workflow, submit it as a PR. The team reviews the process change the same way they review code changes.
- **Portable:** Clone the repo anywhere, and the workflows are there.

Suggested git practices for workflows:

```bash
# Updating a workflow after learning from a bug
git add docs/workflows/db-migration.md
git commit -m "docs(workflows): add step to verify backwards-compat in DB migrations

After the Oct 12 incident where a DROP COLUMN caused a downtime window,
adding an explicit backwards-compatibility check to the migration workflow."
```

The commit message for a workflow change should explain the real-world event that prompted it — this creates an audit trail connecting SOPs to incidents.

### Workflows for onboarding new developers

New developers face the same challenge every time: understanding a codebase they didn't build, learning conventions that exist for reasons they don't know yet, and getting productive without breaking things. Workflows solve this better than any README.

```markdown
# Workflow: Understand This Codebase (Onboarding)

## Goal
Get a new developer oriented in the codebase and confident to make their
first contribution within a single Cline session.

## Steps

1. **Read the foundations**
   Ask Cline to summarize:
   - `.clinerules` (project rules)
   - `docs/ARCHITECTURE.md` (system design)
   - `docs/DB_DECISIONS.md` (data model rationale)

2. **Trace a request end-to-end**
   Pick any existing API route. Ask Cline to walk through what happens from
   HTTP request to database and back, naming every file involved.

3. **Read all workflow files**
   In `docs/workflows/`. Ask Cline to explain what each one is for.

4. **Make a tiny, real change**
   Find a `docs/` file with a typo or outdated info. Fix it. Submit a PR.
   This validates that your local setup works and you understand the git workflow.

5. **Shadow a real task**
   Pick an existing GitHub issue labeled `good-first-issue`.
   Run the appropriate workflow for that task type.
   Complete the task with Cline's help, following the workflow exactly.

## Success criteria
- You can explain the system architecture in 2 minutes
- You know where every type of code lives (routes, services, tests, migrations)
- You've submitted at least one PR that passed CI and got reviewed
```

### Automated workflow triggers via hooks

For teams using tools that support pre/post hooks (Husky for git hooks, custom CI steps, Makefiles), workflows can be partially automated:

**Git hook example (`pre-commit`):**
```bash
#!/bin/bash
# .husky/pre-commit
echo "Running pre-commit workflow checks..."
npx tsc --noEmit              # type check
npx eslint src/ --max-warnings 0  # lint
npm test -- --passWithNoTests     # tests

# If any fail, the commit is blocked.
# This enforces the verification step of all workflows automatically.
```

**Makefile workflow shortcuts:**
```makefile
# Makefile
.PHONY: new-route debug-test db-migration

new-route:
	@echo "Follow: docs/workflows/new-api-route.md"
	@echo "Context needed: method, path, auth, body shape, response shape, side effects"
	@open docs/workflows/new-api-route.md  # or 'xdg-open' on Linux

debug-test:
	@echo "Follow: docs/workflows/debug-test.md"
	@echo "Context needed: test file, test name, error output, when it started failing"
	@open docs/workflows/debug-test.md

# Run the full workflow verification suite
verify:
	npm run type-check
	npm run lint
	npm test
	@echo "All workflow verification steps passed."
```

Running `make new-route` opens the workflow and reminds you what context to gather before starting the Cline session. It's a small thing, but it reduces the friction of reaching for the workflow instead of prompting ad-hoc.

---

### Full picture: how `.clinerules`, slash commands, and workflows work together

```
┌─────────────────────────────────────────────────────────────────┐
│                        .clinerules                              │
│  (always loaded — project rules, architecture, conventions)     │
│                                                                 │
│  "For standard tasks, use the workflow in docs/workflows/"      │
│  "Use /deep-planning for tasks touching >3 files"              │
└───────────────────────────────┬─────────────────────────────────┘
                                │ references
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│               Built-in Slash Commands                           │
│                                                                 │
│  /deep-planning  ← architect mode, generates plan + tasks      │
│  /newrule        ← capture a convention into .clinerules       │
│  /newtask        ← continue across context boundaries          │
│  /smol           ← compress history mid-task                   │
│  /explain-changes← understand a diff                           │
└───────────────────────────────┬─────────────────────────────────┘
                                │ used within
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                   docs/workflows/                               │
│                                                                 │
│  new-api-route.md      ← step-by-step for adding routes        │
│  debug-test.md         ← step-by-step for debugging tests      │
│  db-migration.md       ← step-by-step for DB changes           │
│  refactor-component.md ← step-by-step for refactors            │
│  ...                                                            │
└───────────────────────────────┬─────────────────────────────────┘
                                │ invoked per-task by developer
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Cline task session                           │
│                                                                 │
│  Developer: "Following new-api-route.md workflow.              │
│              @/src/routes/users.ts @/docs/API_SPEC.md          │
│              Context: POST /api/v1/users/:id/promote, ..."     │
│                                                                 │
│  Cline: [executes each step in sequence]                       │
│         [asks for approval at each file write]                 │
│         [verifies against the checklist]                       │
└─────────────────────────────────────────────────────────────────┘
```

The three layers are complementary and additive:

| Layer | Scope | When it applies |
|---|---|---|
| `.clinerules` | Always, automatically | Every Cline session in the project |
| Built-in slash commands | On-demand, ad-hoc | When a specific capability is needed mid-session |
| Custom workflows | On-demand, per task type | When you invoke a specific workflow template |

`.clinerules` is the constitution. Slash commands are the standard library. Workflows are the legislation — specific procedures for specific situations, grounded in the same constitutional rules.

Together, they give you AI-assisted development that is consistent, auditable, improvable over time, and transferable across your entire team.

---

## DSA Connections

### Directed Acyclic Graph — Workflow Dependency Chains and Stage Ordering

A **directed acyclic graph** (DAG) is a graph with directed edges and no cycles, meaning you can always find a linear ordering of nodes such that every edge goes from earlier to later — this ordering is called a topological sort. The "Chained workflows" pattern in this document is a six-node DAG: `new-feature-design → db-migration → new-api-route → new-ui-component → code-review → deploy-checklist`, where each stage's output is a prerequisite for the next stage's input. The acyclic constraint is critical — if `deploy-checklist` required changes to `new-feature-design`, you would have a cycle and no valid execution order, which is exactly the kind of deadlock that ad-hoc prompting can accidentally create but a formalized DAG prevents. The Agent Teams feature extends this to parallel DAGs: the coordinator agent maintains a task board where independent subtasks (like "implement password hashing" and "write integration tests") are sibling nodes with no edge between them, enabling parallel execution, while dependent tasks have explicit edges enforcing sequential ordering. Build systems like Make, Gradle, and Bazel use this identical DAG + topological sort pattern to determine compilation order.

### State Machine — Workflow Decision Points and Conditional Branching

A **finite state machine** (FSM) models a system as a set of states connected by transitions that fire when specific conditions are met. The "Conditional workflows" section demonstrates an explicit FSM: after running `npm test`, the system transitions to one of two states — Branch A (`tests passed → code-review → deploy`) or Branch B (`tests failed → debug-test → loop back to test run`). Each state has a well-defined entry condition, a set of actions to perform, and explicit exit transitions. The escalation rule ("if you cannot fix within 2 debugging cycles, create a GitHub issue") adds a third terminal state that prevents the FSM from looping indefinitely — a bounded retry pattern that guarantees termination. The Plan/Act cycle within each workflow step is itself a nested two-state FSM (explore safely, then implement), making the overall workflow a hierarchical state machine where each macro-state (workflow stage) contains micro-states (plan/act within that stage). FSMs are the formal foundation for workflow engines in CI/CD systems, order fulfillment platforms, and approval pipelines for exactly this reason: every possible state and transition is explicitly documented, auditable, and deterministic.

### Topological Sort — Execution Ordering Across Dependent Workflow Steps

**Topological sort** produces a linear ordering of a DAG's nodes such that for every directed edge (u, v), node u appears before v in the ordering — it answers "in what order must I execute these dependent steps?" Each workflow template in `docs/workflows/` defines an implicit topological ordering: in the "Add a New API Route" workflow, "Create the Zod validation schema" (Step 2) must precede "Write the route handler" (Step 3) because the handler imports the schema, and "Register the route" (Step 5) must follow the handler's creation. Violating this order — say, writing the route handler before the schema exists — produces TypeScript compilation errors, which is exactly the kind of failure that topological sort prevents by construction. The full chained workflow (`design → migration → routes → UI → review → deploy`) is a six-step topological order where running any step before its predecessor produces an incomplete or broken artifact. This is why the document emphasizes "each stage has a defined 'done' state before the next stage starts" — that done-state is the topological sort's guarantee that all prerequisites are satisfied before a node executes.

### Composite Pattern — Nested and Chained Workflow Composition

The **composite pattern** lets you treat individual objects and compositions of objects through the same interface, enabling tree-structured hierarchies where a container is used the same way as a leaf. In Cline's workflow system, a single workflow template (like `new-api-route.md`) is a leaf — it is invoked as a unit with a defined input and output. A chained workflow (like "New Feature End-to-End") is a composite that contains six leaf workflows as children, but is itself invoked with the same interface: "here is the context, execute the steps." The composite can recursively contain other composites — a `new-api-route` workflow might internally invoke a `debug-test` sub-workflow if tests fail during its verification step, creating a tree of arbitrary depth. The `.clinerules` reference table treats every workflow identically regardless of whether it is a leaf or composite ("Task type → Workflow file"), which is the composite pattern's signature: the client does not need to know whether it is invoking a simple workflow or one that fans out into six sub-workflows internally. This composability is what makes the workflow system scalable — new workflows are composed from existing ones without rewriting the orchestration layer.
