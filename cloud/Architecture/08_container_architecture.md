# Container Architecture

## Introduction

Containers have fundamentally changed how software is built, shipped, and run. Before
containers, deploying an application meant managing a complex web of dependencies,
library versions, and OS configurations across environments. The infamous "it works on
my machine" problem plagued every development team. Containers solve this by packaging
an application with its entire runtime environment into a single, portable, immutable
artifact.

But containers are not virtual machines. They are lighter, faster, and more ephemeral.
Understanding the Linux primitives that make containers possible -- namespaces, cgroups,
and union filesystems -- is essential for troubleshooting, security, and performance
optimization. This document covers container fundamentals through production
orchestration with ECS and EKS.

---

## Container Fundamentals

### What Makes a Container?

A container is a process (or group of processes) running on a host OS with three
forms of isolation:

```
┌──────────────────────────────────────────────┐
│                 HOST OS (Linux)               │
│                                              │
│  ┌─────────────────┐  ┌─────────────────┐    │
│  │  Container A     │  │  Container B     │   │
│  │  ┌────────────┐  │  │  ┌────────────┐  │   │
│  │  │ App Process│  │  │  │ App Process│  │   │
│  │  └────────────┘  │  │  └────────────┘  │   │
│  │                  │  │                  │   │
│  │  Namespace:      │  │  Namespace:      │   │
│  │  - Own PID tree  │  │  - Own PID tree  │   │
│  │  - Own network   │  │  - Own network   │   │
│  │  - Own mounts    │  │  - Own mounts    │   │
│  │                  │  │                  │   │
│  │  Cgroup:         │  │  Cgroup:         │   │
│  │  - 512MB RAM max │  │  - 1GB RAM max   │   │
│  │  - 0.5 CPU       │  │  - 1.0 CPU       │   │
│  │                  │  │                  │   │
│  │  Filesystem:     │  │  Filesystem:     │   │
│  │  - Union FS      │  │  - Union FS      │   │
│  │  (overlay2)      │  │  (overlay2)      │   │
│  └─────────────────┘  └─────────────────┘    │
│                                              │
│  ┌────────────────────────────────────────┐   │
│  │           Shared Linux Kernel          │   │
│  └────────────────────────────────────────┘   │
└──────────────────────────────────────────────┘
```

### Linux Namespaces

Namespaces provide isolation. Each namespace type isolates a different resource:

| Namespace | Isolates                           | Example                          |
|-----------|------------------------------------|----------------------------------|
| PID       | Process IDs                        | Container sees PID 1 as its init |
| NET       | Network stack                      | Own IP, ports, routing table     |
| MNT       | Mount points                       | Own filesystem view              |
| UTS       | Hostname                           | Container has its own hostname   |
| IPC       | Inter-process communication        | Shared memory, semaphores        |
| USER      | User and group IDs                 | UID 0 in container != UID 0 on host |
| CGROUP    | Cgroup root                        | Container sees only its own cgroups |

### Control Groups (cgroups)

Cgroups limit and account for resource usage:

```bash
# What cgroups enforce for a container:
CPU:     Maximum CPU usage (e.g., 0.5 cores)
Memory:  Maximum memory (e.g., 512 MB) — OOM killed if exceeded
I/O:     Block device I/O bandwidth limits
PIDs:    Maximum number of processes
```

### Union Filesystem (OverlayFS)

Container images are composed of layers. Each layer is read-only. When a container
runs, a thin read-write layer is added on top. Changes (file edits, new files) are
written to this top layer, leaving the image layers untouched.

```
Container Filesystem (overlay2):

┌────────────────────┐
│  Read-Write Layer  │  ← Container changes (ephemeral)
├────────────────────┤
│  Layer 3: app code │  ← COPY . /app
├────────────────────┤
│  Layer 2: deps     │  ← RUN pip install
├────────────────────┤
│  Layer 1: python   │  ← FROM python:3.12-slim
├────────────────────┤
│  Layer 0: base OS  │  ← Debian slim
└────────────────────┘

All containers from the same image share layers 0-3 (read-only).
Only the R/W layer is unique per container.
```

---

## Docker Architecture

### Components

