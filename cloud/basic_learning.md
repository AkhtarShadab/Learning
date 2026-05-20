# Cloud Computing: From First Principles to Production

A learning document covering the mental models, mathematics, architecture,
and practical deployment patterns of modern cloud computing.

---

## 1. Mental Model: Cloud as a Utility

Before the power grid, every factory ran its own generator -- buying equipment,
hiring engineers, and planning for peak demand even if peak was two hours/year.
The electric grid pooled generation across thousands of customers. Cloud is the
same transformation applied to compute, storage, and networking.

### Three First Principles

**Pooling** -- The provider aggregates resources into a shared pool across
tenants. Like a hotel: you rent a room when needed; the hotel serves more guests
per year than it has rooms because demand is staggered.

**Virtualization** -- Software layers abstract physical hardware into virtual
machines, networks, and disks. Like a taxi: you specify a destination without
owning the car. If one breaks down, another picks you up.

**Economies of Scale** -- Buying 100,000 servers costs ~60% less per unit than
buying 50. Savings pass through as lower prices than self-hosting.

```
Individual company:  10 servers  @ $8,000 each  = $80,000
Cloud provider:      100,000     @ $3,200 each  = bulk pricing
                     Per-unit savings: ~60%
```

These three principles compound. Pooling reduces waste, virtualization enables
pooling across heterogeneous workloads, and scale makes the whole operation
profitable even after passing savings to customers. Remove any one of the three
and cloud computing as an economic model collapses.

---

## 2. Architecture: How the Cloud is Built

### Service Model Stack

```
+-----------------------------------------------------+
|  SaaS  (Gmail, Slack)       You manage: nothing      |
+-----------------------------------------------------+
|  PaaS  (Heroku, App Engine) You manage: code + data  |
+-----------------------------------------------------+
|  IaaS  (EC2, Azure VMs)     You manage: OS + runtime |
+-----------------------------------------------------+
|  Physical (provider manages servers, power, cooling) |
+-----------------------------------------------------+
```

### VPC / AZ / Subnet Layout

```
Region: us-east-1
+------------------------------------------------------------------+
|  VPC: 10.0.0.0/16                                                |
|  AZ: us-east-1a          AZ: us-east-1b          AZ: us-east-1c |
|  +------------------+    +------------------+    +-------------- +|
|  | Public 10.0.1/24 |    | Public 10.0.3/24 |    | Public 10.0.5 ||
|  |  [ALB] [NAT-GW]  |    |  [ALB]           |    |  [ALB]        ||
|  +------------------+    +------------------+    +---------------+|
|  +------------------+    +------------------+    +---------------+|
|  | Private 10.0.2/24|    | Private 10.0.4/24|    | Priv 10.0.6   ||
|  |  [EC2] [EC2]     |    |  [EC2] [EC2]     |    |  [EC2] [EC2]  ||
|  +------------------+    +------------------+    +---------------+|
|  +------------------+    +------------------+                     |
|  | Data 10.0.7/24   |    | Data 10.0.8/24   |  (RDS Multi-AZ    |
|  |  [RDS Primary]   |    |  [RDS Standby]   |   auto-replicates)|
|  +------------------+    +------------------+                     |
|  Internet GW --> Route Table --> Public Subnets                   |
|  NAT GW ------> Route Table --> Private Subnets                  |
+------------------------------------------------------------------+
```

**Design rule**: app servers in private subnets, only ALBs/NATs in public
subnets, databases in dedicated data subnets with strictest security groups.

### Compute Evolution

```
2006  VMs (EC2)           Full OS, minutes to provision, hypervisor isolation
2013  Containers (Docker) Shared kernel, seconds to start, namespace isolation
2015  Orchestration (K8s) Declarative scheduling, self-healing, auto-scaling
2014  Serverless (Lambda) No servers, ms startup, pay-per-invocation
2020s Convergence         K8s + serverless (Knative), edge compute, Wasm
```

---

## 3. Math Foundation

### Statistical Multiplexing (Central Limit Theorem)

With `n` independent workloads each having mean `mu` and std dev `sigma`:
```
Sum mean     = n * mu
Sum std dev  = sigma * sqrt(n)
CoV          = sigma / (mu * sqrt(n))    <-- shrinks as 1/sqrt(n)
```

