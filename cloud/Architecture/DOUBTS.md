# 💬 Doubts & Q&A — Cloud Architecture

> **How to use this file**
> When something confuses you while reading the Architecture docs, log it here immediately.
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

## Global Infrastructure

### Q: What is the difference between an AWS Region, an Availability Zone, and an Edge Location?
**Status:** ⏳ Unanswered
**Source doc:** `01_global_infrastructure.md`

**Answer:**
>

**Notes:**
>

---

### Q: Why are AZs connected via dark fiber specifically — what does that give over regular internet links?
**Status:** ⏳ Unanswered
**Source doc:** `01_global_infrastructure.md`

**Answer:**
>

**Notes:**
>

---

### Q: What are AWS Local Zones and when would you use one instead of a regular Region?
**Status:** ⏳ Unanswered
**Source doc:** `01_global_infrastructure.md`

**Answer:**
>

**Notes:**
>

---

## Compute Architecture

### Q: What are "CPU credits" on T-series instances — what happens when you run out?
**Status:** ⏳ Unanswered
**Source doc:** `02_compute_architecture.md`

**Answer:**
>

**Notes:**
>

---

### Q: What is a "placement group" and when would you use cluster vs spread vs partition?
**Status:** ⏳ Unanswered
**Source doc:** `02_compute_architecture.md`

**Answer:**
>

**Notes:**
>

---

### Q: What is the AWS Nitro System — how is it different from traditional virtualization?
**Status:** ⏳ Unanswered
**Source doc:** `02_compute_architecture.md`

**Answer:**
>

**Notes:**
>

---

## Storage Architecture

### Q: What is the difference between EBS gp3 and io2 — when does the cost of io2 justify itself?
**Status:** ⏳ Unanswered
**Source doc:** `03_storage_architecture.md`

**Answer:**
>

**Notes:**
>

---

### Q: How does S3 store objects across AZs internally — what makes it 11 nines durable?
**Status:** ⏳ Unanswered
**Source doc:** `03_storage_architecture.md`

**Answer:**
>

**Notes:**
>

---

### Q: What is an S3 presigned URL and what security model does it use?
**Status:** ⏳ Unanswered
**Source doc:** `03_storage_architecture.md`

**Answer:**
>

**Notes:**
>

---

## Networking Architecture

### Q: What is the difference between a VPC endpoint (gateway type) and an interface endpoint (PrivateLink)?
**Status:** ⏳ Unanswered
**Source doc:** `04_networking_architecture.md`

**Answer:**
>

**Notes:**
>

---

### Q: When should you use a Transit Gateway instead of VPC peering?
**Status:** ⏳ Unanswered
**Source doc:** `04_networking_architecture.md`

**Answer:**
>

**Notes:**
>

---

### Q: What is the difference between Direct Connect and a site-to-site VPN — in terms of latency, cost, and reliability?
**Status:** ⏳ Unanswered
**Source doc:** `04_networking_architecture.md`

**Answer:**
>

**Notes:**
>

---

## Load Balancing

### Q: What is the practical difference between an ALB (L7) and an NLB (L4) — when would you pick each?
**Status:** ⏳ Unanswered
**Source doc:** `05_load_balancing_architecture.md`

**Answer:**
>

**Notes:**
>

---

### Q: What is "connection draining" and why does it matter during a deployment?
**Status:** ⏳ Unanswered
**Source doc:** `05_load_balancing_architecture.md`

**Answer:**
>

**Notes:**
>

---

### Q: What are "sticky sessions" — what problem do they solve and what problem do they create?
**Status:** ⏳ Unanswered
**Source doc:** `05_load_balancing_architecture.md`

**Answer:**
>

**Notes:**
>

---

## Database Architecture

### Q: What is the difference between RDS Multi-AZ and RDS Read Replicas — do they solve the same problem?
**Status:** ⏳ Unanswered
**Source doc:** `06_database_architecture.md`

**Answer:**
>

**Notes:**
>

---