```
┌─────────────┐     ┌─────────────────────────┐
│  Docker CLI │────►│     Docker Daemon        │
│  (client)   │     │     (dockerd)            │
└─────────────┘     │                          │
                    │  ┌────────────────────┐  │
                    │  │    containerd      │  │
                    │  │  (container mgmt)  │  │
                    │  └────────┬───────────┘  │
                    │           │              │
                    │  ┌────────┴───────────┐  │
                    │  │      runc          │  │
                    │  │  (OCI runtime)     │  │
                    │  └────────────────────┘  │
                    └─────────────────────────┘
```

- **Docker CLI**: User-facing commands (`docker build`, `docker run`)
- **Docker Daemon (dockerd)**: Background service that manages images, containers,
  networks, and volumes
- **containerd**: Industry-standard container runtime that manages the complete
  container lifecycle
- **runc**: Low-level OCI runtime that actually creates and runs containers using
  Linux primitives

### Multi-Stage Builds

Multi-stage builds reduce image size by separating build dependencies from runtime:

```dockerfile
# Stage 1: Build
FROM golang:1.22 AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /server

# Stage 2: Runtime (tiny image, no build tools)
FROM gcr.io/distroless/static-debian12
COPY --from=builder /server /server
EXPOSE 8080
ENTRYPOINT ["/server"]

# Result: ~15 MB image instead of ~800 MB with full Go toolchain
```

### Image Best Practices

```
DO:                                    DON'T:
✓ Use specific base image tags         ✗ Use :latest in production
  (python:3.12.3-slim)                   (non-reproducible)
✓ Use multi-stage builds               ✗ Install dev tools in prod image
✓ Run as non-root user                 ✗ Run as root (security risk)
✓ Use .dockerignore                    ✗ Copy entire repo into image
✓ Order layers by change frequency     ✗ COPY . before RUN pip install
  (deps first, code last)                (invalidates cache on every change)
✓ Use HEALTHCHECK instruction          ✗ Rely on container start = healthy
✓ Scan images for vulnerabilities      ✗ Use unvetted base images
```

---

## Amazon ECR (Elastic Container Registry)

ECR is a fully managed Docker container registry. It integrates with IAM for
authentication and supports image scanning, lifecycle policies, and cross-region
replication.

```bash
# Authenticate Docker to ECR
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin \
  123456789012.dkr.ecr.us-east-1.amazonaws.com

# Build and push an image
docker build -t myapp:v1.2.3 .
docker tag myapp:v1.2.3 123456789012.dkr.ecr.us-east-1.amazonaws.com/myapp:v1.2.3
docker push 123456789012.dkr.ecr.us-east-1.amazonaws.com/myapp:v1.2.3

# Enable image scanning on push
aws ecr put-image-scanning-configuration \
  --repository-name myapp \
  --image-scanning-configuration scanOnPush=true

# Lifecycle policy: keep only last 10 images
aws ecr put-lifecycle-policy \
  --repository-name myapp \
  --lifecycle-policy-text '{
    "rules": [{
      "rulePriority": 1,
      "description": "Keep last 10 images",
      "selection": {
        "tagStatus": "any",
        "countType": "imageCountMoreThan",
        "countNumber": 10
      },
      "action": {"type": "expire"}
    }]
  }'
```

---

## Amazon ECS Architecture

### Core Concepts

```
┌──────────────────────────────────────────────────────┐
│                   ECS CLUSTER                        │
│                                                      │
│  ┌─────────────────────────────────────────────┐     │
│  │              SERVICE                         │    │
│  │  (maintains desired count of tasks)          │    │
│  │                                              │    │
│  │  ┌───────────────┐  ┌───────────────┐        │    │
│  │  │    TASK        │  │    TASK        │       │    │
│  │  │  ┌──────────┐  │  │  ┌──────────┐  │      │    │
│  │  │  │Container │  │  │  │Container │  │      │    │
│  │  │  │ (app)    │  │  │  │ (app)    │  │      │    │
│  │  │  └──────────┘  │  │  └──────────┘  │      │    │
│  │  │  ┌──────────┐  │  │  ┌──────────┐  │      │    │
│  │  │  │Container │  │  │  │Container │  │      │    │
│  │  │  │ (sidecar)│  │  │  │ (sidecar)│  │      │    │
│  │  │  └──────────┘  │  │  └──────────┘  │      │    │
│  │  └───────────────┘  └───────────────┘        │    │
│  └─────────────────────────────────────────────┘     │
│                                                      │
│  Task Definition: Blueprint for a task               │
│  (image, CPU, memory, ports, env vars, IAM role)     │
└──────────────────────────────────────────────────────┘
```

