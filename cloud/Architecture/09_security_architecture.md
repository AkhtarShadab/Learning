# Cloud Security Architecture

## Introduction

Security in the cloud is fundamentally different from on-premises security. In a
traditional data center, security is perimeter-based: firewalls guard the network
edge, and once inside, trust is relatively high. In the cloud, the perimeter
dissolves. Resources are API-driven, identities are the new perimeter, and every
component must be independently secured.

Cloud security is also a shared responsibility. The provider secures the
infrastructure (physical data centers, hypervisor, global network), and you secure
everything you put on it (data, configurations, identities, applications). The
boundary between "their job" and "your job" shifts depending on the service: more
responsibility with EC2, less with Lambda, even less with a managed SaaS service.

This document covers cloud security architecture comprehensively: identity and
access management, encryption, network security, threat detection, compliance,
and the zero-trust principles that tie them together.

---

## The Shared Responsibility Model

```
┌──────────────────────────────────────────────────────────────┐
│                    YOUR RESPONSIBILITY                       │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  Customer Data                                         │  │
│  ├────────────────────────────────────────────────────────┤  │
│  │  Platform, Applications, IAM                           │  │
│  ├────────────────────────────────────────────────────────┤  │
│  │  Operating System, Network, Firewall Configuration     │  │
│  ├────────────────────────────────────────────────────────┤  │
│  │  Client-Side Encryption    Server-Side Encryption      │  │
│  │  Network Traffic Protection  Data Integrity Auth       │  │
│  └────────────────────────────────────────────────────────┘  │
├──────────────────────────────────────────────────────────────┤
│                    AWS RESPONSIBILITY                        │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  Compute    Storage    Database    Networking           │  │
│  ├────────────────────────────────────────────────────────┤  │
│  │  Hardware / AWS Global Infrastructure                  │  │
│  ├────────────────────────────────────────────────────────┤  │
│  │  Regions    Availability Zones    Edge Locations        │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

How responsibility shifts by service type:

| Layer               | IaaS (EC2)      | PaaS (RDS)         | Serverless (Lambda) |
|---------------------|-----------------|--------------------|--------------------|
| Application code    | You             | You                | You                |
| Data encryption     | You             | You (config)       | You (config)       |
| OS patching         | You             | AWS                | AWS                |
| Network config      | You             | You (SGs, subnets) | You (VPC config)   |
| Infrastructure      | AWS             | AWS                | AWS                |
| Physical security   | AWS             | AWS                | AWS                |

---

## IAM Deep Dive

### Principals

IAM has four types of principals (entities that can make requests):

```
┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐
│   User   │  │  Group   │  │   Role   │  │ Federated    │
│          │  │          │  │          │  │ Identity     │
│ (human   │  │(collection│ │(assumable│  │(external IdP:│
│  or svc) │  │ of users) │ │ identity)│  │ SAML, OIDC)  │
└──────────┘  └──────────┘  └──────────┘  └──────────────┘
```

**Best practice**: Do not create IAM users for human access. Use IAM Identity Center
(SSO) with federation to your corporate identity provider. IAM users should only
exist for programmatic service accounts, and even those should prefer IAM roles
(via instance profiles, ECS task roles, or IRSA in EKS).

### IAM Policies

Policies are JSON documents that define permissions. They follow a consistent
structure:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowS3ReadAccess",
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::my-bucket",
        "arn:aws:s3:::my-bucket/*"
      ],
      "Condition": {
        "StringEquals": {
          "s3:prefix": ["reports/", "data/"]
        },
        "IpAddress": {
          "aws:SourceIp": "203.0.113.0/24"
        }
      }
    }
  ]
}
```

### Policy Types (in evaluation order)

```
┌─────────────────────────────────────────────────────────┐
│  1. SERVICE CONTROL POLICIES (SCPs)                     │
│     Organization-level guardrails                       │
│     "No one in this account can delete CloudTrail logs" │
├─────────────────────────────────────────────────────────┤
│  2. RESOURCE-BASED POLICIES                             │
│     Attached to resources (S3 bucket, SQS queue, etc.)  │
│     "This bucket allows access from account 987654"     │
├─────────────────────────────────────────────────────────┤
│  3. PERMISSION BOUNDARIES                               │
│     Maximum permissions an IAM entity can have          │
│     "This role can never exceed S3 + DynamoDB access"   │
├─────────────────────────────────────────────────────────┤
│  4. IDENTITY-BASED POLICIES                             │
│     Attached to users, groups, or roles                 │
│     "This role can read from S3 bucket X"               │
├─────────────────────────────────────────────────────────┤
│  5. SESSION POLICIES                                    │
│     Passed during AssumeRole or federation              │
│     Further limits permissions for this session         │
└─────────────────────────────────────────────────────────┘
```

