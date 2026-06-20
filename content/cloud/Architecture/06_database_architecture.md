# Cloud Database Architecture

## Introduction

Databases are the persistent memory of your applications. While compute is ephemeral
and networking is transient, databases hold the state that gives your application
meaning: user accounts, transactions, product catalogs, audit logs. Choosing the
right database architecture is one of the most consequential decisions in system
design because databases are the hardest component to change once data is in them.

Cloud providers offer a spectrum of managed database services, each optimized for
different access patterns, consistency requirements, and scale characteristics. This
document covers that spectrum -- from relational databases through NoSQL, in-memory
caches, graph databases, and time-series stores -- with deep dives into the
architectures that make them work.

---

## The Database Spectrum

```
 Strict                                                    Flexible
 Schema                                                    Schema
   │                                                         │
   ▼                                                         ▼
┌──────┐  ┌──────┐  ┌────────┐  ┌──────┐  ┌──────┐  ┌──────────┐
│ RDS  │  │Aurora│  │DynamoDB│  │Elast.│  │Neptun│  │Timestream│
│      │  │      │  │        │  │Cache │  │  e   │  │          │
│MySQL │  │MySQL │  │Key-Val │  │Redis │  │Graph │  │Time      │
│Postg.│  │Postg.│  │Documen │  │Memca.│  │      │  │Series    │
│Oracle│  │      │  │        │  │      │  │      │  │          │
│MSSQL │  │      │  │        │  │      │  │      │  │          │
└──────┘  └──────┘  └────────┘  └──────┘  └──────┘  └──────────┘
   │         │          │          │          │          │
   Relational      Key-Value    In-Memory    Graph   Time-Series
              Wide Column     Cache
```

---

## CAP Theorem in Practice

The CAP theorem states that a distributed system can provide at most two of three
guarantees simultaneously:

- **Consistency (C)**: Every read receives the most recent write
- **Availability (A)**: Every request receives a response (not necessarily the latest)
- **Partition tolerance (P)**: The system continues operating despite network splits

In practice, network partitions always happen in distributed systems, so the real
choice is between **CP** (consistent but may reject requests during partitions) and
**AP** (available but may return stale data during partitions).

```
                    C (Consistency)
                   ╱╲
                  ╱  ╲
                 ╱    ╲
        CP ────╱──────╲──── CA
        (RDS) ╱ Not    ╲  (single node
              ╱possible ╲  only; no
             ╱ in dist.  ╲  partition
            ╱  systems    ╲  tolerance)
           ╱              ╲
          ╱────────────────╲
         P                  A
   (Partition         (Availability)
    Tolerance)
              AP
        (DynamoDB,
         Cassandra)
```

AWS services and their CAP positioning:
- **RDS Multi-AZ**: CP (synchronous replication, strongly consistent)
- **Aurora**: CP (quorum writes, strongly consistent reads from primary)
- **DynamoDB**: AP by default (eventually consistent reads), CP option
  (strongly consistent reads at 2x cost)
- **ElastiCache Redis**: CP within a shard, AP across a cluster with replicas

---

## Amazon RDS Architecture

### What Is RDS?

Relational Database Service manages the operational burden of running a relational
database: provisioning, patching, backups, recovery, failover, and scaling. You
choose the engine (MySQL, PostgreSQL, MariaDB, Oracle, SQL Server), and AWS handles
the infrastructure.

### Single-AZ Architecture

```
┌─────────────────────┐
│  AZ-a               │
│  ┌────────────────┐  │
│  │  EC2 (hidden)  │  │
│  │  ┌──────────┐  │  │
│  │  │  DB      │  │  │
│  │  │  Engine  │  │  │
│  │  └──────────┘  │  │
│  │  ┌──────────┐  │  │
│  │  │  EBS     │  │  │
│  │  │  Volume  │  │  │
│  │  └──────────┘  │  │
│  └────────────────┘  │
│                      │
│  Automated backups   │
│  ──► S3 (snapshots)  │
└──────────────────────┘
```

### Multi-AZ Architecture (High Availability)

