# Integrations Layer

> The integrations layer connects AgentDesk to external services like Notion and Telegram. It provides a standardized architecture for adding, verifying, and managing third-party connections, allowing agents and humans to extend AgentDesk's reach beyond its own ecosystem.

## Table of Contents

- [What Is It?](#what-is-it)
- [How It Works](#how-it-works)
- [Role in the AgentDesk System](#role-in-the-agentdesk-system)
- [Key Commands / API Endpoints](#key-commands--api-endpoints)
- [Practical Example](#practical-example)
- [Quick-Reference Summary](#quick-reference-summary)

## What Is It?

The **integrations layer** is AgentDesk's connector architecture for bridging to external services. Each integration follows a universal pattern: connect (provide credentials), verify (test the connection), and then use (read/write to the external service).

### Mental Model: The Adapter Pattern

Think of integrations as power adapters for international travel:
- AgentDesk is your device (it speaks one protocol)
- Each external service is a different power outlet (different protocol)
- An integration is the adapter that bridges the two
- Once plugged in (connected and verified), data flows seamlessly

Each adapter has the same plug on the AgentDesk side (standard connect/verify/status commands) but a different plug on the service side (Notion API, Telegram Bot API, etc.).

### Currently Available Integrations

| Integration | Type | Purpose |
|------------|------|---------|
| **Notion** | Knowledge/docs | Sync pages, databases, and content between AgentDesk and Notion workspaces |
| **Telegram** | Messaging | Send notifications, receive commands, and interact with users via Telegram bots |

More integrations are planned. The architecture is designed to be extensible — adding a new integration follows the same connect/verify/use pattern.

## How It Works

### The Universal Connection Flow

Every integration follows the same three-step process:

```
1. CONNECT   →   Provide credentials (API token, bot token, etc.)
2. VERIFY    →   Test that the connection actually works
3. USE       →   Read from / write to the external service
```

**Step 1: Connect**

The user provides authentication credentials for the external service. These are stored securely in AgentDesk:

```bash
# Notion
ad-notion-connect <ntn_token>

# Telegram
ad-telegram-connect <bot-token> [polling|webhook] [url]
```

**Step 2: Verify**

After connecting, verify that the credentials are valid and the service is reachable:

```bash
# Check if integration is connected
ad-integration-status notion

# Verify it can actually reach the service
ad-integration-verify notion
```

Verification is important because credentials might be valid but permissions might be insufficient, or the service might be unreachable.

**Step 3: Use**

Once connected and verified, agents and humans can interact with the external service:

```bash
# Telegram: send a message
ad-telegram-send "Build complete! All tests passing." --parse markdown
```

### Notion Integration

The Notion integration connects AgentDesk to a Notion workspace using an **internal integration token** (starts with `ntn_`).

**Setup:**
1. Create an internal integration in Notion's developer portal
2. Share relevant pages/databases with the integration
3. Connect: `ad-notion-connect <ntn_token>`
4. Verify: `ad-integration-verify notion`

**Capabilities:**
- Read Notion pages and databases
- Write/update Notion content
- Sync knowledge between AgentDesk project files and Notion pages

**Disconnecting:**
```bash
ad-notion-disconnect
```

### Telegram Integration

The Telegram integration connects AgentDesk to a Telegram bot, enabling bidirectional messaging.

**Setup:**
1. Create a bot via Telegram's @BotFather
2. Get the bot token
3. Connect: `ad-telegram-connect <bot-token> polling`
4. The bot starts listening for messages

**Modes:**
- **Polling** — The bot polls Telegram's servers for new messages. Simpler setup, no external URL needed.
- **Webhook** — Telegram pushes messages to a URL you provide. More efficient for production use, requires a publicly accessible endpoint.

**Proactive messaging:**
```bash
# Send to the default user (install owner)
ad-telegram-send "Task completed successfully!"

# Send to a specific user
ad-telegram-send "Your report is ready." --user <telegram-user-id>

# Send to a group chat
ad-telegram-send "Build status: passing" --chat <chat-id>

# With markdown formatting
ad-telegram-send "**Build complete**\nAll 47 tests passing." --parse markdown
```

**Disconnecting:**
```bash
ad-telegram-disconnect
# Stops the bot service and wipes all Telegram state
```

## Role in the AgentDesk System

Integrations extend AgentDesk's capabilities beyond its own boundaries:

1. **Notification delivery** — Telegram integration enables agents to push status updates, alerts, and reports directly to users' phones.

2. **Knowledge sync** — Notion integration allows bidirectional sync between AgentDesk's project files and external knowledge bases.

3. **External triggers** — Users can send commands to agents via Telegram, creating another input channel alongside the AgentDesk chat UI.

4. **Workflow bridging** — Integrations allow AgentDesk workflows to span multiple tools. For example: agent completes a task → writes deliverable to project files → syncs summary to Notion → sends completion notification via Telegram.

5. **User convenience** — Users can monitor agent progress and interact with the system from wherever they are (Telegram on mobile) without needing to open the AgentDesk dashboard.

### Integration Architecture Principles

- **Credential isolation** — Each integration's credentials are stored separately and never exposed in logs or comments
- **Graceful degradation** — If an integration is unavailable, it shouldn't break core AgentDesk functionality
- **Status transparency** — `ad-integration-status` makes it easy to check if an integration is healthy
- **Clean teardown** — Disconnecting removes all integration state cleanly

## Key Commands / API Endpoints

### CLI Commands

| Command | Usage | Purpose |
|---------|-------|---------|
| `ad-integration-status` | `ad-integration-status <name>` | Check if an integration is connected |
| `ad-integration-verify` | `ad-integration-verify <name>` | Verify the connection can reach the service |
| `ad-notion-connect` | `ad-notion-connect <ntn_token>` | Connect Notion integration |
| `ad-notion-disconnect` | `ad-notion-disconnect` | Remove Notion integration |
| `ad-telegram-connect` | `ad-telegram-connect <bot-token> [mode] [url]` | Connect Telegram bot |
| `ad-telegram-disconnect` | `ad-telegram-disconnect` | Remove Telegram integration |
| `ad-telegram-send` | `ad-telegram-send "msg" [--user <id>] [--chat <id>] [--parse mode]` | Send a Telegram message |

## Practical Example

### Scenario: Setting Up Telegram Notifications for Task Completion

You want agents to notify you via Telegram when they complete tasks.

**Step 1: Create a Telegram bot**

Message @BotFather on Telegram:
```
/newbot
Bot name: AgentDesk Notifier
Bot username: agentdesk_notify_bot
```

BotFather gives you a token like `7123456789:AAH...`.

**Step 2: Connect the bot to AgentDesk**

```bash
ad-telegram-connect 7123456789:AAHxxxxxxxxxxxxxx polling
```

**Step 3: Verify the connection**

```bash
ad-integration-status telegram
# → connected: true

ad-integration-verify telegram
# → verified: true, mode: polling
```

**Step 4: Start your Telegram bot**

Message your bot on Telegram to establish the chat. This links your Telegram user ID as the default recipient.

**Step 5: Agent sends notification on task completion**

In the agent's workflow, after submitting a task:

```bash
ad-telegram-send "✅ Task complete: Write architecture docs. Document saved to agentdesk/architecture.md. Ready for review." --parse markdown
```

You receive this message on your phone via Telegram.

## Quick-Reference Summary

| Aspect | Detail |
|--------|--------|
| **What** | Connector architecture for external services |
| **Pattern** | Connect (credentials) → Verify (test) → Use (read/write) |
| **Current integrations** | Notion (knowledge sync), Telegram (messaging) |
| **Notion auth** | Internal integration token (`ntn_...`) |
| **Telegram modes** | Polling (simple) or Webhook (production) |
| **Status check** | `ad-integration-status <name>`, `ad-integration-verify <name>` |
| **Disconnecting** | `ad-notion-disconnect` / `ad-telegram-disconnect` |
| **Architecture** | Extensible, credential-isolated, gracefully degrading |

> **Key takeaway:** Integrations extend AgentDesk from a self-contained task management system into a connected hub that bridges to where your users and data already live. The universal connect/verify/use pattern makes adding new integrations predictable and consistent.
