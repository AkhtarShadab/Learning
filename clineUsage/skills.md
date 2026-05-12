# Skills — Extending Cline with Reusable Capabilities

---

## 1. What Is This Exactly?

A **skill** is a folder of shell scripts that exposes a set of domain-specific commands to an AI agent. Instead of describing how to do something in natural language every time, you package the capability once as executable scripts — and the agent can invoke them directly, reliably, and repeatedly.

### The concrete structure

```
skills/
└── my-skill/
    ├── SKILL.md          ← documentation the agent reads to understand the skill
    ├── command-one       ← executable script (bash, python, node, etc.)
    ├── command-two
    └── command-three
```

Each script is one thing the agent can do. `SKILL.md` is the manifest that explains what those things are.

### The role of SKILL.md

SKILL.md is the contract between the skill author and the agent. The agent reads it to answer:
- "What can I do with this skill?"
- "What are the exact command names?"
- "What arguments does each command take?"
- "What does the output look like?"

Without `SKILL.md`, the agent has to guess. With it, the agent has a spec.

### Built-in Cline tools vs. Skills

This distinction is important to internalize:

| Built-in Cline tools           | Skills                                      |
|--------------------------------|---------------------------------------------|
| `read_file`, `write_to_file`   | `git-commit`, `deploy-staging`, `db-migrate`|
| `execute_command`              | `check-logs`, `get-metrics`, `ad-tasks`     |
| `list_files`, `search_files`   | `api-create-user`, `send-notification`      |
| Always present, universal      | Project-specific, you add them              |
| General-purpose                | Domain-specific, high-level abstractions    |
| Cline knows them without docs  | Cline learns them from SKILL.md             |

Built-in tools are the foundation. Skills are domain vocabulary built on top of that foundation. When you give Cline a `deploy-staging` skill, it no longer needs to reason about SSH connections, environment variables, health checks, and rollback logic from scratch — that complexity is encapsulated in the script.

---

## 2. Mental Model

### Mental Model 1: A Toolbox

A standard toolbox ships with hammer, screwdriver, pliers, wrench — tools that work for almost any job. That's Cline's built-in toolkit.

But a mechanic's bay also has a torque wrench, an oscilloscope, a coolant flush machine, a timing light. Those are specialist tools you add when you need them. They are not part of the base box — you acquire them for specific jobs.

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
  Agent runs: ./deploy-staging --version 1.4.2
  Script handles all the above internally.
```

You install a skill once. The agent uses it in every task where it's relevant.

### Mental Model 3: A Plugin System

Think of Cline as a base application — capable, but generic. Skills are plugins. You install a plugin, and the application gains new capabilities specific to your domain.

```
┌─────────────────────────────────────────────┐
│                  Cline Agent                │
│                                             │
│  ┌─────────────┐    ┌──────────────────┐   │
│  │  Core Tools │    │  Loaded Skills   │   │
│  │  (built-in) │    │  (your plugins)  │   │
│  └─────────────┘    └──────────────────┘   │
│                            ▲               │
│                            │               │
│                     skills/ folder          │
│                     in your project         │
└─────────────────────────────────────────────┘
```

SKILL.md is the plugin's README. Just as a VS Code extension has a `package.json` manifest and a `README.md`, a skill has a `SKILL.md`. The agent reads the README to know what the plugin can do.

---

## 3. How to Integrate It in Your Projects

### Step 1: Create the skills/ folder

```
your-project/
├── src/
├── tests/
├── .clinerules           ← you'll reference skills here
└── skills/               ← create this
    └── .gitkeep
```

Keep `skills/` in version control. The scripts are part of your project infrastructure, same as Makefiles or CI configs.

### Step 2: Create a skill folder

```
skills/
└── git-helper/
    ├── SKILL.md
    ├── git-status
    ├── git-commit
    └── git-pr
```

### Step 3: Write SKILL.md

SKILL.md has a specific job: give the agent exactly what it needs to use the skill correctly. No more, no less.

**What to include:**

```markdown
# git-helper

