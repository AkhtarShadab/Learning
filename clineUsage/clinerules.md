# `.clinerules` — Cline Project Rules

---

## 1. What Is This Exactly?

`.clinerules` is Cline's persistent instruction system — a way to give Cline standing context that applies automatically to every task in your project or globally across all projects. Every time you start a task with Cline, it reads your rules and treats them as a permanent briefing, prepended to every interaction.

### Primary format: the `.clinerules/` folder

The preferred format as of current Cline versions is a **folder** at the project root, not a single file. Each rule lives in its own Markdown file inside the folder:

```
your-project/
├── .clinerules/               ← folder (primary format)
│   ├── coding-standards.md
│   ├── architecture.md
│   ├── testing.md
│   └── component-rules.md     ← can be path-conditional (see below)
├── src/
├── package.json
└── README.md
```

You can still use a single `.clinerules` file (no folder, no extension) — this is the legacy format and continues to work. The folder format is preferred because it lets you organize rules by concern and apply them conditionally per file path.

### Global rules

Rules that apply across all your projects live at:

- **macOS / Linux / WSL:** `~/Documents/Cline/Rules/`
- **Windows:** `Documents\Cline\Rules\`

Global rules are loaded alongside workspace rules. When the same rule exists in both places, **workspace rules take precedence** on conflicts. Think of global rules as your personal preferences ("I prefer concise answers", "always use ES modules") and workspace rules as the project's own rulebook that travels with the code.

### Other rule formats Cline auto-detects

Cline recognizes rules from several formats automatically — you don't need to convert them:

- `.cursorrules`
- `.windsurfrules`
- `AGENTS.md`

### Managing rules from the Cline panel

Access your rules through the **scale icon** in the Cline panel. From there you can:

- Create new rule files
- Edit existing rules
- **Toggle rules on/off individually** — useful for temporarily disabling a rule without deleting it

### Creating rules via slash command

Type `/newrule` in the Cline chat to create a new rule from a prompt. Your preferences from this command are saved automatically to `.clinerules`.

### Layer summary

| Layer | Location | Scope | Who sets it |
|---|---|---|---|
| **Global Rules** | `~/Documents/Cline/Rules/` | Every project on your machine | You, personally |
| **Workspace Rules** | `.clinerules/` or `.clinerules` at project root | Only this project | You, or your team (checked into git) |

Both layers apply simultaneously. Workspace rules win on conflicts.

---

## 2. Mental Models

Understanding `.clinerules` through analogy makes it stick.

### Mental Model 1: The Constitution

A constitution is the supreme law of a country. Individual laws come and go, presidents give different speeches, but the constitution underlies all of it. You don't vote on it every session — it just *is*.

`.clinerules` is the constitution of your project. No matter what prompt you send Cline, no matter how you phrase a request, the rules in `.clinerules` are always in effect. "Never use `any` in TypeScript" is constitutional law in your project. Cline doesn't need you to remind it every time.

```
                    ┌─────────────────────────────┐
                    │       .clinerules/           │
                    │   (always in force)          │
                    └────────────┬────────────────┘
                                 │ underlies
              ┌──────────────────┼──────────────────┐
              │                  │                  │
    ┌─────────▼──────┐  ┌────────▼───────┐  ┌──────▼──────────┐
    │  Task: Add     │  │  Task: Fix     │  │  Task: Write    │
    │  new feature   │  │  bug #42       │  │  tests for X    │
    └────────────────┘  └────────────────┘  └─────────────────┘