```
┌─────────────────────┐        ┌─────────────────────┐
│  AZ-a               │        │  AZ-b               │
│  ┌────────────────┐  │        │  ┌────────────────┐  │
│  │  PRIMARY       │  │ sync   │  │  STANDBY       │  │
│  │  (read/write)  │──┼───────►│  │  (no traffic)  │  │
│  │                │  │ repl.  │  │                │  │
│  │  ┌──────────┐  │  │        │  │  ┌──────────┐  │  │
│  │  │  EBS     │  │  │        │  │  │  EBS     │  │  │
│  │  └──────────┘  │  │        │  │  └──────────┘  │  │
│  └────────────────┘  │        │  └────────────────┘  │
└──────────────────────┘        └──────────────────────┘

Failover: DNS endpoint (CNAME) swings to standby in 60-120 seconds.
Standby does NOT serve read traffic (it is a hot standby for failover only).
```

### RDS Multi-AZ with Two Readable Standbys

AWS now offers Multi-AZ DB cluster deployment with one primary and two readable
standby instances using a write-ahead log (WAL) based replication. This provides:
- Failover in ~35 seconds (faster than classic Multi-AZ)
- Read replicas that can serve read traffic
- Local writes (transaction log applied locally)

### Read Replicas

Read replicas use asynchronous replication to offload read traffic from the primary:

```
                    ┌──────────────┐
                    │   PRIMARY    │
        ┌───────────│ (read/write) │───────────┐
        │ async     └──────────────┘   async   │
        │ repl.            │           repl.   │
        ▼                  │                   ▼
┌──────────────┐           │          ┌──────────────┐
│ READ REPLICA │           │          │ READ REPLICA │
│  (read only) │     async │ repl.    │  (read only) │
│  Same Region │           │          │  Diff Region │
└──────────────┘           ▼          └──────────────┘
                   ┌──────────────┐
                   │ READ REPLICA │   (Cross-region for
                   │  (read only) │    DR and latency)
                   └──────────────┘
```

Key characteristics:
- Up to 15 read replicas for Aurora, 5 for RDS MySQL/PostgreSQL
- Asynchronous: slight replication lag (milliseconds to seconds)
- Can be promoted to standalone primary (for DR)
- Cross-region replicas incur data transfer charges

### Automated Backups and Parameter Groups

```bash
# Create RDS instance with automated backups
aws rds create-db-instance \
  --db-instance-identifier myapp-db \
  --db-instance-class db.r6g.xlarge \
  --engine postgres \
  --engine-version 15.4 \
  --master-username admin \
  --master-user-password "${DB_PASSWORD}" \
  --allocated-storage 100 \
  --storage-type gp3 \
  --iops 3000 \
  --multi-az \
  --backup-retention-period 14 \
  --preferred-backup-window "03:00-04:00" \
  --preferred-maintenance-window "sun:05:00-sun:06:00" \
  --storage-encrypted \
  --kms-key-id arn:aws:kms:us-east-1:123456789012:key/abc-123 \
  --db-parameter-group-name myapp-params \
  --vpc-security-group-ids sg-database \
  --db-subnet-group-name myapp-subnet-group
```

---

## Amazon Aurora Architecture

### What Makes Aurora Different

Aurora is AWS's cloud-native relational database. While RDS runs traditional database
engines on EC2/EBS, Aurora redesigns the storage layer for the cloud.

### Shared Storage Volume

```
                 ┌────────────────────┐
                 │   Aurora Primary    │
                 │   (compute only)   │
                 └────────┬───────────┘
                          │
              ┌───────────┼───────────┐
              │           │           │
              ▼           ▼           ▼
         ┌─────────┐ ┌─────────┐ ┌─────────┐
         │ Storage │ │ Storage │ │ Storage │
         │ Node    │ │ Node    │ │ Node    │
    AZ-a │ (2 copies)│ (2 copies)│ (2 copies)│ AZ-c
         └─────────┘ └─────────┘ └─────────┘
              AZ-a       AZ-b       AZ-c

    6 copies of data across 3 AZs
    Writes: Quorum of 4/6 (survives losing an entire AZ)
    Reads:  Quorum of 3/6 (fast, can tolerate failures)
```