**Example with 1,000 VMs** (each: `mu=0.40`, `sigma=0.20`):
```
Single VM:  CoV = 0.50, provision at mu+3*sigma = 1.00 core (100%)
1,000 VMs:  Total mean = 400 cores, std dev = 6.32 cores
            Provision at 400 + 3*6.32 = 419 cores (99.7% confidence)
Without pooling: 1,000 cores | With pooling: 419 cores | Savings: 58%
```

### Availability Math

```
Nines   Annual Downtime    Formula (series): A = A1 * A2 * ... * An
99%     3.65 days          Formula (parallel): A = 1 - (1-A1)(1-A2)...(1-An)
99.9%   8.77 hours
99.99%  52.6 minutes       Six nines from two three-nine servers:
99.999% 5.26 minutes       A = 1 - (0.001)^2 = 0.999999
99.9999% 31.5 seconds      Two cheap servers > one expensive server
```

### Load Balancing Algorithms

**Round-Robin**: requests cycle A->B->C->A. Simple, stateless, zero overhead.
Works well when all servers are identical and requests are uniform in cost.
Breaks when some requests are 100x heavier than others.

**Least-Connections**: route to the server with fewest active connections.
Requires real-time connection tracking (state overhead), but handles variable
request durations well because busy servers naturally get fewer new requests.

**Weighted Round-Robin**: assign weights proportional to server capacity.
An 8-core server gets weight 4, a 2-core gets weight 1 -- so the big server
handles 4x the traffic. Useful in heterogeneous fleets during migrations.

### Auto-Scaling Formulas

**Target tracking**: `desired = ceil(current_capacity * current_metric / target)`
Example: 4 instances at 80% CPU, target 50% -> `ceil(4 * 80/50)` = 7 instances.

**Step scaling**: fixed increments at threshold boundaries.
```
CPU > 80%:  add 3 instances     (aggressive response to spikes)
CPU > 60%:  add 1 instance      (gentle scale-out)
CPU < 30%:  remove 1 instance   (gentle scale-in)
CPU < 15%:  remove 2 instances  (aggressive cost savings)
```
Step scaling reacts faster to sudden spikes but can overshoot. Target tracking
is smoother but slower to converge. Many production systems use both: target
tracking for steady-state, step scaling as a safety net for extreme spikes.

### Reserved vs Spot Cost Math

```
Optimized 100-instance mix:
  60 reserved  @ $0.04/hr * 730h = $1,752/mo
  28 spot      @ $0.02/hr * 730h = $409/mo
  12 on-demand @ $0.10/hr * 730h = $876/mo
  Total: $3,037/mo vs $7,300 all on-demand = 58% savings
```

---

## 4. Step-by-Step: AWS Deployment Walkthrough

### Step 1: VPC Creation
```bash
aws ec2 create-vpc --cidr-block 10.0.0.0/16
aws ec2 create-internet-gateway                    # attach to VPC
aws ec2 create-subnet --cidr-block 10.0.1.0/24 --az us-east-1a  # public
aws ec2 create-subnet --cidr-block 10.0.2.0/24 --az us-east-1a  # private
aws ec2 create-nat-gateway --subnet-id <public-subnet>           # for private
```

### Step 2: EC2 Auto Scaling Group
```bash
aws ec2 create-launch-template --instance-type t3.medium --image-id ami-xxx
aws autoscaling create-auto-scaling-group --min 2 --max 20 --desired 4 \
  --vpc-zone-identifier "subnet-priv1a,subnet-priv1b"
aws autoscaling put-scaling-policy --policy-type TargetTrackingScaling \
  --target-value 50.0 --metric ASGAverageCPUUtilization
```

### Step 3: Application Load Balancer
```bash
aws elbv2 create-load-balancer --type application --subnets pub1a pub1b
aws elbv2 create-target-group --protocol HTTP --port 80 --health-check /health
aws elbv2 create-listener --protocol HTTPS --port 443 --forward-to target-group
```

### Step 4: RDS Multi-AZ
```bash
aws rds create-db-instance --engine postgres --multi-az \
  --db-instance-class db.r6g.xlarge --storage-encrypted
# Synchronous standby in another AZ; automatic failover in 60-120s
```

### Step 5: S3 + CloudFront CDN
```bash
aws s3 mb s3://prod-static-assets
aws cloudfront create-distribution --origin s3://prod-static-assets
# 450+ edge locations: Tokyo user gets ~5ms vs ~150ms from Virginia origin
```

### Step 6: CloudWatch Monitoring
```bash
aws cloudwatch put-metric-alarm --metric CPUUtilization --threshold 85 \
  --alarm-actions arn:aws:sns:...:ops-alerts
```

