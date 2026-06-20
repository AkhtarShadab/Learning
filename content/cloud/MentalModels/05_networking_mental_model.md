# Cloud Networking Mental Model

## Core Idea: Virtual Networks Over Physical Networks

In a traditional data center, networking is physical: you buy switches,
routers, cables, and firewalls. In the cloud, networking is **virtual**:
software defines the network topology, and it runs as an overlay on top
of the provider's physical network.

This is called **Software-Defined Networking (SDN)**, and it is what
allows every cloud customer to have their own isolated, configurable
network -- even though they all share the same physical infrastructure.

![PHYSICAL vs VIRTUAL NETWORKING](assets/05_networking_mental_model-mm1.svg)

---

## VPC: Your Virtual Data Center

A **Virtual Private Cloud (VPC)** is a logically isolated section of the
cloud provider's network that you control. Think of it as your own
private data center inside the cloud, with your own IP address range,
subnets, routing rules, and security policies.

### Key Properties of a VPC

- **Isolated:** Traffic cannot flow between VPCs unless you explicitly
  allow it (via peering, Transit Gateway, or VPN).
- **Configurable:** You define the IP range, subnets, route tables,
  gateways, and security rules.
- **Regional:** A VPC spans all Availability Zones in a single region.
- **Free:** VPCs themselves cost nothing. You pay for resources inside
  them (instances, NAT gateways, data transfer).

![VPC networking: public/private/DB subnets across AZs](assets/05_networking_mental_model-vpc.svg)

---

## CIDR Notation and Subnet Math

**CIDR (Classless Inter-Domain Routing)** notation defines IP address
ranges. Mastering CIDR math is essential for cloud networking.

### The Basics

A CIDR block like `10.0.0.0/16` means:
- The first 16 bits are the **network prefix** (fixed)
- The remaining 16 bits are available for **host addresses**
- Total addresses: 2^(32-16) = 2^16 = 65,536

### Quick Reference Table

| CIDR  | Subnet Mask     | Total IPs | Usable IPs* | Use Case              |
|-------|-----------------|-----------|-------------|----------------------|
| /16   | 255.255.0.0     | 65,536    | 65,531      | Large VPC             |
| /20   | 255.255.240.0   | 4,096     | 4,091       | Medium subnet         |
| /24   | 255.255.255.0   | 256       | 251         | Standard subnet       |
| /26   | 255.255.255.192 | 64        | 59          | Small subnet          |
| /28   | 255.255.255.240 | 16        | 11          | Tiny subnet           |

*AWS reserves 5 IPs per subnet: network address, VPC router, DNS,
future use, and broadcast.

### Subnet Planning Example

```
  SUBNET PLANNING FOR A /16 VPC
  ===============================

  VPC: 10.0.0.0/16 (65,536 addresses)

  Split into /20 subnets (4,096 addresses each):

  10.0.0.0/20    = 10.0.0.0   - 10.0.15.255   (Public, AZ-a)
  10.0.16.0/20   = 10.0.16.0  - 10.0.31.255   (Public, AZ-b)
  10.0.32.0/20   = 10.0.32.0  - 10.0.47.255   (Public, AZ-c)
  10.0.48.0/20   = 10.0.48.0  - 10.0.63.255   (Private, AZ-a)
  10.0.64.0/20   = 10.0.64.0  - 10.0.79.255   (Private, AZ-b)
  10.0.80.0/20   = 10.0.80.0  - 10.0.95.255   (Private, AZ-c)
  10.0.96.0/20   = 10.0.96.0  - 10.0.111.255  (Data, AZ-a)
  10.0.112.0/20  = 10.0.112.0 - 10.0.127.255  (Data, AZ-b)
  ...
  (Room for 16 total /20 subnets in a /16 VPC)

  Rule of thumb: Always allocate more IPs than you think you need.
  Expanding CIDR ranges later is painful.
```

---

## Public vs Private Subnets

The distinction between public and private subnets is one of the most
important concepts in cloud networking.

### Public Subnet

- Has a route to an **Internet Gateway (IGW)**
- Instances can have public IP addresses
- Directly reachable from the internet (if security groups allow)
- Used for: load balancers, bastion hosts, NAT gateways

### Private Subnet