**Key innovations:**
1. **Log-structured storage**: Only redo log records are sent to storage nodes, not
   full data pages. This reduces network I/O by 6x compared to traditional replication.

2. **6-way replication with quorum**: Data is replicated 6 times across 3 AZs. Writes
   require 4/6 acknowledgments, reads require 3/6. This means Aurora survives losing
   an entire AZ without data loss and without interrupting writes.

3. **Auto-scaling storage**: Storage grows automatically in 10 GB increments, up to
   128 TB. You never provision storage.

4. **Instant crash recovery**: No replay of redo logs on startup. The storage layer
   handles recovery continuously in the background.

### Aurora Replicas vs RDS Read Replicas

| Feature                    | Aurora Replica         | RDS Read Replica         |
|---------------------------|------------------------|--------------------------|
| Shared storage            | Yes (same volume)      | No (separate EBS)        |
| Replication lag            | Typically < 20ms       | Can be seconds           |
| Failover target            | Yes (automatic)        | Manual promotion         |
| Number supported           | Up to 15               | Up to 5                  |
| Performance impact on write| Minimal (shared storage)| Some (replication stream)|

### Aurora Serverless v2

Aurora Serverless v2 scales compute capacity up and down in fine-grained increments
(0.5 ACU) based on demand. Unlike v1 (which had scaling pauses), v2 scales
instantly and can scale to zero for development workloads.

```bash
# Create Aurora Serverless v2 cluster
aws rds create-db-cluster \
  --db-cluster-identifier myapp-serverless \
  --engine aurora-postgresql \
  --engine-version 15.4 \
  --serverless-v2-scaling-configuration MinCapacity=0.5,MaxCapacity=128 \
  --master-username admin \
  --master-user-password "${DB_PASSWORD}"

aws rds create-db-instance \
  --db-instance-identifier myapp-serverless-1 \
  --db-cluster-identifier myapp-serverless \
  --db-instance-class db.serverless \
  --engine aurora-postgresql
```

---

## Amazon DynamoDB Architecture

### What Is DynamoDB?

DynamoDB is a fully managed NoSQL database that provides single-digit millisecond
performance at any scale. It is serverless: no instances to manage, no storage to
provision. You define a table, choose a capacity mode, and start reading/writing.

### Partition Keys and Sort Keys

DynamoDB stores data in partitions. The partition key determines which partition
stores an item (via consistent hashing). The optional sort key enables range queries
within a partition.

```
Table: Orders
Partition Key: customer_id
Sort Key: order_date

Partition 1 (hash range A-M):
┌────────────────┬──────────────┬─────────┬──────────┐
│ customer_id(PK)│ order_date(SK)│ total   │ status   │
├────────────────┼──────────────┼─────────┼──────────┤
│ alice          │ 2024-01-15   │ 150.00  │ shipped  │
│ alice          │ 2024-02-20   │ 75.50   │ delivered│
│ bob            │ 2024-01-10   │ 200.00  │ delivered│
└────────────────┴──────────────┴─────────┴──────────┘

Partition 2 (hash range N-Z):
┌────────────────┬──────────────┬─────────┬──────────┐
│ customer_id(PK)│ order_date(SK)│ total   │ status   │
├────────────────┼──────────────┼─────────┼──────────┤
│ nadia          │ 2024-03-01   │ 50.00   │ pending  │
│ zach           │ 2024-01-05   │ 300.00  │ shipped  │
└────────────────┴──────────────┴─────────┴──────────┘
```

### Global Secondary Indexes (GSI) and Local Secondary Indexes (LSI)

```
Base Table:  PK=customer_id, SK=order_date
  → Query: "Get all orders for alice in January 2024"  ✓

GSI:         PK=status, SK=order_date
  → Query: "Get all pending orders sorted by date"     ✓

LSI:         PK=customer_id, SK=total (same PK, different SK)
  → Query: "Get alice's orders sorted by total amount" ✓
```

