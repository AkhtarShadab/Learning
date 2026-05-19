# AgentDesk Connectors & Integrations
## Notion, Telegram, and Others — How They Connect, Data Flow, Use Cases

---

## The Mental Model: Connectors as Data Bridges

AgentDesk is an island by default — it manages tasks and agents internally. Connectors are **bridges** that let information flow in both directions between AgentDesk and external services.

```
External World                AgentDesk
─────────────────────────────────────────────────────
Notion page updated     →     Agent creates/updates task
Telegram message        →     Agent receives brief, responds
AgentDesk task done     →     Notion database entry updated
Agent posts comment     →     Telegram message sent to user
```

Think of connectors not as integrations to configure once and forget, but as **channels** that agents actively use. The connector provides the pipe; the agent decides when and what flows through it.

---

## Integration Architecture

```
┌─────────────┐     ┌──────────────────────┐     ┌──────────────┐
│  External   │     │   AgentDesk Core     │     │   Agents     │
│  Service    │◄────►  Integration Layer   │◄────►  (ad-*       │
│ (Notion,    │     │  - Credential store  │     │   commands)  │
│  Telegram)  │     │  - Event bridge      │     └──────────────┘
└─────────────┘     │  - Service runner    │
                    └──────────────────────┘
```

Each integration:
1. **Stores credentials** in AgentDesk's secure config (not exposed to agents directly)
2. **Runs a service** — a polling loop or webhook listener that bridges events
3. **Exposes commands** — `ad-<service>-*` commands agents use to interact

---

## Checking Integration Status

```bash
# Check if an integration is connected
ad-integration-status notion
ad-integration-status telegram

# Verify the connection can actually reach the service
ad-integration-verify notion
```

**Output:**
```
notion: connected
telegram: connected

Notion verification: ✅ Can reach workspace "My Workspace" (5 databases found)
```

---

## Notion Integration

### What It Does

The Notion connector lets agents read from and write to Notion databases and pages. Use cases:
- Create a task in AgentDesk when a Notion database entry is added
- Update a Notion page when an AgentDesk task is completed
- Pull research context from Notion pages before starting work
- Sync project status to a Notion dashboard

### Connecting

```bash
ad-notion-connect <ntn_token>
```

Where `<ntn_token>` is a Notion internal integration token (starts with `ntn_`). To get one:
1. Go to notion.so/my-integrations
2. Create a new integration
3. Copy the "Internal Integration Secret"
4. Share the relevant databases/pages with your integration

**Verification:**
```bash
ad-integration-verify notion
# → Checks that the token can reach at least one database
```

### Disconnecting

```bash
ad-notion-disconnect
# → Removes the stored token; Notion features stop working
```

### Data Flow: Notion → AgentDesk

```
Notion database row added/updated
         │
         ▼
AgentDesk polling service detects change
         │
         ▼
Agent receives notification or creates task automatically
         │
         ▼
Agent processes, posts results back to Notion
```

### Usage Patterns

**Pattern 1: Notion as a task inbox**
Set up a Notion database as a "request queue." When a new row appears, the agent creates an AgentDesk task from it.

**Pattern 2: Notion as a deliverable store**
When an agent completes a research task, it writes the output to a Notion page for human review.

**Pattern 3: Bidirectional status sync**
Keep a Notion "project tracker" database in sync with AgentDesk task statuses. When a task moves to `done`, update the corresponding Notion row.

### Real-World Example

```bash
# Agent reads a Notion page for context before starting work
# (via API call using the stored token)
# Then posts results back when done

# Check connection first
ad-integration-status notion

# Use the Notion API for actual data operations
# (agents make these calls using the credentials managed by AgentDesk)
```

---

## Telegram Integration

### What It Does

The Telegram connector bridges AgentDesk to a Telegram bot. Use cases:
- Get notified in Telegram when a task is completed or blocked
- Send commands to agents via Telegram messages
- Receive daily/weekly summary reports in Telegram
- Alert humans when something needs urgent attention

### Connecting

```bash
# Polling mode (simpler, works without public URL)
ad-telegram-connect <bot-token> polling

# Webhook mode (lower latency, requires public HTTPS URL)
ad-telegram-connect <bot-token> webhook https://your-domain.com/webhook
```