Provides high-level git operations for this project.
Wraps raw git commands with project-specific conventions
(branch naming, commit message format, PR template).

## Available Commands

| Command      | Description                              | Usage                              |
|--------------|------------------------------------------|------------------------------------|
| git-status   | Show working tree status and summary     | ./git-status                       |
| git-commit   | Stage all changes and commit             | ./git-commit "your message"        |
| git-pr       | Create a pull request via gh CLI         | ./git-pr "PR title" "description"  |

## Output Format

All commands output to stdout. Exit code 0 = success, non-zero = failure.
Errors are printed to stderr.

## Examples

Check what's changed:
  ./git-status

Commit current work:
  ./git-commit "feat: add user authentication"

Open a PR:
  ./git-pr "Add user auth" "Implements login, logout, and session management"

## Notes

- git-commit follows Conventional Commits format (feat:, fix:, chore:, etc.)
- git-pr requires the gh CLI to be installed and authenticated
- Always run git-status before git-commit to review what will be staged
```

**What NOT to include:** implementation details (how the scripts work internally), installation instructions for the agent, or anything the agent doesn't need to use the commands.

### Step 4: Write individual command scripts

Each script is a standalone executable. Write it so a human could also run it from the terminal.

```bash
#!/bin/bash
# skills/git-helper/git-status

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
# skills/git-helper/git-commit

set -e

MESSAGE="$1"

if [ -z "$MESSAGE" ]; then
  echo "ERROR: commit message is required" >&2
  echo "Usage: ./git-commit \"your message\"" >&2
  exit 1
fi

echo "Staging all changes..."
git add -A

echo "Committing: $MESSAGE"
git commit -m "$MESSAGE"

echo "Done. Commit hash: $(git rev-parse --short HEAD)"
```

```bash
#!/bin/bash
# skills/git-helper/git-pr

set -e

TITLE="$1"
BODY="$2"

if [ -z "$TITLE" ]; then
  echo "ERROR: PR title is required" >&2
  echo "Usage: ./git-pr \"title\" \"description\"" >&2
  exit 1
fi

BRANCH=$(git branch --show-current)
echo "Creating PR from branch: $BRANCH"

gh pr create \
  --title "$TITLE" \
  --body "${BODY:-No description provided}" \
  --draft

echo "PR created."
gh pr view --web
```

Make all scripts executable:

```bash
chmod +x skills/git-helper/git-status
chmod +x skills/git-helper/git-commit
chmod +x skills/git-helper/git-pr
```

### Step 5: Tell Cline about your skill in .clinerules

```markdown
# .clinerules

## Available Skills

You have access to the following skills in the `skills/` directory.
Read each skill's SKILL.md before using any of its commands.

### git-helper
Path: ./skills/git-helper/SKILL.md
Use for: all git operations — checking status, committing, creating PRs.
Do NOT use raw git commands for these tasks; use the skill instead.

### db-tools
Path: ./skills/db-tools/SKILL.md
Use for: database operations — queries, migrations, seeding.
```

### Full example: db-tools skill

```
skills/
└── db-tools/
    ├── SKILL.md
    ├── db-query
    ├── db-migrate
    └── db-seed
```

**SKILL.md:**

```markdown
# db-tools

Database operations for this project (PostgreSQL via psql).
Connection config is read from DATABASE_URL environment variable.

## Available Commands

| Command     | Description                          | Usage                                    |
|-------------|--------------------------------------|------------------------------------------|
| db-query    | Run a SQL query and print results    | ./db-query "SELECT * FROM users LIMIT 5" |
| db-migrate  | Run pending Prisma migrations        | ./db-migrate                             |
| db-seed     | Seed the database with test data     | ./db-seed [--reset]                      |

## Environment Variables Required

- DATABASE_URL — PostgreSQL connection string (set in .env)

## Examples

Check current users:
  ./db-query "SELECT id, email, created_at FROM users ORDER BY created_at DESC LIMIT 10"

Apply pending migrations:
  ./db-migrate

Seed fresh data (resets existing data):
  ./db-seed --reset
