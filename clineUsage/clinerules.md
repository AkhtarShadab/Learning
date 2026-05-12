# `.clinerules` — Cline Project Rules

---

## 1. What Is This Exactly?

`.clinerules` is a plain Markdown file you place at the **root of your project repository**. Every time you start a task with Cline in that project, Cline automatically reads this file and treats its contents as standing instructions — a persistent briefing that applies to every single interaction in that project.

### File location and format

```
your-project/
├── .clinerules          ← lives here, at the root
├── src/
├── package.json
└── README.md
```

- **Format:** Plain Markdown (`.md` content under a `.clinerules` filename — no extension). Cline reads it as text, so headers, bullet lists, and code blocks all work and improve readability.
- **Encoding:** UTF-8, no BOM.
- **Size:** No hard limit, but you should aim to keep it under ~2000 tokens (roughly 1500 words) so it fits cleanly in every context window without crowding out your actual task.

### How Cline reads it

When you open a project folder in VS Code with Cline installed and start a new task, Cline:

1. Scans the project root for `.clinerules`.
2. Prepends the file's contents to the system context for that task — before your first message.
3. Applies those instructions for the entire duration of the task, every task, automatically.

You never have to reference it manually. It just works.

### Global Custom Instructions vs. `.clinerules`

Cline has two layers of instructions:

| Layer | Location | Scope | Who sets it |
|---|---|---|---|
| **Global Custom Instructions** | Cline settings panel (VS Code) | Every project on your machine | You, personally |
| **`.clinerules`** | Project root | Only this project | You, or your team (checked into git) |

Think of global instructions as your personal preferences that follow you everywhere ("I prefer concise answers", "always use ES modules"). `.clinerules` is the project's own rulebook — it travels with the code, not with the developer. When another team member clones the repo, they get the same rules automatically. When you switch to a different project, those rules don't bleed over.

**Precedence:** `.clinerules` is additive on top of global instructions. Neither overrides the other; both apply simultaneously.

---

## 2. Mental Models

Understanding `.clinerules` through analogy makes it stick.

### Mental Model 1: The Constitution

A constitution is the supreme law of a country. Individual laws come and go, presidents give different speeches, but the constitution underlies all of it. You don't vote on it every session — it just *is*.

`.clinerules` is the constitution of your project. No matter what prompt you send Cline, no matter how you phrase a request, the rules in `.clinerules` are always in effect. "Never use `any` in TypeScript" is constitutional law in your project. Cline doesn't need you to remind it every time.

```
                    ┌─────────────────────────────┐
                    │       .clinerules            │
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

## 3. How to Integrate It in Your Projects

### Step 1: Create the file

```bash
touch .clinerules
```

Add it to version control so every developer gets the same Cline behavior:

```bash
git add .clinerules
git commit -m "chore: add .clinerules for Cline project context"
```

Do NOT add it to `.gitignore` unless you have personal overrides you want to keep private (in which case, keep a team version named differently and document the convention).

### Step 2: Sections to include

A well-structured `.clinerules` covers these areas:

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

### Step 3: Real-world examples

---

#### Example 1: Next.js + Prisma + TypeScript project

```markdown
# Project Rules — AcmeSaaS

## Stack
- Next.js 14 (App Router, not Pages Router)
- TypeScript 5.x — strict mode is ON
- Prisma 5 + PostgreSQL 15
- Tailwind CSS + shadcn/ui
- Vitest for unit tests, Playwright for e2e

## Code Style
- Use named exports everywhere — no default exports except for Next.js page files
- Path aliases: use `@/` for src root, never use relative `../../../` paths
- All async server components must use `async/await` — no `.then()` chains
- Tailwind: use the `cn()` utility (from `@/lib/utils`) for conditional classes, never string interpolation

## TypeScript Rules
- `any` is banned. If you genuinely need it, add a comment explaining why: `// eslint-disable-next-line @typescript-eslint/no-explicit-any — reason`
- All Prisma query results must go through a Zod schema before being returned from a Server Action or API route
- Prefer `type` over `interface` for data shapes; use `interface` only when you need extension/augmentation

## Architecture Boundaries
- Server Actions live in `src/actions/` — one file per domain (e.g. `users.ts`, `billing.ts`)
- Never call Prisma directly from a React component (client or server) — all DB access goes through `src/lib/db/` query functions
- `src/lib/` is for pure logic — no Next.js-specific imports (no `next/headers`, no `next/navigation`)
- Email sending lives exclusively in `src/lib/email/` — nowhere else

## Forbidden Patterns
- Do NOT use `useEffect` to fetch data — use React Server Components or SWR/React Query
- Do NOT write raw SQL strings — use Prisma query builder only
- Do NOT store secrets in `src/` — they go in `.env.local` and are accessed via `src/lib/env.ts` (our validated env module)
- Do NOT use `console.log` in production code — use the logger at `src/lib/logger.ts`

## Database / Prisma
- All schema changes need a migration: `npx prisma migrate dev --name <descriptive-name>`
- Migrations must be backwards compatible (no dropping columns without a multi-step process)
- After any schema change, regenerate the client: `npx prisma generate`
- Seed file is at `prisma/seed.ts` — run with `npx prisma db seed`