**GSI**: Creates a fully independent index with a different partition key. Data is
asynchronously replicated from the base table. You can create GSIs anytime. Each
GSI has its own provisioned capacity.

**LSI**: Must share the same partition key as the base table but with a different
sort key. Must be defined at table creation time. Uses the base table's capacity.

### Capacity Modes

**On-Demand**: Pay per request. No capacity planning. DynamoDB handles scaling
automatically. Best for unpredictable traffic patterns.

**Provisioned**: You specify read capacity units (RCU) and write capacity units (WCU).
Cheaper than on-demand for predictable workloads. Supports auto-scaling.

```
1 RCU = 1 strongly consistent read/sec for items up to 4 KB
      = 2 eventually consistent reads/sec for items up to 4 KB
1 WCU = 1 write/sec for items up to 1 KB
```

### DAX (DynamoDB Accelerator)

DAX is an in-memory cache that sits in front of DynamoDB, providing microsecond
response times for read-heavy workloads.

```
Application ──► DAX Cluster ──► DynamoDB
                  │
           Cache HIT: ~200μs
           Cache MISS: DAX reads from DynamoDB,
                       caches result, returns
```

DAX is API-compatible with DynamoDB -- change the endpoint, and your application
uses the cache automatically without code changes.

### DynamoDB Streams

Streams capture a time-ordered sequence of item-level changes in a table. Each
stream record contains the item's key attributes and the before/after images
of modified attributes.

```
DynamoDB Table ──► Stream ──► Lambda (process changes)
                         ──► Kinesis Data Streams
                         ──► EventBridge Pipes

Use cases:
- Materialized views (replicate to another table/service)
- Real-time aggregations
- Cross-region replication (Global Tables use this internally)
- Event-driven architectures
```

### Single-Table Design

In DynamoDB, the best practice is often to store multiple entity types in a single
table using carefully designed partition keys and sort keys:

```
Table: MyApp
PK              SK                  Attributes
─────────────   ──────────────────  ──────────────────
USER#alice      PROFILE             {name, email, ...}
USER#alice      ORDER#2024-01-15    {total, status}
USER#alice      ORDER#2024-02-20    {total, status}
PRODUCT#p123    METADATA            {name, price, ...}
PRODUCT#p123    REVIEW#alice        {rating, text}
ORDER#ord-456   STATUS              {status, ship_date}
```

This enables efficient access patterns:
- Get user profile: `PK=USER#alice, SK=PROFILE`
- Get all orders for user: `PK=USER#alice, SK begins_with ORDER#`
- Get product with all reviews: `PK=PRODUCT#p123`

---

## Amazon ElastiCache

### Redis vs Memcached

| Feature              | Redis                    | Memcached               |
|----------------------|--------------------------|--------------------------|
| Data structures      | Strings, lists, sets,    | Strings only             |
|                      | sorted sets, hashes, etc.|                          |
| Persistence          | RDB snapshots, AOF       | No persistence           |
| Replication          | Primary/replica          | No replication           |
| Clustering           | Redis Cluster (sharding) | Multi-node (no sharding) |
| Pub/Sub              | Yes                      | No                       |
| Lua scripting        | Yes                      | No                       |
| Multi-threaded       | Single-threaded (6.x+    | Multi-threaded           |
|                      | has I/O threading)       |                          |
| Use case             | Sessions, leaderboards,  | Simple object caching    |
|                      | real-time analytics,     |                          |
|                      | queues, geospatial       |                          |

**Default choice**: Redis. Memcached only when you need multi-threaded performance
for simple key-value caching and don't need any of Redis's advanced features.

### Caching Strategies

```
CACHE-ASIDE (Lazy Loading):
1. App checks cache
2. Cache miss → read from DB
3. Write result to cache
4. Return to caller

     App ──1──► Cache (miss)
      │                │
      ├──2──► DB       │
      │       │        │
      ◄───────┘        │
      │                │
      ├──3──► Cache ───┘ (store)
      │
      ◄── 4. Return

WRITE-THROUGH:
1. App writes to cache AND DB simultaneously
2. Cache is always current
3. Reads always hit cache

WRITE-BEHIND:
1. App writes to cache only
2. Cache async writes to DB (batched)
3. Risk: data loss if cache crashes before flush
```

