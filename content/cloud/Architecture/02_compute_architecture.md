# Cloud Compute Architecture

## Introduction

Compute is the heartbeat of the cloud. Every workload -- a web server responding to
requests, a machine learning model training on terabytes of data, a batch job
crunching financial reports -- ultimately executes on a processor somewhere. Cloud
compute abstracts the physical server into a programmable, elastic resource that
you provision in seconds and release when done.

This document dives deep into cloud compute architecture, primarily through the lens
of AWS EC2, but the concepts (instance families, placement, lifecycle, hardware
acceleration) apply across providers. By the end, you will understand not just
*what* instance types exist, but *why* they exist and *how* to choose between them.

---

## The Nitro System: Foundation of Modern EC2

Before discussing instance types, it is essential to understand what runs them.
AWS's Nitro System is a collection of purpose-built hardware and software components
that offload virtualization functions from the host CPU to dedicated hardware.

### Nitro Components

![02_compute_architecture diagram 1](assets/02_compute_architecture-1.svg)

**Nitro Cards**: Handle VPC networking, EBS I/O, and instance storage as dedicated
hardware, freeing all host CPU cores for customer workloads.

**Nitro Security Chip**: Provides hardware root of trust. The host OS cannot access
instance memory or storage. Even AWS operators cannot access your running instance.

**Nitro Hypervisor**: A lightweight, KVM-based hypervisor that provides CPU and
memory isolation. On bare metal instances, the hypervisor is absent entirely.

Pre-Nitro instances (C4, M4, etc.) used Xen hypervisor and software-based
networking, consuming significant host CPU. Nitro instances deliver near-bare-metal
performance.

---

## Instance Families and Types

### The Naming Convention

![02_compute_architecture diagram 2](assets/02_compute_architecture-2.svg)

### Instance Family Reference

| Family | Purpose              | Key Characteristic                | Example Use Case                |
|--------|----------------------|-----------------------------------|---------------------------------|
| **T**  | Burstable            | CPU credits, baseline + burst     | Dev/test, small web apps        |
| **M**  | General purpose      | Balanced CPU:memory (1:4)         | App servers, mid-size databases |
| **C**  | Compute optimized    | High CPU:memory ratio (1:2)       | Batch processing, encoding      |
| **R**  | Memory optimized     | Low CPU:memory ratio (1:8)        | In-memory databases, caches     |
| **X**  | Memory intensive     | Very high memory (up to 4 TB)     | SAP HANA, large in-memory DBs   |
| **I**  | Storage optimized    | High IOPS NVMe instance store     | NoSQL databases, data warehouses|
| **D**  | Dense storage        | HDD-based, high sequential I/O    | HDFS, distributed file systems  |
| **P**  | GPU (training)       | NVIDIA A100/H100 GPUs             | ML training, HPC                |
| **G**  | GPU (graphics)       | NVIDIA T4/L4 GPUs                 | Graphics rendering, inference   |
| **Inf** | Inferentia          | AWS Inferentia chips              | ML inference at scale           |
| **Trn** | Trainium            | AWS Trainium chips                | ML training (cost-optimized)    |
| **HPC** | High Performance    | EFA networking, high bandwidth    | Tightly-coupled HPC             |

### Graviton Processors

AWS Graviton processors are ARM-based, custom-designed by AWS. They offer up to 40%
better price-performance than comparable x86 instances. Graviton 4 (available in M8g,
C8g, R8g families) delivers further improvements.

```bash
# Launch a Graviton instance (note the 'g' suffix)
aws ec2 run-instances \
  --instance-type m7g.xlarge \
  --image-id ami-0abcdef1234567890 \  # Must be ARM64 AMI
  --count 1
```

When to use Graviton:
- Any workload that runs on Linux (most do)
- Applications built in interpreted languages (Python, Node.js, Java) often
  work without recompilation
- Containerized workloads (just rebuild the image for ARM64)
- Not suitable when your software has x86 binary dependencies with no ARM port