```

### Mental Model 2: The Pilot's Pre-Flight Checklist

Before every commercial flight, pilots run through the exact same checklist — fuel levels, instrument checks, flap settings. It doesn't matter that the captain flew 8000 hours; the checklist runs every time. Consistency is the safety property.

`.clinerules` is Cline's pre-flight checklist. "Check that DB migrations are backwards compatible before any schema change." "Don't import from `../../../` — use path aliases." These checks run on every task, every time, because they're in the file — not because you remembered to say them.

### Mental Model 3: The Printed Onboarding Doc

Imagine you have a brilliant new developer joining your team. You could:

- **Option A:** Tell them the rules verbally every day. "Oh by the way, we don't call the DB directly from React components. Also, our tests live in `__tests__` next to the source, not in a top-level tests/ folder. And never commit `.env` files..."
- **Option B:** Hand them a printed document on day one. They read it once, refer back to it when in doubt, and the whole team benefits from the same baseline.

`.clinerules` is that printed document. You write the rules down once, and every new session — whether that's you, your teammate, or Cline — starts with the same baseline. The AI equivalent of "let me orient you before we start."

---

## 3. Conditional Rules (Path-Scoped Rules)

One of the most powerful features of the folder format is **conditional rules** — rules that only activate when Cline is working on specific file paths. You define which paths trigger a rule using YAML frontmatter at the top of the rule file.

```yaml
---
paths:
  - "src/components/**"
  - "*.test.ts"
---

# Component and Test Rules

- Always use named exports for components
- Co-locate tests next to source files
- Use React Testing Library, not Enzyme
- Every component must have a `data-testid` attribute for e2e tests
```

When Cline works on a file that matches one of the glob patterns, this rule loads. When it's working on files outside those paths, the rule is skipped entirely.

**Why this matters:** Context window space is finite. A rule about React component conventions is irrelevant when Cline is editing a database migration. Conditional rules prevent context bloat — irrelevant rules don't consume tokens.

### Common path-scoping patterns

```yaml
---
paths:
  - "src/components/**"       # All component files
---
# UI component rules...
```

```yaml
---
paths:
  - "*.test.ts"
  - "*.spec.ts"
  - "__tests__/**"
---
# Testing rules...
```

```yaml
---
paths:
  - "src/api/**"
  - "src/routes/**"
---
# API endpoint rules...
```

```yaml
---
paths:
  - "prisma/**"
  - "src/lib/db/**"