### Q: How does Aurora's shared storage volume work — what makes it different from regular RDS?
**Status:** ⏳ Unanswered
**Source doc:** `06_database_architecture.md`

**Answer:**
>

**Notes:**
>

---

### Q: What is a DynamoDB GSI vs LSI — and why can't you add an LSI after the table is created?
**Status:** ⏳ Unanswered
**Source doc:** `06_database_architecture.md`

**Answer:**
>

**Notes:**
>

---

## Serverless Architecture

### Q: What is a Lambda "cold start" — what causes it and how does provisioned concurrency fix it?
**Status:** ⏳ Unanswered
**Source doc:** `07_serverless_architecture.md`

**Answer:**
>

**Notes:**
>

---

### Q: What is the difference between AWS Step Functions and just chaining Lambda functions directly?
**Status:** ⏳ Unanswered
**Source doc:** `07_serverless_architecture.md`

**Answer:**
>

**Notes:**
>

---

### Q: When is serverless NOT the right choice — what workloads should stay on EC2?
**Status:** ⏳ Unanswered
**Source doc:** `07_serverless_architecture.md`

**Answer:**
>

**Notes:**
>

---

## Container Architecture

### Q: What is the difference between ECS on Fargate vs ECS on EC2 — what do you give up with Fargate?
**Status:** ⏳ Unanswered
**Source doc:** `08_container_architecture.md`

**Answer:**
>

**Notes:**
>

---

### Q: What is the difference between a Kubernetes Deployment and a StatefulSet?
**Status:** ⏳ Unanswered
**Source doc:** `08_container_architecture.md`

**Answer:**
>

**Notes:**
>

---

### Q: What is a service mesh — do you actually need one, or is it overkill for most apps?
**Status:** ⏳ Unanswered
**Source doc:** `08_container_architecture.md`

**Answer:**
>

**Notes:**
>

---

## Security Architecture

### Q: What is the shared responsibility model — which layer is AWS responsible for vs the customer?
**Status:** ⏳ Unanswered
**Source doc:** `09_security_architecture.md`

**Answer:**
>

**Notes:**
>

---

### Q: What is "envelope encryption" in KMS — why not just encrypt data directly with the CMK?
**Status:** ⏳ Unanswered
**Source doc:** `09_security_architecture.md`

**Answer:**
>

**Notes:**
>

---

### Q: What is the difference between IAM permission boundaries and Service Control Policies (SCPs)?
**Status:** ⏳ Unanswered
**Source doc:** `09_security_architecture.md`

**Answer:**
>

**Notes:**
>

---

## Observability Architecture

### Q: What is the difference between metrics, logs, and traces — why do you need all three?
**Status:** ✅ Answered
**Source doc:** `10_observability_architecture.md`

**Answer:**
> **Metrics** are numeric time-series data (CPU %, request count, latency p99) — great for alerting and dashboards but don't tell you WHY something went wrong. **Logs** are timestamped text records of events — give you detail and context but are hard to aggregate across services. **Traces** show the end-to-end journey of a single request across multiple services — essential for finding where latency comes from in distributed systems. You need all three because metrics tell you THAT something is wrong, logs tell you WHAT happened, and traces tell you WHERE in the system it happened.

**Notes:**
> CloudWatch covers all three: metrics (CloudWatch Metrics), logs (CloudWatch Logs), traces (X-Ray).

---

### Q: What is "alert fatigue" and how do composite alarms in CloudWatch help?
**Status:** ⏳ Unanswered
**Source doc:** `10_observability_architecture.md`

**Answer:**
>

**Notes:**
>

---

### Q: What is an SLO and how is it different from an SLA?
**Status:** ⏳ Unanswered
**Source doc:** `10_observability_architecture.md`

**Answer:**
>

**Notes:**
>

---

### Q: What is OpenTelemetry and why would you use it instead of CloudWatch directly?
**Status:** ⏳ Unanswered
**Source doc:** `10_observability_architecture.md`

**Answer:**
>

**Notes:**
>

---

## Add Your Own Below ↓

---