**Cluster**: Logical grouping of tasks and services.
**Task Definition**: A blueprint (like a docker-compose file) specifying containers,
resources, networking, and IAM roles.
**Task**: A running instance of a task definition (one or more containers).
**Service**: Ensures a desired number of tasks are running, handles deployments and
load balancer integration.

### ECS on Fargate vs EC2

```
ECS on Fargate:                      ECS on EC2:
┌────────────────────┐               ┌────────────────────┐
│  Task              │               │  EC2 Instance      │
│  ┌──────────────┐  │               │  ┌──────────────┐  │
│  │  Container   │  │               │  │  ECS Agent   │  │
│  └──────────────┘  │               │  ├──────────────┤  │
│                    │               │  │  Task 1      │  │
│  AWS manages the   │               │  │  Task 2      │  │
│  underlying host   │               │  │  Task 3      │  │
│                    │               │  └──────────────┘  │
│  No EC2 to manage  │               │                    │
│  Pay per task      │               │  You manage EC2s   │
│  resources         │               │  Pay per instance  │
└────────────────────┘               └────────────────────┘
```

| Aspect             | Fargate                     | EC2                          |
|--------------------|-----------------------------|------------------------------|
| Server management  | None                        | You manage EC2 instances     |
| Pricing            | Per vCPU + memory per second | EC2 instance pricing         |
| GPU support        | No                          | Yes                          |
| Spot pricing       | Fargate Spot (70% savings)   | EC2 Spot instances           |
| Max task size      | 16 vCPU, 120 GB RAM         | Limited by instance type     |
| Boot time          | ~30-60 seconds              | Instant (container on host)  |
| Persistent storage | EFS (no EBS)                | EBS + EFS + instance store   |
| Networking         | awsvpc only                 | awsvpc, bridge, host, none   |

### Task Definition Example

```json
{
  "family": "myapp",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "1024",
  "memory": "2048",
  "executionRoleArn": "arn:aws:iam::123456789012:role/ecsTaskExecutionRole",
  "taskRoleArn": "arn:aws:iam::123456789012:role/myapp-task-role",
  "containerDefinitions": [
    {
      "name": "app",
      "image": "123456789012.dkr.ecr.us-east-1.amazonaws.com/myapp:v1.2.3",
      "portMappings": [{"containerPort": 8080, "protocol": "tcp"}],
      "healthCheck": {
        "command": ["CMD-SHELL", "curl -f http://localhost:8080/health || exit 1"],
        "interval": 15,
        "timeout": 5,
        "retries": 3,
        "startPeriod": 60
      },
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/myapp",
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "app"
        }
      },
      "secrets": [
        {
          "name": "DB_PASSWORD",
          "valueFrom": "arn:aws:secretsmanager:us-east-1:123456789012:secret:myapp/db-password"
        }
      ],
      "environment": [
        {"name": "NODE_ENV", "value": "production"},
        {"name": "PORT", "value": "8080"}
      ]
    }
  ]
}
```

---

## Amazon EKS Architecture

### What Is EKS?

Elastic Kubernetes Service is a managed Kubernetes control plane. AWS runs the
Kubernetes API server, etcd, and other control plane components. You manage the
worker nodes (or use Fargate for serverless pods).

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    EKS CLUSTER                          │
│                                                         │
│  ┌─────────────────────────────────┐  (AWS-managed)     │
│  │        CONTROL PLANE            │                    │
│  │  ┌────────┐ ┌────────┐         │                    │
│  │  │API     │ │  etcd  │         │                    │
│  │  │Server  │ │(state) │         │                    │
│  │  └────────┘ └────────┘         │                    │
│  │  ┌────────────┐ ┌───────────┐  │                    │
│  │  │Controller  │ │Scheduler  │  │                    │
│  │  │Manager     │ │           │  │                    │
│  │  └────────────┘ └───────────┘  │                    │
│  └────────────────┬────────────────┘                    │
│                   │                                     │
│  ┌────────────────┼────────────────┐  (you manage)      │
│  │        DATA PLANE               │                    │
│  │                                 │                    │
│  │  ┌──────────┐  ┌──────────┐     │                    │
│  │  │  Node    │  │  Node    │     │                    │
│  │  │(EC2/Farg)│  │(EC2/Farg)│     │                    │
│  │  │ ┌──────┐ │  │ ┌──────┐ │    │                    │
│  │  │ │ Pod  │ │  │ │ Pod  │ │    │                    │
│  │  │ │┌────┐│ │  │ │┌────┐│ │    │                    │
│  │  │ ││cntr││ │  │ ││cntr││ │    │                    │
│  │  │ │└────┘│ │  │ │└────┘│ │    │                    │
│  │  │ └──────┘ │  │ └──────┘ │    │                    │
│  │  └──────────┘  └──────────┘    │                    │
│  └─────────────────────────────────┘                    │
└─────────────────────────────────────────────────────────┘
```

### Kubernetes Core Concepts

**Pod**: The smallest deployable unit. Contains one or more containers that share
network and storage. Usually one main container plus optional sidecars.

**Deployment**: Manages ReplicaSets and provides declarative updates for pods.
Rolling updates, rollbacks, and scaling are built in.

**Service**: Provides a stable network endpoint for a set of pods. Types:
ClusterIP (internal), NodePort (external via node port), LoadBalancer (provisions
AWS NLB/ALB).

**Ingress**: HTTP/HTTPS routing to services. In EKS, the AWS Load Balancer
Controller provisions ALBs from Ingress resources.

**Horizontal Pod Autoscaler (HPA)**: Scales pod count based on CPU, memory, or
custom metrics.

**Vertical Pod Autoscaler (VPA)**: Adjusts CPU/memory requests for pods based on
actual usage.

### EKS Deployment Example

```yaml
# deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: myapp
  namespace: production