## Testing
- Run unit tests: `pnpm test`
- Run e2e tests: `pnpm test:e2e` (requires local dev server running on port 3000)
- Coverage threshold: 80% on `src/lib/` — CI will fail below this
- Test files live next to source files: `foo.ts` → `foo.test.ts`

## Common Gotchas
- shadcn/ui components live in `src/components/ui/` — do NOT edit them manually; use `npx shadcn-ui add` to update
- The Prisma client is a singleton — import from `src/lib/prisma.ts`, never instantiate a new `PrismaClient()` directly
- Next.js 14 caches fetch aggressively — add `{ cache: 'no-store' }` or `revalidate` tags explicitly when data must be fresh
- `useRouter` is from `next/navigation` in App Router (not `next/router`)

## Before Changing Routes
Read `docs/API_SPEC.md` first. All public API routes must be documented there before code is written.

## PR Conventions
- One logical change per PR
- PR title format: `type(scope): description` (e.g. `feat(billing): add Stripe webhook handler`)
- Always include a test for new features
```

---

#### Example 2: Python ML project

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
- Type hints are required on all function signatures — use `from __future__ import annotations` at the top of every module
- Docstrings: Google style. Every public function needs a docstring with Args and Returns sections.
- Max line length: 100 characters (configured in `pyproject.toml`)

## Project Structure
- `src/churn/data/`     — data loading and preprocessing only
- `src/churn/features/` — feature engineering pipelines
- `src/churn/models/`   — model training, evaluation, serialization
- `src/churn/api/`      — FastAPI routes and Pydantic schemas
- `notebooks/`          — exploration only, never imported by src/
- `tests/`              — mirrors src/ structure

## Architecture Boundaries
- `notebooks/` code is exploratory ONLY — never import from `src/` in notebooks (copy what you need)
- Model artifacts are serialized to `models/` directory with joblib — never pickle raw objects
- Feature engineering pipelines must be scikit-learn compatible (implement `fit`/`transform`) so they can be included in a Pipeline

## Forbidden Patterns
- Never hardcode file paths — use `pathlib.Path` and constants from `src/churn/config.py`
- Never fit a transformer on the test set — always fit on train, transform on both
- Do not commit model artifacts (`*.joblib`) to git — they go in the `models/` directory which is in `.gitignore`; document the training command instead
- No bare `except:` clauses — always specify the exception type

## Data Rules
- Raw data lives in `data/raw/` — never modify it
- Processed data goes in `data/processed/` — document the processing steps in `data/README.md`
- If you add a new data source, update `docs/DATA_SOURCES.md`

## Testing
- Run: `poetry run pytest`
- All feature transformers must have a unit test that checks output shape and dtype
- Model tests use a small synthetic dataset (< 100 rows) — do not commit large test datasets

## Common Gotchas
- The training pipeline assumes feature columns are sorted alphabetically — do not change column order without updating `src/churn/config.py`
- FastAPI route response models must be Pydantic v2 models (we migrated from v1 in March 2024)
- `pandas` FutureWarnings about `.fillna` chaining are real — always assign explicitly
```

---

### Tips for writing effective `.clinerules`

1. **Be specific, not generic.** "Write clean code" is useless. "Do not call `db.query()` outside of `src/lib/db/` modules" is actionable.

2. **Keep it under 2000 tokens.** A 5000-token `.clinerules` eats into every context window. If your rules are that long, split them into referenced docs and link from `.clinerules`.

3. **Update it when you discover a new gotcha.** Just had a nasty bug because someone imported Prisma directly in a component? Add it to the Forbidden Patterns section that day — encode the lesson while the pain is fresh.

4. **Review it quarterly.** Remove rules that no longer apply (e.g., if you migrated from Pages Router to App Router, old Pages-specific rules become noise).

5. **Write for the AI, not for a human reader.** Humans skim and infer. Cline reads literally. Be explicit. "Use the `cn()` utility" is better than "follow our class merging conventions."

---

## 4. Advanced Use Cases

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
- The production DB runs on read replicas for SELECT — write queries must go through the primary connection string

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

`.clinerules` becomes the single source of truth for what every developer (and every Cline session) should know about your team's conventions. Crucially, it eliminates the "which way do we do this?" conversation when someone new joins:

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
RULE: Import paths must exactly match the file's casing. Use your editor's "autocomplete import" — never type paths by hand.
```

---

### Quick reference: `.clinerules` anatomy

```
.clinerules
│
├── ## Stack                    ← what's in the project
├── ## Code Style               ← formatter, naming, import rules
├── ## Architecture Boundaries  ← what can call what
├── ## Forbidden Patterns       ← explicitly banned with reasons
├── ## Testing                  ← how to run tests, thresholds
├── ## File Structure           ← where things live
├── ## Environment Notes        ← dev / prod / CI differences
├── ## Before You Change X      ← links to required reading
├── ## Team Conventions         ← branching, PR, ownership
└── ## Lessons Learned          ← encoded bug history
```

The investment is low — an hour to write, minutes to maintain — and the payoff is compounding: every Cline session in your project starts with full context, every time, for every developer, forever.
