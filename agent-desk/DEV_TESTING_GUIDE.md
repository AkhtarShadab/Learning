# AgentDesk — Dev Mode Testing Guide

---

## 1. Prerequisites

| Requirement | Version |
|---|---|
| Node.js | >= 20 |
| npm | >= 9 |
| SQLite | (bundled via better-sqlite3) |
| Camoufox (optional) | for browser automation tests |

---

## 2. Initial Setup

```bash
# Clone / enter the project
cd /home/shadab/projects/agent-desk

# Install dependencies
npm install

# Copy environment variables
cp .env.example .env

# Generate DB migrations & push schema
npm run db:generate
npm run db:migrate

# (Optional) Seed the database with test data
npm run db:seed
```

---

## 3. Starting the Dev Server

### Option A — HMR Dev Mode (Hot Reload)
```bash
npm run dev
# → http://localhost:3737
```
> **Warning:** Without `NODE_ENV=production`, Next.js dev mode auto-refreshes the UI. Only use this for frontend iteration.

### Option B — Production-like Mode (Recommended for Testing)
```bash
npm run build
NODE_ENV=production npx tsx server.ts
# → http://localhost:3737
```

### Option C — Custom Port
Edit `~/.agent-desk/config.json` (or `agent-desk.json` in your working dir):
```json
{ "server": { "port": 8080 } }
```

---

## 4. Running the Test Suite

### Run All Tests Once
```bash
npm test
# or explicitly:
npm run test
# → vitest run
```

### Watch Mode (re-runs on file changes)
```bash
npm run test:watch
# → vitest (interactive)
```

### Run a Specific Test File
```bash
npx vitest run src/lib/claudecode/threshold-utils.test.ts
npx vitest run src/app/api/v1/agents/[id]/token-usage/route.test.ts
```

### Existing Test Coverage

| Test File | What It Tests |
|---|---|
| `src/lib/claudecode/threshold-utils.test.ts` | Context window saturation calculation, threshold crossing detection, alert message building |
| `src/app/api/v1/agents/[id]/token-usage/route.test.ts` | `GET /api/v1/agents/:id/token-usage` — usage calculation, threshold logic, HTTP status codes |

---

## 5. TypeScript & Lint Checks

```bash
# Type-check server/app code
npx tsc --noEmit

# Type-check CLI code
npx tsc -p tsconfig.cli.json --noEmit

# Lint
npm run lint
```

---

## 6. Database Operations

```bash
# Generate new migration after schema changes
npm run db:generate

# Apply migrations to the database
npm run db:migrate

# Push schema directly (skips migration files — dev only)
npm run db:push

# Seed with test data
npm run db:seed
```

> **DB Location:** `~/.agent-desk/data.db`
> **Schema Definition:** `src/lib/db/schema.ts`
> **Migrations:** `drizzle/` directory

---

## 7. Testing Key API Endpoints

Use `curl`, Postman, or any HTTP client against `http://localhost:3737`.

### Auth

```bash
# Check auth status
curl http://localhost:3737/api/v1/auth/status

# Login
curl -X POST http://localhost:3737/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"yourpassword"}'

# Get current user
curl http://localhost:3737/api/v1/auth/me \
  -H "Cookie: <session-cookie>"
```

### Agents

```bash
# List agents
curl http://localhost:3737/api/v1/agents

# Token usage for an agent
curl http://localhost:3737/api/v1/agents/<agent-id>/token-usage

# Available agents
curl http://localhost:3737/api/v1/agents/available
```

### Projects & Tasks

```bash
# List projects
curl http://localhost:3737/api/v1/projects

# List tasks
curl http://localhost:3737/api/v1/tasks

# Create a task
curl -X POST http://localhost:3737/api/v1/tasks \
  -H "Content-Type: application/json" \
  -d '{"title":"Test Task","projectId":"<id>","status":"todo"}'

# Update task status
curl -X PATCH http://localhost:3737/api/v1/tasks/<task-id> \
  -H "Content-Type: application/json" \
  -d '{"status":"in-progress"}'
```

### System Health

```bash
curl http://localhost:3737/api/v1/platform/status
curl http://localhost:3737/api/v1/stats
```

### LLM Providers

```bash
# List configured providers
curl http://localhost:3737/api/v1/providers

# Test a provider connection
curl -X POST http://localhost:3737/api/v1/providers/<id>/test
```

---

## 8. Testing Agent Skills (CLI Tools)

Agent skill commands interact with AgentDesk directly:

```bash
ad-projects                                         # List all projects
ad-tasks <projectId>                                # List tasks in a project
ad-task <taskId>                                    # View task details
ad-status <taskId> in-progress                      # Update task status
ad-comment <taskId> "Test comment"                  # Post a comment
ad-assign <taskId> <agentId>                        # Assign a task
ad-pause task <taskId> <agentId> "reason"           # Pause a task
ad-mention <agentId>                                # Get @mentions for an agent
```

---

## 9. Testing Integrations

### Notion

