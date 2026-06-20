# Cloud Cost Mental Model

## Core Idea: The Cloud Cost Iceberg

Cloud costs are like an iceberg. The visible portion -- the compute
instances you launch and the storage buckets you fill -- represents
only a fraction of the total bill. Below the waterline lie data
transfer charges, API call fees, logging costs, NAT gateway fees,
and a dozen other line items that can dwarf your compute spend if
left unchecked.

```
  THE CLOUD COST ICEBERG
  =======================

        /\
       /  \         VISIBLE COSTS (~40-60%)
      / EC2 \       - Compute instances
     / RDS   \      - Storage (S3, EBS)
    / Lambda  \     - Managed databases
   /___________\
  ~~~~~~~~~~~~~~~~~~~~~~~~~~~~  WATERLINE
   \           /
    \ Data    /     HIDDEN COSTS (~40-60%)
     \Transfer/     - Data transfer (cross-AZ, egress)
      \NAT GW/      - NAT Gateway processing fees
       \Logs /       - CloudWatch logs ingestion/storage
        \API/        - API Gateway request charges
         \/          - DNS query charges
          |          - Load balancer hours + LCU charges
          |          - EBS snapshots and lifecycle
          |          - Elastic IPs (when unattached)
          |          - KMS key operations
          |          - Support plan fees
```

---

## Pricing Dimensions: How You Get Charged

Cloud pricing is not one-dimensional. Every service meters usage across
multiple dimensions simultaneously. Understanding these dimensions is
critical for cost prediction and optimization.

### The Four Primary Pricing Dimensions

| Dimension       | What It Measures         | Example                          | Surprise Factor |
|-----------------|--------------------------|----------------------------------|-----------------|
| Compute-time    | vCPU/memory per hour     | EC2 $0.0832/hr (c5.xlarge)       | Low (expected)  |
| Storage         | GB stored per month      | S3 $0.023/GB-month               | Low             |
| Data transfer   | GB moved across networks | Egress $0.09/GB (first 10 TB)    | HIGH            |
| API calls       | Number of requests       | S3 GET $0.0004/1000 requests     | Medium          |

### Data Transfer: The Real Surprise

Data transfer is where most cloud bill surprises come from. The pricing
is asymmetric and complex:

```
  DATA TRANSFER PRICING (AWS, approximate)
  ==========================================

  INBOUND (data INTO AWS):
  From internet to AWS:                FREE
  From other AWS services (same AZ):   FREE
  From other AWS services (cross-AZ):  $0.01/GB each direction

  OUTBOUND (data OUT OF AWS):
  To internet (first 10 TB/month):     $0.09/GB
  To internet (next 40 TB/month):      $0.085/GB
  To internet (next 100 TB/month):     $0.07/GB
  Cross-region:                        $0.02/GB
  To CloudFront:                       FREE (from origin)

  COST EXAMPLE:
  A video streaming service serving 100 TB/month outbound:
  10 TB  x $0.09  = $900
  40 TB  x $0.085 = $3,400
  50 TB  x $0.07  = $3,500
  Total:            $7,800/month JUST for data transfer

  Compare: a c5.4xlarge (16 vCPU, 32 GB) costs $489/month.
  Data transfer can easily exceed compute costs.
```

### Cross-AZ Data Transfer: The Hidden Tax

```
  CROSS-AZ DATA TRANSFER
  ========================

  AZ-a                    AZ-b
  +--------+              +--------+
  | Web    | --request--> | App    |
  | Server |              | Server |
  |        | <--response- |        |
  +--------+              +--------+

  Each direction: $0.01/GB
  Round trip: $0.02/GB

  If your app does 1 TB of cross-AZ traffic per month:
  Cost: 1,000 GB x $0.02 = $20/month

  Seems small? At scale (100 services x 10 TB each):
  Cost: 100 x 10,000 GB x $0.02 = $200,000/month

  Mitigation:
  - Keep chattiest services in the same AZ
  - Use AZ-affinity for service mesh routing
  - Compress payloads between services
  - But: single-AZ = no fault tolerance, so balance cost vs risk
```

---

## Pricing Models: Reserved, On-Demand, Spot

Choosing the right pricing model is the single highest-impact cost
optimization decision you can make.

### On-Demand

Full price. No commitment. Maximum flexibility.

- **When:** Unpredictable workloads, short experiments, new projects
  before you understand demand patterns.
- **Cost:** 100% of list price (baseline)