### IAM Policy Evaluation Flowchart

```
                    Request arrives
                         │
                         ▼
                  ┌──────────────┐
             ┌────│ Explicit DENY│────┐
             │YES │ in any policy│    │NO
             │    └──────────────┘    │
             ▼                        ▼
        ┌─────────┐           ┌──────────────┐
        │ DENIED  │      ┌────│     SCP      │────┐
        └─────────┘      │YES │ allows it?   │    │NO
                         │    └──────────────┘    │
                         ▼                        ▼
                  ┌──────────────┐          ┌─────────┐
             ┌────│ Resource-    │────┐     │ DENIED  │
             │YES │ based policy │    │NO   └─────────┘
             │    │ allows it?   │    │
             │    └──────────────┘    │
             ▼                        ▼
        (If same account:       ┌──────────────┐
         may be allowed)   ┌────│ Permission   │────┐
                           │YES │ boundary     │    │NO
                           │    │ allows it?   │    │
                           │    └──────────────┘    │
                           ▼                        ▼
                    ┌──────────────┐          ┌─────────┐
               ┌────│ Identity-   │────┐     │ DENIED  │
               │YES │ based policy│    │NO   └─────────┘
               │    │ allows it?  │    │
               │    └──────────────┘    │
               ▼                        ▼
          ┌─────────┐            ┌─────────┐
          │ ALLOWED │            │ DENIED  │
          └─────────┘            └─────────┘

Key rule: Default DENY. Explicit DENY always wins.
         An Allow is only effective if no Deny overrides it.
```

### Permission Boundaries

Permission boundaries set the maximum permissions an IAM entity can have. They do
not grant permissions themselves -- they constrain what identity-based policies can
grant.

```
Permission Boundary:              Identity Policy:
{                                 {
  "Effect": "Allow",                "Effect": "Allow",
  "Action": [                       "Action": [
    "s3:*",                           "s3:*",
    "dynamodb:*",                     "ec2:*",      ← NOT in boundary
    "logs:*"                          "dynamodb:*"
  ],                                ],
  "Resource": "*"                   "Resource": "*"
}                                 }

Effective permissions = INTERSECTION:
  s3:* + dynamodb:* (ec2:* is excluded by the boundary)
```

Use case: Allowing developers to create their own IAM roles (for Lambda, ECS) while
ensuring those roles never exceed a predefined set of permissions.

---

## AWS Organizations and SCPs

### Organization Structure

```
Root (Management Account)
├── OU: Production
│   ├── Account: prod-us (123456789012)
│   └── Account: prod-eu (234567890123)
├── OU: Development
│   ├── Account: dev (345678901234)
│   └── Account: staging (456789012345)
├── OU: Security
│   └── Account: security-tooling (567890123456)
└── OU: Sandbox
    └── Account: experiments (678901234567)
```

### SCP Examples

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyRootAccountUsage",
      "Effect": "Deny",
      "Action": "*",
      "Resource": "*",
      "Condition": {
        "StringLike": {
          "aws:PrincipalArn": "arn:aws:iam::*:root"
        }
      }
    },
    {
      "Sid": "DenyLeavingOrganization",
      "Effect": "Deny",
      "Action": "organizations:LeaveOrganization",
      "Resource": "*"
    },
    {
      "Sid": "RequireIMDSv2",
      "Effect": "Deny",
      "Action": "ec2:RunInstances",
      "Resource": "arn:aws:ec2:*:*:instance/*",
      "Condition": {
        "StringNotEquals": {
          "ec2:MetadataHttpTokens": "required"
        }
      }
    }
  ]
}
```

---

## Encryption

### Encryption at Rest

**AWS KMS (Key Management Service)** is the centralized key management system.

```
Envelope Encryption:
┌────────────────────────────────────────────┐
│ KMS                                        │
│ ┌──────────────┐                           │
│ │ Customer     │──► Encrypts Data Key      │
│ │ Master Key   │    (never leaves KMS)     │
│ │ (CMK)        │                           │
│ └──────────────┘                           │
└────────────────────┬───────────────────────┘
                     │
                     ▼
           ┌──────────────────┐
           │ Encrypted Data   │
           │ Key (stored with │
           │ the data)        │
           └────────┬─────────┘
                    │ Data Key (plaintext)
                    │ used to encrypt data,
                    │ then discarded from
                    │ memory
                    ▼
           ┌──────────────────┐
           │ Encrypted Data   │
           │ (S3, EBS, RDS)   │
           └──────────────────┘