```

**db-query:**

```bash
#!/bin/bash
set -e

SQL="$1"

if [ -z "$SQL" ]; then
  echo "ERROR: SQL query required" >&2
  echo "Usage: ./db-query \"SELECT ...\"" >&2
  exit 1
fi

# Load .env if present
[ -f .env ] && export $(grep -v '^#' .env | xargs)

if [ -z "$DATABASE_URL" ]; then
  echo "ERROR: DATABASE_URL not set" >&2
  exit 1
fi

psql "$DATABASE_URL" -c "$SQL"
```

**db-migrate:**

```bash
#!/bin/bash
set -e

[ -f .env ] && export $(grep -v '^#' .env | xargs)

echo "Running Prisma migrations..."
npx prisma migrate deploy

echo "Current migration status:"
npx prisma migrate status
```

**db-seed:**

```bash
#!/bin/bash
set -e

[ -f .env ] && export $(grep -v '^#' .env | xargs)

RESET=false
if [ "$1" = "--reset" ]; then
  RESET=true
fi

if [ "$RESET" = true ]; then
  echo "Resetting database..."
  npx prisma migrate reset --force
fi

echo "Seeding database..."
npx prisma db seed

echo "Seed complete."
```

---

## 4. Advanced Use Cases

### Building an API-wrapper skill

You have a backend API. Instead of letting Cline construct curl commands from scratch (and get auth headers wrong), you wrap it:

```
skills/
└── api/
    ├── SKILL.md
    ├── api-get-user
    ├── api-create-user
    ├── api-list-orders
    └── api-update-order
```

```bash
#!/bin/bash
# skills/api/api-create-user

set -e
[ -f .env ] && export $(grep -v '^#' .env | xargs)

EMAIL="$1"
ROLE="${2:-user}"

if [ -z "$EMAIL" ]; then
  echo "ERROR: email required" >&2
  echo "Usage: ./api-create-user email@example.com [role]" >&2
  exit 1
fi

curl -s -X POST "$API_BASE_URL/users" \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"email\": \"$EMAIL\", \"role\": \"$ROLE\"}" \
  | jq .
```

Now Cline calls `./api-create-user test@example.com admin` instead of constructing the curl command. Cline cannot leak the API token in its output, cannot get the auth header format wrong, and cannot call the wrong endpoint.

### Building a deployment skill

```
skills/
└── deploy/
    ├── SKILL.md
    ├── deploy-staging
    ├── deploy-prod
    └── rollback
```

```bash
#!/bin/bash
# skills/deploy/deploy-staging

set -euo pipefail
[ -f .env ] && export $(grep -v '^#' .env | xargs)

VERSION="${1:-$(git rev-parse --short HEAD)}"
echo "Deploying version $VERSION to staging..."

# Build
docker build -t "myapp:$VERSION" .

# Push
docker push "$REGISTRY/myapp:$VERSION"

# Deploy via kubectl or your platform
kubectl set image deployment/myapp-staging \
  myapp="$REGISTRY/myapp:$VERSION" \
  --record

# Wait for rollout
kubectl rollout status deployment/myapp-staging --timeout=120s

# Health check
sleep 5
HEALTH=$(curl -sf "$STAGING_URL/health" | jq -r '.status')
if [ "$HEALTH" != "ok" ]; then
  echo "Health check failed: $HEALTH" >&2
  echo "Run ./rollback staging to revert." >&2
  exit 1
fi

echo "Staging deploy complete. URL: $STAGING_URL"
```

This script encapsulates: build, push, deploy, wait, health-check. Cline issues one command. All the failure handling and platform specifics are invisible to the agent.

### Building a monitoring skill

```
skills/
└── monitoring/
    ├── SKILL.md
    ├── check-logs
    ├── get-errors
    └── get-metrics
```

```bash
#!/bin/bash
# skills/monitoring/get-errors

set -e
[ -f .env ] && export $(grep -v '^#' .env | xargs)

MINUTES="${1:-60}"
LIMIT="${2:-20}"