### Reserved Instances (RI) / Savings Plans

Commit to 1 or 3 years of usage. Discounts range from 30% to 72%.

```
  RESERVED INSTANCE PRICING (c5.xlarge example)
  ===============================================

  Pricing Model          Monthly Cost    Savings vs On-Demand
  ----------------       ------------    --------------------
  On-Demand              $120.96         0%
  1-year No Upfront      $76.80          36%
  1-year All Upfront     $72.00          40%
  3-year No Upfront      $52.80          56%
  3-year All Upfront     $43.20          64%

  Break-even point for 1-year RI:
  If you run the instance > 7-8 months/year, RI saves money.
```

### Savings Plans (AWS)

More flexible than RIs. Commit to a $/hour spend (e.g., $10/hour) for
1 or 3 years, and all compute usage up to that amount is discounted.

```
  SAVINGS PLANS
  ==============

  You commit: $10/hour for 1 year
  Total commitment: $10 x 24 x 365 = $87,600/year

  Any compute usage up to $10/hour gets discounted:
  - EC2 instances (any family, any size, any region)
  - Lambda functions
  - Fargate tasks

  Advantage over RIs: flexibility to change instance types
  without losing your discount.
```

### Spot Instances

Buy unused capacity at 60-90% discounts. Instances can be interrupted
with 2 minutes notice.

```
  SPOT INSTANCE STRATEGY
  =======================

  On-Demand price:  $0.0832/hr (c5.xlarge)
  Spot price:       $0.0250/hr (c5.xlarge, varies by AZ)
  Savings:          70%

  GOOD FOR:                      BAD FOR:
  - Batch processing             - Databases
  - CI/CD build agents           - Stateful applications
  - Data processing (EMR)        - User-facing web servers*
  - Machine learning training    - Long-running transactions
  - Testing and dev environments

  *Exception: Spot can work for web servers if:
   - Behind a load balancer
   - Stateless
   - Mixed with On-Demand (e.g., 70% Spot, 30% On-Demand)
   - Using Spot Fleet with diversification across instance types/AZs
```

### The Optimal Pricing Mix

```
  THE PRICING PYRAMID
  ====================

        /\
       /  \       SPOT (10-20%)
      / Burst\    Fault-tolerant batch, CI/CD, dev/test
     /________\
    /          \   ON-DEMAND (10-30%)
   / Flexibility\  Unpredictable bursts, new workloads
  /______________\
  |              |  RESERVED / SAVINGS PLANS (50-70%)
  | Steady-state |  Known baseline, 24/7 production workloads
  |  baseline    |
  |______________|

  Aim: 50-70% committed spend, 10-30% on-demand, 10-20% spot.
  This blend typically saves 40-60% vs all on-demand.
```

---

## Cost Allocation Tags

Tags are key-value pairs attached to resources that enable cost tracking
by team, project, environment, or any other dimension.

```
  TAGGING STRATEGY
  =================

  Resource: EC2 instance i-0123456789abcdef0

  Tags:
    Environment:  production
    Team:         platform-engineering
    Project:      payment-service
    CostCenter:   CC-4200
    Owner:        alice@company.com
    ManagedBy:    terraform

  Cost allocation report (filtered by Project=payment-service):

  Service      Jan      Feb      Mar      YTD
  --------     -----    -----    -----    ------
  EC2          $4,200   $4,500   $4,800   $13,500
  RDS          $1,800   $1,800   $1,800   $5,400
  S3           $200     $220     $250     $670
  Data Xfer    $800     $900     $1,100   $2,800
  Total        $7,000   $7,420   $7,950   $22,370

  Without tags, you see one big bill.
  With tags, you see cost per team, per project, per environment.
```

### Tagging Best Practices

1. **Enforce tags via SCP/IAM policies.** Deny resource creation without
   required tags.
2. **Automate tagging in IaC.** Terraform/CloudFormation should set tags
   automatically.
3. **Minimum tag set:** Environment, Team, Project, CostCenter, Owner.
4. **Audit regularly.** Untagged resources are invisible to cost reporting.

---

## The FinOps Framework

**FinOps** (Financial Operations) is the practice of bringing financial
accountability to cloud spending. It is a cultural practice as much as
a technical one.