```

**Why envelope encryption?** KMS has a 4 KB limit on direct encryption. For larger
data, KMS generates a data key, you use the data key to encrypt locally, then store
the encrypted data key alongside the encrypted data. To decrypt, you send the
encrypted data key to KMS, get back the plaintext data key, and decrypt locally.

```bash
# Create a KMS key
aws kms create-key \
  --description "Production database encryption" \
  --key-usage ENCRYPT_DECRYPT \
  --key-spec SYMMETRIC_DEFAULT \
  --tags '[{"TagKey":"Environment","TagValue":"production"}]'

# Create an alias for easy reference
aws kms create-alias \
  --alias-name alias/prod-database \
  --target-key-id 1234abcd-12ab-34cd-56ef-1234567890ab
```

### Encryption in Transit

All AWS API calls use TLS. For your own services:

- **ACM (AWS Certificate Manager)**: Free public TLS certificates, auto-renewed,
  integrated with ALB, CloudFront, API Gateway
- **Private CA**: Issue private certificates for internal services
- **TLS termination at ALB**: Offloads TLS processing from application servers

```bash
# Request a public certificate
aws acm request-certificate \
  --domain-name "*.example.com" \
  --validation-method DNS \
  --subject-alternative-names "example.com"
```

---

## Secrets Management

### Secrets Manager vs Parameter Store

| Feature                    | Secrets Manager              | Parameter Store (SecureString) |
|---------------------------|------------------------------|-------------------------------|
| Automatic rotation        | Built-in (Lambda-based)      | Manual (you implement)        |
| Cross-account access      | Resource-based policy        | Via IAM role assumption       |
| Cost                      | $0.40/secret/month + API     | Free (standard) or $0.05/adv |
| Versioning                | Built-in                     | Built-in                      |
| Max size                  | 64 KB                        | 8 KB (standard) / 8 KB (adv) |
| Random password generation| Built-in                     | No                            |

**Use Secrets Manager** for: database credentials, API keys, OAuth tokens -- anything
that benefits from automatic rotation.

**Use Parameter Store** for: configuration values, feature flags, non-sensitive
parameters, and secrets where you do not need rotation.

```bash
# Store a secret in Secrets Manager
aws secretsmanager create-secret \
  --name "prod/myapp/database" \
  --secret-string '{"username":"admin","password":"s3cur3P@ss!","host":"mydb.cluster-xxx.us-east-1.rds.amazonaws.com"}'

# Enable automatic rotation
aws secretsmanager rotate-secret \
  --secret-id "prod/myapp/database" \
  --rotation-lambda-arn "arn:aws:lambda:us-east-1:123456789012:function:rotate-db-secret" \
  --rotation-rules '{"AutomaticallyAfterDays": 30}'
```

---

## Network Security

### Security Groups vs NACLs

```
                    Security Groups              NACLs
                    ─────────────────           ──────────────────
Level:              Instance/ENI level           Subnet level
Stateful:           YES (return traffic          NO (must explicitly
                    auto-allowed)                allow return traffic)
Rules:              Allow only                   Allow AND Deny
Evaluation:         All rules evaluated          Rules evaluated in
                    together                     number order (first match)
Default:            Deny all inbound,            Allow all inbound and
                    Allow all outbound           outbound
Best for:           Primary firewall             Broad deny rules
                                                 (block IP ranges)
```

### Security Group Best Practices

```bash
# Reference other security groups instead of IP ranges
# "Allow traffic from the ALB security group"
aws ec2 authorize-security-group-ingress \
  --group-id sg-app-servers \
  --protocol tcp \
  --port 8080 \
  --source-group sg-alb

# This is more maintainable than hard-coding ALB IP addresses
# and automatically adapts as ALB IPs change
```

### VPC Flow Logs

Flow Logs capture metadata about network traffic (source, dest, port, protocol,
action, bytes). They do not capture packet contents.

```
Format: version account-id interface-id srcaddr dstaddr srcport dstport protocol packets bytes start end action log-status

Example:
2 123456789012 eni-abc123 10.0.1.5 10.0.2.10 49152 3306 6 20 4000 1620000000 1620000060 ACCEPT OK
2 123456789012 eni-abc123 203.0.113.1 10.0.1.5 12345 22 6 5 300 1620000000 1620000060 REJECT OK
                                                                                        ^^^^^^
                                                                      SSH attempt from external IP - REJECTED