echo "=== Errors in last ${MINUTES} minutes (limit: $LIMIT) ==="

# Query your log aggregation system (Loki, CloudWatch, Datadog, etc.)
curl -s "$LOKI_URL/loki/api/v1/query_range" \
  --data-urlencode "query={app=\"myapp\"} |= \"ERROR\"" \
  --data-urlencode "start=$(date -d "-${MINUTES} minutes" +%s)000000000" \
  --data-urlencode "end=$(date +%s)000000000" \
  --data-urlencode "limit=$LIMIT" \
  -H "Authorization: Bearer $LOKI_TOKEN" \
  | jq -r '.data.result[].values[][1]' \
  | tail -"$LIMIT"
```

Cline can now investigate production errors during a debugging task: `./get-errors 30 50`. No credentials in context, no curl flag guessing, clean output.

### Composing skills (one skill's output feeds another)

```bash
#!/bin/bash
# skills/debug/investigate-errors
# Composes monitoring + db-tools skills

set -e

echo "=== Fetching recent errors ==="
ERROR_OUTPUT=$(./skills/monitoring/get-errors 30 10)
echo "$ERROR_OUTPUT"

# Extract failing user IDs from error logs
USER_IDS=$(echo "$ERROR_OUTPUT" | grep -oP 'user_id=\K[0-9]+' | sort -u | head -5)

if [ -n "$USER_IDS" ]; then
  echo ""
  echo "=== Looking up affected users ==="
  for UID in $USER_IDS; do
    ./skills/db-tools/db-query "SELECT id, email, created_at FROM users WHERE id = $UID"
  done
fi
```

You've composed two skills into a higher-level diagnostic command. Cline runs one script and gets both the error context and the affected user data.

### Skills with authentication (storing tokens securely)

Never hardcode credentials in skill scripts. Use environment variables loaded from `.env`:

```bash
#!/bin/bash
# Pattern used in all skill scripts

# Load .env from project root (never commit .env to git)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
[ -f "$PROJECT_ROOT/.env" ] && export $(grep -v '^#' "$PROJECT_ROOT/.env" | xargs)

# Validate required vars
: "${API_TOKEN:?ERROR: API_TOKEN not set in .env}"
: "${DATABASE_URL:?ERROR: DATABASE_URL not set in .env}"
```

For more sensitive credentials (production secrets), use a secrets manager and fetch at runtime:

```bash
# Fetch from AWS Secrets Manager at runtime
PROD_DB_URL=$(aws secretsmanager get-secret-value \
  --secret-id "myapp/prod/database-url" \
  --query SecretString \
  --output text)
```

This way the credential is never written to disk or printed to stdout.

### Skills the agent uses autonomously during heartbeat

When an AI agent runs on a heartbeat (scheduled cron), it needs skills that are:

1. **Idempotent** — safe to run multiple times with the same result
2. **Non-interactive** — no prompts, no y/n confirmations
3. **Self-contained** — all context comes from arguments or environment
4. **Informative** — clear output the agent can parse and act on

```bash
#!/bin/bash
# skills/maintenance/check-stale-tasks
# Designed for autonomous heartbeat use

set -e

THRESHOLD_DAYS="${1:-7}"
TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)

echo "[$TIMESTAMP] Checking for tasks stale > ${THRESHOLD_DAYS} days..."

# Query AgentDesk (or your task system)
STALE=$(./skills/agent-desk/ad-tasks \
  --filter "status=in-progress" \
  --filter "updated_before=$(date -d "-${THRESHOLD_DAYS} days" +%Y-%m-%d)" \
  --format json)

COUNT=$(echo "$STALE" | jq 'length')
echo "Found $COUNT stale task(s)."

if [ "$COUNT" -gt 0 ]; then
  echo "$STALE" | jq -r '.[] | "STALE: \(.id) — \(.title) (last updated: \(.updated_at))"'
  exit 2   # non-zero so calling agent knows action is needed
fi