```
  THE FINOPS LIFECYCLE
  =====================

  +----------+     +-----------+     +----------+
  | INFORM   | --> | OPTIMIZE  | --> | OPERATE  |
  | (Measure)|     | (Analyze) |     | (Act)    |
  +----+-----+     +-----+-----+     +-----+----+
       |                 |                  |
       +--------<--------+--------<---------+
                    (Continuous loop)

  INFORM:
  - Visibility into who is spending what
  - Cost allocation by team, project, environment
  - Dashboards showing trends and anomalies
  - Shared cost model (how to split shared resources)

  OPTIMIZE:
  - Right-size instances (is that m5.4xlarge really needed?)
  - Purchase commitments (RIs, Savings Plans)
  - Spot instances for fault-tolerant workloads
  - Storage tiering (S3 Standard -> Infrequent Access -> Glacier)
  - Delete unused resources (zombie instances, old snapshots)

  OPERATE:
  - Budget alerts and guardrails
  - Automated scaling policies
  - Architecture decisions consider cost
  - Teams own their cloud spend
  - Regular cost reviews (weekly/monthly)
```

### FinOps Maturity Levels

| Level     | Characteristics                                    |
|-----------|----------------------------------------------------|
| Crawl     | Basic tagging, monthly cost review, manual reports |
| Walk      | Automated reporting, RI/SP purchasing, right-sizing |
| Run       | Real-time cost awareness, automated optimization,   |
|           | cost in CI/CD, team-level accountability            |

---

## The Cost Optimization Loop

```
  COST OPTIMIZATION LOOP
  =======================

  1. MEASURE
     - Enable Cost Explorer, set up cost allocation tags
     - Export detailed billing to S3 for analysis
     - Set up Athena queries for custom cost analysis
     - Dashboard: cost per service, per team, per environment

  2. ANALYZE
     - Identify top 5 cost drivers (usually EC2, RDS, data transfer)
     - Find unused resources (instances with <5% CPU for 7+ days)
     - Find over-provisioned resources (m5.4xlarge running at 10% CPU)
     - Check coverage ratio (% of spend covered by commitments)
     - Review data transfer patterns (cross-AZ, egress)

  3. OPTIMIZE
     - Right-size: downsize over-provisioned instances
     - Commit: purchase RIs/Savings Plans for steady-state workloads
     - Spot: move fault-tolerant workloads to Spot instances
     - Storage: tier cold data to cheaper storage classes
     - Architect: reduce cross-AZ traffic, add caching, compress data
     - Delete: terminate zombie instances, old snapshots, unused EIPs

  4. REPEAT
     - Monthly cadence for reviews
     - Quarterly cadence for commitment purchases
     - Continuous automation for right-sizing and cleanup
```

---

## Right-Sizing Instances

Right-sizing means matching instance types and sizes to actual workload
requirements. It is the easiest and highest-impact optimization.

```
  RIGHT-SIZING EXAMPLE
  =====================

  Current: m5.4xlarge (16 vCPU, 64 GB RAM)
  Avg CPU: 8%    Peak CPU: 22%
  Avg RAM: 12 GB  Peak RAM: 18 GB
  Cost: $561/month

  Recommendation: m5.xlarge (4 vCPU, 16 GB RAM)
  Projected CPU: 32%   Peak CPU: 88%  (still safe)
  Projected RAM: 12 GB  (fits, with headroom)
  Cost: $140/month

  Savings: $421/month (75% reduction)

  TOOLS:
  - AWS Compute Optimizer (free, ML-based recommendations)
  - AWS Cost Explorer right-sizing recommendations
  - Datadog / CloudHealth / Spot.io for cross-cloud
```

### Graviton / ARM Cost Advantage

AWS Graviton (ARM-based) instances offer 20-40% better price-performance
than equivalent x86 instances for most workloads.

```
  x86 vs GRAVITON COMPARISON
  ============================

  Instance       vCPU  RAM    Price/hr   Price/month
  -------------- ----  -----  --------   -----------
  m5.xlarge      4     16 GB  $0.192     $140
  m6g.xlarge     4     16 GB  $0.154     $112  (Graviton2)
  m7g.xlarge     4     16 GB  $0.163     $119  (Graviton3)

  Graviton2 savings: ~20% vs m5
  Graviton3 savings: ~15% vs m5, but ~25% better performance

  Compatible with: Linux workloads, containers, Java, Python,
  Node.js, Go, Rust, .NET Core
  NOT compatible with: Windows, x86-specific compiled binaries
```

---

## Data Transfer Costs: The Real Surprise

