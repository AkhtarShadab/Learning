# Workflows — Structured Task Patterns in Cline

---

## 1. What Is This Exactly?

Workflows are not a built-in Cline feature with a special file format or magic folder name. They are a **practice** — a convention your team adopts to make AI-assisted development repeatable, predictable, and auditable.

A **workflow** is a documented, repeatable sequence of prompts, context-setting instructions, and expected outputs that you use every time you perform a specific type of task with Cline.

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

## 2. Mental Models

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

---

## 3. How to Integrate Workflows in Your Projects

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

Please follow all steps in the workflow exactly.
```

That's the entire prompt. The workflow template provides all the structure; you provide only the task-specific details.

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
```

---

## 4. Advanced Use Cases

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

### Full picture: how `.clinerules` and workflows work together

```
┌─────────────────────────────────────────────────────────────────┐
│                        .clinerules                              │
│  (always loaded — project rules, architecture, conventions)     │
│                                                                 │
│  "For standard tasks, use the workflow in docs/workflows/"      │
└───────────────────────────────┬─────────────────────────────────┘
                                │ references
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
│              Context: POST /api/v1/users/:id/promote, ..."     │
│                                                                 │
│  Cline: [executes each step in sequence]                       │
│         [asks for approval at each file write]                 │
│         [verifies against the checklist]                       │
└─────────────────────────────────────────────────────────────────┘
```

The two tools are complementary and additive:

| Tool | Scope | When it applies |
|---|---|---|
| `.clinerules` | Always, automatically | Every Cline session in the project |
| Workflows | On-demand, per task type | When you invoke a specific workflow |

`.clinerules` is the constitution. Workflows are the legislation — specific procedures for specific situations, grounded in the same constitutional rules.

Together, they give you AI-assisted development that is consistent, auditable, improvable over time, and transferable across your entire team.