echo "No stale tasks found."
exit 0
```

The agent checks the exit code: 0 = nothing to do, 2 = stale tasks found. Clean, parseable, autonomous-friendly.

### The AgentDesk skill as a reference implementation

AgentDesk ships with its own skill as the canonical example of how to build one. Study it:

```
skills/agent-desk/
├── SKILL.md           ← explains all commands, output formats, error codes
├── ad-tasks           ← list tasks for a project
├── ad-task            ← get details of a single task
├── ad-comment         ← post a comment on a task
├── ad-create-task     ← create a new task
├── ad-update-task     ← update task status/assignee
├── ad-projects        ← list all projects
├── ad-mentions        ← get tasks where an agent is mentioned
└── ad-cron-create     ← schedule a recurring job
```

What makes it a good reference:

1. **SKILL.md is the source of truth** — the agent reads SKILL.md, not the scripts
2. **Each command does one thing** — `ad-comment` comments, `ad-tasks` lists, they don't overlap
3. **Consistent output format** — all commands use the same JSON/text conventions
4. **Error handling is explicit** — non-zero exit codes, error messages to stderr
5. **Auth is invisible to the agent** — API tokens are handled inside the scripts, not passed as arguments
6. **Commands are composable** — the agent chains `ad-tasks | ad-task | ad-comment` to do complex operations

---

## Quick Reference

### Skill folder structure

```
skills/
└── your-skill/
    ├── SKILL.md           ← REQUIRED: agent reads this
    ├── command-one        ← executable script, no extension
    ├── command-two
    └── command-three
```

### SKILL.md template

```markdown
# skill-name

One sentence: what does this skill do and for what system?

## Available Commands

| Command        | Description                  | Usage                          |
|----------------|------------------------------|--------------------------------|
| command-one    | What it does                 | ./command-one arg1 [arg2]      |
| command-two    | What it does                 | ./command-two --flag value     |

## Environment Variables Required

- VAR_NAME — description of what this is

## Examples

Typical use case A:
  ./command-one argument

Typical use case B:
  ./command-two --flag value

## Output

Describe what the output looks like so the agent knows how to parse it.
Exit code 0 = success. Non-zero = error (message on stderr).
```

### Script template

```bash
#!/bin/bash
set -euo pipefail

# Load environment
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
[ -f "$PROJECT_ROOT/.env" ] && export $(grep -v '^#' "$PROJECT_ROOT/.env" | xargs)

# Parse arguments
ARG_ONE="$1"
ARG_TWO="${2:-default_value}"

# Validate
if [ -z "$ARG_ONE" ]; then
  echo "ERROR: arg-one is required" >&2
  echo "Usage: ./command-one <arg-one> [arg-two]" >&2
  exit 1
fi

# Do the work
echo "Running with $ARG_ONE..."
# ... your logic here ...

echo "Done."
exit 0
```

### .clinerules snippet to register skills

```markdown
## Skills

The following skills are available. Read each SKILL.md before using.

| Skill         | Path                          | Use for                        |
|---------------|-------------------------------|--------------------------------|
| git-helper    | ./skills/git-helper/SKILL.md  | All git operations             |
| db-tools      | ./skills/db-tools/SKILL.md    | Database queries and migrations|
| deploy        | ./skills/deploy/SKILL.md      | Staging and production deploys |
| monitoring    | ./skills/monitoring/SKILL.md  | Logs, errors, metrics          |

Prefer skill commands over raw shell commands for these domains.
Always read SKILL.md before first use in a session.
```

### Decision guide: built-in tool vs. skill

```
Do you need to...
  ├── Read or write a file?           → use read_file / write_to_file (built-in)
  ├── Run a general shell command?    → use execute_command (built-in)
  ├── List or search files?           → use list_files / search_files (built-in)
  │
  └── Do something domain-specific?
        ├── Git operations?           → use git-helper skill
        ├── Database operations?      → use db-tools skill
        ├── Deploy something?         → use deploy skill
        ├── Check production health?  → use monitoring skill
        └── Manage AgentDesk tasks?   → use agent-desk skill
```

If you find yourself writing the same `execute_command` invocation more than twice, it belongs in a skill.