Data transfer is consistently the most surprising line item for cloud
newcomers. Here is a comprehensive view of where data transfer costs
lurk.

```
  DATA TRANSFER COST MAP
  =======================

  +------------------+
  | Internet         |
  | (Users/APIs)     |
  +--------+---------+
           |
           | Egress: $0.09/GB (expensive!)
           | Ingress: FREE
           |
  +--------+---------+
  |   CloudFront     |  Origin fetch: FREE from S3/EC2 to CF
  |   (CDN Edge)     |  CF to Internet: $0.085/GB (slightly cheaper)
  +--------+---------+
           |
  +--------+---------+
  |   Load Balancer  |  Processing: $0.008/LCU-hour
  +--------+---------+
           |
  +--------+---------+
  | VPC              |
  |  +------+------+ |
  |  | AZ-a | AZ-b | |  Cross-AZ: $0.01/GB each way
  |  +------+------+ |
  +--------+---------+
           |
           | Cross-region: $0.02/GB
           |
  +--------+---------+
  | Another Region   |
  +------------------+

  NAT Gateway: $0.045/GB processed (ON TOP of other charges!)
  VPC Endpoint: $0.01/GB processed (cheaper than NAT for AWS services)
```

### Cost Reduction Strategies for Data Transfer

| Strategy              | Savings Potential | Complexity |
|----------------------|-------------------|------------|
| Use VPC Endpoints     | 50-80% for AWS API calls | Low    |
| CloudFront caching    | 40-70% for static content | Low   |
| Compress inter-service payloads | 30-60% | Medium |
| AZ-affinity routing   | 50-90% of cross-AZ costs | Medium |
| Regional S3 Transfer Acceleration | 20-50% for uploads | Low |
| PrivateLink instead of internet | Eliminates egress | Medium |

---

## Budgets, Alerts, and Anomaly Detection

### AWS Budgets

```
  BUDGET CONFIGURATION
  =====================

  Budget: "Production Monthly Spend"
  Amount: $50,000/month

  Alerts:
  1. When ACTUAL spend > 50% of budget ($25,000)  -> Email team lead
  2. When ACTUAL spend > 80% of budget ($40,000)  -> Email + Slack
  3. When ACTUAL spend > 100% of budget ($50,000) -> Email + PagerDuty
  4. When FORECASTED spend > 100% of budget       -> Email team
     (AWS predicts you will exceed based on trend)

  Actions (optional):
  - At 100%: Apply restrictive IAM policy (prevent new resource creation)
  - At 120%: Terminate non-production instances automatically
```

### Cost Anomaly Detection

AWS Cost Anomaly Detection uses ML to identify unusual spending patterns.

```
  ANOMALY DETECTION EXAMPLE
  ==========================

  Normal daily spend: ~$1,600/day

  Day 1: $1,580  (normal)
  Day 2: $1,620  (normal)
  Day 3: $1,590  (normal)
  Day 4: $4,200  (ANOMALY DETECTED!)
         ^
         Anomaly alert triggered
         Root cause: developer left 50 GPU instances running
         Impact: $2,600 in unexpected spend
         Action: terminated instances, saved $78,000/month

  Without anomaly detection: might not notice for weeks.
  With anomaly detection: caught in hours.
```

---

## Unit Economics: Cost Per Request, Cost Per User

Mature FinOps practices track **unit costs** -- the cost to serve one
unit of business value. This normalizes cost against growth.

```
  UNIT ECONOMICS EXAMPLES
  ========================

  E-commerce:
    Total cloud cost: $50,000/month
    Orders processed: 500,000/month
    Cost per order: $0.10
    Trend: $0.12 -> $0.11 -> $0.10 (improving with scale)

  SaaS:
    Total cloud cost: $200,000/month
    Active users: 100,000
    Cost per user: $2.00/month
    Revenue per user: $15.00/month
    Cloud cost as % of revenue: 13.3%
    Industry benchmark: 15-25% (you're doing well)

  API Platform:
    Total cloud cost: $30,000/month
    API calls: 1 billion/month
    Cost per 1M API calls: $30
    Trend: $45 -> $38 -> $30 (optimization working)

  WHY UNIT COSTS MATTER:
  - Total spend going up is fine IF units are going up too
  - Total spend going up while units are flat = problem
  - Total spend flat while units are going up = optimization success
```

---

## Real Examples of Cloud Bills Going Wrong

### Case 1: The S3 Surprise

