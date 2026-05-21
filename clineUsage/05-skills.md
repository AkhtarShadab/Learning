# Skills — Extending Cline with Reusable Capabilities

---

## 1. What Is This Exactly?

A **skill** is a modular instruction set that extends Cline's capabilities for a specific domain. Skills package reusable knowledge — instructions, reference docs, templates, and executable scripts — into a structured folder that Cline can discover and load on demand.

When Cline determines a skill is relevant to a task, it invokes the `use_skill` tool internally, which loads the skill's instructions into context. You can also activate skills manually by typing `/` in chat and selecting from the skill list.

### The key insight: progressive loading

Unlike `.clinerules` rules (which load fully when active), skills use **three-level progressive loading** to manage context cost:

| Level | Content | Size | When loaded |
|---|---|---|---|
| **1 — Metadata** | Name + description | ~100 tokens | Always — even for inactive skills |
| **2 — Instructions** | Full `SKILL.md` | < 5K tokens | When skill is triggered |
| **3 — Resources** | Docs, scripts, templates | Unlimited | On-demand, when Cline needs them |

This means inactive skills cost only ~100 tokens (the metadata description). You can have many skills installed without bloating context — only triggered skills pay the full cost. This is the key difference from rules, which always load fully when active.

### The concrete structure

```
skill-name/
├── SKILL.md       (required — YAML frontmatter + instructions)
├── docs/          (optional — deep reference, troubleshooting guides)
├── templates/     (optional — boilerplate code, config files)
└── scripts/       (optional — validation, processing, API calls)
```

`SKILL.md` is the contract: it tells Cline what the skill can do, when to use it, and how to use it. The supporting folders provide depth that only loads when needed.

### Skills vs. built-in Cline tools

| Built-in Cline tools | Skills |
|---|---|
| `read_file`, `write_to_file` | `deploy-staging`, `db-migrate`, `git-commit` |
| `execute_command` | `check-logs`, `get-metrics`, `ad-tasks` |
| `list_files`, `search_files` | `api-create-user`, `send-notification` |
| Always present, universal | You add them, project- or user-specific |
| General-purpose primitives | Domain-specific abstractions |
| Cline knows them without docs | Cline learns them from `SKILL.md` |

Built-in tools are the foundation. Skills are domain vocabulary built on top of that foundation. A `deploy-staging` skill means Cline no longer reasons about SSH, environment variables, health checks, and rollback from scratch on every deploy task — that complexity is encapsulated once, reused always.

---

## 2. Mental Models

### Mental Model 1: A Toolbox

A standard toolbox ships with hammer, screwdriver, pliers, wrench — tools that work for almost any job. That's Cline's built-in toolkit.

But a mechanic's bay also has a torque wrench, an oscilloscope, a coolant flush machine, a timing light. Those are specialist tools you add when you need them for specific jobs.

```
Base Cline toolkit (always present):     Specialist skills (you add):
┌─────────────────────┐                  ┌──────────────────────────┐
│  read_file          │                  │  deploy-staging          │
│  write_to_file      │                  │  db-migrate              │
│  execute_command    │     +  skills =  │  check-errors            │
│  list_files         │                  │  send-slack-alert        │
│  search_files       │                  │  rollback                │
└─────────────────────┘                  └──────────────────────────┘
```

The base tools get you anywhere. The skills get you there faster, with less friction, and with fewer mistakes.

### Mental Model 2: npm Packages for Your Agent

When you `npm install axios`, you don't have to explain HTTP to your code anymore — you just call `axios.get(url)`. The package encapsulates complexity behind a clean interface.

Skills do the same thing for agents:

```
Without a skill:
  Agent must know: how to SSH into server, which env vars to set,
  how to run the deploy script, how to check health endpoint,
  how to rollback if it fails, where to log results...

With a deploy skill:
  Agent runs the deploy command.
  Script handles all the above internally.
```

You install a skill once. The agent uses it in every task where it's relevant — with zero re-explanation.