spec:
  replicas: 3
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  selector:
    matchLabels:
      app: myapp
  template:
    metadata:
      labels:
        app: myapp
    spec:
      serviceAccountName: myapp-sa  # IAM Roles for Service Accounts (IRSA)
      containers:
        - name: app
          image: 123456789012.dkr.ecr.us-east-1.amazonaws.com/myapp:v1.2.3
          ports:
            - containerPort: 8080
          resources:
            requests:
              cpu: 250m
              memory: 512Mi
            limits:
              cpu: 500m
              memory: 1Gi
          readinessProbe:
            httpGet:
              path: /health
              port: 8080
            initialDelaySeconds: 10
            periodSeconds: 5
          livenessProbe:
            httpGet:
              path: /health
              port: 8080
            initialDelaySeconds: 30
            periodSeconds: 10
---
apiVersion: v1
kind: Service
metadata:
  name: myapp-svc
  namespace: production
spec:
  type: ClusterIP
  selector:
    app: myapp
  ports:
    - port: 80
      targetPort: 8080
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: myapp-ingress
  namespace: production
  annotations:
    kubernetes.io/ingress.class: alb
    alb.ingress.kubernetes.io/scheme: internet-facing
    alb.ingress.kubernetes.io/target-type: ip
    alb.ingress.kubernetes.io/certificate-arn: arn:aws:acm:...
spec:
  rules:
    - host: app.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: myapp-svc
                port:
                  number: 80
```

---

## Container Networking

### ECS awsvpc Mode

Each task gets its own Elastic Network Interface (ENI) with a private IP in your
VPC subnet. This is the only networking mode supported on Fargate and the
recommended mode for EC2 launch type.

```
VPC Subnet: 10.0.1.0/24
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ Task A       │  │ Task B       │  │ Task C       │
│ IP: 10.0.1.5 │  │ IP: 10.0.1.6 │  │ IP: 10.0.1.7 │
│ ENI: eni-aaa │  │ ENI: eni-bbb │  │ ENI: eni-ccc │
│              │  │              │  │              │
│ SG: sg-app   │  │ SG: sg-app   │  │ SG: sg-app   │
└──────────────┘  └──────────────┘  └──────────────┘

Each task has its own security group, like an EC2 instance.
```

### Kubernetes Pod Networking (Amazon VPC CNI)

The Amazon VPC CNI plugin assigns VPC IP addresses directly to pods. Each pod gets
a real VPC IP, enabling direct communication with other VPC resources without NAT.

```
Node (EC2 instance): 10.0.1.10
├── Pod A: 10.0.1.11 (secondary IP on ENI)
├── Pod B: 10.0.1.12 (secondary IP on ENI)
└── Pod C: 10.0.1.13 (secondary IP on ENI)

