# Cloud Networking Architecture Deep Dive

## Introduction

Networking is the connective tissue of cloud architecture. Every request from a user,
every database query, every API call between microservices, every log shipped to a
monitoring service -- all of it flows over the network. Yet networking is often the
least understood layer, treated as plumbing rather than architecture.

In the cloud, networking is software-defined. You do not plug in cables or configure
physical switches. Instead, you define virtual networks, subnets, routing tables,
and access controls in code. This programmability is powerful but introduces
complexity: misconfigure a route table and traffic black-holes silently; misconfigure
a security group and you either block legitimate traffic or expose a database to
the internet.

This document covers cloud networking from first principles through advanced patterns,
with a focus on AWS VPC. The concepts transfer to Azure VNets and GCP VPCs with
different naming conventions but similar architectures.

---

## VPC Fundamentals

### What Is a VPC?

A Virtual Private Cloud is a logically isolated section of the cloud where you launch
resources in a virtual network you define. You control the IP address range, subnets,
route tables, and network gateways. A VPC spans all Availability Zones in a region
but is confined to a single region.

```
Region: us-east-1
┌──────────────────────────────────────────────────┐
│                  VPC: 10.0.0.0/16                │
│                  (65,536 addresses)              │
│                                                  │
│   AZ-a                 AZ-b              AZ-c    │
│   ┌──────────┐        ┌──────────┐      ┌─────┐ │
│   │ Subnet   │        │ Subnet   │      │ ... │ │
│   │ 10.0.1.0 │        │ 10.0.2.0 │      │     │ │
│   │ /24      │        │ /24      │      │     │ │
│   └──────────┘        └──────────┘      └─────┘ │
│                                                  │
│   Route Tables    Security Groups    NACLs       │
│   Internet GW     NAT GW            VPC Endpts   │
└──────────────────────────────────────────────────┘
```

### How AWS Implements Virtual Networking

Under the hood, AWS VPC uses a combination of:

1. **Mapping Service**: A distributed system that maps virtual IP addresses to
   physical host addresses. When instance A sends a packet to instance B's private
   IP, the mapping service resolves which physical host B runs on.

2. **Encapsulation**: Packets between instances are encapsulated in an outer IP
   header for transit across the physical network. The guest OS never sees the
   physical addressing.

3. **Blackfoot Edge Devices**: Hardware at VPC boundaries that handle traffic
   entering/leaving the VPC (internet gateway, NAT gateway, VPN, Direct Connect).

This is why VPC networking "just works" regardless of the physical topology of the
underlying data center.

---

## CIDR Planning

### CIDR Basics

CIDR (Classless Inter-Domain Routing) notation defines IP address ranges:
- `10.0.0.0/16` = 65,536 addresses (10.0.0.0 - 10.0.255.255)
- `10.0.0.0/24` = 256 addresses (10.0.0.0 - 10.0.0.255)
- `10.0.0.0/28` = 16 addresses (10.0.0.0 - 10.0.0.15)

AWS reserves 5 addresses in each subnet:
- `.0` = Network address
- `.1` = VPC router
- `.2` = DNS server
- `.3` = Reserved for future use
- `.255` = Broadcast (not supported in VPC but reserved)

So a `/24` subnet gives you 251 usable addresses, not 256.

### CIDR Planning for Large Organizations

The most common mistake in CIDR planning is choosing ranges that overlap with other
VPCs, on-premises networks, or acquired company networks. Once you peer VPCs or
establish VPN/Direct Connect, overlapping CIDRs cannot route.

**Best practice**: Allocate from RFC 1918 private ranges with a centralized IPAM
(IP Address Management) strategy:

```
Corporate CIDR Allocation Plan
═══════════════════════════════════════════
10.0.0.0/8       ─── Reserved for cloud VPCs
  10.0.0.0/12    ─── AWS accounts
    10.0.0.0/16  ─── Production (us-east-1)
    10.1.0.0/16  ─── Production (eu-west-1)
    10.2.0.0/16  ─── Staging
    10.3.0.0/16  ─── Development
  10.16.0.0/12   ─── Azure subscriptions
  10.32.0.0/12   ─── GCP projects

172.16.0.0/12    ─── On-premises data centers
  172.16.0.0/16  ─── DC-1 (New York)
  172.17.0.0/16  ─── DC-2 (London)

192.168.0.0/16   ─── Office/branch networks
```