### Mental Model 3: A Plugin System with Lazy Loading

Think of Cline as a base application — capable, but generic. Skills are plugins. You install a plugin, and the application gains new capabilities specific to your domain.

The critical difference from a naive plugin system: skills are **lazy-loaded**. A plugin you installed but aren't using costs nothing (just its 100-token metadata description). Only when you actually invoke a skill does it pay the full cost of loading its instructions.

```
┌─────────────────────────────────────────────────┐
│                  Cline Agent                    │
│                                                 │
│  ┌─────────────┐    ┌──────────────────────┐   │
│  │  Core Tools │    │  Active Skills       │   │
│  │  (built-in) │    │  (loaded on trigger) │   │
│  └─────────────┘    └──────────────────────┘   │
│                             ▲                  │
│                      ~100 tokens each          │
│                      (inactive skills)         │
│                      .cline/skills/            │
└─────────────────────────────────────────────────┘
```

`SKILL.md` is the plugin's manifest. Just as a VS Code extension has a `package.json` declaring what it does, a skill's YAML frontmatter declares when Cline should activate it. The agent reads the description, matches it against the task at hand, and decides whether to load the full skill.

---

## 3. Storage Locations

Skills can live at project level (version-controlled, shared with your team) or at the global user level (available across all projects).

### Project-level skills

```
your-project/
├── .cline/
│   └── skills/          ← Primary project skill location
│       └── deploy/
│           ├── SKILL.md
│           └── scripts/
│               └── deploy-staging.sh
├── .clinerules/
│   └── skills/          ← Alternative project skill location
└── src/
```

Both `.cline/skills/` and `.clinerules/skills/` work for project-level skills. `.cline/skills/` is the primary recommended path.

### Global user-level skills

```
~/.cline/skills/               (macOS / Linux / WSL)
C:\Users\USERNAME\.cline\skills\  (Windows)
```

Global skills are available in every project on your machine. When a naming conflict occurs between a global skill and a project skill, **global skills take precedence**.

Use global skills for capabilities that span projects — your personal git workflow, your preferred deploy patterns, organization-wide API wrappers. Use project skills for things that are specific to one codebase.

---

## 4. The SKILL.md File

`SKILL.md` is the core of every skill. It has two parts: a YAML frontmatter block that controls discovery and activation, and a Markdown body with full instructions.

### YAML frontmatter

```yaml
---
name: skill-name        # must match the directory name exactly (kebab-case)
description: |          # max 1024 chars — this is what Cline reads to decide when to activate
  Deploy applications to AWS using CDK. Use when deploying, updating
  infrastructure, or managing AWS resources. Handles staging and production
  deployments, stack diffs, and rollbacks.
---
```

The `name` must exactly match the folder name. The `description` is the Level 1 metadata — the ~100 tokens that are always loaded. It determines when Cline activates the skill automatically.

**Description best practices:**

- Start with an **action verb**: "Deploy...", "Generate...", "Validate...", "Query..."
- Include **specific trigger phrases** that match how users ask for the task
- Mention **relevant file types or domains** so Cline knows what context activates it
- Be **concrete and specific**, not vague: "Deploy to AWS using CDK" not "helps with AWS stuff"
- Keep it under 1024 characters — this is a hard limit

```yaml
# Good description
description: |
  Generate TypeScript types from OpenAPI specs. Use when creating API client types,
  updating type definitions from an API schema, or working with .openapi.yaml or
  swagger.json files. Outputs ready-to-use TypeScript interfaces.

# Weak description (too vague)
description: |
  Helps with API stuff and types.
```

### SKILL.md body

After the frontmatter, write your instructions in Markdown. This is the Level 2 content — loaded when the skill activates. Keep it under 5K tokens.

A solid `SKILL.md` answers:
- What can I do with this skill?
- When should I use each capability?
- What are the exact commands or steps?
- What does output look like?
- What supporting files exist in `docs/`, `templates/`, `scripts/`?

