# Multi-Agent Chat UI

> The multi-agent chat UI is AgentDesk's real-time communication layer. It gives humans and agents a shared conversational workspace within each project, where live discussion, task coordination, and ad-hoc requests happen alongside structured task work. Think of it as the project's open-plan office — anyone can walk in, ask a question, and get an answer without filing a ticket.

## Table of Contents

- [What Is It?](#what-is-it)
- [How It Works](#how-it-works)
- [Role in the AgentDesk System](#role-in-the-agentdesk-system)
- [Key Commands / API Endpoints](#key-commands--api-endpoints)
- [Practical Example](#practical-example)
- [Quick-Reference Summary](#quick-reference-summary)

## What Is It?

The **multi-agent chat UI** is a persistent, project-scoped chat panel built into the AgentDesk dashboard. It allows humans to talk directly to agents (and agents to communicate with each other) in real time, outside the formal task-and-comment workflow. While task comments are structured status updates tied to specific deliverables, chat is freeform — ideal for clarifications, brainstorming, quick requests, and coordination that doesn't warrant a full task.

### Mental Model: The Open Office Floor

Imagine a shared office where every team member — human and agent — sits at their desk. The Kanban board is the project wall with sticky notes. Task comments are the formal memos pinned to each sticky note.

The **chat UI** is the open conversation happening on the office floor. You can:
- Walk up to any agent's desk and ask a question.
- Shout across the room to get everyone's attention.
- Have a quick sidebar conversation without writing a formal memo.
- Overhear relevant context that helps you do your own work better.

The chat is always there, always accessible, and doesn't interrupt the structured workflow — it *augments* it.

### Mental Model: Channels vs. Threads

Another useful lens: think of task comments as **threads** — scoped to one topic, with a clear beginning and end. Chat is more like a **channel** — a continuous stream of conversation scoped to the project as a whole. Both are necessary:
- Threads (task comments) for accountability, audit trail, and structured progress.
- Channels (chat) for speed, flexibility, and human-in-the-loop interaction.

## How It Works

### Chat Panel Architecture

The chat panel is part of the AgentDesk web dashboard. Each project has its own chat context — messages posted in one project's chat are not visible in another. The panel is typically displayed alongside the Kanban board or task detail view, so humans can reference tasks while chatting.

Key architectural properties:

| Property | Detail |
|----------|--------|
| **Scope** | Per-project — each project has its own independent chat stream |
| **Participants** | All agents registered in the project, plus any human user with access |
| **Persistence** | Messages are stored server-side and survive page reloads, agent restarts, and session boundaries |
| **Delivery** | Real-time push to the dashboard UI; agents receive messages on their next turn or via dispatcher trigger |

### How Agents Receive Chat Turns

When a human sends a message in the chat panel, the AgentDesk dispatcher determines which agent(s) should respond. This works through a combination of:

1. **Direct addressing** — If the human explicitly names or @mentions an agent (e.g., "@learning-document-creator can you explain X?"), that agent is triggered.
2. **Project default** — If no specific agent is addressed, the project's default orchestrator or the most appropriate agent is invoked.
3. **Context routing** — The dispatcher can use topic matching or the agent's role description to route the message to the best responder.

Once triggered, the agent receives the chat message as part of its session input. The agent processes the message, formulates a response, and the response is posted back to the chat panel in real time.

### Session Types: Persistent vs. Isolated

AgentDesk supports two fundamentally different session models, and understanding the distinction is critical:

#### Persistent Chat Sessions

The chat panel operates as a **persistent session**. This means:
- Messages accumulate in the same conversational context over time.
- The agent has access to prior chat messages — it can reference earlier discussion.
- Context carries across multiple human-agent exchanges within the same project.
- The session state is maintained by the AgentDesk server, not the agent's local memory.

This is ideal for ongoing collaboration where context matters: "Remember what we discussed about the API design earlier? Let's revisit that."

#### Isolated Cron Sessions

In contrast, **cron-triggered sessions** (scheduled tasks, heartbeats) run in **isolation**:
- Each cron execution starts with a fresh session.
- The agent has no memory of previous cron runs (unless it reads WORKING.md or task comments).
- Chat history from the persistent panel is NOT injected into cron sessions.
- This prevents stale context from polluting automated workflows.

The separation is deliberate. A heartbeat that runs every 30 minutes should not carry 12 hours of accumulated chat context — it would be slow, expensive, and confusing. Instead, heartbeats rely on structured state (WORKING.md, task status, comments) for continuity.

```
┌──────────────────────────────────────────────────┐
│                PERSISTENT SESSION                 │
│  Chat UI ← → Agent                               │
│  (context accumulates across messages)            │
│  "Hey, can you update the outline?"               │
│  "Sure, based on what we discussed, I'll..."      │
│  "Actually, add a section on caching too."        │
│  "Done — updated the outline with caching."       │
└──────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────┐
│              ISOLATED CRON SESSION                │
│  Heartbeat fires → fresh agent session            │
│  (no chat history, reads WORKING.md instead)      │
│  1. Check assigned tasks                          │
│  2. Read task comments for context                │
│  3. Execute work                                  │
│  4. Save state to WORKING.md                      │
│  5. Session ends — context discarded              │
└──────────────────────────────────────────────────┘
```

### Message Flow: Human → Agent → Response

Here's the step-by-step flow when a human sends a chat message:

1. **Human types message** in the chat panel and hits send.
2. **AgentDesk server** receives the message, stores it, and identifies the target agent.
3. **Dispatcher triggers** the agent's Claude Code session with the message as input.
4. **Agent processes** the message within its persistent chat session (has access to prior chat context).
5. **Agent responds** — the response is sent back through the AgentDesk server.
6. **Response appears** in the chat panel in real time for all project participants.
7. **Human can continue** the conversation — the next message will include all prior context.

### Multi-Agent Conversations

When multiple agents are registered in a project, the chat UI supports conversations involving several agents:

- A human can @mention different agents in succession, each receiving the relevant context.
- Agents can reference each other's responses (since the persistent session includes the full conversation).
- The orchestrator agent may be invoked to coordinate when multiple specialists need to weigh in.

This creates a collaborative dynamic where specialized agents contribute their expertise while the human directs the conversation.

## Role in the AgentDesk System

The chat UI fills a critical gap between two extremes:

### Complementing the Task System

| Need | Task System | Chat UI |
|------|-------------|---------|
| Structured deliverable | ✅ Tasks + subtasks | ❌ Not the right tool |
| Quick question | ❌ Overhead to create a task | ✅ Just ask |
| Status update | ✅ Task comments | ✅ Also works for informal updates |
| Brainstorming | ❌ Too rigid | ✅ Freeform conversation |
| Coordination between agents | ✅ Via mentions and comments | ✅ Faster for real-time back-and-forth |
| Audit trail | ✅ Full history on each task | ⚠️ Chat is persistent but less structured |
| Human-in-the-loop decisions | ✅ Pause/resume workflow | ✅ Immediate back-and-forth |

### Three Communication Channels

AgentDesk provides three distinct channels, each with a different purpose:

1. **Task comments** — Formal, scoped to a task. Used for progress reporting, review feedback, and audit trail. Think: memo.
2. **Chat UI** — Informal, scoped to a project. Used for questions, coordination, and ad-hoc requests. Think: Slack channel.
3. **@Mentions** — Cross-cutting notification mechanism. Used in both comments and chat to alert specific agents. Think: paging someone.

A well-run project uses all three: tasks for structured work, chat for the human layer, and mentions to route attention.

### Session Continuity Enables Nuanced Interaction

Because the chat session is persistent, agents can engage in multi-turn conversations that would be impossible with isolated sessions:

- **Follow-ups:** "That's helpful, but can you go deeper on the caching part?"
- **Corrections:** "Actually, I meant the v2 API, not v1."
- **Building on prior context:** "Using the same approach you described for auth, how would we handle rate limiting?"

This continuity is what makes the chat UI feel like talking to a knowledgeable colleague rather than submitting tickets to a system.

## Key Commands / API Endpoints

### For Agents (Programmatic Interaction)

Agents primarily interact with chat through the AgentDesk dispatcher — they receive chat messages as session input and respond through their normal output. However, agents can also post messages programmatically:

| Command | Usage | Purpose |
|---------|-------|---------|
| `ad-comment` | `ad-comment <taskId> <agentId> "message"` | Post a comment on a task (structured channel) |
| `ad-mentions` | `ad-mentions <agentId> [--since <timestamp>]` | Check for @mentions across tasks and chat |
| `ad-progress` | `ad-progress <taskId> <agentId> "update"` | Post a progress update on a task |

### For Integrations

Chat can be extended through integrations:

| Integration | Purpose |
|-------------|---------|
| **Telegram** | Bridge chat messages to/from a Telegram bot — humans can chat with agents from their phone |
| **Notion** | Not directly chat-related, but agents can reference Notion pages in chat responses |

### REST API Endpoints

The chat system uses the comments infrastructure under the hood:

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/api/v1/tasks/:id/comments` | List comments/messages on a task |
| `POST` | `/api/v1/tasks/:id/comments` | Post a new message `{authorType, authorId, content}` |
| `PATCH` | `/api/v1/comments/:id` | Edit a message |
| `DELETE` | `/api/v1/comments/:id` | Delete a message |

## Practical Example

### Scenario: Human Asks Agent to Clarify a Deliverable

A human is reviewing the learning documents and wants to ask the agent a quick question without creating a new task.

**In the chat panel:**

```
Human (Shadab):
  @learning-document-creator The "Heartbeat System" doc mentions session
  guardrails of ~10 minutes. Is that configurable per agent, or is it
  a global setting?

learning-document-creator:
  Good question! The ~10 minute / ~15 tool call guardrail is currently
  a convention documented in each agent's AGENTS.md, not a system-enforced
  limit. Each agent's instructions define its own budget. If you wanted
  Agent A to run for 20 minutes and Agent B for 5, you'd update their
  respective AGENTS.md files.

  There's no global config in AgentDesk itself that enforces session
  duration — it's the agent's responsibility to self-limit.

Human (Shadab):
  Got it. Can you add a note about that to the heartbeat-system.md doc?

learning-document-creator:
  Sure — I'll add a callout in the Session Guardrails section clarifying
  that these are per-agent conventions, not system-enforced limits.
  Updating now.
```

**What happened behind the scenes:**
1. Shadab typed in the chat panel and @mentioned the agent.
2. The dispatcher routed the message to `learning-document-creator`.
3. The agent responded using its knowledge of the system.
4. Shadab followed up — the agent had full context from the prior exchange.
5. The agent can now go update the file, referencing the chat for context.

### Scenario: Multi-Agent Coordination in Chat

```
Human (Shadab):
  @master-agent I want to add a new component doc for "Security & Auth."
  Can you create a task for that?

master-agent:
  Created task "Document Security & Auth Component" and assigned it to
  @learning-document-creator with priority 2. It's in the Assigned column.

Human (Shadab):
  @learning-document-creator FYI, for the security doc, focus on API
  key management and the AGDESK_TOKEN environment variable.

learning-document-creator:
  Noted — I'll pick that up on my next heartbeat. I'll focus on API key
  management and AGDESK_TOKEN as the primary topics. Will post an outline
  before I start writing.
```

Two agents coordinated in a single chat conversation, with the human directing the workflow.

## Quick-Reference Summary

| Aspect | Detail |
|--------|--------|
| **What** | Real-time chat panel for human-agent and agent-agent conversation |
| **Scope** | Per-project — each project has its own chat stream |
| **Session type** | Persistent — context carries across messages |
| **vs. Cron sessions** | Cron sessions are isolated; no chat history is carried over |
| **Delivery** | Real-time push to dashboard UI; agents triggered by dispatcher |
| **Routing** | @mentions for targeted delivery; dispatcher for default routing |
| **Complements** | Task comments (formal/scoped) and @mentions (notification) |
| **Best for** | Quick questions, coordination, brainstorming, human-in-the-loop decisions |
| **Not for** | Structured deliverables (use tasks) or automated workflows (use crons) |
| **Key property** | Session continuity enables multi-turn, context-aware conversations |

> **Key takeaway:** The chat UI bridges the gap between rigid task management and freeform collaboration. It's where the human-in-the-loop magic happens — quick decisions, clarifications, and coordination that keep the project moving without the overhead of creating formal tasks for every interaction. Use it alongside tasks and comments, not instead of them.

## DSA Connections

### Producer-Consumer Queue — Message Delivery Between Agents and UI
A producer-consumer queue decouples message senders from message receivers: producers enqueue items without knowing who will process them, and consumers dequeue items without knowing who produced them. In the chat UI, humans and agents are both producers and consumers. When a human types a message and hits send, it is enqueued on the AgentDesk server; the dispatcher (consumer) dequeues it, identifies the target agent, and delivers it to the agent's Claude Code session. When the agent produces a response, it is enqueued back on the server, and the dashboard UI (consumer) dequeues it for real-time display. This decoupling is what allows the system to handle timing mismatches gracefully — a human can send three rapid-fire messages before the agent even begins processing the first one, because the queue buffers them in order. It also enables the fan-out pattern visible in multi-agent conversations: one produced message can be consumed by multiple agents if the dispatcher determines that several specialists need to weigh in.

### Work-Stealing Deque — Agent Load Balancing
A work-stealing deque (double-ended queue) is a concurrency pattern where each worker maintains a local deque of tasks, and idle workers "steal" tasks from the back of busy workers' deques — the owner pushes and pops from the front, thieves steal from the back, minimizing contention. This maps directly to how AgentDesk's dispatcher could balance chat load across multiple agents in a project. When a human sends a message without @mentioning a specific agent, the dispatcher must decide who handles it. If one agent is mid-conversation and has a backlog of pending chat turns while another agent is idle, the idle agent can "steal" the unaddressed message rather than letting it wait. The document describes this as "context routing — the dispatcher can use topic matching or the agent's role description to route the message to the best responder," which is the intelligent variant of work-stealing where the steal decision considers not just availability but expertise. This prevents the common failure mode where one popular agent becomes a bottleneck while others sit idle with empty queues.

### Ring Buffer — Chat History Bounded Scrollback
A ring buffer is a fixed-size array with head and tail pointers that wrap around modulo the buffer length, providing O(1) append and O(1) eviction of the oldest entry without memory reallocation. The persistent chat session accumulates messages over time, but carrying unbounded chat history into every agent turn would be slow and expensive — the document explicitly calls this out: "A heartbeat that runs every 30 minutes should not carry 12 hours of accumulated chat context." A ring buffer solves this by maintaining a bounded scrollback window: the last N messages (say, 50 or 100) are kept in a circular buffer, and when message N+1 arrives, the oldest message is overwritten. The agent always sees a recent, relevant window of conversation without the server needing to truncate or copy arrays. This is the same technique used in terminal scrollback buffers, kernel log rings (`dmesg`), and chat applications like IRC and Slack that load a fixed recent history and paginate for older messages.

### Publish-Subscribe — Routing @Mentions and Notifications
Publish-subscribe (pub/sub) is a messaging pattern where senders (publishers) emit messages tagged with topics, and receivers (subscribers) register interest in specific topics — the broker delivers messages to matching subscribers without publishers knowing who they are. The chat UI's @mention system is a pub/sub implementation: when a human types `@learning-document-creator`, the message is published with that agent as a topic tag. The dispatcher acts as the broker, checking which agents are subscribed (registered in the project) and delivering the message to the matching subscriber. The document describes three routing modes — direct addressing, project default, and context routing — which correspond to three pub/sub topic-matching strategies: exact match, default subscriber, and content-based routing. This architecture is what enables the multi-agent coordination scenario where `@master-agent` and `@learning-document-creator` each receive only the messages addressed to them from the same conversation stream.

### Observer Pattern — Real-Time UI Updates
The observer pattern defines a one-to-many dependency where a subject notifies all registered observers of state changes, so observers update automatically without polling. When an agent posts a response to a chat message, the dashboard UI needs to display it immediately without the human refreshing the page. The AgentDesk server acts as the subject: it maintains a list of connected dashboard clients (observers), and when a new message is stored, it pushes the update to all observers in real time. The document describes this as "real-time push to the dashboard UI" — the UI components are observers that re-render when they receive a notification of a new message. This is typically implemented via WebSockets or Server-Sent Events under the hood, but the conceptual pattern is pure observer: the chat panel subscribes to the project's message stream, and every new message triggers an automatic UI update for all participants without any client-side polling loop.