AWS VPC IPAM (IP Address Management) automates this allocation and prevents overlap.

---

## Subnet Design Patterns

### The Multi-Tier Architecture

The standard enterprise pattern uses three tiers of subnets per AZ:

```
Internet
    │
    ▼
┌──────────────────────────────────────────────────┐
│  VPC: 10.0.0.0/16                                │
│                                                  │
│  PUBLIC SUBNETS (Internet-facing)                │
│  ┌──────────────┐  ┌──────────────┐              │
│  │ 10.0.1.0/24  │  │ 10.0.2.0/24  │   AZ-a, AZ-b│
│  │ ALB, NAT GW  │  │ ALB, NAT GW  │              │
│  │ Bastion Host │  │              │              │
│  └──────┬───────┘  └──────┬───────┘              │
│         │                 │                      │
│  PRIVATE SUBNETS (Application tier)              │
│  ┌──────┴───────┐  ┌──────┴───────┐              │
│  │ 10.0.11.0/24 │  │ 10.0.12.0/24 │              │
│  │ App servers  │  │ App servers  │              │
│  │ (EC2/ECS)    │  │ (EC2/ECS)    │              │
│  └──────┬───────┘  └──────┬───────┘              │
│         │                 │                      │
│  ISOLATED SUBNETS (Data tier)                    │
│  ┌──────┴───────┐  ┌──────┴───────┐              │
│  │ 10.0.21.0/24 │  │ 10.0.22.0/24 │              │
│  │ RDS, ElastiC │  │ RDS, ElastiC │              │
│  │ (no internet)│  │ (no internet)│              │
│  └──────────────┘  └──────────────┘              │
└──────────────────────────────────────────────────┘
```

**Public subnets**: Have a route to an Internet Gateway (IGW). Resources here get
public IP addresses and can be reached from the internet. Only place load balancers,
NAT gateways, and bastion hosts here.

**Private subnets**: Have a route to a NAT Gateway (in the public subnet) for
outbound internet access. No inbound access from the internet. Application servers,
containers, and Lambda functions live here.

**Isolated subnets**: No route to the internet at all. Databases and caches that
should never initiate or receive internet connections.

---

## Route Tables

Every subnet is associated with exactly one route table. The route table controls
where traffic is directed.

```
Route Table: Private-Subnet-RT
═══════════════════════════════════════
Destination        Target
───────────────    ──────────────────
10.0.0.0/16        local              (VPC-internal traffic)
0.0.0.0/0          nat-gw-123abc      (internet via NAT)
10.100.0.0/16      tgw-456def         (on-prem via Transit GW)
pl-68a54001        vpce-s3-789ghi     (S3 via Gateway Endpoint)
```

Route evaluation: most specific route wins. A packet destined for `10.0.12.5` matches
`10.0.0.0/16` (local). A packet for `8.8.8.8` matches `0.0.0.0/0` (NAT gateway).
A packet for `10.100.5.10` matches `10.100.0.0/16` (Transit Gateway).

---

## NAT Gateway

### Why NAT?

Instances in private subnets need outbound internet access (downloading packages,
calling external APIs, pushing to SaaS services) without being reachable from the
internet. NAT (Network Address Translation) provides this by masquerading the
private IP behind a public Elastic IP.

### NAT Gateway HA Architecture

A single NAT Gateway operates in one AZ. If that AZ fails, all private subnets
using it lose internet access. For high availability, deploy one NAT Gateway per AZ:

```
              Internet
                │
        ┌───────┴───────┐
        │    IGW        │
        └───────┬───────┘
                │
    ┌───────────┼───────────┐
    │           │           │
    ▼           ▼           ▼
┌───────┐  ┌───────┐  ┌───────┐
│NAT GW │  │NAT GW │  │NAT GW │  (one per AZ)
│ AZ-a  │  │ AZ-b  │  │ AZ-c  │
└───┬───┘  └───┬───┘  └───┬───┘
    │          │          │
    ▼          ▼          ▼
┌───────┐  ┌───────┐  ┌───────┐
│Private│  │Private│  │Private│
│Sub AZa│  │Sub AZb│  │Sub AZc│
└───────┘  └───────┘  └───────┘

Each private subnet's route table points to its local AZ's NAT Gateway.
Traffic stays within the AZ (no cross-AZ data transfer charges).
```

```hcl
# Terraform: NAT Gateway per AZ
resource "aws_nat_gateway" "main" {
  count         = length(var.availability_zones)
  allocation_id = aws_eip.nat[count.index].id
  subnet_id     = aws_subnet.public[count.index].id

  tags = {
    Name = "nat-gw-${var.availability_zones[count.index]}"
  }
}

resource "aws_route" "private_nat" {
  count                  = length(var.availability_zones)
  route_table_id         = aws_route_table.private[count.index].id
  destination_cidr_block = "0.0.0.0/0"
  nat_gateway_id         = aws_nat_gateway.main[count.index].id
}
```

### NAT Gateway Cost

NAT Gateway charges per hour ($0.045/hr in us-east-1) plus per GB processed
($0.045/GB). For high-throughput workloads, this can be significant. Strategies
to reduce cost:

- Use VPC endpoints for AWS service traffic (S3, DynamoDB, etc.) -- free
- Use PrivateLink for third-party services
- Consider NAT instances (self-managed, cheaper but no HA) for dev/test

---

## VPC Endpoints

VPC endpoints allow private connectivity to AWS services without traversing the
internet or NAT gateway.

### Gateway Endpoints

Free. Available only for S3 and DynamoDB. A route table entry directs traffic to
the endpoint.

```bash
# Create S3 Gateway Endpoint
aws ec2 create-vpc-endpoint \
  --vpc-id vpc-123abc \
  --service-name com.amazonaws.us-east-1.s3 \
  --route-table-ids rtb-private-a rtb-private-b
```

### Interface Endpoints (PrivateLink)

Creates an ENI (Elastic Network Interface) in your subnet with a private IP. Works
with 100+ AWS services (SQS, SNS, KMS, CloudWatch, ECR, etc.). Charges apply
per endpoint per AZ per hour plus per GB.

```bash
# Create SQS Interface Endpoint
aws ec2 create-vpc-endpoint \
  --vpc-id vpc-123abc \
  --vpc-endpoint-type Interface \
  --service-name com.amazonaws.us-east-1.sqs \
  --subnet-ids subnet-private-a subnet-private-b \
  --security-group-ids sg-endpoint
```

---

## Transit Gateway

### The Hub-and-Spoke Problem

As organizations grow, they accumulate many VPCs (production, staging, dev, shared
services, security). Connecting them with VPC Peering creates an O(n^2) mesh:

```
Without Transit Gateway (mesh):     With Transit Gateway (hub-and-spoke):

VPC-A ──── VPC-B                     VPC-A ──┐
  │  ╲    ╱  │                               │
  │   ╲  ╱   │                     VPC-B ────┤
  │    ╳╳    │                               │
  │   ╱  ╲   │                     VPC-C ────┼──── Transit Gateway
  │  ╱    ╲  │                               │
VPC-C ──── VPC-D                   VPC-D ────┤
                                             │
6 peering connections               On-Prem──┘
for 4 VPCs. 10 VPCs = 45.
                                   5 attachments for 5 networks.
                                   Each new network = 1 attachment.
```

### Transit Gateway Architecture

Transit Gateway is a regional network hub that connects VPCs, VPN, and Direct
Connect through a single gateway. It supports route tables, enabling network
segmentation (e.g., dev VPCs cannot route to production VPCs).