A startup stored application logs in S3 Standard. After a year, they
had 50 TB of logs they never looked at, costing $1,150/month for
storage alone. Additionally, their log analysis job scanned ALL logs
daily, generating $4,000/month in S3 GET request charges.

**Fix:**
- Lifecycle policy: move logs older than 30 days to S3 Glacier ($200/month)
- Partition logs by date; scan only recent data
- **Result:** $5,150/month reduced to $450/month (91% savings)

### Case 2: The NAT Gateway Nightmare

A company routed all outbound traffic from private subnets through NAT
Gateways. Their microservices architecture generated enormous inter-
service traffic that unnecessarily traversed the NAT Gateway.

- 20 TB/month through NAT Gateway
- NAT Gateway processing: 20,000 GB x $0.045 = $900/month
- NAT Gateway hourly: $0.045 x 730 hours x 3 AZs = $98.55/month
- **Total NAT cost: ~$1,000/month**

**Fix:**
- VPC Endpoints for AWS service calls ($0.01/GB vs $0.045/GB)
- Service mesh for internal service-to-service communication (no NAT)
- **Result:** $1,000/month reduced to $200/month

### Case 3: The Forgotten Dev Environment

A team spun up a full production-replica environment for testing a
feature, including multi-AZ RDS, ElastiCache cluster, and 20 EC2
instances. The feature shipped in 2 weeks. The environment ran for
8 months before anyone noticed.

- Monthly cost: $12,000
- Total waste: $12,000 x 6 months (after the 2-week project) = $72,000

**Fix:**
- Mandatory tagging with `ExpireDate` tag
- Lambda function that terminates resources past their expire date
- Nightly report of untagged resources
- **Prevention:** Never happened again

### Case 4: The Log Explosion

A team enabled DEBUG-level logging in production "temporarily." The
application generated 500 GB/day of CloudWatch Logs.

- Ingestion: 500 GB x $0.50/GB = $250/day
- Storage: 500 GB/day x 30 days x $0.03/GB = $450/month (growing)
- **Monthly cost: ~$7,500 (just for logs)**

**Fix:**
- Reduced log level to WARN in production
- Implemented log sampling (log 1% of DEBUG, 100% of ERROR)
- Set CloudWatch log retention to 7 days (not infinite default)
- **Result:** $7,500/month reduced to $200/month

---

## Cloud Cost Optimization Checklist

```
  COST OPTIMIZATION CHECKLIST
  ============================

  QUICK WINS (do these first):
  [ ] Right-size instances (Compute Optimizer recommendations)
  [ ] Delete unused resources (stopped instances, old snapshots,
      unattached EBS volumes, unused Elastic IPs)
  [ ] Set S3 lifecycle policies (Standard -> IA -> Glacier)
  [ ] Set CloudWatch log retention periods (not indefinite)
  [ ] Review and downgrade over-provisioned RDS instances
  [ ] Remove unused NAT Gateways and load balancers

  COMMITMENTS (save 30-72%):
  [ ] Purchase Savings Plans for steady-state compute
  [ ] Purchase Reserved Instances for RDS and ElastiCache
  [ ] Review commitment coverage quarterly

  ARCHITECTURE (save 20-60%):
  [ ] Use VPC Endpoints instead of NAT Gateway for AWS services
  [ ] Add CloudFront for cacheable content (reduces egress)
  [ ] Use Graviton instances where compatible (20-40% cheaper)
  [ ] Implement request-level caching (API Gateway, DAX, ElastiCache)
  [ ] Compress inter-service payloads (gzip, protobuf vs JSON)

  GOVERNANCE (prevent waste):
  [ ] Enforce cost allocation tags via IAM policies
  [ ] Set up AWS Budgets with alerts at 50%, 80%, 100%
  [ ] Enable Cost Anomaly Detection
  [ ] Schedule dev/test environments to stop after hours
  [ ] Monthly cost review meetings with engineering leads
  [ ] Track unit economics (cost per request, cost per user)
```

---

## DSA Connections

### Dynamic Programming (Knapsack Problem) -- Reserved Instance Purchasing