Pods communicate directly using VPC networking.
Security groups can be applied at the pod level.
```

---

## Service Mesh

### What Is a Service Mesh?

A service mesh manages service-to-service communication in a microservices
architecture. It handles traffic management, security (mTLS), and observability
transparently via sidecar proxies.

```
Without Service Mesh:            With Service Mesh:
┌────────┐    ┌────────┐        ┌────────┐    ┌────────┐
│Service │───►│Service │        │Service │    │Service │
│   A    │    │   B    │        │   A    │    │   B    │
│        │    │        │        │┌──────┐│    │┌──────┐│
└────────┘    └────────┘        ││Proxy ││───►││Proxy ││
                                │└──────┘│    │└──────┘│
App handles: retries,           └────────┘    └────────┘
timeouts, auth, metrics
                                Proxy handles: retries,
                                timeouts, mTLS, metrics,
                                traffic splitting
```

AWS App Mesh and Istio are the primary service mesh options on EKS.

---

## Container Security

### Image Security

```bash
# Scan ECR image for vulnerabilities
aws ecr start-image-scan \
  --repository-name myapp \
  --image-id imageTag=v1.2.3

# Get scan findings
aws ecr describe-image-scan-findings \
  --repository-name myapp \
  --image-id imageTag=v1.2.3 \
  --query 'imageScanFindings.findingSeverityCounts'
```

### Runtime Security Best Practices

1. **Run as non-root**: Set `USER` in Dockerfile, `runAsNonRoot: true` in K8s
2. **Read-only root filesystem**: `readOnlyRootFilesystem: true`
3. **Drop all capabilities**: `drop: ["ALL"]`, add back only what is needed
4. **No privilege escalation**: `allowPrivilegeEscalation: false`
5. **Use distroless or scratch base images**: Minimal attack surface
6. **Scan images in CI/CD**: Fail builds with critical vulnerabilities

```yaml
# Kubernetes security context
securityContext:
  runAsNonRoot: true
  runAsUser: 1000
  readOnlyRootFilesystem: true
  allowPrivilegeEscalation: false
  capabilities:
    drop: ["ALL"]
```

---

## ECS vs EKS Decision Matrix

| Criterion                    | ECS                        | EKS                        |
|------------------------------|----------------------------|----------------------------|
| Complexity                   | Lower (AWS-native)         | Higher (Kubernetes)        |
| Learning curve               | Gentle                     | Steep                      |
| Portability                  | AWS only                   | Multi-cloud (K8s standard) |
| Ecosystem                    | AWS tools                  | Vast CNCF ecosystem        |
| Team expertise               | AWS-focused teams          | K8s-experienced teams      |
| Advanced scheduling          | Basic                      | Highly flexible            |
| Service mesh                 | App Mesh                   | Istio, Linkerd, App Mesh   |
| Fargate support              | Full                       | Full                       |
| Managed node groups          | N/A (Fargate or EC2 ASG)   | Yes (EKS Managed Nodes)   |
| Cost (control plane)         | Free                       | $0.10/hr ($73/mo)         |
| GitOps                       | Limited                    | ArgoCD, Flux              |
| Batch workloads              | Good                       | Excellent (Argo Workflows) |

**Choose ECS when**: Your team is AWS-native, you want simplicity, you do not need
Kubernetes portability, and your orchestration needs are straightforward.

**Choose EKS when**: Your team knows Kubernetes, you need multi-cloud portability,
you want access to the CNCF ecosystem, or you have complex scheduling requirements.

---

## Practical Takeaways

1. **Start with Fargate** unless you need GPUs, specific instance types, or EBS
   volumes. Fargate eliminates all node management.

2. **Use multi-stage builds** to keep images small. Smaller images pull faster,
   reduce storage costs, and have a smaller attack surface.

3. **Never use `:latest` tag in production.** Always pin to a specific version
   (e.g., `v1.2.3` or a SHA digest) for reproducibility.

4. **Set resource requests AND limits** in Kubernetes. Without requests, the
   scheduler cannot make informed placement decisions. Without limits, a runaway
   container can consume all node resources.

5. **Use readiness probes** to prevent traffic from reaching containers that are
   not ready. Use liveness probes to restart stuck containers. Do not make liveness
   probes hit external dependencies (database, cache) -- that causes cascading
   restarts.

6. **Store secrets in AWS Secrets Manager or Parameter Store**, not in environment
   variables in task definitions. Use ECS secrets injection or the Kubernetes
   Secrets Store CSI Driver.

7. **Implement image lifecycle policies** in ECR to automatically clean up old
   images. Untagged and outdated images accumulate and increase storage costs.

8. **Run containers as non-root.** This single practice mitigates a large class of
   container escape vulnerabilities.