- Has **no** route to an Internet Gateway
- Instances have only private IP addresses
- NOT directly reachable from the internet
- Can reach the internet via a **NAT Gateway** (outbound only)
- Used for: application servers, databases, internal services

![PUBLIC vs PRIVATE SUBNET TRAFFIC FLOW](assets/05_networking_mental_model-mm2.svg)

---

## Internet Gateway vs NAT Gateway

These two components are frequently confused. They serve opposite
purposes.

### Internet Gateway (IGW)

- Allows **inbound and outbound** internet traffic
- Attached to the VPC (one per VPC)
- Instances in public subnets use it with a public IP
- Free (no hourly charge, but data transfer costs apply)
- Horizontally scaled, redundant, and highly available by default

### NAT Gateway

- Allows **outbound-only** internet traffic from private subnets
- Instances initiate connections out; the internet cannot initiate
  connections in
- Deployed in a public subnet, referenced in private subnet route tables
- Costs money (~$0.045/hour + $0.045/GB processed)
- Use case: private instances need to download software updates,
  call external APIs

![INTERNET GATEWAY vs NAT GATEWAY](assets/05_networking_mental_model-mm3.svg)

---

## Route Tables: The GPS of Your VPC

Every subnet has a **route table** that determines where network traffic
is directed. Think of it as a set of GPS directions: "to reach this
destination, go through this gateway."

### Route Table Example

```
  PUBLIC SUBNET ROUTE TABLE
  ==========================

  Destination       Target          Notes
  ---------------  --------------  ----------------------------
  10.0.0.0/16      local           Traffic within VPC stays local
  0.0.0.0/0        igw-abc123      All other traffic -> internet

  PRIVATE SUBNET ROUTE TABLE
  ===========================

  Destination       Target          Notes
  ---------------  --------------  ----------------------------
  10.0.0.0/16      local           Traffic within VPC stays local
  0.0.0.0/0        nat-xyz789      All other traffic -> NAT GW

  The key difference: public subnets route 0.0.0.0/0 to an IGW.
  Private subnets route 0.0.0.0/0 to a NAT Gateway (or nowhere).
```

### Route Evaluation

Routes are evaluated using **longest prefix match**. More specific
routes (longer prefix) take priority over less specific routes.

![LONGEST PREFIX MATCH EXAMPLE](assets/05_networking_mental_model-mm4.svg)

---

## Security Groups vs NACLs

Cloud networking provides two layers of firewalling. Understanding the
difference is critical.

### Security Groups (Stateful Firewall)

- Applied at the **instance (ENI) level**
- **Stateful:** If you allow inbound traffic, the response is
  automatically allowed (no need for an outbound rule)
- **Allow-only:** You can only write ALLOW rules. Everything not
  explicitly allowed is denied.
- **Evaluated as a group:** All rules are evaluated together; the
  most permissive rule wins.
- Default: all outbound allowed, all inbound denied.

### NACLs (Stateless Firewall)

- Applied at the **subnet level**
- **Stateless:** You must write rules for both inbound AND outbound
  traffic. Return traffic is not automatically allowed.
- **Allow and Deny:** You can write both ALLOW and DENY rules.
- **Evaluated in order:** Rules are evaluated by rule number (lowest
  first). First match wins.
- Default: all traffic allowed (both directions).

```
  SECURITY GROUPS vs NACLs
  =========================

                     Security Group         NACL
                     -----------------      -----------------
  Applied to         Instance (ENI)         Subnet
  Statefulness       Stateful               Stateless
  Rule types         Allow only             Allow and Deny
  Rule evaluation    All rules, most        In order, first
                     permissive wins        match wins
  Default            Deny all inbound       Allow all
  Return traffic     Automatic              Must be explicit
  Use case           Primary firewall       Subnet-level
                     for instances          guard rails

  MENTAL MODEL:
  - Security Groups = bouncers at the door of each room (instance)
  - NACLs = security checkpoint at the building entrance (subnet)
```

### Example Configuration