```markdown
---
name: aws-deploy
description: |
  Deploy applications to AWS using CDK. Use when deploying, updating
  infrastructure, or managing AWS resources. Handles staging and production
  deployments, stack diffs, and rollbacks.
---

# AWS Deploy Skill

Manages deployments to AWS via CDK. All deploy operations run through
scripts in `scripts/` — do not construct raw AWS CLI commands.

## Capabilities

| Action | How |
|---|---|
| Deploy to staging | Run `scripts/deploy.sh staging` |
| Deploy to production | Run `scripts/deploy.sh production` (requires confirmation) |
| Preview changes (diff) | Run `scripts/diff.sh [environment]` |
| Rollback | Run `scripts/rollback.sh [environment] [version]` |

## Required Environment Variables

- `AWS_PROFILE` — AWS credentials profile
- `CDK_DEFAULT_ACCOUNT` — target AWS account ID
- `CDK_DEFAULT_REGION` — target region (e.g. us-east-1)

## Workflow

1. Always run `scripts/diff.sh` first to preview what will change
2. Review the diff output before proceeding
3. For staging: `scripts/deploy.sh staging`
4. For production: get explicit user confirmation, then `scripts/deploy.sh production`
5. Monitor deployment output — the script polls CloudFormation events

## Advanced Reference

For CDK stack structure, troubleshooting common errors, and cross-account
deployment patterns, see `docs/advanced.md`.
```

---

## 5. Supporting Files

### `docs/` — Deep reference (Level 3, on-demand)

The `docs/` folder holds advanced guides, troubleshooting references, and detailed API documentation. Cline loads these **only when it needs them** — they don't bloat context by default.

```
aws-deploy/
└── docs/
    ├── advanced.md          ← CDK patterns, cross-account setup
    ├── troubleshooting.md   ← common errors and fixes
    └── architecture.md      ← how the stacks are organized
```

Put content here that is too detailed for the main `SKILL.md` but that Cline might need for edge cases or deep dives. The main instructions in `SKILL.md` should reference these files by name so Cline knows they exist.

### `scripts/` — Executables (output-only cost)

Scripts in `scripts/` are **executed but not loaded into context**. The script's source code never consumes tokens — only its output does. This makes scripts the right place for complex logic, credential handling, and anything that would be verbose as inline instructions.

```
aws-deploy/
└── scripts/
    ├── deploy.sh            ← deploy to an environment
    ├── diff.sh              ← preview CDK changes
    └── rollback.sh          ← revert to a previous version
```

Write scripts defensively: validate inputs, fail fast with clear error messages to stderr, exit non-zero on failure. The agent reads exit codes and stdout, so keep output parseable.

### `templates/` — Boilerplate (on-demand)

Templates are config files, scaffolding code, or common patterns that Cline can copy or adapt for the task. Like `docs/`, they load on-demand, not upfront.

```
aws-deploy/
└── templates/
    ├── stack-template.ts    ← CDK stack boilerplate
    └── pipeline-config.yml  ← CI/CD pipeline template
```

---

## 6. Activation

### Automatic activation

Cline reads the `description` frontmatter of every installed skill (the ~100-token metadata). When you start a task, it matches your request against all descriptions and automatically loads the most relevant skill via the `use_skill` tool.

A well-written description makes automatic activation reliable. A vague description means Cline might not activate the skill when it should — or activate it when it shouldn't.

### Manual activation

Type `/` in the Cline chat input to see a list of all available skills. Select one to activate it explicitly. Manual activation is useful when:

- The task description doesn't obviously match the skill's description
- You want to force a specific skill rather than let Cline choose
- You're testing a skill you just created

---

## 7. How to Integrate It in Your Projects

### Step 1: Create the skills folder

```bash
mkdir -p .cline/skills
```

Keep skills in version control — they're infrastructure, same as Makefiles or CI configs:

```bash
git add .cline/skills/
git commit -m "chore: add cline skills"
```

### Step 2: Create a skill folder with SKILL.md

