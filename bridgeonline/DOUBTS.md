# 💬 Doubts & Q&A — BridgeOnline

> **How to use this file**
> When something confuses you while reading the BridgeOnline docs, log it here immediately.
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

## Architecture & Design

### Q: Why is the game logic kept in pure functions inside `lib/game/` with no DB or socket calls?
**Status:** ✅ Answered
**Source doc:** `01-architecture-and-design.md`

**Answer:**
> Pure functions are deterministic and easy to test — given the same input they always return the same output. Keeping game logic free of side effects means you can unit test every rule (bidding, scoring, trick logic) without spinning up a DB or socket server. It also means the same logic can run on both the server and the client if needed.

**Notes:**
> See `02-game-logic-pure-functions.md` for examples of how Fisher-Yates shuffle and trick resolution are implemented purely.

---

### Q: What is the difference between the Next.js API routes and the Socket.io server — why do both exist?
**Status:** ⏳ Unanswered
**Source doc:** `01-architecture-and-design.md`

**Answer:**
>

**Notes:**
>

---

### Q: What does "ACBL-compliant" actually mean in practice for the code?
**Status:** ⏳ Unanswered
**Source doc:** `00-project-overview.md`

**Answer:**
>

**Notes:**
>

---

## Database & Prisma

### Q: Why use `lib/prisma.ts` as a singleton instead of calling `new PrismaClient()` directly?
**Status:** ⏳ Unanswered
**Source doc:** `03-database-prisma.md`

**Answer:**
>

**Notes:**
>

---

### Q: What is the concurrency bug mentioned in the Prisma doc, and how was it resolved?
**Status:** ⏳ Unanswered
**Source doc:** `03-database-prisma.md`

**Answer:**
>

**Notes:**
>

---

## Real-time & Socket.io

### Q: How does Socket.io handle a player reconnecting mid-game — what events fire?
**Status:** ⏳ Unanswered
**Source doc:** `04-realtime-socketio.md`

**Answer:**
>

**Notes:**
>

---

### Q: What does "hand filtering" mean in the context of sending socket events?
**Status:** ⏳ Unanswered
**Source doc:** `04-realtime-socketio.md`

**Answer:**
>

**Notes:**
>

---

## Testing

### Q: What is the difference between `vitest.config.ts`, `vitest.config.db.ts`, and `vitest.config.socket.ts`?
**Status:** ⏳ Unanswered
**Source doc:** `05-testing-strategy.md`

**Answer:**
>

**Notes:**
>

---

### Q: Why does the Node.js 24 environment variable issue break Playwright tests specifically?
**Status:** ⏳ Unanswered
**Source doc:** `10-e2e-playwright-nodejs24.md`

**Answer:**
>

**Notes:**
>

---

## WebRTC & Voice

### Q: What is the difference between STUN and TURN servers, and when do you need TURN?
**Status:** ⏳ Unanswered
**Source doc:** `06-webrtc-voice.md`

**Answer:**
>

**Notes:**
>

---

### Q: What does "full mesh" mean in the context of WebRTC for 4 players?
**Status:** ⏳ Unanswered
**Source doc:** `06-webrtc-voice.md`

**Answer:**
>

**Notes:**
>

---

## Scalability

### Q: Why does Redis solve the problem that arises when scaling Socket.io across multiple servers?
**Status:** ⏳ Unanswered
**Source doc:** `07-scalability.md`

**Answer:**
>

**Notes:**
>

---

### Q: What is BullMQ and why is it relevant for a card game backend?
**Status:** ⏳ Unanswered
**Source doc:** `07-scalability.md`

**Answer:**
>

**Notes:**
>

---

## TypeScript & Next.js Patterns

### Q: What is "literal narrowing" in TypeScript and where does it come up in this project?
**Status:** ⏳ Unanswered
**Source doc:** `08-typescript-nextjs-patterns.md`

**Answer:**
>

**Notes:**
>

---

### Q: Why do Next.js 15 async params behave differently from Next.js 14?
**Status:** ⏳ Unanswered
**Source doc:** `08-typescript-nextjs-patterns.md`

**Answer:**
>

**Notes:**
>

---

## Add Your Own Below ↓

---
