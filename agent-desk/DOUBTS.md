# 💬 Doubts & Q&A — AgentDesk

> **How to use this file**
> When something confuses you while reading the AgentDesk docs, log it here immediately.
> Come back and fill in the answer once you've figured it out — from docs, experimentation, or asking someone.
> Format: write the question, leave the answer blank, fill it in later.

---

## Template

```
### Q: [Your question here]
**Status:** ⏳ Unanswered / ✅ Answered
**Source doc:** [which .md file triggered this doubt]

**Answer:**
> [Fill this in once resolved]

**Notes:**
> [Any extra context, links, or follow-up thoughts]
```

---

## Architecture & System

### Q: What is the difference between the Dispatcher and the SessionPool in AgentDesk?
**Status:** ⏳ Unanswered
**Source doc:** `00-agentdesk-overview.md`

**Answer:**
>

**Notes:**
>

---

### Q: How does the ChatBridge connect the browser chat UI to a running Claude Code session?
**Status:** ⏳ Unanswered
**Source doc:** `00-agentdesk-overview.md`

**Answer:**
>

**Notes:**
>

---

### Q: What happens when two agents are both eligible to pick up the same task at the same tick?
**Status:** ⏳ Unanswered
**Source doc:** `01-architecture-summary.md`

**Answer:**
>

**Notes:**
>

---

### Q: Why does the dispatcher tick slow down from 15s to 90s when idle?
**Status:** ⏳ Unanswered
**Source doc:** `01-architecture-summary.md`

**Answer:**
>

**Notes:**
>

---

## Heartbeat & Task Lifecycle

### Q: What is the exact sequence of events from heartbeat trigger → agent picks up task → task completes?
**Status:** ⏳ Unanswered
**Source doc:** `00-agentdesk-overview.md`

**Answer:**
>

**Notes:**
>

---

### Q: What does "pausing" a task actually do — does it kill the running agent session?
**Status:** ⏳ Unanswered
**Source doc:** `00-agentdesk-overview.md`

**Answer:**
>

**Notes:**
>

---

## Cron Scheduler

### Q: What was broken in the cron field mapping before v0.1.2, and what broke because of it?
**Status:** ⏳ Unanswered
**Source doc:** `02-upstream-v012-features.md`

**Answer:**
>

**Notes:**
>

---

### Q: What is the "dual-cache singleton" bug in the scheduler — why does it cause problems?
**Status:** ⏳ Unanswered
**Source doc:** `02-upstream-v012-features.md`

**Answer:**
>

**Notes:**
>

---

## LLM Proxy & Integrations

### Q: Why does AgentDesk proxy LLM requests instead of having agents call Anthropic directly?
**Status:** ⏳ Unanswered
**Source doc:** `00-agentdesk-overview.md`

**Answer:**
>

**Notes:**
>

---

### Q: What was the Notion MCP path fix about — what broke and why did webpack cause it?
**Status:** ⏳ Unanswered
**Source doc:** `02-upstream-v012-features.md`

**Answer:**
>

**Notes:**
>

---

### Q: What does the Telegram dynamic import fix solve — why does dynamic import matter here?
**Status:** ⏳ Unanswered
**Source doc:** `02-upstream-v012-features.md`

**Answer:**
>

**Notes:**
>

---

## Dev & Testing

### Q: How do you test an agent skill locally without triggering a real heartbeat?
**Status:** ⏳ Unanswered
**Source doc:** `DEV_TESTING_GUIDE.md`

**Answer:**
>

**Notes:**
>

---

### Q: What is the difference between starting the dev server with `npm run dev` vs `npm start` — beyond NODE_ENV?
**Status:** ✅ Answered
**Source doc:** `DEV_TESTING_GUIDE.md`

**Answer:**
> `npm run dev` runs `tsx server.ts` without setting NODE_ENV, which defaults to development mode and enables verbose chat-proxy WebSocket logging on every message frame. `npm start` runs `NODE_ENV=production tsx server.ts` which suppresses the dev-only logging, making it much quieter and preventing terminal floods that can crash VS Code over long sessions.

**Notes:**
> This was actually a real issue encountered — VS Code terminal was crashing due to constant logging from the chat-proxy in dev mode.

---

## Add Your Own Below ↓

---