```
.cline/skills/
└── git-helper/
    ├── SKILL.md
    └── scripts/
        ├── git-status.sh
        ├── git-commit.sh
        └── git-pr.sh
```

### Step 3: Write SKILL.md

```markdown
---
name: git-helper
description: |
  Perform git operations following this project's conventions. Use when
  committing changes, checking status, creating branches, or opening pull
  requests. Enforces Conventional Commits format and project branch naming.
---

# git-helper

High-level git operations for this project. Wraps raw git with project
conventions (branch naming, commit message format, PR template).

## Available Scripts

| Script | Description | Usage |
|---|---|---|
| `scripts/git-status.sh` | Show working tree status and recent commits | `bash scripts/git-status.sh` |
| `scripts/git-commit.sh` | Stage all and commit with conventional format | `bash scripts/git-commit.sh "feat: message"` |
| `scripts/git-pr.sh` | Create a pull request via gh CLI | `bash scripts/git-pr.sh "title" "body"` |

## Notes

- `git-commit.sh` enforces Conventional Commits: feat, fix, chore, docs, refactor, test, perf
- `git-pr.sh` requires the `gh` CLI authenticated
- Always run `git-status.sh` before committing to review what will be staged
```

### Step 4: Write scripts

```bash
#!/bin/bash
# .cline/skills/git-helper/scripts/git-status.sh
set -e

echo "=== Working Tree Status ==="
git status --short

echo ""
echo "=== Recent Commits ==="
git log --oneline -5

echo ""
echo "=== Modified Files ==="
git diff --name-only
```

```bash
#!/bin/bash
# .cline/skills/git-helper/scripts/git-commit.sh
set -e

MESSAGE="$1"

if [ -z "$MESSAGE" ]; then
  echo "ERROR: commit message is required" >&2
  echo "Usage: bash git-commit.sh \"type(scope): description\"" >&2
  exit 1
fi

echo "Staging all changes..."
git add -A

echo "Committing: $MESSAGE"
git commit -m "$MESSAGE"

echo "Done. Commit: $(git rev-parse --short HEAD)"
```

```bash
#!/bin/bash
# .cline/skills/git-helper/scripts/git-pr.sh
set -e

TITLE="$1"
BODY="${2:-No description provided}"

if [ -z "$TITLE" ]; then
  echo "ERROR: PR title is required" >&2
  echo "Usage: bash git-pr.sh \"title\" [\"body\"]" >&2
  exit 1
fi

BRANCH=$(git branch --show-current)
echo "Creating PR from branch: $BRANCH"

gh pr create --title "$TITLE" --body "$BODY" --draft

echo "PR created."
```

### Step 5: Full example — db-tools skill

```
.cline/skills/
└── db-tools/
    ├── SKILL.md
    └── scripts/
        ├── db-query.sh
        ├── db-migrate.sh
        └── db-seed.sh
```

**SKILL.md:**

```markdown
---
name: db-tools
description: |
  Run database operations: queries, migrations, and seeding. Use when
  querying the database, applying Prisma migrations, or seeding test data.
  Requires DATABASE_URL in .env.
---

# db-tools

Database operations for this project (PostgreSQL via Prisma).
Connection config is read from DATABASE_URL in `.env`.

## Available Scripts

| Script | Description | Usage |
|---|---|---|
| `scripts/db-query.sh` | Run a SQL query and print results | `bash scripts/db-query.sh "SELECT ..."` |
| `scripts/db-migrate.sh` | Run pending Prisma migrations | `bash scripts/db-migrate.sh` |
| `scripts/db-seed.sh` | Seed with test data | `bash scripts/db-seed.sh [--reset]` |

## Environment Variables Required

- `DATABASE_URL` — PostgreSQL connection string (set in .env)
```

**scripts/db-query.sh:**