```bash
# Check connection status
curl http://localhost:3737/api/v1/integrations/notion/status

# Verify token
curl -X POST http://localhost:3737/api/v1/integrations/notion/verify \
  -H "Content-Type: application/json" \
  -d '{"token":"secret_xxx"}'
```

### Telegram

```bash
# Check connection status
curl http://localhost:3737/api/v1/integrations/telegram/status
```

### Camoufox Browser Daemon

```bash
# Health check
curl http://localhost:9377/health

# Open a new tab
curl -X POST http://localhost:9377/tabs

# Navigate
curl -X POST http://localhost:9377/tabs/<id>/navigate \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com"}'

# Get DOM snapshot
curl http://localhost:9377/tabs/<id>/snapshot
```

---

## 10. Dispatcher Tuning for Testing

Edit `~/.agent-desk/config.json` to speed up agent polling during dev:

```json
{
  "dispatcher": {
    "tickActiveMs": 5000,
    "tickCoolingMs": 10000,
    "tickIdleMs": 15000,
    "perTurnHardTimeoutMs": 120000,
    "postRunCooldownMs": 5000
  }
}
```

> Remember to restore these to defaults for production to avoid thrashing.

**Default values:**

| Key | Default |
|---|---|
| `tickActiveMs` | 15000 |
| `tickCoolingMs` | 45000 |
| `tickIdleMs` | 90000 |
| `perTurnHardTimeoutMs` | 600000 |
| `postRunCooldownMs` | 60000 |

---

## 11. Writing New Tests

Test files live alongside source files:

```
src/
  lib/
    your-module/
      your-module.ts
      your-module.test.ts   <- place tests here
```

### Unit Test Template

```typescript
import { describe, it, expect } from 'vitest';
import { yourFunction } from './your-module';

describe('yourFunction', () => {
  it('returns expected value', () => {
    expect(yourFunction(input)).toBe(expected);
  });

  it('handles edge case', () => {
    expect(yourFunction(edgeCase)).toBeNull();
  });
});
```

### API Route Test Template

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({ db: { /* mock */ } }));

import { GET } from './route';
import { NextRequest } from 'next/server';

function makeRequest(url: string) {
  return new NextRequest(new URL(url, 'http://localhost:3737'));
}

describe('GET /api/v1/your-route', () => {
  it('returns 200 with data', async () => {
    const req = makeRequest('http://localhost:3737/api/v1/your-route');
    const res = await GET(req, { params: {} });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('data');
  });
});
```

---

## 12. Testing Your Recent Changes

The two most recent features shipped are:
- **Token Consumption Alerts** — context-window saturation tracking with configurable warn thresholds
- **Telegram Voice Notes** — two-way voice communication (Whisper STT + OpenAI TTS)

Both are fully committed. Follow the steps below to verify each one works end-to-end.

---

### 12a. Token Consumption Alerts

**What was built:**
- DB columns `warn1_pct` (default 75) and `warn2_pct` (default 90) on the `agents` table
- Pure utility functions in `src/lib/claudecode/threshold-utils.ts`
- New API endpoint `GET /api/v1/agents/:id/token-usage`
- Chat-bridge wires in the threshold detector and fires an alert once per threshold per session
- Agent detail panel UI to configure thresholds; chat header color ramp uses agent thresholds

#### Step 1 — Confirm the DB migration ran

```bash
# Check that warn1_pct and warn2_pct columns exist on the agents table
sqlite3 ~/.agent-desk/data.db ".schema agents" | grep warn
```

Expected output (two lines):
```
warn1_pct integer DEFAULT 75 NOT NULL,
warn2_pct integer DEFAULT 90 NOT NULL,
```

If missing, run: `npm run db:migrate`

#### Step 2 — Run the existing unit tests

```bash
# Pure-function tests (16 cases — no DB or HTTP needed)
npx vitest run src/lib/claudecode/threshold-utils.test.ts