### Traffic Spike Scenario

```
T+0m   500 req/s   4 instances   CPU 35%   steady state
T+3m   2000 req/s  4 instances   CPU 78%   traffic climbing
T+4m   2800 req/s  7 instances   ASG scales: ceil(4*78/50) = 7
T+6m   4200 req/s  10 instances  scales again: ceil(7*71/50) = 10
T+10m  5000 req/s  12 instances  CPU 52%   converged at target
T+30m  1000 req/s  8 instances   scale-in begins (300s cooldown)
T+40m  500 req/s   4 instances   back to steady state
```

Scale-out cooldown is short (60s) for fast reaction; scale-in cooldown
is long (300s) to prevent flapping. Over-provisioning during convergence
is intentional -- better to spend $0.50 extra than drop requests.

---

## 5. Revolutionary Aspects

### CapEx to OpEx Transformation

```
Traditional (5-year): $500K servers + $120K/yr datacenter + $200K/yr staff
                      Total: ~$1.95M
Cloud (5-year):       ~$3K/mo scaling with revenue
                      Total: ~$180K for same workload (91% savings)
Hidden value: zero upfront capital, no hardware refresh, elastic spending
```

This didn't just lower costs -- it lowered the barrier to starting a company.
A startup that needed $500K for infrastructure now launches for $50/month.

### VT-x Hardware Virtualization

Before Intel VT-x (2005), virtualization used binary translation: the
hypervisor intercepted and rewrote every privileged CPU instruction at
runtime. This imposed 20-40% performance overhead, making production
workloads on VMs impractical at scale.

VT-x introduced hardware-level support:
- **VMX root mode**: hypervisor runs here with full hardware control
- **VMX non-root mode**: guest VMs run here; privileged instructions
  automatically trap to root mode without binary translation
- **Extended Page Tables (EPT)**: hardware memory translation for guests,
  eliminating costly shadow page tables
- **VT-d (IOMMU)**: direct device assignment so VMs get near-native I/O

Result: overhead dropped from 20-40% to 2-5%. AWS EC2 launched in 2006,
one year after VT-x shipped -- the hardware made the business model viable.

### Docker/K8s Revolution