---

## Specialty Databases

### Amazon Neptune (Graph)

For highly connected data where relationships are as important as the data itself:
social networks, fraud detection, recommendation engines, knowledge graphs.

### Amazon Timestream (Time-Series)

Optimized for time-stamped data: IoT sensor readings, application metrics,
DevOps monitoring. Automatically tiers data from in-memory to magnetic storage
based on age.

### Amazon QLDB (Ledger)

Immutable, cryptographically verifiable transaction log. Every change is
recorded and cannot be altered. Use cases: financial transactions, supply chain
tracking, regulatory audit trails.

---

## Database Migration Strategies

### The 6 R's Applied to Databases

```
Strategy           Description                     Example
─────────────────  ─────────────────────────────── ────────────────────────
Rehost (Lift)      Move to RDS same engine         Oracle on-prem → RDS Oracle
Replatform         Move to managed, same paradigm  MySQL on-prem → Aurora MySQL
Refactor           Change engine entirely           Oracle → Aurora PostgreSQL
                                                   SQL Server → DynamoDB
Repurchase         Move to SaaS                    Self-hosted CRM → Salesforce
Retire             Decommission                    Unused databases
Retain             Keep on-premises                Mainframe DB (for now)
```

### AWS Database Migration Service (DMS)

```
Source DB ──► DMS Replication Instance ──► Target DB
  (on-prem      (runs in your VPC,         (RDS, Aurora,
   or cloud)     performs ETL if needed)     DynamoDB, S3)

Migration phases:
1. Full load: Initial bulk data copy
2. Change Data Capture (CDC): Ongoing replication of changes
3. Cutover: Switch application to target when caught up
```

---

## Database Decision Flowchart

```
START: What are your data access patterns?
│
├── Structured data with complex joins and transactions?
│   ├── Need cloud-native performance? ──► Aurora
│   ├── Need Oracle/SQL Server compatibility? ──► RDS
│   └── Need auto-scaling compute? ──► Aurora Serverless v2
│
├── Key-value lookups with massive scale?
│   ├── Need single-digit ms latency? ──► DynamoDB
│   ├── Need microsecond latency? ──► DynamoDB + DAX
│   └── Need flexible queries? ──► Consider Aurora instead
│
├── Caching layer for reads?
│   ├── Need data structures (sorted sets, lists)? ──► ElastiCache Redis
│   └── Simple key-value cache? ──► ElastiCache Redis (or Memcached)
│
├── Highly connected data (relationships)?
│   └── Neptune (graph database)
│
├── Time-series data (metrics, IoT)?
│   └── Timestream
│
├── Immutable audit log?
│   └── QLDB
│
└── Document storage with search?
    └── OpenSearch (Elasticsearch managed)
```

---

## Practical Takeaways

1. **Start with Aurora PostgreSQL** for relational workloads. It provides 5x the
   throughput of standard PostgreSQL, automatic storage scaling, and fast failover.

2. **Use DynamoDB for high-scale, well-understood access patterns.** If you can model
   your access patterns upfront, DynamoDB delivers unmatched scale and operational
   simplicity. If your access patterns evolve frequently, a relational database gives
   more flexibility.

3. **Cache aggressively.** Add ElastiCache Redis between your application and database.
   Most read-heavy applications see 80%+ cache hit rates, dramatically reducing
   database load and latency.

4. **Enable Multi-AZ for production RDS.** The ~2x cost is justified by automatic
   failover. Do not run single-AZ databases in production.

5. **Use read replicas for read scaling**, not for HA. Read replicas do not provide
   automatic failover (except Aurora replicas).

6. **Design DynamoDB tables around access patterns**, not entities. Plan your partition
   key, sort key, and GSIs around the queries you need to run, then fit the data model
   to those keys.