```

---

## Threat Detection and Monitoring

### Amazon GuardDuty

GuardDuty analyzes VPC Flow Logs, CloudTrail events, and DNS logs to detect threats:

- Reconnaissance: Port scanning, unusual API calls
- Instance compromise: Bitcoin mining, C&C communication
- Account compromise: API calls from unusual locations, disabled logging
- S3 compromise: Anonymous access, exfiltration patterns

```bash
# Enable GuardDuty
aws guardduty create-detector --enable --finding-publishing-frequency FIFTEEN_MINUTES
```

### AWS CloudTrail

CloudTrail records every API call made in your account: who called what, from where,
when, and with what parameters.

```bash
# Create a trail that logs all regions
aws cloudtrail create-trail \
  --name organization-trail \
  --s3-bucket-name cloudtrail-logs-123456789012 \
  --is-multi-region-trail \
  --enable-log-file-validation \
  --include-global-service-events \
  --is-organization-trail

aws cloudtrail start-logging --name organization-trail
```

### AWS Config

Config continuously monitors and records resource configurations and evaluates them
against compliance rules.

```bash
# Example Config Rule: ensure all S3 buckets have encryption
aws configservice put-config-rule --config-rule '{
  "ConfigRuleName": "s3-bucket-server-side-encryption-enabled",
  "Source": {
    "Owner": "AWS",
    "SourceIdentifier": "S3_BUCKET_SERVER_SIDE_ENCRYPTION_ENABLED"
  },
  "Scope": {
    "ComplianceResourceTypes": ["AWS::S3::Bucket"]
  }
}'
```

### AWS Security Hub

Security Hub aggregates findings from GuardDuty, Inspector, Config, Macie, and
third-party tools into a single dashboard. It scores your security posture against
frameworks like CIS Benchmarks and AWS Foundational Security Best Practices.

---

## DDoS Protection

### AWS Shield

- **Shield Standard**: Free, automatic, protects against common L3/L4 DDoS attacks
- **Shield Advanced**: $3,000/month, protects against sophisticated L3/L4/L7 attacks,
  includes DDoS Response Team (DRT), cost protection (credit for scaling charges
  during an attack)

### AWS WAF (Web Application Firewall)

WAF operates at Layer 7 (HTTP) and provides:
- SQL injection protection
- Cross-site scripting (XSS) protection
- Rate limiting per IP
- Geographic blocking
- IP reputation-based blocking (managed rule groups)
- Bot control

---

## Zero Trust in Cloud

Traditional security trusts everything inside the network perimeter. Zero trust
trusts nothing and verifies everything:

```
Zero Trust Principles in AWS:
═══════════════════════════════════════════════════════

1. VERIFY EXPLICITLY
   - Use IAM roles, not long-lived credentials
   - MFA for all human access
   - Validate JWTs at every API boundary

2. LEAST PRIVILEGE ACCESS
   - Scope IAM policies to specific resources
   - Use permission boundaries
   - Review and remove unused permissions (IAM Access Analyzer)

3. ASSUME BREACH
   - Encrypt everything at rest and in transit
   - Enable CloudTrail, GuardDuty, VPC Flow Logs
   - Segment networks (private subnets, security groups)
   - Use VPC endpoints to avoid internet exposure