---

## Burstable Instances (T Family) Deep Dive

### The CPU Credit Model

T instances (T3, T3a, T4g) have a baseline CPU performance level and earn CPU
credits when idle. Credits are spent when the instance bursts above baseline.

![02_compute_architecture diagram 3](assets/02_compute_architecture-3.svg)

**Key mechanics:**
- Each vCPU earns credits at a rate determined by the instance size
- A `t3.medium` (2 vCPUs) earns 24 credits/hour and has a 20% baseline
- One credit = one vCPU running at 100% for one minute
- Credits accumulate up to a maximum balance (e.g., 576 for t3.medium)
- New instances start with a launch credit balance for initial boot/setup

### Unlimited Mode

By default, T3/T4g instances run in `unlimited` mode. When credits are exhausted,
the instance continues to burst but you pay a per-vCPU-hour surcharge. This prevents
the performance cliff of `standard` mode (where the instance is throttled to
baseline when credits run out).

```bash
# Launch with standard credit mode (no overage charges, but throttling possible)
aws ec2 run-instances \
  --instance-type t3.medium \
  --credit-specification CpuCredits=standard
```

### When NOT to Use T Instances

If your workload consistently uses > 20-30% CPU, a T instance in unlimited mode
will cost more than a comparably-sized M instance. T instances are for workloads
with spiky, unpredictable CPU patterns -- not sustained compute.

---

## Instance Lifecycle

![02_compute_architecture diagram 4](assets/02_compute_architecture-4.svg)

**Important distinctions:**
- **Stopped**: Instance is not running; you are not charged for compute (only EBS
  storage). You can change the instance type while stopped, then restart.
- **Terminated**: Instance is permanently deleted. EBS root volumes are deleted by
  default (configurable with `DeleteOnTermination=false`).
- **Hibernate**: Instance memory (RAM) is saved to the root EBS volume. On restart,
  the instance resumes from where it left off -- no boot sequence, no application
  cold start. Useful for long-initialization applications.

```bash
# Stop an instance (preserves EBS, releases host)
aws ec2 stop-instances --instance-ids i-1234567890abcdef0

# Change instance type while stopped
aws ec2 modify-instance-attribute \
  --instance-id i-1234567890abcdef0 \
  --instance-type m6i.2xlarge

# Restart with new type
aws ec2 start-instances --instance-ids i-1234567890abcdef0
```

---

## Amazon Machine Images (AMIs)

An AMI is a template containing the OS, application software, and configuration
needed to launch an instance. AMIs include:

- One or more EBS snapshots (or instance-store-backed: S3 bundle)
- Launch permissions (who can use the AMI)
- Block device mapping (which volumes to attach)

### AMI Lifecycle

![02_compute_architecture diagram 5](assets/02_compute_architecture-5.svg)

```bash
# Create an AMI from a running instance
aws ec2 create-image \
  --instance-id i-1234567890abcdef0 \
  --name "myapp-v2.3.1-$(date +%Y%m%d)" \
  --no-reboot  # Avoids downtime; filesystem may be inconsistent

# Copy AMI to another region
aws ec2 copy-image \
  --source-region us-east-1 \
  --source-image-id ami-0abcdef1234567890 \
  --region eu-west-1 \
  --name "myapp-v2.3.1-eu"
```

### Golden AMI Pipeline

Production environments typically use a "Golden AMI" pipeline that builds hardened,
patched AMIs automatically using tools like EC2 Image Builder or HashiCorp Packer.

---

## Placement Groups

Placement groups control how instances are physically positioned on underlying hardware.

### Cluster Placement Group

All instances placed on the same rack (or nearby racks) within a single AZ.
Provides the lowest latency and highest throughput between instances.

![02_compute_architecture diagram 6](assets/02_compute_architecture-6.svg)

### Spread Placement Group

Each instance is placed on distinct hardware (different racks). Maximum 7 instances
per AZ per spread group. Minimizes correlated failure.