```bash
#!/bin/bash
set -e

SQL="$1"

if [ -z "$SQL" ]; then
  echo "ERROR: SQL query required" >&2
  echo "Usage: bash db-query.sh \"SELECT ...\"" >&2
  exit 1
fi

[ -f .env ] && export $(grep -v '^#' .env | xargs)

if [ -z "$DATABASE_URL" ]; then
  echo "ERROR: DATABASE_URL not set" >&2
  exit 1
fi

psql "$DATABASE_URL" -c "$SQL"
```

**scripts/db-migrate.sh:**

```bash
#!/bin/bash
set -e

[ -f .env ] && export $(grep -v '^#' .env | xargs)

echo "Running Prisma migrations..."
npx prisma migrate deploy

echo "Current migration status:"
npx prisma migrate status
```

**scripts/db-seed.sh:**

```bash
#!/bin/bash
set -e

[ -f .env ] && export $(grep -v '^#' .env | xargs)

if [ "$1" = "--reset" ]; then
  echo "Resetting database..."
  npx prisma migrate reset --force
fi

echo "Seeding database..."
npx prisma db seed

echo "Seed complete."
```

---

## 8. Advanced Use Cases

### Building an API-wrapper skill

You have a backend API. Instead of letting Cline construct curl commands from scratch (and get auth headers wrong), you wrap it:

```
.cline/skills/
└── api/
    ├── SKILL.md
    └── scripts/
        ├── api-get-user.sh
        ├── api-create-user.sh
        ├── api-list-orders.sh
        └── api-update-order.sh
```

```bash
#!/bin/bash
# .cline/skills/api/scripts/api-create-user.sh
set -e
[ -f .env ] && export $(grep -v '^#' .env | xargs)

EMAIL="$1"
ROLE="${2:-user}"

if [ -z "$EMAIL" ]; then
  echo "ERROR: email required" >&2
  echo "Usage: bash api-create-user.sh email@example.com [role]" >&2
  exit 1
fi

curl -s -X POST "$API_BASE_URL/users" \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"email\": \"$EMAIL\", \"role\": \"$ROLE\"}" \
  | jq .
```

Now Cline calls the script instead of constructing curl commands. The API token is never in context, the auth header format is always correct, and the endpoint is always right.

### Building a deployment skill

```
.cline/skills/
└── deploy/
    ├── SKILL.md
    ├── docs/
    │   └── rollback-procedures.md
    └── scripts/
        ├── deploy-staging.sh
        ├── deploy-prod.sh
        └── rollback.sh
```

```bash
#!/bin/bash
# .cline/skills/deploy/scripts/deploy-staging.sh
set -euo pipefail
[ -f .env ] && export $(grep -v '^#' .env | xargs)

VERSION="${1:-$(git rev-parse --short HEAD)}"
echo "Deploying version $VERSION to staging..."

docker build -t "myapp:$VERSION" .
docker push "$REGISTRY/myapp:$VERSION"

kubectl set image deployment/myapp-staging \
  myapp="$REGISTRY/myapp:$VERSION" \
  --record

kubectl rollout status deployment/myapp-staging --timeout=120s

HEALTH=$(curl -sf "$STAGING_URL/health" | jq -r '.status')
if [ "$HEALTH" != "ok" ]; then
  echo "Health check failed: $HEALTH" >&2
  echo "Run rollback.sh staging to revert." >&2
  exit 1
fi

echo "Staging deploy complete. URL: $STAGING_URL"
```

This script encapsulates: build, push, deploy, wait, health-check. Cline issues one command. All failure handling and platform specifics are invisible to the agent.

### Building a monitoring skill

```
.cline/skills/
└── monitoring/
    ├── SKILL.md
    └── scripts/
        ├── check-logs.sh
        ├── get-errors.sh
        └── get-metrics.sh
```