# API route integration tests (8 cases)
npx vitest run "src/app/api/v1/agents/[id]/token-usage/route.test.ts"
```

All tests should pass with zero failures.

#### Step 3 — Hit the live token-usage endpoint

```bash
# Replace <agent-id> with a real agent ID from your instance
curl -s http://localhost:3737/api/v1/agents/<agent-id>/token-usage | jq .
```

Expected response shape:
```json
{
  "agentId": "<agent-id>",
  "inputTokens": 0,
  "outputTokens": 0,
  "cacheReadInputTokens": 0,
  "cacheCreationInputTokens": 0,
  "contextWindow": 200000,
  "usedTokens": 0,
  "pct": 0,
  "warn1Pct": 75,
  "warn2Pct": 90
}
```

> Token counts are 0 until the agent completes at least one chat turn. Send the agent a message and re-poll to see live numbers.

#### Step 4 — Verify threshold configuration saves via UI

1. Open the AgentDesk dashboard → **Agents** → pick any agent → **Settings** tab
2. Find the **Context Alerts** section
3. Change `warn1Pct` to `50` and `warn2Pct` to `70`, save
4. Re-hit the endpoint:
   ```bash
   curl -s http://localhost:3737/api/v1/agents/<agent-id>/token-usage | jq '.warn1Pct, .warn2Pct'
   ```
   Should return `50` and `70`.

#### Step 5 — Verify chat header color ramp

1. Start a conversation with an agent in the dashboard
2. As tokens accumulate, the context-usage bar in the chat header should turn:
   - **Yellow** when `pct >= warn1Pct`
   - **Red** when `pct >= warn2Pct`

#### Step 6 — Verify alert fires exactly once per threshold per session

Check server logs after an agent turn crosses a threshold:

```bash
tail -f ~/.agent-desk/logs/agdesk.log | grep -i "context window"
```

Expected log line format:
```
⚠️ Agent `<id>` context window is at 76% — WARNING: 75% threshold crossed.
```

The same alert must NOT appear again in the same session unless the session is reset.

---

### 12b. Telegram Voice Notes

**What was built:**
- **Receiving:** Telegram voice/audio → Whisper API (STT) → forwarded to agent as `[Voice message, Ns]: <transcription>`
- **Sending:** `POST /api/v1/integrations/telegram/send` with `voice: true` → OpenAI TTS → OGG/Opus → Telegram voice note
- Graceful degradation when `OPENAI_API_KEY` is not set

#### Prerequisites

```bash
# Required for both STT and TTS
export OPENAI_API_KEY=sk-...

# Optional — customize TTS voice (alloy | echo | fable | onyx | nova | shimmer)
export OPENAI_TTS_VOICE=alloy

# Optional — use higher quality model
export OPENAI_TTS_MODEL=tts-1-hd
```

> Telegram integration must already be connected (bot token + at least one linked chat).
> Check: `curl http://localhost:3737/api/v1/integrations/telegram/status`

#### Step 1 — Verify env vars are picked up

```bash
curl -s http://localhost:3737/api/v1/platform/status | jq .
```

Then from a Node REPL or quick script, confirm:
```bash
node -e "console.log('STT available:', Boolean(process.env.OPENAI_API_KEY))"
```

#### Step 2 — Test sending a voice note via API

```bash
# Send a text-to-speech voice note to a linked Telegram chat
curl -X POST http://localhost:3737/api/v1/integrations/telegram/send \
  -H "Content-Type: application/json" \
  -H "Cookie: <your-session-cookie>" \
  -d '{"text": "Hello! This is a test voice message from AgentDesk.", "voice": true}'
```

Expected response:
```json
{ "ok": true, "chatId": <number>, "messageId": <number>, "voice": true }
```

Check your Telegram — you should receive a playable OGG voice note.

#### Step 3 — Test graceful degradation (no API key)

```bash
# Temporarily unset the key and retry
curl -X POST http://localhost:3737/api/v1/integrations/telegram/send \
  -H "Content-Type: application/json" \
  -H "Cookie: <your-session-cookie>" \
  -d '{"text": "Test without API key", "voice": true}'
```

Expected response (502):
```json
{ "error": "Telegram send failed: OPENAI_API_KEY is not set. Voice replies require an OpenAI API key." }
```

#### Step 4 — Test receiving a voice note (Whisper STT)

1. Open Telegram and send a voice note to your connected AgentDesk bot
2. Watch the server logs:
   ```bash
   tail -f ~/.agent-desk/logs/agdesk.log | grep -i voice
   ```
3. The assigned agent should receive the message in the format:
   ```
   [Voice message, 4s]: <transcribed text here>
   ```
4. The agent should respond in text (default) or in voice if configured to do so.

#### Step 5 — Test long-text truncation

Send a message that exceeds 4000 characters via the voice endpoint. The TTS should:
- Truncate at 4000 chars with a `…` suffix
- Send the voice note for the truncated portion
- Follow up with the full text as a separate text message

#### Step 6 — Test the ad-telegram-send skill (voice flag)

```bash
# From an agent's context, if the skill doc mentions --voice:
ad-telegram-send --voice "Your scheduled summary is ready."
```

---

## 14. Debugging Tips

| Problem | Solution |
|---|---|
| `Could not find a production build` | Run `npm run build` before starting the server |
| Dashboard auto-refreshes constantly | Ensure `NODE_ENV=production` is set |
| DB schema out of sync | Run `npm run db:migrate` |
| Agent not picking up tasks | Check `GET /api/v1/config/dispatcher-paused` |
| Port already in use | Change port in `agent-desk.json` or kill the existing process |
| Context window alerts not firing | Verify `warn1Pct` / `warn2Pct` are set on the agent record in the DB |
| Camoufox unreachable | Check `http://localhost:9377/health` — restart the daemon if needed |

---

## 15. Quick Verification Checklist

```bash
# 1. Server is up
curl http://localhost:3737/api/v1/platform/status

# 2. Auth works
curl http://localhost:3737/api/v1/auth/status

# 3. DB is reachable
curl http://localhost:3737/api/v1/projects

# 4. All unit tests pass
npm test

# 5. TypeScript is clean
npx tsc --noEmit

# 6. Lint is clean
npm run lint

# 7. Browser daemon (if needed)
curl http://localhost:9377/health
```

---