![02_compute_architecture diagram 7](assets/02_compute_architecture-7.svg)

### Partition Placement Group

Instances are divided into logical partitions, each on separate racks. Partitions
can contain multiple instances but share no hardware across partitions.

![02_compute_architecture diagram 8](assets/02_compute_architecture-8.svg)

---

## Dedicated Hosts vs Dedicated Instances

| Aspect           | Dedicated Instance                 | Dedicated Host                        |
|------------------|------------------------------------|---------------------------------------|
| Hardware sharing | No sharing with other accounts     | No sharing; you see the physical host |
| Visibility       | Cannot see host-level details      | Can see sockets, cores, host ID       |
| Licensing        | Cannot use BYOL                    | BYOL (Windows Server, SQL Server, etc.)|
| Placement        | AWS chooses host within your tenancy| You control which host                |
| Cost             | Per-instance + per-region fee      | Per-host (hourly or reserved)         |

Dedicated hosts are primarily used for **Bring Your Own License (BYOL)** scenarios
where software licensing is tied to physical cores or sockets.

---

## Instance Store vs EBS

### Instance Store (Ephemeral Storage)

Physically attached to the host machine. Extremely fast (NVMe, millions of IOPS on
i3en instances) but data is lost when the instance stops or terminates.

### EBS (Elastic Block Store)

Network-attached storage that persists independently of the instance. Slower than
instance store but durable.

![02_compute_architecture diagram 9](assets/02_compute_architecture-9.svg)

| Aspect        | Instance Store       | EBS                      |
|---------------|----------------------|--------------------------|
| Persistence   | Ephemeral            | Persistent               |
| Performance   | Very high IOPS       | Up to 256,000 IOPS (io2) |
| Cost          | Included with instance| Separate charge          |
| Snapshots     | Not supported        | Yes (to S3)              |
| Encryption    | Supported            | Supported (KMS)          |
| Use case      | Caches, scratch data | Boot volumes, databases  |

---

## GPU and Accelerated Instances

### GPU Instances for Machine Learning

| Instance | GPU               | GPU Memory | Use Case                     |
|----------|-------------------|------------|------------------------------|
| p5.48xl  | 8x NVIDIA H100    | 640 GB HBM | Large model training         |
| p4d.24xl | 8x NVIDIA A100    | 320 GB HBM | Distributed training         |
| g5.xlarge| 1x NVIDIA A10G    | 24 GB      | Inference, graphics          |
| g6.xlarge| 1x NVIDIA L4      | 24 GB      | Inference (cost-optimized)   |
| inf2.xl  | 1x AWS Inferentia2 | 32 GB     | High-throughput inference    |
| trn1.32xl| 16x AWS Trainium  | 512 GB     | Training (cost-optimized)    |

### Elastic Fabric Adapter (EFA)

For distributed ML training across multiple GPU instances, EFA provides OS-bypass
networking, achieving near-HPC-level inter-node communication. Combined with NCCL
(NVIDIA Collective Communications Library), it enables efficient multi-node GPU
training.

```bash
# Launch p4d instance with EFA
aws ec2 run-instances \
  --instance-type p4d.24xlarge \
  --network-interfaces "DeviceIndex=0,InterfaceType=efa,Groups=sg-xxx,SubnetId=subnet-xxx" \
  --placement "GroupName=my-cluster-pg"
```

---

## Launch Templates

Launch templates are versioned configurations that define everything needed to launch
an instance. They replace the older Launch Configurations and are required for modern
ASG features.