```
  SECURITY GROUP: web-server-sg
  =============================
  Inbound:
    HTTP   (TCP 80)   from 0.0.0.0/0         ALLOW
    HTTPS  (TCP 443)  from 0.0.0.0/0         ALLOW
    SSH    (TCP 22)   from 10.0.0.0/16       ALLOW (VPC only)
  Outbound:
    All traffic       to 0.0.0.0/0           ALLOW (default)

  Because Security Groups are stateful:
  - A request on port 443 is allowed in
  - The response on the ephemeral port is AUTOMATICALLY allowed out
  - No outbound rule needed for the response
```

---

## VPC Peering vs Transit Gateway

As architectures grow, you need to connect multiple VPCs. Two primary
approaches exist.

### VPC Peering

Direct connection between two VPCs. Traffic stays on the provider's
private backbone (never crosses the public internet).

![VPC PEERING](assets/05_networking_mental_model-mm5.svg)

### Transit Gateway

A centralized hub that connects multiple VPCs and on-premises networks.
Think of it as a cloud router.

![TRANSIT GATEWAY](assets/05_networking_mental_model-mm6.svg)

---

## DNS: Route 53 and Cloud DNS

DNS is the phone book of the internet. In the cloud, managed DNS
services provide additional capabilities beyond simple name resolution.

### Routing Policies

| Policy          | Behavior                                    | Use Case                      |
|-----------------|---------------------------------------------|-------------------------------|
| Simple          | Return one record                           | Single resource               |
| Weighted        | Distribute traffic by percentage            | A/B testing, canary deploys   |
| Latency-based   | Route to lowest-latency region              | Global applications           |
| Failover        | Route to primary; switch to secondary       | Disaster recovery             |
| Geolocation     | Route based on user's location              | Content localization          |
| Multi-value     | Return multiple IPs, health-checked         | Simple load balancing         |

---

## Load Balancers: L4 vs L7

Load balancers distribute traffic across multiple targets. The key
distinction is between Layer 4 and Layer 7 load balancers.

### Layer 4 (Network Load Balancer - NLB)

Operates at the **transport layer** (TCP/UDP). Sees source IP, destination
IP, source port, destination port. Routes based on IP and port. Does not
inspect the content of the request.

- **Speed:** Millions of requests per second, ultra-low latency
- **Use case:** TCP/UDP traffic, gaming, IoT, non-HTTP protocols
- **Preserves:** Client source IP

### Layer 7 (Application Load Balancer - ALB)

Operates at the **application layer** (HTTP/HTTPS). Sees URLs, headers,
cookies, query parameters. Can make routing decisions based on content.

- **Speed:** Hundreds of thousands of requests per second
- **Use case:** HTTP/HTTPS traffic, microservices, path-based routing
- **Features:** Host-based routing, path-based routing, header inspection,
  WebSocket support, sticky sessions

![L4 vs L7 LOAD BALANCER](assets/05_networking_mental_model-mm7.svg)

---

## The Packet Journey: End to End

Here is the complete journey of an HTTPS request from a user's browser
to a database and back.

![THE PACKET JOURNEY](assets/05_networking_mental_model-mm8.svg)

### What Security Checks Happen Along the Way

```
  SECURITY CHECK SEQUENCE
  ========================

  1. CloudFront:  WAF rules (block SQL injection, XSS, rate limiting)
  2. ALB:         Security Group (allow HTTPS from CloudFront IPs)
  3. EC2:         Security Group (allow HTTP from ALB only)
                  NACL at subnet boundary (stateless check)
  4. RDS:         Security Group (allow PostgreSQL from app subnet)
                  NACL at data subnet boundary

  Each layer adds defense in depth.
```

---

## CDN Edge Locations

A **Content Delivery Network (CDN)** caches content at edge locations
close to users, reducing latency for static content (images, CSS, JS)
and improving performance for dynamic content (via optimized backbone
routing).

![CDN TOPOLOGY](assets/05_networking_mental_model-mm9.svg)

---

## DSA Connections

### Graph Traversal (Dijkstra's Algorithm) -- Route Table Evaluation and CDN Routing

