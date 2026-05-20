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

---

## DSA Connections

### Adapter Pattern — Bridging External Service Protocols to a Uniform Agent Interface

The **adapter pattern** wraps an incompatible interface so it conforms to the interface a client expects, enabling integration without modifying either side. Each AgentDesk connector is a concrete adapter: the Notion connector translates between Notion's REST API (which speaks OAuth tokens, block objects, database queries with filter syntax) and the uniform `ad-notion-*` command interface that agents use. The Telegram connector similarly adapts Telegram's Bot API (with its chat IDs, update polling, and Markdown parse modes) into `ad-telegram-send` with simple flags like `--chat` and `--parse markdown`. Agents never interact with Notion's or Telegram's native APIs directly — they call the adapted `ad-*` commands, and the integration layer handles authentication, request formatting, response parsing, and error translation. This is why the document's architecture diagram shows the "Integration Layer" sitting between external services and agents: it is the adapter, and its existence means adding a new connector (Slack, GitHub, Linear) requires only implementing a new adapter to the same `ad-<service>-*` interface, with zero changes to agent code.

### Producer-Consumer Queue — Event Bridge Between External Services and Agent Processing

A **producer-consumer queue** is a thread-safe data structure where producer threads enqueue items and consumer threads dequeue them, decoupling the rate of production from the rate of consumption. The Telegram polling service and the Notion change-detection service are producers: the Telegram poller checks for new messages every few seconds and enqueues them as events; the Notion poller detects database row changes and enqueues update events. AgentDesk agents are consumers: when a heartbeat fires or a task is triggered, the agent dequeues pending events and processes them (creating tasks, sending responses, updating statuses). The document's data flow diagrams — "Telegram message → service receives → AgentDesk creates task → agent processes → agent sends response" — trace the lifecycle of a single item through this producer-consumer pipeline. The webhook mode for Telegram is a push-based producer (Telegram itself pushes updates to the queue), while polling mode is a pull-based producer (the service periodically checks for new items), but both feed the same consumer interface.

### Connection Pool — Credential Management and Persistent Service Connections

An **object pool** (connection pool) maintains a set of initialized, reusable connections to avoid repeated creation and teardown overhead. AgentDesk's integration layer manages persistent connections to external services: the Notion integration maintains a live HTTP client authenticated with the stored `ntn_` token, and the Telegram integration maintains either a persistent polling loop or a webhook listener — both are long-lived connections reused across every agent invocation. The credential store acts as the pool's initialization mechanism: `ad-notion-connect` creates and authenticates a connection entry, `ad-integration-verify` validates that a pooled connection is still healthy (analogous to a connection pool's health-check ping), and `ad-notion-disconnect` drains and destroys the connection. The security model — "agents never see the raw token; they interact through the `ad-*` abstraction layer" — is the pool's encapsulation property: consumers check out a connection handle without accessing the underlying credentials, just as database connection pools return opaque connection objects rather than raw TCP sockets.

### Pub-Sub with Topic Filtering — Bidirectional Event Routing Between Services

A **publish-subscribe** system with topic filtering allows publishers to emit events and subscribers to receive only events matching a declared interest pattern. The connector architecture implements bidirectional pub-sub: on the inbound side, external services (Notion row updated, Telegram message received) publish events to the integration layer, which routes them to the appropriate agent based on project and task configuration — the "topic" is the service name and event type. On the outbound side, agents publish commands (`ad-telegram-send "Task complete"`) that the integration layer routes to the correct external service based on the service prefix in the command name. The document's usage patterns illustrate topic-filtered subscription: "completion notifications" subscribe to task-completion events and route them to Telegram; "Notion as a task inbox" subscribes to Notion database-change events and routes them to task creation. The future connector roadmap (Slack, GitHub, Linear, webhook-based generics) follows the same pub-sub model — each new service is a new topic publisher/subscriber that plugs into the existing routing infrastructure.