---
# Database rules...
```

Rules without a `paths` frontmatter load unconditionally for every task — use these for project-wide standards that always apply.

---

## 4. How to Integrate It in Your Projects

### Step 1: Create the folder

```bash
mkdir .clinerules
```

Add it to version control so every developer gets the same Cline behavior:

```bash
git add .clinerules/
git commit -m "chore: add .clinerules for Cline project context"
```

Do NOT add it to `.gitignore` unless you have personal overrides you want to keep private.

### Step 2: Organize rules by concern

Rather than one large file, split rules into focused files — each covering a single concern:

```
.clinerules/
├── stack.md             ← tech stack snapshot (always loaded)
├── code-style.md        ← formatting, naming, imports (always loaded)
├── architecture.md      ← layering rules, boundaries (always loaded)
├── components.md        ← UI rules (paths: src/components/**)
├── testing.md           ← test rules (paths: *.test.ts, *.spec.ts)
├── database.md          ← DB/migration rules (paths: prisma/**)
└── lessons-learned.md   ← encoded bug history (always loaded)
```

### Step 3: Sections to include (in always-loaded rules)

| Section | Purpose |
|---|---|
| **Tech stack snapshot** | What's in the project so Cline doesn't guess |
| **Code style rules** | Formatter settings, naming conventions, import order |
| **Forbidden patterns** | Anti-patterns you've explicitly banned |
| **Testing commands** | How to run tests, what coverage threshold is required |
| **File structure conventions** | Where things live, what goes where |
| **Common gotchas** | Things that bit you before — encode the lesson |
| **Architecture boundaries** | Which layers may call which |
| **References to other docs** | "Read X before changing Y" |

### Step 4: Real-world examples

---

#### Example 1: Next.js + Prisma + TypeScript project

`.clinerules/stack.md` (always loaded):

```markdown
# Stack

- Next.js 14 (App Router, not Pages Router)
- TypeScript 5.x — strict mode is ON
- Prisma 5 + PostgreSQL 15
- Tailwind CSS + shadcn/ui
- Vitest for unit tests, Playwright for e2e
```

`.clinerules/code-style.md` (always loaded):

```markdown
# Code Style

- Use named exports everywhere — no default exports except for Next.js page files
- Path aliases: use `@/` for src root, never use relative `../../../` paths
- All async server components must use `async/await` — no `.then()` chains
- Tailwind: use the `cn()` utility (from `@/lib/utils`) for conditional classes, never string interpolation
- `any` is banned. If you genuinely need it: `// eslint-disable-next-line @typescript-eslint/no-explicit-any — reason`
- All Prisma query results must go through a Zod schema before returning from a Server Action or API route
- Prefer `type` over `interface` for data shapes; use `interface` only for extension/augmentation
```

`.clinerules/architecture.md` (always loaded):

```markdown
# Architecture Boundaries

- Server Actions live in `src/actions/` — one file per domain (e.g. `users.ts`, `billing.ts`)
- Never call Prisma directly from a React component — all DB access through `src/lib/db/` query functions
- `src/lib/` is for pure logic — no Next.js-specific imports (no `next/headers`, no `next/navigation`)
- Email sending lives exclusively in `src/lib/email/` — nowhere else

## Forbidden Patterns

- Do NOT use `useEffect` to fetch data — use React Server Components or SWR/React Query
- Do NOT write raw SQL strings — use Prisma query builder only
- Do NOT store secrets in `src/` — use `.env.local`, accessed via `src/lib/env.ts`
- Do NOT use `console.log` in production code — use the logger at `src/lib/logger.ts`
```

`.clinerules/components.md` (path-conditional):

```yaml
---
paths:
  - "src/components/**"
---

# Component Rules

- Every component file exports exactly one component (named export, matches filename)
- Always add a `data-testid` attribute for testability
- Use shadcn/ui components from `src/components/ui/` — do NOT edit them manually
- Use the `cn()` utility for conditional class merging, never string interpolation
- Client components must have `'use client'` as the first line
```

`.clinerules/testing.md` (path-conditional):

```yaml
---
paths:
  - "*.test.ts"
  - "*.spec.ts"
  - "*.test.tsx"
  - "*.spec.tsx"
  - "e2e/**"
---

# Testing Rules

- Run unit tests: `pnpm test`
- Run e2e tests: `pnpm test:e2e` (requires local dev server on port 3000)
- Coverage threshold: 80% on `src/lib/` — CI fails below this
- Test files live next to source files: `foo.ts` → `foo.test.ts`
- Do NOT rely on test order — each test must set up its own data
```

`.clinerules/database.md` (path-conditional):

```yaml
---
paths:
  - "prisma/**"
  - "src/lib/db/**"
---

# Database Rules

- All schema changes need a migration: `npx prisma migrate dev --name <descriptive-name>`
- Migrations must be backwards compatible (no dropping columns without a multi-step process)
- After any schema change, regenerate the client: `npx prisma generate`
- Seed file is at `prisma/seed.ts` — run with `npx prisma db seed`
- The Prisma client is a singleton — import from `src/lib/prisma.ts`, never `new PrismaClient()`
```

---

#### Example 2: Python ML project (single-file format)

```markdown
# Project Rules — ChurnPredictor

## Stack
- Python 3.11
- scikit-learn, pandas, numpy, matplotlib
- FastAPI for the serving layer
- pytest for testing
- Poetry for dependency management

## Code Style
- Follow PEP 8 strictly — use `ruff` for linting (`poetry run ruff check .`)
- Type hints are required on all function signatures — use `from __future__ import annotations`
- Docstrings: Google style. Every public function needs Args and Returns sections.
- Max line length: 100 characters (configured in `pyproject.toml`)

## Project Structure
- `src/churn/data/`     — data loading and preprocessing only
- `src/churn/features/` — feature engineering pipelines
- `src/churn/models/`   — model training, evaluation, serialization
- `src/churn/api/`      — FastAPI routes and Pydantic schemas
- `notebooks/`          — exploration only, never imported by src/

## Forbidden Patterns
- Never hardcode file paths — use `pathlib.Path` and constants from `src/churn/config.py`
- Never fit a transformer on the test set — always fit on train, transform on both
- No bare `except:` clauses — always specify the exception type

## Testing
- Run: `poetry run pytest`
- All feature transformers must have a unit test that checks output shape and dtype
- Model tests use a small synthetic dataset (< 100 rows) — do not commit large test datasets
```

---

### Tips for writing effective rules

1. **Be specific, not generic.** "Write clean code" is useless. "Do not call `db.query()` outside of `src/lib/db/` modules" is actionable.

2. **Include reasoning.** Rules with "why" are better than rules without. Cline can make better judgment calls near a boundary when it understands intent. "No `useEffect` for data fetching — use RSC instead (reason: Next.js caches RSC responses automatically)" is more useful than just "No `useEffect` for data fetching."

3. **Reference code examples within rules.** Show the bad pattern and the good pattern side-by-side. Cline reads literally — concrete examples eliminate ambiguity.

4. **Keep each file focused on a single concern.** A rule file about testing should not also contain deployment instructions. One concern per file makes toggling and conditional loading work cleanly.

5. **Keep files concise — under 5K tokens per file.** A massive rules file eats into every context window. If rules for a domain are extensive, split them and use path-conditioning so only relevant ones load.

6. **Maintain current information — stale rules mislead the model.** Migrated from Pages Router to App Router? Remove old Pages-specific rules. Stale rules are worse than no rules — they actively mislead Cline.

7. **Update when you discover a new gotcha.** Just had a nasty bug? Add it to the lessons-learned file that day. Encode the lesson while the pain is fresh.

8. **Write for the AI, not for a human reader.** Humans skim and infer. Cline reads literally. Be explicit: "Use the `cn()` utility for class merging" is better than "follow our class merging conventions."

---

## 5. Advanced Use Cases

### Enforcing architectural boundaries

One of the highest-value uses of `.clinerules` is encoding your architecture's layering rules — the kind that take months to learn by reading the codebase.

```markdown
## Architecture — Layering Rules

The application follows a strict layered architecture:

┌─────────────────────────────────────┐
│          React Components           │  (UI only — no business logic)
├─────────────────────────────────────┤
│          Custom Hooks               │  (state + side effects)
├─────────────────────────────────────┤
│          Service Layer (lib/)       │  (business logic, pure functions)
├─────────────────────────────────────┤
│          Data Access Layer (db/)    │  (all DB/API calls live here)
└─────────────────────────────────────┘

Rules:
- Components → may call hooks and service functions. May NOT import from db/ directly.
- Hooks → may call service functions. May NOT import from db/ directly.
- Service layer → may call data access layer. Must be free of React imports.
- Data access layer → may call external APIs and DB. No business logic here.
```

### Preventing known anti-patterns

Document what you've banned and why. The "why" helps Cline understand the intent when it needs to make judgment calls near the boundary:

```markdown
## Banned Patterns

### No direct state mutation
❌ state.items.push(newItem)
✅ setState(prev => ({ ...prev, items: [...prev.items, newItem] }))
Reason: Causes subtle React re-render bugs that are hard to trace.

### No synchronous localStorage access in render
❌ const theme = localStorage.getItem('theme')  // in component body
✅ Use the `useLocalStorage` hook from `src/hooks/useLocalStorage.ts`
Reason: Causes SSR hydration mismatches in Next.js.

### No floating Promises
❌ someAsyncFn()  // not awaited, no .catch()
✅ await someAsyncFn()  or  someAsyncFn().catch(handleError)
Reason: Silent failures that surface as weird UI states.
```

### Multiple environment rules

```markdown
## Environment Notes

### Development
- Use `docker-compose up` to start local services (Postgres, Redis, Mailhog)
- Local mail is caught by Mailhog at http://localhost:8025 — do not use real email addresses in dev
- Feature flags are controlled by `NEXT_PUBLIC_FLAGS` env var — see `.env.example`

### Production
- Never log PII in production — the logger strips it in dev, but be explicit
- Rate limits are enforced at the infrastructure level — do not add app-level rate limiting that conflicts
- The production DB runs on read replicas for SELECT — write queries must go through the primary

### CI
- Tests run against a fresh Postgres instance seeded from `prisma/seed.ts`
- Do not rely on test order — each test must set up its own data
```

### Linking to other docs

```markdown
## Before You Touch These Areas, Read First

| Area | Required reading |
|---|---|
| Any API route change | `docs/API_SPEC.md` |
| Payment / billing code | `docs/BILLING_FLOWS.md` |
| Authentication flows | `docs/AUTH_ARCHITECTURE.md` |
| Database schema | `docs/DB_DECISIONS.md` — explains why tables are structured as they are |
| Email templates | `docs/EMAIL_SYSTEM.md` |
```

### Team conventions for multi-developer projects

`.clinerules` becomes the single source of truth for what every developer (and every Cline session) should know about your team's conventions:

```markdown
## Team Conventions

### PR Review
- All PRs need at least one approval from a team member (not the author)
- Reviewers check for: correctness, test coverage, adherence to this document
- Use "Request Changes" if any rule in this file is violated

### Commit Messages
Format: `type(scope): short description`
Types: feat, fix, chore, docs, refactor, test, perf
Example: `fix(auth): handle expired JWT refresh token correctly`

### Branching
- Main branch: `main` (protected, no direct push)
- Feature branches: `feat/short-description`
- Bug fixes: `fix/ticket-number-description`
- Never commit directly to `main`

### Code Ownership
- `src/billing/` — owned by @alice — ping her for reviews
- `src/auth/` — owned by @bob — security-sensitive, mandatory review
- `infra/` — owned by @ops-team — do not modify without a ticket
```

### Encoding lessons from past bugs

The most underused power of `.clinerules` is treating it as a living bug log — a place where you encode the lesson every time something breaks:

```markdown
## Lessons Learned (encode once, never repeat)

### 2024-03-15: Race condition in cart updates
SYMPTOM: Users reported double-charges on fast clicks.
ROOT CAUSE: Two concurrent cart update requests both read stale state before either committed.
RULE: All cart modification endpoints must use a database transaction with a row-level lock:
  `SELECT ... FOR UPDATE` before any cart read-modify-write cycle.

### 2024-05-02: Prisma connection pool exhaustion in serverless
SYMPTOM: 503 errors under moderate load in production.
ROOT CAUSE: Each serverless function instantiated its own PrismaClient.
RULE: Import Prisma ONLY from `src/lib/prisma.ts` — never `new PrismaClient()` anywhere else.

### 2024-07-19: Next.js build failure on case-sensitive file systems
SYMPTOM: Works on Mac (case-insensitive FS), fails in CI (Linux).
ROOT CAUSE: Import was `import Foo from './foo'` but file was named `Foo.tsx`.
RULE: Import paths must exactly match the file's casing. Use editor autocomplete — never type paths by hand.
```

---

### Quick reference: `.clinerules` anatomy

```
.clinerules/
│
├── stack.md               ← what's in the project (always loaded)
├── code-style.md          ← formatter, naming, import rules (always loaded)
├── architecture.md        ← what can call what (always loaded)
├── components.md          ← UI rules (paths: src/components/**)
├── testing.md             ← test rules (paths: *.test.ts, *.spec.ts)
├── database.md            ← DB rules (paths: prisma/**)
├── environments.md        ← dev / prod / CI differences (always loaded)
├── required-reading.md    ← links to docs before touching key areas (always loaded)
├── team-conventions.md    ← branching, PR, ownership (always loaded)
└── lessons-learned.md     ← encoded bug history (always loaded)
```

The investment is low — an hour to write, minutes to maintain — and the payoff is compounding: every Cline session in your project starts with full context, every time, for every developer, forever. Conditional rules mean even large rule sets don't bloat your context — only what's relevant to the current files loads.