```

---

## Compliance Frameworks

| Framework    | Focus                          | Key AWS Services                     |
|-------------|-------------------------------|--------------------------------------|
| SOC 2       | Security, availability, privacy| CloudTrail, Config, Security Hub     |
| HIPAA       | Healthcare data protection    | BAA required, encryption, access logs|
| PCI DSS     | Payment card data             | WAF, encryption, network segmentation|
| GDPR        | EU personal data protection   | Region restriction, data lifecycle    |
| FedRAMP     | US government cloud           | GovCloud region                      |
| ISO 27001   | Information security mgmt     | Config rules, Security Hub           |

---

## Practical Takeaways

1. **Never use IAM user access keys for applications.** Use IAM roles everywhere:
   EC2 instance profiles, ECS task roles, Lambda execution roles, IRSA for EKS.

2. **Enable CloudTrail in all regions** with log file validation. It is the audit
   trail that makes forensics possible after a breach.

3. **Enable GuardDuty** in all accounts and regions. It costs pennies and catches
   threats that would otherwise go unnoticed.

4. **Encrypt everything by default.** Enable EBS encryption, S3 default encryption,
   and RDS encryption at creation. There is negligible performance impact.

5. **Use SCPs to enforce guardrails organization-wide.** Prevent root account usage,
   require encryption, restrict to approved regions.

6. **Rotate credentials automatically.** Use Secrets Manager with auto-rotation for
   database passwords and API keys.

7. **Apply the principle of least privilege.** Start with zero permissions and add
   only what is needed. Use IAM Access Analyzer to identify unused permissions and
   tighten policies.

8. **Use IMDSv2 (instance metadata service v2)** exclusively. Enforce it via SCP.
   IMDSv1 is vulnerable to SSRF attacks that can steal instance credentials.

9. **Block public access to S3** at the account level. Override only for
   intentionally public buckets (static websites, public datasets).

10. **Segment your network.** Databases in isolated subnets. Application servers in
    private subnets. Only load balancers and NAT gateways in public subnets.

---

## DSA Connections

### Merkle Trees — CloudTrail Log File Integrity Validation

A Merkle tree is a binary tree where each leaf node contains a hash of a data block and each non-leaf node contains a hash of its children, enabling efficient and tamper-evident verification of large datasets. CloudTrail's log file validation feature uses Merkle tree-like hash chains to prove that log files have not been modified or deleted after delivery. When CloudTrail delivers a log file to S3, it computes a SHA-256 hash of the file and includes it in a digest file. Each digest file also contains the hash of the previous digest file, forming a hash chain. To verify integrity, you walk the chain backward: if any log file has been tampered with, its hash will not match the digest, and if the digest has been tampered with, its hash will not match the next digest in the chain. This is the same principle behind blockchain integrity and Git commit hashes -- a single bit change in any historical log file propagates upward through the hash chain, making tampering detectable in O(log n) time rather than requiring a full re-read of every log file.

### Hash Chains — KMS Envelope Encryption and Key Derivation

A hash chain is a sequence of values where each value is the hash of the previous one, providing a one-way progression that is computationally infeasible to reverse. AWS KMS envelope encryption implements a two-level key hierarchy conceptually similar to a hash chain: the Customer Master Key (CMK) encrypts a data key, and the data key encrypts the actual data. The CMK never leaves KMS hardware (similar to a root hash that anchors the chain), while the encrypted data key is stored alongside the ciphertext. To decrypt, you must traverse the chain backward: send the encrypted data key to KMS, which uses the CMK to recover the plaintext data key, then use the data key to decrypt the data. Key rotation extends this chain -- when you rotate a CMK, KMS generates new backing key material but retains the old material, creating a chain of key versions. Decryption automatically selects the correct version based on metadata in the ciphertext, exactly as walking a hash chain to the correct position recovers the right value.

### Bloom Filters — GuardDuty and WAF Threat Intelligence Matching

A Bloom filter is a space-efficient probabilistic data structure that tests whether an element is a member of a set, with possible false positives but no false negatives. It uses k hash functions to map elements to positions in a bit array, enabling O(k) membership queries regardless of set size. GuardDuty and AWS WAF use Bloom filter-like structures to efficiently match incoming traffic against massive threat intelligence databases containing millions of known malicious IP addresses, domain names, and request signatures. When a VPC Flow Log entry or an HTTP request arrives, GuardDuty hashes the source IP against its threat intelligence Bloom filter -- if all k bit positions are set, the IP is flagged as a potential threat (and verified against the full database to eliminate false positives). This two-stage approach enables GuardDuty to process millions of flow log entries per second without performing a full database lookup for each one. The same principle applies to WAF's IP reputation rule groups, which must decide in microseconds whether to block a request from a known-bad IP.

### DAG-Based Policy Evaluation — IAM Policy Evaluation as Graph Traversal

The IAM policy evaluation flowchart in the document is a directed acyclic graph (DAG) where each node represents a policy check (explicit deny, SCP, resource-based policy, permission boundary, identity-based policy) and edges represent the evaluation flow based on allow/deny outcomes. Evaluating whether a request is authorized is equivalent to traversing this DAG from the root (incoming request) to a terminal node (ALLOWED or DENIED). The evaluation engine performs a depth-first traversal: first checking for explicit denies across all policy types (short-circuit on any deny), then verifying that every applicable policy layer (SCP, boundary, identity) contains an allow. This is a specific instance of the general problem of evaluating boolean circuits, where the inputs are policy allow/deny signals and the circuit computes the final authorization decision. Understanding this as a graph traversal explains why explicit deny always wins (it is checked first, at the root of the traversal) and why the effective permissions are the intersection of all policy layers -- each layer is a gate in the DAG that must pass for the traversal to reach the ALLOWED terminal.