Selecting the optimal combination of Reserved Instances and Savings Plans is a variant of the 0/1 knapsack problem: each commitment option has a "weight" (upfront cost and lock-in period) and a "value" (projected savings over the term), and the budget is the knapsack capacity. The goal is to maximize total savings without exceeding the capital budget constraint. The pricing pyramid in this document -- 50-70% reserved, 10-30% on-demand, 10-20% spot -- is the empirically-derived solution to this knapsack. AWS Cost Explorer's RI recommendations solve this DP internally: for each instance family and term length, the algorithm computes the break-even utilization and selects the combination that maximizes net savings, subject to the constraint that reserved capacity should not exceed steady-state demand. The overlapping subproblem structure (covering week 1's demand informs covering week 2's) makes DP the natural algorithmic framework.

### Greedy Algorithms -- Right-Sizing and Quick-Win Optimization

The cost optimization checklist's "quick wins" section is a greedy strategy: sort optimization opportunities by savings-to-effort ratio and execute them in descending order. Right-sizing an m5.4xlarge down to m5.xlarge (75% savings, minimal effort) is selected before architectural changes (moderate savings, high effort) because the greedy criterion -- maximum immediate savings per unit of work -- favors it. This mirrors the greedy algorithm for fractional knapsack, where items are sorted by value-per-weight and added in that order. The FinOps lifecycle's Crawl/Walk/Run maturity model is itself a greedy progression: at each stage, the organization picks the highest-impact optimization it can currently execute, exactly as a greedy algorithm selects the locally optimal choice at each step.

### Trie / Prefix Trees -- Cost Allocation Tag Hierarchies

Cost allocation tags form a hierarchical namespace that can be represented as a trie: the root branches by `Environment` (production, staging, dev), each environment branches by `Team`, each team by `Project`, and so on. Querying "what does Team Platform-Engineering spend in Production?" is a trie prefix lookup -- traverse the path `production -> platform-engineering -> *` and sum all leaf costs. AWS Cost Explorer's filtering and grouping operations perform exactly this trie traversal when generating cost breakdowns. The document's tagging strategy (Environment, Team, Project, CostCenter, Owner) defines a 5-level trie whose depth determines the granularity of cost attribution. Untagged resources are orphan nodes outside the trie -- invisible to cost reporting, which is why the document insists tags are non-negotiable.

### Anomaly Detection as Online Algorithms -- Cost Spike Identification

The Cost Anomaly Detection system described in this document is an online algorithm: it processes a stream of daily cost data points and must decide, at each new observation, whether that point is anomalous -- without the luxury of seeing the full dataset. Internally, AWS uses a sliding-window approach combined with statistical thresholds (similar to exponentially-weighted moving averages or CUSUM detectors). The algorithmic challenge is the same as maintaining a running median or a streaming percentile: the system must update its model in O(1) or O(log n) time per data point while accurately distinguishing true anomalies ($4,200 on a normally-$1,600 day) from natural variance. The 50 forgotten GPU instances scenario in this document would be flagged because the cost observation falls outside the confidence interval maintained by the online algorithm -- a classic application of streaming statistics.

---

## Key Takeaways

1. **Cloud costs are an iceberg.** Compute is visible, but data transfer,
   NAT Gateway, logging, and API charges can equal or exceed compute
   spend. Monitor all cost dimensions.

2. **Data transfer is the biggest surprise.** Egress to the internet,
   cross-AZ traffic, and NAT Gateway processing fees add up fast at
   scale. Use VPC Endpoints, CloudFront, and compression to mitigate.

3. **The pricing pyramid -- commit, flex, and spot.** 50-70% of spend
   on commitments (RIs/Savings Plans), 10-30% on-demand for flexibility,
   10-20% Spot for fault-tolerant work. This blend saves 40-60%.

4. **Right-sizing is the easiest win.** Most instances are over-
   provisioned by 2-4x. Use Compute Optimizer or similar tools to
   identify and downsize. Graviton/ARM adds another 20-40% savings.

5. **Tags are non-negotiable.** Without cost allocation tags, you cannot
   attribute costs to teams, projects, or environments. Enforce tagging
   at creation time.

6. **Track unit economics, not just total spend.** Cost per request,
   cost per user, and cloud cost as a percentage of revenue normalize
   costs against business growth. Total spend increasing is fine if
   unit costs are decreasing.

7. **Automate cost governance.** Budget alerts, anomaly detection,
   scheduled shutdowns of dev environments, and automated cleanup of
   expired resources prevent waste before it accumulates.

8. **Cost optimization is continuous.** The FinOps loop (measure,
   analyze, optimize, repeat) never ends. New services, new pricing,
   new workloads -- the landscape shifts constantly, and so must your
   cost strategy.