To get a bot token:
1. Message `@BotFather` on Telegram
2. Send `/newbot`, follow prompts
3. Copy the token provided

**Polling vs Webhook:**
| Mode | How it works | Best for |
|------|-------------|----------|
| Polling | Bot checks Telegram every few seconds | Local/dev setups, no public URL |
| Webhook | Telegram pushes updates to your URL | Production, lower latency |

### Sending Messages from Agents

```bash
# Send to the install owner (default)
ad-telegram-send "Task 'Weekly Report' is complete. Review it here: http://localhost:3838"

# Send to a specific user
ad-telegram-send "Urgent: API is down" --user <telegram-user-id>

# Send to a specific chat/group
ad-telegram-send "Deployment complete" --chat <chat-id>

# Send with Markdown formatting
ad-telegram-send "*Task Complete*\n\nThe report has been generated." --parse markdown
```

### Disconnecting

```bash
ad-telegram-disconnect
# → Stops the polling/webhook service and removes all Telegram state
```

### Data Flow: Telegram → AgentDesk

```
User sends Telegram message to bot
         │
         ▼
Telegram service receives via polling/webhook
         │
         ▼
AgentDesk creates task or triggers agent based on message content
         │
         ▼
Agent processes and sends response via ad-telegram-send
         │
         ▼
User receives reply in Telegram
```

### Usage Patterns

**Pattern 1: Completion notifications**

Schedule a nightly cron that sends a Telegram summary:
```bash
ad-cron-create \
  --project projectId \
  --agent master-agent \
  --name "Daily Summary to Telegram" \
  --cron "0 18 * * *" \
  --message "Generate today's summary (tasks completed, in progress, blocked) and send it via Telegram to the owner."
```

**Pattern 2: Alert on blockers**

When an agent pauses a task, send an alert:
```bash
# In agent code, before pausing:
ad-telegram-send "⚠️ Task 'X' is blocked: waiting for API credentials. Please provide them to unblock."
ad-pause task <taskId> <agentId> "Waiting for API credentials"
```

**Pattern 3: Command via Telegram**

Configure the bot to accept commands like `/status` or `/tasks` that trigger agent responses.

---

## Future Connectors

AgentDesk's integration architecture is designed to be extensible. The same pattern applies to any service:
1. `ad-<service>-connect <credentials>` — store credentials
2. `ad-integration-status <service>` — check connection
3. `ad-<service>-<action>` — interact with the service
4. `ad-<service>-disconnect` — remove credentials

Expected future connectors include Slack, GitHub, Linear, Jira, and webhook-based generic integrations.

---

## Integration Security Model

**Credentials are never exposed to agents directly.** The flow is:

```
Human provides token
      │
      ▼
AgentDesk stores it (encrypted at rest)
      │
      ▼
Service runner uses token for API calls
      │
      ▼
Agent calls ad-* commands (which proxy through AgentDesk, no raw token)
```

Agents never see the raw Notion token or Telegram bot token. They interact through the `ad-*` abstraction layer.

---

## Troubleshooting Integrations

### "Integration shows connected but doesn't work"

```bash
# Verify the connection can actually reach the service
ad-integration-verify notion

# Check if the service is running (for Telegram)
# Look at recent logs or try sending a test message
ad-telegram-send "Test message"
```

### "Messages aren't being received"

For Telegram polling mode — check that the polling service is still running. It may need to be restarted:
```bash
ad-telegram-disconnect
ad-telegram-connect <bot-token> polling
```

### "Notion API calls failing"

- Ensure the integration token hasn't expired
- Verify the Notion page/database is shared with the integration
- Re-run `ad-notion-connect` with a fresh token if needed

---

## Anti-Patterns

| Anti-pattern | Problem | Fix |
|-------------|---------|-----|
| Hardcoding Notion tokens in agent code | Security risk, breaks when token rotates | Use `ad-notion-connect` to store; let AgentDesk manage |
| Polling Notion from agent code directly | Creates undocumented dependency | Use the integration layer so it's visible and manageable |
| Sending Telegram messages without checking status | Fails silently if disconnected | Check `ad-integration-status telegram` first |
| Using Telegram for all notifications | Notification fatigue | Reserve Telegram for urgent/actionable items; use task comments for progress |
| Not testing with `ad-integration-verify` after setup | May appear connected but be broken | Always verify after connecting |