```bash
aws ec2 create-launch-template \
  --launch-template-name myapp-template \
  --version-description "v1 - initial" \
  --launch-template-data '{
    "ImageId": "ami-0abcdef1234567890",
    "InstanceType": "m6i.xlarge",
    "KeyName": "my-key",
    "SecurityGroupIds": ["sg-903004f8"],
    "BlockDeviceMappings": [
      {
        "DeviceName": "/dev/xvda",
        "Ebs": {
          "VolumeSize": 100,
          "VolumeType": "gp3",
          "Iops": 3000,
          "Throughput": 125,
          "Encrypted": true
        }
      }
    ],
    "UserData": "IyEvYmluL2Jhc2gKeXVtIHVwZGF0ZSAteQo=",
    "TagSpecifications": [
      {
        "ResourceType": "instance",
        "Tags": [{"Key": "Environment", "Value": "production"}]
      }
    ],
    "MetadataOptions": {
      "HttpTokens": "required",
      "HttpEndpoint": "enabled"
    }
  }'
```

---

## User Data and Instance Initialization

User data scripts run on first boot (or every boot with cloud-init configuration).
They configure the instance after launch.

```bash
#!/bin/bash
# User data script for a web server

# Update packages
yum update -y

# Install and start nginx
amazon-linux-extras install nginx1 -y
systemctl enable nginx
systemctl start nginx

# Pull application code
aws s3 cp s3://my-app-bucket/release/latest.tar.gz /opt/app/
cd /opt/app && tar xzf latest.tar.gz

# Signal CloudFormation that setup is complete
/opt/aws/bin/cfn-signal -e $? --stack ${AWS::StackName} \
  --resource AutoScalingGroup --region ${AWS::Region}
```

For more complex initialization, use **cfn-init** (AWS-specific) or **cloud-init**
(cross-cloud) to declaratively define packages, files, services, and commands.

---

## Instance Selection Decision Tree

![02_compute_architecture diagram 10](assets/02_compute_architecture-10.svg)

---

## Bare Metal Instances

Bare metal instances (e.g., `m5.metal`, `c6i.metal`) provide direct access to the
host hardware with no hypervisor. Use cases include:

- Workloads that need access to hardware feature sets (performance counters, Intel VT)
- Applications that require a non-virtualized environment for licensing or compliance
- Running your own hypervisor (nested virtualization)
- Performance benchmarking without hypervisor noise

Bare metal instances still use Nitro Cards for networking and storage, so you get
the same VPC and EBS experience as virtualized instances.

---

## Purchasing Options

| Option          | Discount     | Commitment        | Best For                          |
|-----------------|-------------|-------------------|-----------------------------------|
| On-Demand       | 0%          | None              | Unpredictable, short-term work    |
| Reserved (1yr)  | ~30-40%     | 1 year            | Steady-state, predictable         |
| Reserved (3yr)  | ~50-60%     | 3 years           | Long-term, stable workloads       |
| Savings Plans   | ~30-60%     | $/hr commitment   | Flexible across instance types    |
| Spot            | Up to 90%   | Can be interrupted | Fault-tolerant, flexible timing   |
| Dedicated Host  | Varies      | Per-host billing   | BYOL licensing                    |

### Spot Instance Strategies

Spot instances can be interrupted with 2 minutes notice. Design for interruption:

- Use multiple instance types and AZs in your Spot Fleet/ASG
- Persist state externally (S3, DynamoDB, EFS)
- Use Spot Instance interruption notices (via metadata or EventBridge)
- Combine with On-Demand as a baseline capacity

```bash
# Mixed instances ASG with Spot
aws autoscaling create-auto-scaling-group \
  --auto-scaling-group-name myapp-asg \
  --mixed-instances-policy '{
    "LaunchTemplate": {
      "LaunchTemplateSpecification": {
        "LaunchTemplateName": "myapp-template",
        "Version": "$Latest"
      },
      "Overrides": [
        {"InstanceType": "m5.xlarge"},
        {"InstanceType": "m5a.xlarge"},
        {"InstanceType": "m5d.xlarge"},
        {"InstanceType": "m4.xlarge"}
      ]
    },
    "InstancesDistribution": {
      "OnDemandBaseCapacity": 2,
      "OnDemandPercentageAboveBaseCapacity": 25,
      "SpotAllocationStrategy": "capacity-optimized"
    }
  }' \
  --min-size 4 --max-size 20 --desired-capacity 8
```