```bash
#!/bin/bash
# .cline/skills/monitoring/scripts/get-errors.sh
set -e
[ -f .env ] && export $(grep -v '^#' .env | xargs)

MINUTES="${1:-60}"
LIMIT="${2:-20}"

echo "=== Errors in last ${MINUTES} minutes (limit: $LIMIT) ==="

curl -s "$LOKI_URL/loki/api/v1/query_range" \
  --data-urlencode "query={app=\"myapp\"} |= \"ERROR\"" \
  --data-urlencode "start=$(date -d "-${MINUTES} minutes" +%s)000000000" \
  --data-urlencode "end=$(date +%s)000000000" \
  --data-urlencode "limit=$LIMIT" \
  -H "Authorization: Bearer $LOKI_TOKEN" \
  | jq -r '.data.result[].values[][1]' \
  | tail -"$LIMIT"
```

Cline can investigate production errors during a debugging task with a single script call. No credentials in context, clean output.

### Composing skills (one skill's output feeds another)

```bash
#!/bin/bash
# .cline/skills/debug/scripts/investigate-errors.sh
# Composes monitoring + db-tools skills

set -e
SKILL_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

echo "=== Fetching recent errors ==="
ERROR_OUTPUT=$(bash "$SKILL_ROOT/monitoring/scripts/get-errors.sh" 30 10)
echo "$ERROR_OUTPUT"

USER_IDS=$(echo "$ERROR_OUTPUT" | grep -oP 'user_id=\K[0-9]+' | sort -u | head -5)

if [ -n "$USER_IDS" ]; then
  echo ""
  echo "=== Looking up affected users ==="
  for UID in $USER_IDS; do
    bash "$SKILL_ROOT/db-tools/scripts/db-query.sh" \
      "SELECT id, email, created_at FROM users WHERE id = $UID"
  done
fi
```

You've composed two skills into a higher-level diagnostic command. Cline runs one script and gets both the error context and the affected user data.

### Handling credentials securely in scripts

Never hardcode credentials in skill scripts. Use environment variables loaded from `.env`:

```bash
#!/bin/bash
# Pattern used in all skill scripts that need credentials

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
[ -f "$PROJECT_ROOT/.env" ] && export $(grep -v '^#' "$PROJECT_ROOT/.env" | xargs)

# Validate required vars are present
: "${API_TOKEN:?ERROR: API_TOKEN not set in .env}"
: "${DATABASE_URL:?ERROR: DATABASE_URL not set in .env}"
```

For production secrets, fetch from a secrets manager at runtime:

```bash
PROD_DB_URL=$(aws secretsmanager get-secret-value \
  --secret-id "myapp/prod/database-url" \
  --query SecretString \
  --output text)
```

The credential is never written to disk or printed to stdout.

### Skills designed for autonomous heartbeat use

When Cline runs on a heartbeat (scheduled cron), skills need to be:

1. **Idempotent** — safe to run multiple times with the same result
2. **Non-interactive** — no prompts, no y/n confirmations
3. **Self-contained** — all context comes from arguments or environment
4. **Informative** — clear output the agent can parse and act on
5. **Exit-code-aware** — use distinct exit codes to signal different outcomes

```bash
#!/bin/bash
# .cline/skills/maintenance/scripts/check-stale-tasks.sh
# Designed for autonomous heartbeat use

set -e
THRESHOLD_DAYS="${1:-7}"
TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)

echo "[$TIMESTAMP] Checking for tasks stale > ${THRESHOLD_DAYS} days..."

STALE=$(ad-tasks \
  --filter "status=in-progress" \
  --filter "updated_before=$(date -d "-${THRESHOLD_DAYS} days" +%Y-%m-%d)" \
  --format json)

COUNT=$(echo "$STALE" | jq 'length')
echo "Found $COUNT stale task(s)."

if [ "$COUNT" -gt 0 ]; then
  echo "$STALE" | jq -r '.[] | "STALE: \(.id) — \(.title) (last updated: \(.updated_at))"'
  exit 2   # non-zero so the calling agent knows action is needed
fi

echo "No stale tasks found."
exit 0
```

The agent checks exit code: 0 = nothing to do, 2 = stale tasks found. Clean, parseable, autonomous-friendly.

### Using `docs/` for advanced reference without upfront cost

When a skill has complex domain knowledge — troubleshooting guides, architectural references, edge-case handling — put it in `docs/` and reference it from `SKILL.md`:

```markdown
# SKILL.md body (excerpt)

## Advanced Reference

For complex scenarios, consult the supporting docs:
- `docs/troubleshooting.md` — common errors and fixes
- `docs/cross-account.md` — deploying across AWS accounts
- `docs/rollback-procedures.md` — step-by-step rollback for each failure mode

These load on-demand. If you encounter an error not covered above,
check `docs/troubleshooting.md` first.
```

The docs are there when Cline needs them. They never load upfront and never cost tokens when they're not relevant.

---

## Quick Reference

### Skill folder structure

```
.cline/skills/
└── your-skill/
    ├── SKILL.md           ← REQUIRED: frontmatter + instructions
    ├── docs/              ← optional: loaded on-demand, deep reference
    │   └── advanced.md
    ├── templates/         ← optional: loaded on-demand, boilerplate
    │   └── config-template.yml
    └── scripts/           ← optional: executed, never loaded into context
        ├── command-one.sh
        └── command-two.sh
```

### SKILL.md template

```markdown
---
name: skill-name          # must match directory name (kebab-case)
description: |            # max 1024 chars — determines when Cline activates this skill
  ACTION_VERB what this skill does. Use when USER_TRIGGER_PHRASES.
  Works with RELEVANT_FILES or DOMAIN_AREA.
---

# skill-name

One sentence: what does this skill do and for what system?

## Capabilities

| Action | How | Notes |
|---|---|---|
| Do thing A | `bash scripts/command-one.sh arg` | When to use |
| Do thing B | `bash scripts/command-two.sh --flag` | When to use |

## Environment Variables Required

- `VAR_NAME` — description of what this is

## Examples

Typical use case A:
  bash scripts/command-one.sh argument

Typical use case B:
  bash scripts/command-two.sh --flag value

## Output

Describe what the output looks like so the agent knows how to parse it.
Exit code 0 = success. Non-zero = error (message on stderr).

## Advanced Reference

See `docs/advanced.md` for edge cases and troubleshooting.
```

### Script template

```bash
#!/bin/bash
set -euo pipefail

# Load environment from project root .env
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
[ -f "$PROJECT_ROOT/.env" ] && export $(grep -v '^#' "$PROJECT_ROOT/.env" | xargs)

# Parse arguments
ARG_ONE="$1"
ARG_TWO="${2:-default_value}"

# Validate required inputs
if [ -z "$ARG_ONE" ]; then
  echo "ERROR: arg-one is required" >&2
  echo "Usage: bash command-one.sh <arg-one> [arg-two]" >&2
  exit 1
fi

# Do the work
echo "Running with $ARG_ONE..."
# ... your logic here ...

echo "Done."
exit 0
```

### Decision guide: skill activation

```
Task comes in...
  ├── Matches a skill description?
  │     ├── Yes → Cline activates automatically via use_skill
  │     └── No / uncertain → type / in chat and select manually
  │
  ├── Need deep reference?
  │     → Cline loads docs/ on-demand (Level 3)
  │
  └── Need to run something?
        → Cline executes scripts/ (output-only cost)
```

### Storage location decision guide

```
Who needs this skill?
  ├── Just this project / team
  │     → .cline/skills/skill-name/       (version-controlled)
  │     → .clinerules/skills/skill-name/  (alternative)
  │
  └── All my projects (personal workflow)
        → ~/.cline/skills/skill-name/     (global, macOS/Linux)
        → C:\Users\NAME\.cline\skills\    (Windows)

Note: global skills take precedence over project skills on name conflicts.
```

If you find yourself repeating the same domain-specific instructions across multiple tasks, that's a skill waiting to be written. Package it once, and Cline carries that capability forward into every relevant task — automatically.

---

## DSA Connections

### Trie — Skill Name Prefix Matching and Slash-Command Discovery