Docker (2013) gave us "build once, run anywhere" with shared-kernel containers.
Kubernetes (2015, from Google's Borg experience) won the orchestration wars with
its declarative desired-state model. By 2020, every major cloud offered managed
K8s (EKS/AKS/GKE). Impact: 10-50x density vs VMs, seconds to deploy, true
microservice portability.

### Lambda Serverless

```python
def handler(event, context):
    return {'statusCode': 200, 'body': f'Hello, {event.get("name")}!'}
```

Upload a function, define a trigger, pay per millisecond of execution time.
Zero cost at zero traffic -- the first truly pay-per-use compute model.

Serverless is ideal for:
- Event processing (S3 upload triggers image resize)
- API backends (API Gateway routes to Lambda functions)
- Scheduled tasks (nightly data processing, report generation)
- Glue logic (connecting services without a persistent server)

Serverless is NOT ideal for:
- Long-running processes (15-minute execution limit on Lambda)
- Persistent connections (WebSockets require workarounds)
- Latency-sensitive apps (cold starts range from 100ms to 5 seconds)
- Constant high-throughput (cheaper to run reserved EC2 at steady load)

---

## 6. Comparative Analysis

### (a) Deployment Models

| Factor        | On-Prem    | IaaS      | PaaS       | Serverless   |
|---------------|------------|-----------|------------|--------------|
| Upfront Cost  | Very High  | None      | None       | None         |
| Control       | Full       | High      | Medium     | Low          |
| Scaling Speed | Days/Weeks | Minutes   | Seconds    | Milliseconds |
| Ops Burden    | Heavy      | Medium    | Light      | Minimal      |
| Vendor Lock-in| None       | Low       | Medium     | High         |
| Best For      | Regulated  | Custom    | Apps/APIs  | Event-driven |

### (b) Cloud Providers

| Category  | AWS                    | Azure               | GCP                 |
|-----------|------------------------|----------------------|---------------------|
| Compute   | EC2, Lambda, EKS       | VMs, Functions, AKS  | GCE, Cloud Run, GKE |
| Storage   | S3, EBS, EFS           | Blob, Managed Disks  | GCS, Persistent Disk |
| Database  | RDS, DynamoDB, Aurora   | SQL DB, Cosmos DB    | Cloud SQL, Spanner  |
| ML/AI     | SageMaker, Bedrock     | Azure ML, OpenAI Svc | Vertex AI, Gemini   |
| Pricing   | Reserved/Spot/Savings  | Reserved/Spot/DevTest| CUD/Spot/Sustained  |
| Strength  | Broadest catalog       | Enterprise/hybrid    | Data/ML, simplicity |
| Share     | ~31%                   | ~25%                 | ~11%                |

### (c) Compute Units

| Factor       | VMs              | Containers       | Serverless         |
|--------------|------------------|------------------|--------------------|
| Startup      | 30-120 seconds   | 1-5 seconds      | 100-5000 ms        |
| Isolation    | Hypervisor (HW)  | Namespaces (OS)  | MicroVM (Firecracker)|
| Density      | 10-20/host       | 100-500/host     | 1000s/host         |
| OS Overhead  | 1-10 GB          | ~50 MB           | 0 MB               |
| State        | Stateful default | Stateless by norm| Stateless by design|
| Use Cases    | Legacy, DBs      | Microservices    | Events, APIs, glue |

---

## 7. Math Connections

### Probability and Statistics
Availability SLAs are probabilistic guarantees derived from component failure
data. Model server failure as a Poisson process: if a server fails on average
once per 1,000 hours (`lambda = 0.001/hr`), the probability of surviving a
24-hour window is:
```
P(0 failures in 24h) = e^(-0.001 * 24) = e^(-0.024) = 0.9763
```
That's 97.6% per day. Over a year: `0.9763^365 = 0.0001` -- near-certain
failure. This is why redundancy is mandatory, not optional.

Traffic modeling also uses Poisson arrivals: if your mean rate is 200 req/s,
you can calculate the probability of exceeding 300 req/s and set auto-scaling
thresholds based on statistical confidence rather than guesswork.

### Convex Optimization
Cloud cost optimization is a constrained optimization problem:
```
Minimize:    C = sum(c_i * x_i)     (total cost across resource types)
Subject to:  sum(x_i) >= D          (meet total demand)
             x_i >= 0               (non-negative allocations)
             x_reserved <= budget    (capital budget constraint)
```
Costs are linear in allocation quantities, constraints are linear inequalities,
so the feasible region is convex and a global optimum is guaranteed. Tools like
AWS Cost Explorer and third-party optimizers (Spot.io, CloudHealth) solve
variants of this program continuously.

### Graph Theory
Cloud networks are graphs. CDN routing uses shortest-path (Dijkstra). VPC
peering across N regions uses minimum spanning trees (Kruskal/Prim) to
minimize connections. Capacity planning uses max-flow/min-cut (Ford-Fulkerson)
to find bottlenecks.

### Distributed Consensus and Raft
Distributed systems need to agree on a single value (who is leader, what
the next log entry is) even when nodes fail. This is the **consensus problem**.
Raft (2014, Ongaro & Ousterhout) solves it with three mechanisms:

1. **Leader election** — randomized timeouts + majority vote ensure exactly
   one leader per term. Two leaders cannot coexist because two majorities
   must overlap on at least one node (quorum intersection).
2. **Log replication** — leader appends, broadcasts, commits once a majority
   ACK. Followers apply committed entries to their state machines in order.
3. **Safety** — only a candidate with the most up-to-date log can win an
   election, so committed entries are never overwritten.

The quorum math: an n-node cluster tolerates `⌊(n-1)/2⌋` failures.
n=3 tolerates 1; n=5 tolerates 2. Odd sizes are standard — n=4 still only
tolerates 1 failure (needs 3 ACKs) but has higher write latency than n=3.

Real-world usage: etcd (Kubernetes config), CockroachDB (per-range Raft
groups), TiKV, Consul. Without consensus, redundant nodes produce
split-brain — two nodes accepting conflicting writes simultaneously.
See `MentalModels/04_fault_tolerance.md` for the full mental model with
diagrams and quorum tables.

### Permutations and Consistent Hashing
Distributed caches map servers and keys onto a circular hash ring. When a
server is added/removed, only `K/n` keys remap (not all K). With virtual
nodes, each server gets approximately `K/n` keys with `O(log n)` deviation.
Total possible assignments: `n^K` (permutations with repetition).

### Number Theory (Cryptography)
Every HTTPS call uses TLS built on number theory. RSA: factoring semiprimes.
ECC: discrete logarithm on elliptic curves (256-bit ECC = 3072-bit RSA).
AWS SigV4 signs every API request via iterated HMAC-SHA256:
```
SigningKey = HMAC(HMAC(HMAC(HMAC("AWS4"+Secret, Date), Region), Service), "aws4_request")
```
This chain design ensures a compromised signing key for one region/service/date
cannot be reused elsewhere. The security rests on the preimage resistance of
SHA-256 -- a property rooted in number-theoretic hardness assumptions.

---

## DSA Connections

### Consistent Hashing -- Distributed Cache Scaling

Consistent hashing arranges both servers and keys on a virtual ring, so adding or removing a node only redistributes keys from its immediate neighbors -- O(K/n) keys move instead of O(K). The document's discussion of auto-scaling and stateless horizontal scaling directly depends on this: when an ElastiCache Memcached cluster scales out, consistent hashing ensures that only the keys between the new node and its ring predecessor need to migrate. Without it, adding a cache node would invalidate the entire cache (a full rehash), causing a thundering herd to the database. The "permutations and consistent hashing" section in this document notes that virtual nodes reduce deviation to O(log n), which is what makes elastic scaling of caches practical at the 100,000+ key scale that production systems require.

### Dynamic Programming -- Optimal Reserved/Spot/On-Demand Mix

The document's cost math section frames the pricing mix as a linear optimization problem: minimize `C = sum(c_i * x_i)` subject to demand and budget constraints. This is solvable as a linear program, but the more general version -- choosing commitment durations (1-year vs 3-year), payment options (no upfront vs all upfront), and instance families across multiple workloads with varying demand profiles -- has overlapping subproblems that make it a dynamic programming problem. The "optimized 100-instance mix" example (60 reserved + 28 spot + 12 on-demand = 58% savings) is the output of such an optimization. Each subproblem asks: "given this workload's demand distribution, what is the cheapest coverage strategy for the next month, given commitments already made?" The optimal solution at month 12 depends on choices at months 1-11 -- classic DP structure.

### Graph Theory (Shortest Path, Spanning Trees) -- Network Architecture

The VPC/AZ/subnet layout in this document is a graph: regions are disconnected components, AZs are vertices within a region, and subnets are sub-vertices connected by route table edges. CDN routing from a Tokyo user to a Virginia origin traverses the shortest-latency path across AWS's backbone graph -- a Dijkstra problem where edge weights are propagation delays. The document notes that VPC peering across N regions uses minimum spanning trees (Kruskal/Prim) to minimize connections, and that capacity planning uses max-flow/min-cut (Ford-Fulkerson) to identify bottlenecks. The ALB's path-based routing (/api/* to one target, /static/* to another) is a trie-based dispatch at the application layer, mapping URL prefixes to backend target groups in O(prefix length) time.

### Poisson Processes and Queuing Theory -- Availability and Scaling Thresholds

The document models server failure as a Poisson process with rate lambda=0.001/hr, yielding P(survival over 24h) = e^(-0.024) = 97.6%. This is the same exponential distribution that underlies M/M/1 and M/M/c queuing models used for capacity planning. The auto-scaling formula `desired = ceil(current_capacity * current_metric / target)` is a deterministic approximation of the queue-theoretic result that for an M/M/c queue, utilization must stay below a threshold to maintain bounded waiting times. The document's step-scaling policy (add 3 instances at CPU > 80%, add 1 at CPU > 60%) is a piecewise-linear approximation of the nonlinear relationship between utilization and response time in queuing theory -- response time grows as 1/(1-rho), so the system must scale more aggressively as utilization approaches 1.0.

---

## 8. Key Takeaways

1. **Cloud is utility computing, not magic.** Pooling, virtualization, and
   economies of scale turned private servers into a metered utility -- the
   same way the electric grid replaced private generators.

2. **Redundancy is multiplicative.** Two 99.9% components in parallel yield
   99.9999%. Always distribute across availability zones.

3. **Statistical multiplexing is the pricing engine.** The Central Limit
   Theorem guarantees aggregate demand is predictable -- providers need 58%
   fewer resources than the sum of individual peaks.

4. **The compute spectrum trades control for convenience.** VMs give full
   control with high ops burden; serverless gives zero ops with limited
   control. Match the tradeoff to your team and application.

5. **Cost optimization is solvable math.** Reserved for baseline, spot for
   burst, on-demand for overflow. The optimal mix is a linear program that
   can save 50-70% over naive on-demand usage.

---

*Document version: 2026-05-09. Covers AWS, Azure, and GCP as of early 2025
service catalogs. Pricing examples are illustrative and will vary by region
and instance generation.*