```hcl
# Terraform: Transit Gateway with route segmentation
resource "aws_ec2_transit_gateway" "main" {
  description                     = "Central hub"
  default_route_table_association = "disable"
  default_route_table_propagation = "disable"
  auto_accept_shared_attachments  = "enable"
}

resource "aws_ec2_transit_gateway_route_table" "production" {
  transit_gateway_id = aws_ec2_transit_gateway.main.id
  tags = { Name = "production-rt" }
}

resource "aws_ec2_transit_gateway_route_table" "development" {
  transit_gateway_id = aws_ec2_transit_gateway.main.id
  tags = { Name = "development-rt" }
}
```

---

## Direct Connect

### What Is Direct Connect?

A dedicated physical connection from your data center to AWS, bypassing the public
internet. Provides consistent latency, higher bandwidth (1 Gbps, 10 Gbps, 100 Gbps),
and lower data transfer costs than VPN.

```
On-Premises DC            Direct Connect         AWS Region
┌──────────┐              Location               ┌──────────┐
│ Customer │              ┌──────────┐            │          │
│ Router   │──Dark Fiber──│ AWS      │──AWS Net──│  VPC     │
│          │              │ Router   │            │          │
└──────────┘              └──────────┘            └──────────┘
                          (Equinix, Coresite, etc.)
```

Direct Connect uses Virtual Interfaces (VIFs):
- **Private VIF**: Access VPC resources via private IPs
- **Public VIF**: Access AWS public services (S3, DynamoDB)
- **Transit VIF**: Access Transit Gateway (connect to multiple VPCs)

### Direct Connect + VPN (Encrypted)

Direct Connect alone does not encrypt traffic. For encryption over Direct Connect,
layer a site-to-site VPN on top:

```
On-Prem ──► Direct Connect (high bandwidth) ──► VPN (encryption) ──► VPC
```

---

## VPN (Virtual Private Network)

### Site-to-Site VPN

Connects your on-premises network to a VPC over an encrypted IPsec tunnel across
the public internet. AWS creates two tunnels per connection for redundancy.

```bash
# Create a Virtual Private Gateway (VPC side)
aws ec2 create-vpn-gateway --type ipsec.1

# Create a Customer Gateway (your on-prem side)
aws ec2 create-customer-gateway \
  --type ipsec.1 \
  --public-ip 203.0.113.12 \
  --bgp-asn 65000

# Create the VPN connection
aws ec2 create-vpn-connection \
  --type ipsec.1 \
  --vpn-gateway-id vgw-123abc \
  --customer-gateway-id cgw-456def
```

### Client VPN

Managed OpenVPN service for individual users to connect to VPC resources from
their laptops. Supports Active Directory authentication, certificate-based auth,
and SAML-based SSO.

---

## Enterprise VPC Design

Here is a complete enterprise VPC architecture incorporating all concepts:

```
                            INTERNET
                               │
                         ┌─────┴─────┐
                         │    IGW    │
                         └─────┬─────┘
                               │
┌──────────────────────────────┼─────────────────────────────────┐
│  VPC: 10.0.0.0/16           │                                  │
│                              │                                  │
│  PUBLIC TIER                 │                                  │
│  ┌─────────────────┐   ┌────┴────────────┐                     │
│  │ 10.0.1.0/24     │   │ 10.0.2.0/24     │                     │
│  │ AZ-a            │   │ AZ-b            │                     │
│  │ ┌─────┐ ┌─────┐ │   │ ┌─────┐ ┌─────┐ │                    │
│  │ │ ALB │ │NAT  │ │   │ │ ALB │ │NAT  │ │                    │
│  │ │ node│ │ GW  │ │   │ │ node│ │ GW  │ │                    │
│  │ └──┬──┘ └──┬──┘ │   │ └──┬──┘ └──┬──┘ │                    │
│  └────┼───────┼────┘   └────┼───────┼────┘                     │
│       │       │             │       │                          │
│  APP TIER     │             │       │                          │
│  ┌────┼───────┼────┐   ┌────┼───────┼────┐                     │
│  │ 10.0.11.0/24   │   │ 10.0.12.0/24   │                      │
│  │ ┌──────────┐   │   │ ┌──────────┐   │                      │
│  │ │ECS Tasks │   │   │ │ECS Tasks │   │                      │
│  │ │(Fargate) │   │   │ │(Fargate) │   │                      │
│  │ └────┬─────┘   │   │ └────┬─────┘   │                      │
│  └──────┼─────────┘   └──────┼─────────┘                       │
│         │                    │                                 │
│  DATA TIER (isolated)        │                                 │
│  ┌──────┼─────────┐   ┌─────┼──────────┐                      │
│  │ 10.0.21.0/24   │   │ 10.0.22.0/24   │                      │
│  │ ┌────┴───┐     │   │ ┌────┴───┐     │                      │
│  │ │RDS     │     │   │ │RDS     │     │                      │
│  │ │Primary │     │   │ │Standby │     │                      │
│  │ └────────┘     │   │ └────────┘     │                      │
│  │ ┌────────┐     │   │ ┌────────┐     │                      │
│  │ │ElastiC │     │   │ │ElastiC │     │                      │
│  │ │Redis   │     │   │ │Replica │     │                      │
│  │ └────────┘     │   │ └────────┘     │                      │
│  └────────────────┘   └────────────────┘                       │
│                                                                │
│  VPC ENDPOINTS                                                 │
│  ┌──────────────────────────────────────┐                      │
│  │ S3 (Gateway)  │ ECR (Interface)      │                      │
│  │ DynamoDB (GW) │ CloudWatch (Interf.) │                      │
│  │ SQS (Interf.) │ Secrets Mgr (Interf.)│                      │
│  └──────────────────────────────────────┘                      │
│                                                                │
│  ┌──────────────────────────────┐                              │
│  │  Transit Gateway Attachment  │──► TGW ──► Other VPCs / VPN  │
│  └──────────────────────────────┘                              │
└────────────────────────────────────────────────────────────────┘
```

---

## Elastic Network Interfaces (ENI) and ENA

### ENI

A virtual network card attached to an instance. Each instance has a primary ENI
(eth0) and can have additional ENIs. ENIs have:
- Primary private IP address
- One or more secondary private IPs
- One Elastic IP per private IP (optional)
- One or more security groups
- A MAC address
- Source/destination check flag

### Elastic Network Adapter (ENA)

ENA is AWS's custom network driver for Nitro instances, providing up to 100 Gbps
bandwidth with enhanced networking features (higher packets per second, lower
latency, lower jitter). ENA is required for all current-generation instances.

---

## Global Accelerator

AWS Global Accelerator provides static anycast IP addresses that route traffic
through the AWS global network to the optimal regional endpoint. Unlike CloudFront
(which caches content), Global Accelerator is for non-HTTP workloads and dynamic
traffic that benefits from network path optimization.

```
User (Tokyo) ──► Anycast IP ──► AWS Edge ──► AWS Backbone ──► ALB (us-east-1)
                                (Tokyo)       (fast, reliable)
vs.
User (Tokyo) ──► Public Internet (variable hops) ──► ALB (us-east-1)
```

---

## Practical Takeaways

1. **Plan CIDR blocks before deploying.** Changing VPC CIDR later is possible but
   painful. Allocate generously and use a central IPAM.

2. **Use the three-tier subnet pattern** (public, private, isolated) as your default.
   It provides defense in depth.

3. **Deploy NAT Gateways per-AZ** in production. The cross-AZ data transfer cost
   and single point of failure are not worth the savings.

4. **Use VPC endpoints for all AWS service traffic.** It is more secure (traffic
   stays on AWS network), faster, and cheaper than NAT gateway data processing.

5. **Never put databases in public subnets.** There is no legitimate reason for a
   database to have a public IP.

6. **Use Transit Gateway** once you have more than 3-4 VPCs. The management overhead
   of full-mesh peering becomes untenable.

7. **Enable VPC Flow Logs** on all VPCs. They are invaluable for debugging connectivity
   issues and security analysis.

```bash
aws ec2 create-flow-logs \
  --resource-type VPC \
  --resource-ids vpc-123abc \
  --traffic-type ALL \
  --log-destination-type cloud-watch-logs \
  --log-group-name /vpc/flow-logs
```