A **trie** (prefix tree) is a tree data structure where each node represents a single character, enabling prefix-based search in O(k) time where k is the length of the query string. When a user types `/` in the Cline chat input to manually activate a skill, the system must match the typed prefix against all installed skill names (`deploy-staging`, `db-tools`, `git-helper`, `monitoring`, `api`, etc.) and present matching candidates in real time. A trie keyed on skill names makes this instant: typing `/de` walks two nodes deep and returns all skills under the `d→e` branch (like `deploy-staging` and `debug`), pruning irrelevant entries without scanning the full list. This same structure applies to the `name` field in SKILL.md frontmatter, where the kebab-cased skill name must exactly match the directory name — the trie enforces this uniqueness constraint because inserting a duplicate name would collide at the same terminal node. Real-world autocompletion systems in IDEs and CLI tools use compressed tries (radix trees) for this exact pattern of interactive prefix resolution over a registry of named entities.

### Hash Map — Skill Registry and Metadata Indexing

A **hash map** provides O(1) average-time lookup by hashing a key to an array bucket. Cline's skill system maintains a registry that maps each skill's `name` (from the YAML frontmatter) to its metadata — the ~100-token description, the file path to `SKILL.md`, and the activation status — forming a hash map keyed by skill name. When the LLM processes a new task and evaluates whether any skill is relevant, it iterates the descriptions but when it decides to activate a specific skill, the `use_skill` internal tool call looks up the skill by name in O(1) to locate and load its full instructions. The same hash map pattern governs the three-level progressive loading system: Level 1 (metadata) is the hash map's value always resident in memory, Level 2 (full SKILL.md) is loaded on activation by key lookup, and Level 3 (docs, scripts, templates) is a secondary hash map of resource paths within the skill directory. Global versus project skill precedence resolution is also a hash map merge operation — the global `~/.cline/skills/` map is merged with the project `.cline/skills/` map, with global keys overwriting project keys on collision.

### Strategy Pattern — Skill Dispatch and Encapsulated Execution

The **strategy pattern** defines a family of interchangeable algorithms behind a common interface, allowing the client to swap strategies at runtime without changing the calling code. Each Cline skill is a concrete strategy: `deploy-staging`, `db-tools`, `git-helper`, and `monitoring` all conform to the same structural interface (a SKILL.md with frontmatter + instructions, optional scripts that accept arguments and return structured output via stdout/exit codes), but each encapsulates entirely different domain logic. The LLM acts as the strategy selector, matching the user's task against skill descriptions and activating the appropriate strategy — a deploy task dispatches to the `deploy` strategy, a database query dispatches to `db-tools`. The scripts within each skill further demonstrate the pattern: `deploy-staging.sh`, `deploy-prod.sh`, and `rollback.sh` are sub-strategies within the deploy skill, each encapsulating a different deployment algorithm behind the same bash-script interface. This is exactly why new skills can be added by simply creating a new directory with a SKILL.md — no modification to the core agent loop is required, just a new strategy implementation dropped into the registry.

### Lazy Loading / Virtual Proxy — Three-Level Progressive Context Management

The **virtual proxy** pattern defers the creation or loading of an expensive object until the moment it is actually needed, presenting a lightweight placeholder in the meantime. Cline's three-level progressive loading system is a textbook implementation: Level 1 (the ~100-token metadata description) is the lightweight proxy that is always resident, costing almost nothing even across dozens of installed skills. Level 2 (the full SKILL.md body at up to 5K tokens) is loaded only when the proxy determines the skill is relevant — the `use_skill` tool call triggers materialization of the real object. Level 3 (docs, templates, scripts) is an even deeper proxy layer that materializes only when the already-loaded skill's instructions reference a specific resource file. This three-tier deferral is analogous to how virtual memory systems work: the page table entry (Level 1) is always in RAM, the page itself (Level 2) is loaded from disk on first access, and the data the page references (Level 3) may trigger further page faults. The concrete benefit is quantifiable: 20 installed skills cost only ~2,000 tokens (20 x 100) when idle, versus ~100,000 tokens if all were eagerly loaded — a 50x reduction in baseline context consumption.
