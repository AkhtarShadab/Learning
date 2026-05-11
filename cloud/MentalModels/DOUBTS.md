# 💬 Doubts & Q&A — Cloud Mental Models

> **How to use this file**
> When something confuses you while reading the Mental Models docs, log it here immediately.
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

## Utility Model

### Q: If cloud is like electricity, what is the equivalent of "running your own power plant" (on-prem)?
**Status:** ✅ Answered
**Source doc:** `01_utility_model.md`

**Answer:**
> Running your own on-premises data center — you buy the servers, manage power, cooling, networking, and capacity planning yourself. You pay the full CapEx upfront regardless of how much you actually use, just like a factory that built its own power plant has to maintain it even on weekends when it's idle.

**Notes:**
> The key insight: the cloud provider achieves economies of scale across millions of customers, so per-unit costs are lower than any single company could achieve alone.

---

### Q: What is the difference between IaaS, PaaS, and SaaS — where does the responsibility boundary sit?
**Status:** ⏳ Unanswered
**Source doc:** `01_utility_model.md`

**Answer:**
>

**Notes:**
>

---

### Q: What does "reserved vs spot pricing" mean and when would you actually choose spot instances?
**Status:** ⏳ Unanswered
**Source doc:** `01_utility_model.md`

**Answer:**
>

**Notes:**
>

---

## Statistical Multiplexing

### Q: How does the Central Limit Theorem apply to cloud resource pooling — what exactly does it guarantee?
**Status:** ⏳ Unanswered
**Source doc:** `02_statistical_multiplexing.md`

**Answer:**
>

**Notes:**
>

---

### Q: Why can hyperscalers run at 60–70% utilization while on-prem typically runs at 15–20%?
**Status:** ⏳ Unanswered
**Source doc:** `02_statistical_multiplexing.md`

**Answer:**
>

**Notes:**
>

---

### Q: What is "memory overcommit" and is it safe?
**Status:** ⏳ Unanswered
**Source doc:** `02_statistical_multiplexing.md`

**Answer:**
>

**Notes:**
>

---

## Virtualization & Abstraction

### Q: What is the difference between a Type-1 and Type-2 hypervisor — which does AWS use?
**Status:** ⏳ Unanswered
**Source doc:** `03_virtualization_abstraction.md`

**Answer:**
>

**Notes:**
>

---

### Q: What does Intel VT-x actually enable that wasn't possible before hardware-assisted virtualization?
**Status:** ⏳ Unanswered
**Source doc:** `03_virtualization_abstraction.md`

**Answer:**
>

**Notes:**
>

---

### Q: What is the key technical difference between containers and VMs — what do containers NOT isolate?
**Status:** ⏳ Unanswered
**Source doc:** `03_virtualization_abstraction.md`

**Answer:**
>

**Notes:**
>

---

## Fault Tolerance

### Q: What is the difference between MTBF and MTTR, and which one matters more for user experience?
**Status:** ⏳ Unanswered
**Source doc:** `04_fault_tolerance.md`

**Answer:**
>

**Notes:**
>

---

### Q: What does "blast radius" mean in cloud architecture — how do you design to minimize it?
**Status:** ⏳ Unanswered
**Source doc:** `04_fault_tolerance.md`

**Answer:**
>

**Notes:**
>

---

### Q: What is the circuit breaker pattern and how is it different from just retrying?
**Status:** ⏳ Unanswered
**Source doc:** `04_fault_tolerance.md`

**Answer:**
>

**Notes:**
>

---

## Cloud Networking

### Q: What is CIDR notation — how do you calculate how many IPs a /24 subnet gives you?
**Status:** ⏳ Unanswered
**Source doc:** `05_networking_mental_model.md`

**Answer:**
>

**Notes:**
>

---

### Q: What is the difference between a security group and a NACL — which one is stateful?
**Status:** ⏳ Unanswered
**Source doc:** `05_networking_mental_model.md`

**Answer:**
>

**Notes:**
>

---

### Q: Why does a private subnet need a NAT gateway to reach the internet — why can't it just use the internet gateway?
**Status:** ⏳ Unanswered
**Source doc:** `05_networking_mental_model.md`

**Answer:**
>

**Notes:**
>

---

## Elasticity & Scaling

### Q: What does "stateless design" mean and why is it a prerequisite for horizontal scaling?
**Status:** ⏳ Unanswered
**Source doc:** `06_elasticity_scaling.md`

**Answer:**
>

**Notes:**
>

---

### Q: Why should auto-scaling scale OUT fast but scale IN slowly?
**Status:** ⏳ Unanswered
**Source doc:** `06_elasticity_scaling.md`

**Answer:**
>

**Notes:**
>

---

## Cloud Costs

### Q: What is "data transfer cost" and why is it often the biggest surprise in cloud bills?
**Status:** ⏳ Unanswered
**Source doc:** `07_cost_mental_model.md`

**Answer:**
>

**Notes:**
>

---

### Q: What is the FinOps framework — what are its core principles?
**Status:** ⏳ Unanswered
**Source doc:** `07_cost_mental_model.md`

**Answer:**
>

**Notes:**
>

---

## Add Your Own Below ↓

---
