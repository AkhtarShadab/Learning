# 💬 Doubts & Q&A — AgentDesk

---

### Q1: Explain the Claude Code SDK with a mental model.

**Answer:**

**Mental Model 1 — The Contractor Analogy:**
Raw Claude API = micromanaging a contractor (one message → one reply, you manage every step). Claude Code SDK = handing the contractor a master key and a goal — they read blueprints, make decisions, and deliver a finished result autonomously.

**Mental Model 2 — The Layer Stack:**
```
YOUR APPLICATION     ← you build this (AgentDesk, scripts)
CLAUDE CODE SDK      ← the bridge (spawns sessions, streams events)
CLAUDE CODE          ← the agent engine (reads files, runs terminal, edits code)
CLAUDE (LLM)         ← the brain (Anthropic's API)
```
The SDK sits between your app and Claude Code, letting you drive it programmatically instead of typing into a chat UI.

**Mental Model 3 — Subprocess with a Conversation Channel:**
The SDK spawns Claude Code as a background process and streams back events in real time:
- `{ type: "tool_use", tool: "read_file", path: "..." }`
- `{ type: "tool_use", tool: "write_to_file", ... }`
- `{ type: "result", content: "Done." }`
You get a live feed of the agent working, not just a final answer.

**3 Key Concepts:**
- **Sessions** — Each SDK call is an isolated Claude Code instance with its own context and working directory.
- **Streaming** — Events stream as they happen so your app can react in real time.
- **Tool Permissions** — You control what the agent is allowed to do (read-only vs full terminal access).

**How AgentDesk uses it:** Heartbeat fires → Dispatcher picks task → SDK spawns a Claude Code session with the task as prompt → Claude works autonomously → events stream back as task comments → session ends → task submitted.

---

### Q2: Explain the Dispatcher and Heartbeat mechanism with a mental model.

**Answer:**

**Mental Model 1 — The Night Security Guard:**
A guard wakes up every 30 minutes, sweeps the building, acts on anything found, then goes back to waiting. They don't stand at every door all day.
- **Heartbeat** = the alarm clock that wakes the guard on schedule.
- **Dispatcher** = the guard's checklist logic (what to check, priority order, who to assign).

**Mental Model 2 — The Restaurant Kitchen:**
```
⏰ HEARTBEAT (kitchen bell)   → wakes dispatcher on a schedule
🧑‍💼 DISPATCHER (head chef)   → checks order board, assigns tickets to free cooks
👨‍🍳 AGENT (cook)             → gets ticket, works, marks done, becomes free again
```

**The actual tick logic:**
```
Cron fires → Dispatcher.tick() runs
  → Fetch all projects + tasks (assigned / in-progress)
  → For each task, find eligible agent:
       - not paused
       - not already on another task (single in-progress rule)
       - project not paused
  → Sort by priority (0=critical → 3=low), oldest first on ties
  → Spawn Claude Code SDK session for each matched pair
  → Stream results back as task comments
```

**Adaptive speed:** Dispatcher runs at 15s intervals when active, backs off to 90s when idle — like a guard doing more frequent rounds when the building is busy.

**Key insight — agents don't poll:** Agents never ask "is there work for me?" The dispatcher pushes work to them. This prevents thundering-herd problems where all agents check simultaneously.

---

### Q3: How does work delegate across multiple agents?

**Answer:**

**Mental Model — The Law Firm:**
```
👔 MASTER AGENT (Managing Partner)
   → First contact for every user request
   → Decides: do it myself, or route to a specialist?
   → Decomposes big goals into scoped sub-tasks
   → Reviews specialist output before delivering to client

👩‍💼 SPECIALIST AGENTS (Associates)
   → Frontend agent, Security agent, Data agent, etc.
   → Each picks up only work matching their domain
   → Work autonomously, post progress, submit for review
```

**The delegation flow:**
```
User → Master Agent
  │
  ├── Small / general task → Master does it directly
  │
  └── Specialist task → Master creates a TASK on the board
            assigned to: specialist-agent
                  │
                  ▼
        Specialist's next heartbeat fires
        Dispatcher sees their assigned task
        Spawns their Claude Code session
        Agent works → comments progress → submits
                  │
                  ▼
        Master / Human reviews → APPROVE or REJECT (with feedback)
```

**Key insight — the Kanban board IS the communication channel:**
Agents never talk to each other directly. Tasks, comments, and status updates on the board are how they coordinate — like sticky notes everyone reads on their next round. This makes the system fully async and auditable.

---

### Q4: What is the complete request-to-response flow for a prompt?

**Answer:**

**Mental Model — Restaurant Full-Stack Order:**
```
Customer → Waiter → Kitchen Ticket → Chef → Food back to customer
You      → WS     → ChatBridge    → SDK  → LLM + Tools → Stream back
```

**Full step-by-step journey:**
```
1. You type prompt in AgentDesk chat UI
2. Browser sends via WebSocket → AgentDesk server
3. ChatBridge receives: looks up/creates Claude Code session, prepends history
4. Claude Code SDK spawns/resumes process with your prompt
5. Claude (LLM) thinks → decides first action → emits tool_use (e.g. read_file)
6. Tool executes on disk → result returned to LLM as tool_result
7. Claude thinks again → decides next action → emits another tool_use
8. ... loop repeats (can be 10-20 tool calls for one prompt) ...
9. Claude signals completion → emits attempt_completion with final message
10. SDK streams ALL events back to ChatBridge in real time
11. ChatBridge forwards via WebSocket to browser
12. Chat UI renders: tool calls appearing live, then final answer
13. Conversation saved → context available for your next message
```

**Key insight — it's a loop, not a single call:**
Most people think: *send message → get reply*. Claude Code is actually:
**send → think → act → observe → think → act → observe → ... → reply**
Each act-observe cycle is one tool call. A single prompt can trigger many before you see the final answer. The SDK streams every step live — you're watching the thought process unfold, not waiting for a finished product.

---
