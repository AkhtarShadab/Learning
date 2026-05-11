# 💬 Doubts & Q&A — Cline

> **How to use this file**
> When something confuses you while reading the Cline docs or using Cline in practice, log it here.
> Come back and fill in the answer once you've figured it out — from docs, experimentation, or asking someone.
> Format: write the question, leave the answer blank, fill it in later.

---

## Template

```
### Q: [Your question here]
**Status:** ⏳ Unanswered / ✅ Answered
**Source doc:** [which .md file or real-world experience triggered this doubt]

**Answer:**
> [Fill this in once resolved]

**Notes:**
> [Any extra context, links, or follow-up thoughts]
```

---

## Core Concepts

### Q: What exactly is the difference between Cline and GitHub Copilot under the hood?
**Status:** ⏳ Unanswered
**Source doc:** `cline_knowledge_base.md`

**Answer:**
>

**Notes:**
>

---

### Q: When Cline hits the context window limit mid-task, what exactly gets "compacted" — and can important context get lost?
**Status:** ⏳ Unanswered
**Source doc:** `cline_knowledge_base.md`

**Answer:**
>

**Notes:**
>

---

### Q: How does Cline know which tool to call next — is it entirely up to the LLM, or does Cline's code guide it?
**Status:** ⏳ Unanswered
**Source doc:** `cline_knowledge_base.md`

**Answer:**
>

**Notes:**
>

---

## Tools & Approvals

### Q: What is the difference between `write_to_file` and `replace_in_file` — when should Cline use each?
**Status:** ✅ Answered
**Source doc:** `cline_knowledge_base.md`

**Answer:**
> `write_to_file` creates or fully overwrites a file — it sends the entire new content. `replace_in_file` makes targeted search-and-replace edits, only sending the changed blocks. For small edits, `replace_in_file` is cheaper (fewer tokens in the response) and safer (less risk of accidentally overwriting content). Use `write_to_file` only for new files or full rewrites.

**Notes:**
>

---

### Q: If I auto-approve file reads, can Cline accidentally read sensitive files like `.env`?
**Status:** ⏳ Unanswered
**Source doc:** `cline_knowledge_base.md`

**Answer:**
>

**Notes:**
>

---

### Q: What happens if I reject a tool call mid-task — does Cline retry or give up?
**Status:** ⏳ Unanswered
**Source doc:** `cline_knowledge_base.md`

**Answer:**
>

**Notes:**
>

---

## MCP

### Q: What is the practical difference between an MCP server and a Cline built-in tool?
**Status:** ⏳ Unanswered
**Source doc:** `cline_knowledge_base.md`

**Answer:**
>

**Notes:**
>

---

### Q: If an MCP server crashes mid-task, what happens to the Cline session?
**Status:** ⏳ Unanswered
**Source doc:** `cline_knowledge_base.md`

**Answer:**
>

**Notes:**
>

---

## Prompting

### Q: Why does giving Cline a plan first ("outline before coding") produce better results?
**Status:** ⏳ Unanswered
**Source doc:** `cline_knowledge_base.md`

**Answer:**
>

**Notes:**
>

---

### Q: When Cline "loops" and can't finish a task, what's usually the root cause?
**Status:** ⏳ Unanswered
**Source doc:** `cline_knowledge_base.md`

**Answer:**
>

**Notes:**
>

---

## Memory Bank

### Q: If I don't use a Memory Bank, what context does Cline have at the start of a new task?
**Status:** ⏳ Unanswered
**Source doc:** `cline_knowledge_base.md`

**Answer:**
>

**Notes:**
>

---

### Q: How often should `activeContext.md` in the Memory Bank be updated?
**Status:** ⏳ Unanswered
**Source doc:** `cline_knowledge_base.md`

**Answer:**
>

**Notes:**
>

---

## Cost & Models

### Q: Which model is most cost-effective for day-to-day coding tasks — Haiku, Sonnet, or Opus?
**Status:** ⏳ Unanswered
**Source doc:** `cline_knowledge_base.md`

**Answer:**
>

**Notes:**
>

---

### Q: Why does a long task cost disproportionately more than multiple short tasks for the same work?
**Status:** ✅ Answered
**Source doc:** `cline_knowledge_base.md`

**Answer:**
> Every API call sends the ENTIRE conversation history — system prompt + all messages + all tool results. As a task grows longer, each new LLM call becomes more expensive because the input token count keeps growing. Two short tasks avoid this by starting fresh each time, so neither accumulates a long history. The same total work done in one long task can cost 2–3x more than split across multiple focused tasks.

**Notes:**
>

---

## Add Your Own Below ↓

---