A cloud network is a weighted directed graph: nodes are VPCs, subnets, gateways, and edge locations; edges are routes with associated latency or cost weights. When Route 53 uses latency-based routing to direct a user in Tokyo to the nearest CloudFront edge, it is solving a single-source shortest-path problem -- the same problem Dijkstra's algorithm addresses in O((V + E) log V) time with a min-heap. The document's packet journey from Sydney through CloudFront to us-east-1 traverses the shortest-latency path across AWS's backbone graph. Similarly, BGP (Border Gateway Protocol), which underlies all internet routing including VPC-to-internet paths, uses a distance-vector algorithm that is a distributed variant of Bellman-Ford -- trading Dijkstra's centralized optimality for decentralized convergence across autonomous systems.

### Trie (Prefix Tree) -- Longest Prefix Match in Route Tables

The longest prefix match algorithm described in the route table section -- where a packet to 10.0.5.17 matches /24 over /16 over /0 -- is implemented using a binary trie (also called a radix tree or Patricia trie). Each bit of the destination IP address determines a left or right branch in the trie, and the deepest matching node is the selected route. Hardware routers implement this in TCAMs (ternary content-addressable memory) for O(1) lookups, but the logical structure is a trie with up to 32 levels for IPv4. CIDR notation directly encodes the trie depth: /16 means "match the first 16 bits," which corresponds to traversing the trie to depth 16. This is why more specific routes (longer prefixes, deeper trie nodes) always win -- they represent a more precise match in the trie, just as a longer key match in a trie is always more specific than a shorter one.

### Spanning Trees -- VPC Peering vs Transit Gateway Topology

The document's comparison of VPC peering (requiring N*(N-1)/2 connections for N VPCs) versus Transit Gateway (a centralized hub) directly mirrors the graph theory distinction between a complete graph and a star topology. VPC peering creates a complete graph K_n with O(n^2) edges, which is expensive to manage and non-transitive. Transit Gateway creates a star graph with O(n) edges and transitive routing -- topologically equivalent to a spanning tree of the complete graph. This is the same optimization that the Spanning Tree Protocol (STP) performs in physical Ethernet networks: it finds a loop-free subgraph (tree) that connects all nodes with minimum edges. The Transit Gateway is, in effect, the cloud-level spanning tree that replaces an unmanageable full mesh with a minimal connected topology.

### Adjacency Lists -- Security Group Rule Evaluation

Security groups and NACLs are evaluated as rule sets that can be modeled as adjacency lists in a directed graph where nodes are (source, destination) pairs and edges represent allowed traffic flows. A security group with rules allowing HTTP from 0.0.0.0/0 and SSH from 10.0.0.0/16 defines two edges in this access graph. The stateful property of security groups means that for every edge (A -> B) in the inbound adjacency list, the reverse edge (B -> A) is implicitly added to the outbound list -- automatic bidirectional edge insertion. NACLs, being stateless, require explicit edges in both directions. Evaluating whether a packet is allowed is a graph reachability query: "does a path exist from source to destination through the allowed-traffic graph?" Network segmentation via VPCs, subnets, and security groups is the practice of partitioning this graph into disconnected components to minimize blast radius.

---

## Key Takeaways

1. **VPCs are virtual data centers.** They give you a logically isolated
   network with your own IP space, subnets, route tables, and security
   policies. Learn to design VPCs before deploying workloads.

2. **Public vs private subnets are about routing, not magic.** A subnet
   is "public" if its route table has a route to an Internet Gateway. A
   subnet is "private" if it does not.

3. **NAT Gateway enables outbound-only internet access.** Private
   instances can reach the internet (for updates, API calls) without
   being reachable from the internet.

4. **Security Groups are your primary firewall.** They are stateful,
   allow-only, and applied per instance. Start with the most restrictive
   rules and open only what is needed.

5. **CIDR math is worth learning.** Subnet planning mistakes are
   expensive to fix later. Always allocate more IP space than you think
   you need.

6. **Transit Gateway replaces the peering mesh.** For more than 3-4
   VPCs, Transit Gateway is simpler and more scalable than managing
   N*(N-1)/2 peering connections.

7. **Understand the packet journey.** Knowing how a request flows from
   user to CloudFront to ALB to EC2 to RDS (and back) helps you debug
   connectivity issues, optimize latency, and design security in depth.

8. **L4 vs L7 load balancers serve different purposes.** Use NLB for raw
   TCP/UDP performance and source IP preservation. Use ALB for
   HTTP-aware routing, path-based rules, and WebSocket support.