8. **Use security groups as the primary firewall.** They are stateful, instance-level,
   and allow referencing other security groups (e.g., "allow traffic from the ALB
   security group"). NACLs are stateless and harder to manage; use them only for
   broad deny rules.

---

## DSA Connections

### Graph Traversal (Dijkstra's Algorithm) — Route Table Evaluation and Network Path Selection

Dijkstra's algorithm finds the shortest path between nodes in a weighted graph in O((V + E) log V) time using a priority queue. VPC route tables implement a simplified form of graph-based routing: when a packet leaves an instance, the route table is consulted to determine the next hop. The "most specific route wins" rule (longest prefix match) is the routing equivalent of choosing the shortest weighted path -- a packet destined for `10.100.5.10` matches `10.100.0.0/16` (Transit Gateway) over `0.0.0.0/0` (NAT Gateway) because the more specific prefix represents a more direct path. At the AWS backbone level, the Global Accelerator and Direct Connect services use actual shortest-path algorithms to route traffic across the physical network. When a packet traverses from a private subnet through a NAT Gateway to the internet, or across a Transit Gateway to another VPC, each hop is a node in the network graph, and the route table chain from source to destination is effectively the shortest-path result precomputed and cached as static routes.

### Spanning Trees — Transit Gateway Hub-and-Spoke Topology

A spanning tree is a subgraph of a connected graph that includes all vertices with the minimum number of edges and no cycles. The Transit Gateway hub-and-spoke architecture directly solves the problem that VPC Peering's full mesh creates: with N VPCs, peering requires O(N^2) connections (N*(N-1)/2 edges), while Transit Gateway reduces this to O(N) connections (one attachment per VPC). This mirrors the transformation from a complete graph to a star-topology spanning tree where the Transit Gateway is the root node. In physical networking, the Spanning Tree Protocol (STP) prevents broadcast loops by pruning a network graph into a tree; Transit Gateway achieves the analogous result in the virtual networking layer by centralizing routing decisions at a single hub. Each new VPC requires only one attachment to the Transit Gateway rather than N-1 peering connections, exactly as adding a node to a spanning tree requires only one edge to connect it to the existing tree.

### Trie (Prefix Tree) — CIDR Matching and Longest Prefix Match Routing

A trie is a tree data structure where each node represents a character (or bit) of a key, enabling O(k) lookup where k is the key length. IP routing fundamentally relies on a binary trie (also called a radix tree or Patricia trie) for longest prefix match: each bit of a destination IP address is a branch in the trie, and the deepest matching node determines the route. When a VPC route table contains entries like `10.0.0.0/16 -> local`, `10.100.0.0/16 -> tgw`, and `0.0.0.0/0 -> nat-gw`, the routing engine builds a binary trie of these prefixes. A packet to `10.0.12.5` traverses the trie bit by bit, matching `10.0.0.0/16` (the local route) at depth 16. A packet to `8.8.8.8` falls through to `0.0.0.0/0` (the default route) because no more specific prefix matches. This trie-based approach is how routers achieve wire-speed forwarding even with large routing tables -- the lookup is bounded by the address length (32 bits for IPv4), not by the number of routes.

### Hash Tables — VPC Mapping Service for Virtual-to-Physical Address Resolution

A hash table provides O(1) average-case lookups by computing a hash of the key to index into an array of buckets. The AWS VPC Mapping Service, which resolves virtual private IP addresses to physical host addresses, operates as a massive distributed hash table. When instance A sends a packet to instance B's private IP (say `10.0.11.47`), the Mapping Service hashes this virtual IP to locate the physical host and encapsulation metadata for B. This lookup must complete in microseconds for every packet, making a hash-table-based design essential. The system must also handle dynamic updates (instances launching, stopping, migrating) without disrupting in-flight lookups, which is why it uses consistent hashing with replication across multiple mapping nodes rather than a single central table -- similar to how distributed key-value stores like DynamoDB distribute their partition maps.