---

## Practical Takeaways

1. **Start with Graviton** unless you have a specific x86 dependency. The
   price-performance advantage is significant and growing.

2. **Right-size before reserving.** Use AWS Compute Optimizer or CloudWatch CPU/memory
   metrics to identify oversized instances before committing to Reserved Instances.

3. **Use T instances wisely.** Monitor CPU credit balance. If credits stay at zero,
   switch to M/C family.

4. **Layer purchasing options.** Use Reserved/Savings Plans for baseline, On-Demand for
   variable load, and Spot for fault-tolerant batch work.

5. **Encrypt everything.** IMDSv2 (instance metadata service v2) should be required
   (`HttpTokens=required`) to prevent SSRF attacks. EBS encryption should be on by
   default at the account level.

6. **Automate AMI creation.** Use EC2 Image Builder or Packer in a CI/CD pipeline.
   Never hand-craft production AMIs.

7. **Treat instances as cattle, not pets.** Use Auto Scaling Groups, launch templates,
   and immutable deployments. If an instance has problems, replace it; do not SSH in
   and fix it.

---

## DSA Connections

### Priority Queues (Binary Heaps) — Auto Scaling Group Instance Selection

A priority queue is a data structure that always surfaces the highest-priority element in O(log n) time, typically implemented as a binary heap. When an Auto Scaling Group needs to terminate instances during a scale-in event, it must select which instances to remove based on a policy (e.g., oldest launch configuration, closest to the next billing hour, or the AZ with the most instances). Internally, the ASG scheduler maintains a priority-ordered structure of instances keyed by the termination policy criteria. When scale-in is triggered, the scheduler extracts the highest-priority candidate in O(log n) time rather than scanning all instances linearly. This same pattern applies to Spot Fleet allocation, where the fleet manager must continuously select instance types and AZs that offer the lowest interruption probability and best price, maintaining a priority queue of capacity pools ranked by the `capacity-optimized` or `lowest-price` strategy.

### Bin Packing — EC2 Placement and Instance Scheduling

Bin packing is an NP-hard optimization problem where items of varying sizes must be packed into a finite number of bins with fixed capacity, minimizing wasted space. The AWS hypervisor layer solves a variant of bin packing when placing EC2 instances onto physical hosts. Each Nitro-based physical server has a fixed amount of CPU, memory, and network bandwidth, and incoming instance requests (the "items") must be packed onto hosts (the "bins") to maximize utilization while respecting isolation guarantees. The scheduler uses heuristics like first-fit-decreasing (sort instances by resource demand, then place each on the first host with sufficient capacity) to achieve near-optimal packing. This is why launching a very large instance type (like `p5.48xlarge`) may occasionally fail with an `InsufficientInstanceCapacity` error -- the bin packing solver cannot find a host with enough contiguous resources, even though aggregate capacity exists across fragmented hosts.

### Round-Robin Scheduling — CPU Credit Model for Burstable Instances

Round-robin is a scheduling algorithm that assigns equal time slices to each process in a circular queue, ensuring fair CPU sharing. The T-family burstable instance credit model is a direct application of CPU scheduling theory: each vCPU earns credits at a fixed rate (analogous to a token bucket), and the instance is allowed to burst above its baseline only while tokens remain. Under the hood, the Nitro hypervisor implements a variant of weighted fair queuing where burstable instances receive a guaranteed baseline share (e.g., 20% for t3.medium) and can borrow additional cycles up to their credit balance. When credits are exhausted in `standard` mode, the scheduler enforces the baseline by throttling the instance back to its guaranteed time slice -- exactly like a round-robin scheduler with a strict quantum. Understanding this as a scheduling problem explains why sustained workloads above baseline are better served by M/C families: they receive a full, unthrottled time quantum without the credit overhead.