7. **Encrypt databases at rest and in transit.** RDS and Aurora support encryption at
   rest via KMS (must be enabled at creation -- cannot encrypt an existing unencrypted
   database) and TLS for client connections.

8. **Automate backups and test restores.** Automated backups are worthless if you have
   never verified that a restore actually works. Schedule quarterly restore drills.

---

## DSA Connections

### B+ Trees — RDS and Aurora Indexing

A B+ tree is a self-balancing tree where all values are stored in leaf nodes linked together, with internal nodes containing only keys for navigation. B+ trees provide O(log n) lookups and support efficient range scans by walking the linked leaf chain. Every relational database engine available in RDS (MySQL, PostgreSQL, Oracle, SQL Server) uses B+ trees as the default index structure. When you create an index on a column like `order_date`, the database builds a B+ tree where internal nodes guide searches and leaf nodes contain the indexed values plus pointers to the actual table rows. A query like `SELECT * FROM orders WHERE order_date BETWEEN '2024-01-01' AND '2024-03-31'` traverses the tree to the first matching leaf in O(log n), then walks the linked leaf list to collect all results sequentially. Aurora's shared storage layer replicates these B+ tree structures across 6 copies in 3 AZs, ensuring that the index data survives even a full AZ failure without needing to rebuild the tree.

### LSM Trees — DynamoDB Write-Optimized Storage

A Log-Structured Merge-tree (LSM tree) is a data structure that buffers writes in an in-memory sorted structure (memtable), then periodically flushes them to sorted, immutable files on disk (SSTables), and merges these files in the background. LSM trees provide O(1) amortized write performance at the cost of slightly slower reads, which must check multiple levels. DynamoDB uses an LSM-tree-based storage engine internally, which is why it achieves consistent single-digit-millisecond write latency regardless of table size. When you perform a `PutItem`, the write goes to an in-memory buffer first (fast), is acknowledged after replication to multiple storage nodes, and is later compacted into sorted runs on disk. This architecture explains DynamoDB's capacity model: WCUs map to the rate at which the memtable can absorb writes and the compaction process can keep up. The trade-off is that reads may need to check both the memtable and multiple on-disk levels, which is why DAX (the in-memory cache) provides such a dramatic speedup for read-heavy workloads -- it bypasses the LSM tree's multi-level read path entirely.

### Hash Indexes — DynamoDB Partition Key Lookups via Consistent Hashing

A hash index maps keys to storage locations using a hash function, providing O(1) average-case lookups for exact-match queries but no support for range scans on the hashed key. DynamoDB's partition key is a hash index: when you query `PK = 'USER#alice'`, DynamoDB hashes this value to determine which partition stores the item, then retrieves it in constant time. This is why partition key queries are so fast and why you cannot perform range queries on the partition key itself -- hash functions destroy ordering. The sort key, by contrast, is stored in sorted order within each partition (using a B-tree-like structure), which is why `SK begins_with 'ORDER#'` works as a range scan. Single-table design in DynamoDB is essentially the art of designing composite hash keys (`PK = 'USER#alice'`, `SK = 'ORDER#2024-01-15'`) that align with your access patterns, so that each query maps to a single hash lookup followed by an efficient range scan within that partition.

### Doubly-Linked Lists + Hash Maps — ElastiCache Redis LRU Eviction

Redis implements its LRU eviction policy using an approximated LRU algorithm that samples a configurable number of keys and evicts the least recently used among the sample. Under the hood, each Redis key-value entry maintains an LRU clock field (recording the last access time), and the key space is organized as a hash table for O(1) lookups. When Redis reaches its `maxmemory` limit and the eviction policy is `allkeys-lru`, it samples N random keys (default 5), checks their LRU clock values, and evicts the oldest. A classic textbook LRU cache uses a doubly-linked list (for O(1) move-to-front on access) combined with a hash map (for O(1) key lookup), achieving exact LRU in O(1) per operation. Redis trades exact LRU for approximate LRU to avoid the memory overhead of maintaining a full linked list across millions of keys -- a pragmatic engineering decision that the document's caching strategy section implicitly relies on when recommending Redis for session stores and read caches.
