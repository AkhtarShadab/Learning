# Kubernetes: From Local Setup to Production Cloud

> This is a comprehensive, publication-quality learning document covering Kubernetes
> end to end — from understanding why it exists, through core concepts and local
> experimentation, to production-grade cloud deployments and GitOps workflows. It is
> written for engineers who understand Docker and containers but have not yet worked
> with Kubernetes in depth. By the end, you will be able to set up a local cluster,
> write and apply YAML manifests for all essential resource types, manage applications
> with Helm, design a production cloud architecture on AWS/GCP/Azure, and implement
> GitOps continuous delivery with ArgoCD or Flux. You will also understand the data
> structures and algorithms that power Kubernetes internals.

---

## Table of Contents

1. [Why This Matters](#why-this-matters)
2. [Mental Models](#mental-models)
3. [Chapter 1: Why Kubernetes Exists](#chapter-1-why-kubernetes-exists)
4. [Chapter 2: Core Concepts](#chapter-2-core-concepts)
5. [Chapter 3: Local Setup — Playing with Kubernetes](#chapter-3-local-setup--playing-with-kubernetes)
6. [Chapter 4: Understanding YAML Manifests](#chapter-4-understanding-yaml-manifests)
7. [Chapter 5: Essential kubectl Commands](#chapter-5-essential-kubectl-commands)
8. [Chapter 6: Helm — Kubernetes Package Manager](#chapter-6-helm--kubernetes-package-manager)
9. [Chapter 7: Production Cloud Architecture](#chapter-7-production-cloud-architecture)
10. [Chapter 8: GitOps with ArgoCD and Flux](#chapter-8-gitops-with-argocd-and-flux)
11. [Common Pitfalls and Misconceptions](#common-pitfalls-and-misconceptions)
12. [Summary and Key Takeaways](#summary-and-key-takeaways)
13. [Quick Reference Cheat Sheet](#quick-reference-cheat-sheet)
14. [DSA Connections](#dsa-connections)
15. [Further Reading](#further-reading)

---

## Why This Matters

Kubernetes is the operating system of the cloud-native era. Every major cloud provider
offers a managed Kubernetes service. Every serious platform engineering team runs
Kubernetes or something built on top of it. The CNCF (Cloud Native Computing
Foundation) ecosystem — service meshes, observability stacks, CI/CD pipelines,
policy engines — is built on the assumption that Kubernetes is the substrate.

If you understand Docker but not Kubernetes, you can build applications but you
cannot run them reliably at scale. Docker Compose works beautifully on a single
machine, but the moment you need to run your application across multiple servers,
handle node failures gracefully, scale horizontally under load, perform zero-downtime
deployments, and manage secrets and configuration consistently across environments —
you need an orchestrator. Kubernetes is that orchestrator, and it has won the
orchestration war decisively.

Understanding Kubernetes is not just about learning a tool — it is about understanding
a design philosophy. Kubernetes embodies **declarative infrastructure**: you describe
the desired state of your system, and a set of controllers continuously works to make
reality match that description. This is a fundamentally different paradigm from
imperative scripting ("run this, then run that, then check this"), and it changes
how you think about operations, reliability, and infrastructure as code.

---

## Mental Models

Before diving into components and commands, internalize these five mental models.
They are the conceptual scaffolding that makes everything else in Kubernetes click.

### Mental Model 1: K8s as a Datacenter Operating System

Think of Kubernetes the way you think about Linux on a single machine. Linux manages
a single computer's resources — CPU, memory, disk, network — and provides abstractions
(processes, files, sockets) so applications do not have to manage hardware directly.

Kubernetes does the same thing, but for a *cluster* of machines. It manages a pool of
compute resources and provides abstractions (Pods, Services, Volumes) so applications
do not have to know which machine they are running on.

![05-kubernetes diagram 1](assets/05-kubernetes-1.svg)

When you think "how would Linux handle this for one machine?", the Kubernetes analogy
is usually the right answer for a cluster.

### Mental Model 2: Pods as Logical Hosts

A **Pod** is not a container. A Pod is a *logical host* — a group of one or more
containers that share the same network namespace (same IP address, same `localhost`)
and the same storage volumes. Containers within a Pod can communicate via
`localhost:port`, just like processes on the same machine.

Most Pods run a single container. Multi-container Pods are for tightly coupled
processes — a web server and a log shipper, an app and a metrics sidecar. If two
containers do not *need* to share `localhost` and disk, they belong in separate Pods.

### Mental Model 3: Deployments as Desired State Declarations

You never tell Kubernetes "start 3 containers." You tell Kubernetes "I desire 3
replicas of this Pod specification." Kubernetes then *continuously reconciles* reality
with your declaration:

```
You declare:       "I want 3 replicas of nginx:1.25"
K8s observes:      "Currently there are 2 running"
K8s acts:          "Starting 1 more to reach desired state"
```

This is the **reconciliation loop** — the heartbeat of Kubernetes. Every controller
in the system follows the same pattern: observe current state, compare to desired
state, take action to converge. This is why Kubernetes is self-healing: if a Pod
dies, the controller notices the discrepancy and creates a replacement.

### Mental Model 4: Services as Stable Phone Numbers

Pods are ephemeral. They get created, destroyed, rescheduled, and given new IP
addresses constantly. You cannot hardcode a Pod's IP address into your application
configuration — it will change.

A **Service** is a stable abstraction that gives a set of Pods a permanent DNS name
and IP address. Think of it as a phone number that never changes, even though the
person answering the phone (the Pod) might be different each time you call.

![05-kubernetes diagram 2](assets/05-kubernetes-2.svg)

### Mental Model 5: etcd as the Cluster's Brain

All cluster state — every Pod, Service, Deployment, Secret, ConfigMap, and custom
resource — lives in **etcd**, a distributed key-value store. The API server is the
only component that talks to etcd directly. Every other component reads and writes
state through the API server.

If etcd is lost and unrecoverable, the cluster's brain is gone. This is why etcd
backup is the single most critical operational task in Kubernetes. The cluster can
tolerate losing worker nodes, losing the scheduler temporarily, even losing the API
server briefly — but losing etcd data is catastrophic.

---

## Chapter 1: Why Kubernetes Exists

### The Problem Docker Compose Cannot Solve

Docker Compose is excellent for local development and simple deployments. You define
your services in a `docker-compose.yml`, run `docker compose up`, and everything
starts on one machine. But consider what happens when your application grows:

| Challenge | Docker Compose | Kubernetes |
|-----------|---------------|------------|
| Multi-host deployment | Not supported natively | Built-in cluster scheduling |
| Node failure recovery | Manual restart | Automatic rescheduling |
| Horizontal scaling | Manual `scale` command, single host | HPA: automatic scaling based on metrics |
| Rolling deployments | Recreate only (downtime) | Rolling updates with health checks |
| Service discovery | Docker DNS (single host) | Cluster-wide DNS + load balancing |
| Secret management | `.env` files or Docker secrets | Encrypted Secrets, external vault integration |
| Resource limits enforcement | Per-container, single host | Cluster-wide resource quotas and limits |
| Configuration management | Environment variables, files | ConfigMaps with hot-reload support |
| Storage orchestration | Docker volumes (local) | PersistentVolumes across storage backends |
| Network policies | None | Fine-grained pod-to-pod traffic control |

Docker Compose answers the question "how do I run multiple containers together?"
Kubernetes answers the question "how do I run containers reliably across a fleet of
machines, at scale, in production, with zero downtime?"

### What Kubernetes Gives You

**Scheduling.** You have 50 machines and 200 containers to run. Which containers go
on which machines? Kubernetes's scheduler handles bin-packing — placing Pods on
nodes based on resource requests, affinity rules, and constraints. You never SSH into
a machine to start a container.

**Self-Healing.** A node goes down at 3 AM. Kubernetes detects the failure, marks the
node as unhealthy, and reschedules all its Pods to healthy nodes. A container crashes
in a restart loop. Kubernetes applies exponential backoff and keeps restarting it. A
readiness probe fails. Kubernetes removes the Pod from the Service's endpoint list so
no traffic reaches it until it recovers.

**Horizontal Scaling.** CPU usage crosses 70%? The Horizontal Pod Autoscaler creates
more replicas. Traffic drops? It scales back down. You define the policy; Kubernetes
executes it continuously.

**Service Discovery and Load Balancing.** Every Service gets a DNS name
(`my-service.my-namespace.svc.cluster.local`) and a cluster IP. kube-proxy programs
iptables or IPVS rules to distribute traffic across healthy Pods. No external load
balancer configuration needed for internal communication.

**Rolling Deployments.** You push a new image version. Kubernetes creates new Pods
with the updated image, waits for them to pass readiness checks, and then terminates
old Pods — one at a time or in batches, as you configure. If the new version fails
health checks, the rollout stops automatically. One command rolls back to the previous
version.

**Declarative Configuration.** Your entire infrastructure is described in YAML files
stored in Git. `kubectl apply -f` converges the cluster to match those files. This
makes infrastructure reproducible, auditable, and reviewable through pull requests.

---

## Chapter 2: Core Concepts

### Kubernetes Architecture

![05-kubernetes diagram 3](assets/05-kubernetes-3.svg)

### Control Plane Components

The **control plane** is the brain of the cluster. In managed Kubernetes services
(EKS, GKE, AKS), the cloud provider runs and maintains the control plane for you.

**API Server (`kube-apiserver`).** The front door to the cluster. Every interaction —
`kubectl` commands, controller reconciliation loops, kubelet status reports — goes
through the API server as REST API calls. It validates requests, authenticates callers,
and persists state to etcd. If the API server is down, you cannot make any changes to
the cluster, but existing workloads continue running.

**etcd.** A distributed, strongly consistent key-value store that holds all cluster
state. It uses the **Raft consensus algorithm** to replicate data across an odd number
of members (typically 3 or 5). Every object you create — Pods, Deployments, Services —
is serialized and stored in etcd. Only the API server reads from and writes to etcd;
no other component communicates with it directly.

**Scheduler (`kube-scheduler`).** Watches for newly created Pods that have no node
assigned. For each unscheduled Pod, the scheduler runs a two-phase algorithm:
*filtering* (which nodes can run this Pod, based on resource requests, taints,
affinity rules) and *scoring* (which eligible node is the best fit, based on resource
balance, data locality, spread). The scheduler writes the selected node to the Pod's
`spec.nodeName` field via the API server.

**Controller Manager (`kube-controller-manager`).** Runs a bundle of controllers, each
implementing one reconciliation loop. Key controllers include:

| Controller | Watches | Reconciles |
|-----------|---------|-----------|
| Deployment controller | Deployment objects | Creates/updates ReplicaSets |
| ReplicaSet controller | ReplicaSet objects | Creates/deletes Pods to match replica count |
| Node controller | Node heartbeats | Marks nodes as NotReady, evicts Pods |
| Job controller | Job objects | Creates Pods, tracks completion |
| Service Account controller | Namespaces | Creates default ServiceAccount per namespace |
| Endpoint controller | Services and Pods | Updates endpoint lists as Pods come and go |

### Worker Node Components

**kubelet.** An agent that runs on every worker node. It receives Pod specifications
from the API server, ensures the containers described in those specs are running and
healthy, and reports status back. The kubelet does not manage containers that were not
created by Kubernetes.

**kube-proxy.** A network proxy that runs on every node. It maintains network rules
(using iptables, IPVS, or eBPF) that enable Service abstractions. When traffic
arrives for a Service's ClusterIP, kube-proxy routes it to one of the backing Pods.

**Container Runtime.** The software that actually runs containers. Kubernetes supports
any runtime that implements the **Container Runtime Interface (CRI)**. The most common
runtimes are **containerd** (default in most distributions) and **CRI-O** (used by
OpenShift). Docker itself was removed as a supported runtime in Kubernetes 1.24, but
images built with Docker still work — the runtime interface is standardized.

### Kubernetes Objects

Everything in Kubernetes is an **object** — a persistent entity in the cluster's
state. You create objects by submitting YAML (or JSON) manifests to the API server.
Each object has four key fields:

```yaml
apiVersion: apps/v1          # Which API group and version
kind: Deployment             # What type of object
metadata:                    # Name, namespace, labels, annotations
  name: my-app
  namespace: production
  labels:
    app: my-app
spec:                        # The desired state (varies by kind)
  replicas: 3
  ...
```

Here is the taxonomy of essential objects:

**Workload Objects:**
- **Pod** — The smallest deployable unit. One or more containers with shared networking and storage.
- **ReplicaSet** — Ensures a specified number of Pod replicas are running at all times. You almost never create ReplicaSets directly; Deployments manage them.
- **Deployment** — Manages ReplicaSets and provides declarative updates, rolling deployments, and rollback capabilities.
- **StatefulSet** — Like a Deployment, but for stateful applications. Provides stable network identities, ordered deployment, and persistent storage per replica.
- **DaemonSet** — Ensures a copy of a Pod runs on every node (or a subset of nodes). Used for log collectors, monitoring agents, and network plugins.
- **Job / CronJob** — Runs a Pod to completion (Job) or on a schedule (CronJob).

**Networking Objects:**
- **Service** — Exposes a set of Pods as a network service with a stable IP and DNS name. Types: ClusterIP (internal), NodePort (external via node port), LoadBalancer (cloud provider LB).
- **Ingress** — HTTP/HTTPS routing rules that map external hostnames and paths to internal Services. Requires an Ingress Controller (e.g., nginx, Traefik).
- **NetworkPolicy** — Firewall rules for pod-to-pod communication. Default is "allow all"; NetworkPolicies restrict traffic.

**Configuration Objects:**
- **ConfigMap** — Stores non-confidential configuration data as key-value pairs. Injected into Pods as environment variables or mounted as files.
- **Secret** — Stores sensitive data (passwords, tokens, keys). Base64-encoded by default, optionally encrypted at rest in etcd.

**Storage Objects:**
- **PersistentVolume (PV)** — A piece of storage provisioned by an admin or dynamically by a StorageClass.
- **PersistentVolumeClaim (PVC)** — A request for storage by a Pod. The PVC binds to a PV that satisfies its requirements.

**Cluster Organization:**
- **Namespace** — A virtual partition of the cluster. Provides scope for names and a boundary for resource quotas and RBAC policies.

---

## Chapter 3: Local Setup — Playing with Kubernetes

You need three tools to work with Kubernetes locally: `kubectl` (the CLI),
a local cluster (minikube or kind), and optionally `helm` (package manager) and
`k9s` (terminal UI).

### Installing the Tools

![05-kubernetes diagram 4](assets/05-kubernetes-4.svg)

### Option A: minikube — The Standard Local Cluster

**minikube** creates a single-node Kubernetes cluster inside a Docker container (or VM).
It is the most popular choice for local development and learning.

```bash
# Start a minikube cluster with generous resources
minikube start \
  --driver=docker \          # Use Docker as the virtualization driver (recommended)
  --cpus=4 \                 # Allocate 4 CPU cores to the cluster
  --memory=8g \              # Allocate 8 GB RAM (sufficient for most workloads)
  --kubernetes-version=v1.30.0  # Pin to a specific K8s version for reproducibility

# Verify the cluster is running
kubectl cluster-info         # Shows control plane and CoreDNS addresses
# Output:
# Kubernetes control plane is running at https://127.0.0.1:52345
# CoreDNS is running at https://127.0.0.1:52345/api/v1/namespaces/kube-system/...

kubectl get nodes            # List all nodes in the cluster
# Output:
# NAME       STATUS   ROLES           AGE   VERSION
# minikube   Ready    control-plane   45s   v1.30.0

# Enable useful addons
minikube addons enable ingress          # Nginx Ingress Controller
minikube addons enable metrics-server   # Enables `kubectl top` for resource usage
minikube addons enable dashboard        # Web-based K8s dashboard

# Open the dashboard in your browser
minikube dashboard           # Opens the K8s dashboard automatically

# When done, stop or delete the cluster
minikube stop                # Pause the cluster (preserves state)
minikube delete              # Destroy the cluster completely
```

### Option B: kind — Multi-Node Clusters in Docker

**kind** (Kubernetes IN Docker) runs entire Kubernetes nodes as Docker containers. Its
superpower is multi-node clusters — you can simulate a production-like topology with
separate control plane and worker nodes on your laptop.

```bash
# Create a simple single-node cluster
kind create cluster --name dev  # Creates cluster named "dev"

# Switch kubectl context to the kind cluster
kubectl config use-context kind-dev  # Context name is "kind-" + cluster name

# Verify
kubectl get nodes
# Output:
# NAME                STATUS   ROLES           AGE   VERSION
# dev-control-plane   Ready    control-plane   30s   v1.30.0

# Create a multi-node cluster with a config file
cat <<'EOF' > kind-multi-node.yaml
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
nodes:
  - role: control-plane     # One control plane node
  - role: worker            # First worker node
  - role: worker            # Second worker node
  - role: worker            # Third worker node
EOF

kind create cluster --name production-sim --config kind-multi-node.yaml

kubectl get nodes
# Output:
# NAME                            STATUS   ROLES           AGE   VERSION
# production-sim-control-plane    Ready    control-plane   45s   v1.30.0
# production-sim-worker           Ready    <none>          30s   v1.30.0
# production-sim-worker2          Ready    <none>          30s   v1.30.0
# production-sim-worker3          Ready    <none>          30s   v1.30.0

# Delete a kind cluster
kind delete cluster --name dev
```

### Managing Multiple Clusters and Contexts

```bash
# List all contexts (clusters you can talk to)
kubectl config get-contexts
# Output:
# CURRENT   NAME            CLUSTER          AUTHINFO
# *         kind-dev        kind-dev         kind-dev
#           minikube        minikube         minikube

# Switch to a different context
kubectl config use-context minikube  # Now kubectl talks to minikube

# See current context
kubectl config current-context       # Prints: minikube
```

---

## Chapter 4: Understanding YAML Manifests

Every Kubernetes object is defined by a YAML manifest. Learning to read and write
manifests is the core skill of working with Kubernetes. This chapter provides
complete, annotated examples for every essential resource type.

### Pod

A **Pod** is the atomic unit of deployment. This manifest defines a Pod with resource
limits, a liveness probe, and a readiness probe.

```yaml
# file: pod-example.yaml
apiVersion: v1                        # Pods are in the core API group (v1)
kind: Pod                             # Resource type
metadata:
  name: nginx-pod                     # Unique name within the namespace
  namespace: default                  # Namespace (omit for "default")
  labels:                             # Key-value pairs for selection and organization
    app: nginx                        # Used by Services to find this Pod
    environment: dev
spec:
  containers:
    - name: nginx                     # Container name (must be unique within the Pod)
      image: nginx:1.25-alpine        # Container image (always pin versions in production)
      ports:
        - containerPort: 80           # Port the container listens on (documentation only)
          protocol: TCP
      resources:
        requests:                     # Minimum guaranteed resources (used for scheduling)
          cpu: "100m"                 # 100 millicores = 0.1 CPU core
          memory: "128Mi"            # 128 mebibytes
        limits:                       # Maximum allowed resources (enforced by cgroups)
          cpu: "250m"                 # 250 millicores = 0.25 CPU core
          memory: "256Mi"            # Container is OOM-killed if it exceeds this
      livenessProbe:                  # "Is the container alive?" — restarts if failed
        httpGet:
          path: /                     # Endpoint to probe
          port: 80
        initialDelaySeconds: 10       # Wait 10s after start before first probe
        periodSeconds: 15             # Probe every 15 seconds
        failureThreshold: 3           # Restart after 3 consecutive failures
      readinessProbe:                 # "Is the container ready for traffic?" — removes from Service if failed
        httpGet:
          path: /
          port: 80
        initialDelaySeconds: 5        # Wait 5s before first readiness check
        periodSeconds: 10             # Check every 10 seconds
  restartPolicy: Always               # Always restart on failure (default for Pods in Deployments)
```

```bash
# Apply the manifest
kubectl apply -f pod-example.yaml    # Creates (or updates) the Pod

# Verify
kubectl get pods                     # List Pods in default namespace
# Output:
# NAME        READY   STATUS    RESTARTS   AGE
# nginx-pod   1/1     Running   0          15s
```

### Deployment

A **Deployment** manages the lifecycle of your application — scaling, rolling updates,
and rollbacks. This is the object you will use most often.

```yaml
# file: deployment-example.yaml
apiVersion: apps/v1                     # Deployments are in the "apps" API group
kind: Deployment
metadata:
  name: api-server                      # Deployment name
  namespace: default
  labels:
    app: api-server
spec:
  replicas: 3                           # Desired number of Pod replicas
  selector:                             # How the Deployment finds its Pods
    matchLabels:
      app: api-server                   # Must match template.metadata.labels
  strategy:
    type: RollingUpdate                 # Update Pods incrementally (not all at once)
    rollingUpdate:
      maxSurge: 1                       # Allow 1 extra Pod during update (4 total briefly)
      maxUnavailable: 0                 # Never reduce below 3 healthy Pods during update
  template:                             # Pod template — the Deployment creates Pods from this
    metadata:
      labels:
        app: api-server                 # Labels applied to every Pod created by this Deployment
    spec:
      containers:
        - name: api                     # Container name
          image: myregistry/api:v2.1.0  # Application image (always use specific tags)
          ports:
            - containerPort: 8080
          env:                          # Environment variables
            - name: NODE_ENV
              value: "production"       # Hardcoded value
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:           # Value pulled from a Kubernetes Secret
                  name: db-credentials  # Name of the Secret object
                  key: url              # Key within the Secret's data map
            - name: LOG_LEVEL
              valueFrom:
                configMapKeyRef:        # Value pulled from a ConfigMap
                  name: app-config      # Name of the ConfigMap object
                  key: log-level        # Key within the ConfigMap's data map
          resources:
            requests:
              cpu: "250m"
              memory: "256Mi"
            limits:
              cpu: "500m"
              memory: "512Mi"
          readinessProbe:               # Traffic is only sent to Pods that pass this
            httpGet:
              path: /healthz            # Health check endpoint in your application
              port: 8080
            initialDelaySeconds: 10
            periodSeconds: 5
          livenessProbe:                # Pod is restarted if this fails
            httpGet:
              path: /healthz
              port: 8080
            initialDelaySeconds: 30
            periodSeconds: 15
            failureThreshold: 3
      terminationGracePeriodSeconds: 30  # Give the app 30s to finish requests on shutdown
```

```bash
kubectl apply -f deployment-example.yaml  # Create the Deployment
kubectl get deployments                    # Check Deployment status
# Output:
# NAME         READY   UP-TO-DATE   AVAILABLE   AGE
# api-server   3/3     3            3           45s

kubectl get pods -l app=api-server         # List Pods matching the label
# Output:
# NAME                          READY   STATUS    RESTARTS   AGE
# api-server-7d4f8b6c9f-abc12   1/1     Running   0          45s
# api-server-7d4f8b6c9f-def34   1/1     Running   0          45s
# api-server-7d4f8b6c9f-ghi56   1/1     Running   0          45s
```

### Service (ClusterIP)

A **Service** provides stable networking for a set of Pods. The default type is
**ClusterIP**, which is only reachable from within the cluster.

```yaml
# file: service-example.yaml
apiVersion: v1
kind: Service
metadata:
  name: api-service                     # DNS name: api-service.default.svc.cluster.local
  namespace: default
spec:
  type: ClusterIP                       # Internal-only (default type)
  selector:
    app: api-server                     # Routes traffic to Pods with this label
  ports:
    - name: http                        # Port name (required when multiple ports)
      protocol: TCP
      port: 80                          # Port the Service listens on
      targetPort: 8080                  # Port on the Pod to forward traffic to
```

```bash
kubectl apply -f service-example.yaml
kubectl get services
# Output:
# NAME          TYPE        CLUSTER-IP     EXTERNAL-IP   PORT(S)   AGE
# api-service   ClusterIP   10.96.45.123   <none>        80/TCP    10s

# Test from inside the cluster
kubectl run curl-test --rm -it --image=curlimages/curl -- \
  curl http://api-service.default.svc.cluster.local/healthz
# Output: {"status":"ok"}
```

### Ingress

An **Ingress** defines HTTP routing rules from outside the cluster to internal
Services. It requires an **Ingress Controller** (like nginx) to be installed.

```yaml
# file: ingress-example.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: api-ingress
  namespace: default
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /    # Strip the path prefix before forwarding
    nginx.ingress.kubernetes.io/ssl-redirect: "true" # Redirect HTTP to HTTPS
    nginx.ingress.kubernetes.io/proxy-body-size: "10m"  # Max request body size
    nginx.ingress.kubernetes.io/rate-limit: "100"    # Rate limiting: 100 requests/second
spec:
  ingressClassName: nginx               # Which Ingress Controller handles this rule
  tls:                                  # HTTPS configuration
    - hosts:
        - api.example.com
      secretName: api-tls-cert          # Secret containing the TLS certificate and key
  rules:
    - host: api.example.com             # Match requests for this hostname
      http:
        paths:
          - path: /                     # Match all paths
            pathType: Prefix            # Prefix match (/ matches /foo, /bar, etc.)
            backend:
              service:
                name: api-service       # Route to this Service
                port:
                  number: 80            # On this port
```

```bash
kubectl apply -f ingress-example.yaml
kubectl get ingress
# Output:
# NAME          CLASS   HOSTS             ADDRESS        PORTS     AGE
# api-ingress   nginx   api.example.com   192.168.49.2   80, 443   10s
```

### ConfigMap

A **ConfigMap** stores non-sensitive configuration data that can be injected into Pods.

```yaml
# file: configmap-example.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config
  namespace: default
data:
  log-level: "info"                     # Simple key-value pair
  max-connections: "100"                # All values are strings in ConfigMaps
  app-settings.json: |                  # Multi-line value (entire config file)
    {
      "feature_flags": {
        "new_dashboard": true,
        "beta_api": false
      },
      "cache_ttl_seconds": 300
    }
```

```bash
kubectl apply -f configmap-example.yaml
kubectl get configmap app-config -o yaml  # View the full ConfigMap
```

### Secret

A **Secret** stores sensitive data. Values are base64-encoded (NOT encrypted) by
default. In production, enable encryption at rest for etcd.

```yaml
# file: secret-example.yaml
apiVersion: v1
kind: Secret
metadata:
  name: db-credentials
  namespace: default
type: Opaque                            # Generic secret type
stringData:                             # Use stringData for plain text (auto-encoded to base64)
  url: "postgresql://user:pass@db-host:5432/mydb"
  username: "app_user"
  password: "s3cur3-p@ssw0rd!"
# Alternatively, use `data` with pre-encoded values:
# data:
#   url: cG9zdGdyZXNxbDovL3VzZXI6cGFzc0BkYi1ob3N0OjU0MzIvbXlkYg==
```

```bash
kubectl apply -f secret-example.yaml
kubectl get secrets
# Output:
# NAME              TYPE     DATA   AGE
# db-credentials    Opaque   3      5s

# View decoded secret value (be careful — this prints the secret in plain text)
kubectl get secret db-credentials -o jsonpath='{.data.password}' | base64 -d
# Output: s3cur3-p@ssw0rd!
```

> **Warning:** Kubernetes Secrets are base64-encoded, not encrypted. Anyone with read
> access to the namespace can decode them. In production, use an external secrets
> manager (AWS Secrets Manager, HashiCorp Vault) via the External Secrets Operator,
> or enable etcd encryption at rest.

### PersistentVolumeClaim

A **PersistentVolumeClaim (PVC)** requests storage from the cluster. When a Pod
references a PVC, Kubernetes provisions or binds a PersistentVolume to satisfy it.

```yaml
# file: pvc-example.yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: postgres-data                   # Name referenced by the Pod's volume mount
  namespace: default
spec:
  accessModes:
    - ReadWriteOnce                     # Can be mounted read-write by a single node
  storageClassName: standard            # StorageClass (e.g., "gp3" on AWS, "standard" on minikube)
  resources:
    requests:
      storage: 10Gi                     # Request 10 gibibytes of storage
```

Using the PVC in a Pod:

```yaml
# file: pod-with-pvc.yaml
apiVersion: v1
kind: Pod
metadata:
  name: postgres
spec:
  containers:
    - name: postgres
      image: postgres:16-alpine
      ports:
        - containerPort: 5432
      env:
        - name: POSTGRES_PASSWORD
          valueFrom:
            secretKeyRef:
              name: db-credentials
              key: password
      volumeMounts:
        - name: data-volume             # Name must match volumes[].name below
          mountPath: /var/lib/postgresql/data  # Where to mount inside the container
  volumes:
    - name: data-volume                 # Volume name (referenced by volumeMounts)
      persistentVolumeClaim:
        claimName: postgres-data        # Name of the PVC to bind
```

```bash
kubectl apply -f pvc-example.yaml
kubectl apply -f pod-with-pvc.yaml

kubectl get pvc
# Output:
# NAME            STATUS   VOLUME                                     CAPACITY   ACCESS MODES   STORAGECLASS   AGE
# postgres-data   Bound    pvc-a1b2c3d4-e5f6-7890-abcd-ef1234567890   10Gi       RWO            standard       20s
```

---

## Chapter 5: Essential kubectl Commands

`kubectl` is the primary CLI for interacting with Kubernetes. This chapter covers
every command you will use regularly, organized by workflow.

### Context and Cluster Management

![05-kubernetes diagram 5](assets/05-kubernetes-5.svg)

### Applying Manifests

![05-kubernetes diagram 6](assets/05-kubernetes-6.svg)

### Inspecting Resources

![05-kubernetes diagram 7](assets/05-kubernetes-7.svg)

### Logs and Debugging

![05-kubernetes diagram 8](assets/05-kubernetes-8.svg)

### Scaling and Rollouts

![05-kubernetes diagram 9](assets/05-kubernetes-9.svg)

### Troubleshooting Workflow

When something is wrong, follow this systematic debugging path:

```bash
# Step 1: Check events for the namespace
kubectl get events -n default --sort-by=.metadata.creationTimestamp | tail -20
# Look for: FailedScheduling, FailedMount, BackOff, OOMKilled, Unhealthy

# Step 2: Check Pod status
kubectl get pods -n default
# Look for: CrashLoopBackOff, ImagePullBackOff, Pending, ErrImagePull

# Step 3: Describe the problematic Pod
kubectl describe pod <pod-name>
# Look at: Events section at the bottom, Conditions, Container state reason

# Step 4: Check logs
kubectl logs <pod-name> --previous      # If the container is crash-looping, check previous logs

# Step 5: Check node resources
kubectl top nodes                        # Is a node out of CPU or memory?
kubectl describe node <node-name>        # Check "Allocated resources" section

# Step 6: Check Service endpoints
kubectl get endpoints <service-name>     # Are there Pods behind this Service?
# Empty endpoints = selector does not match any running Pods

# Common Status Meanings:
# Pending       → No node can schedule this Pod (resource shortage, taints, affinity)
# CrashLoopBackOff → Container keeps crashing and K8s is backing off restart attempts
# ImagePullBackOff → Cannot pull the container image (wrong name, no auth, registry down)
# OOMKilled     → Container exceeded its memory limit
# Evicted       → Node ran out of resources and evicted the Pod
```

---

## Chapter 6: Helm — Kubernetes Package Manager

**Helm** is the package manager for Kubernetes. Just as `apt` installs and manages
software packages on Debian, Helm installs and manages **charts** — pre-packaged
collections of Kubernetes manifests with configurable values.

### Why Helm?

Without Helm, deploying a complex application means maintaining dozens of YAML files
and manually editing values (image tags, replica counts, resource limits) for each
environment. Helm solves this with:

- **Templating:** YAML files with Go template variables, so one chart works for dev, staging, and production.
- **Packaging:** Bundle all manifests into a versioned, distributable archive (a chart).
- **Dependency management:** A chart can depend on other charts (e.g., your app chart depends on a Redis chart).
- **Release management:** Each installation is a named "release" with rollback history.

### Essential Helm Commands

![05-kubernetes diagram 10](assets/05-kubernetes-10.svg)

### Creating Your Own Helm Chart

```bash
# Scaffold a new chart
helm create my-app                      # Creates a directory structure:
```

The generated structure:

![05-kubernetes diagram 11](assets/05-kubernetes-11.svg)

### Chart.yaml

```yaml
# file: my-app/Chart.yaml
apiVersion: v2                          # Helm 3 chart API version
name: my-app                            # Chart name
description: A Helm chart for my application
type: application                       # "application" or "library"
version: 1.0.0                          # Chart version (SemVer — bump this on chart changes)
appVersion: "2.1.0"                     # Version of the application being deployed
dependencies:                           # Sub-chart dependencies
  - name: redis
    version: "19.x.x"                  # Version range
    repository: https://charts.bitnami.com/bitnami
    condition: redis.enabled            # Only include if redis.enabled=true in values
```

### values.yaml

```yaml
# file: my-app/values.yaml
# Default values for my-app.
# Override these with --set or -f values-production.yaml

replicaCount: 2                         # Number of Pod replicas

image:
  repository: myregistry/my-app         # Container image repository
  tag: "2.1.0"                          # Image tag (defaults to Chart.appVersion if empty)
  pullPolicy: IfNotPresent              # Always | IfNotPresent | Never

service:
  type: ClusterIP                       # Service type
  port: 80                              # Service port

ingress:
  enabled: true                         # Set to false to skip Ingress creation
  className: nginx
  host: app.example.com
  tls: true

resources:
  requests:
    cpu: "100m"
    memory: "128Mi"
  limits:
    cpu: "500m"
    memory: "512Mi"

autoscaling:
  enabled: true
  minReplicas: 2
  maxReplicas: 10
  targetCPUUtilizationPercentage: 70

redis:
  enabled: true                         # Enable the Redis sub-chart dependency
```

### Template Example

```yaml
# file: my-app/templates/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ include "my-app.fullname" . }}    {{/* Helper function from _helpers.tpl */}}
  labels:
    {{- include "my-app.labels" . | nindent 4 }}  {{/* Standard labels */}}
spec:
  {{- if not .Values.autoscaling.enabled }}
  replicas: {{ .Values.replicaCount }}        {{/* Only set if HPA is not managing replicas */}}
  {{- end }}
  selector:
    matchLabels:
      {{- include "my-app.selectorLabels" . | nindent 6 }}
  template:
    metadata:
      labels:
        {{- include "my-app.selectorLabels" . | nindent 8 }}
    spec:
      containers:
        - name: {{ .Chart.Name }}
          image: "{{ .Values.image.repository }}:{{ .Values.image.tag | default .Chart.AppVersion }}"
          imagePullPolicy: {{ .Values.image.pullPolicy }}
          ports:
            - name: http
              containerPort: 8080
          resources:
            {{- toYaml .Values.resources | nindent 12 }}  {{/* Inject resource block from values */}}
          readinessProbe:
            httpGet:
              path: /healthz
              port: http
            initialDelaySeconds: 10
          livenessProbe:
            httpGet:
              path: /healthz
              port: http
            initialDelaySeconds: 30
```

### Deploying with Overrides

![05-kubernetes diagram 12](assets/05-kubernetes-12.svg)

---

## Chapter 7: Production Cloud Architecture

Moving from a local cluster to production requires understanding networking, security
boundaries, managed services, autoscaling, and multi-tenancy.

### Production Cloud Layout

![05-kubernetes diagram 13](assets/05-kubernetes-13.svg)

### Creating a Production Cluster on AWS (EKS)

![05-kubernetes diagram 14](assets/05-kubernetes-14.svg)

### Creating a Production Cluster on GCP (GKE)

![05-kubernetes diagram 15](assets/05-kubernetes-15.svg)

### Namespace Strategy

Namespaces provide logical isolation within a cluster. A production cluster should
have a deliberate namespace strategy.

![05-kubernetes diagram 16](assets/05-kubernetes-16.svg)

```yaml
# file: namespace-with-labels.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: production
  labels:
    environment: production              # Used by NetworkPolicies and admission webhooks
    team: platform                       # Used for cost allocation and RBAC
    istio-injection: enabled             # Auto-inject Istio sidecar (if using service mesh)
```

### Resource Quotas

**ResourceQuotas** prevent a single team or application from consuming all cluster
resources. Apply them per namespace.

```yaml
# file: resource-quota.yaml
apiVersion: v1
kind: ResourceQuota
metadata:
  name: production-quota
  namespace: production
spec:
  hard:
    requests.cpu: "20"                   # Total CPU requests in this namespace: max 20 cores
    requests.memory: "40Gi"              # Total memory requests: max 40 GiB
    limits.cpu: "40"                     # Total CPU limits: max 40 cores
    limits.memory: "80Gi"               # Total memory limits: max 80 GiB
    pods: "100"                          # Max 100 Pods in this namespace
    services: "20"                       # Max 20 Services
    persistentvolumeclaims: "30"         # Max 30 PVCs
    secrets: "50"                        # Max 50 Secrets
```

```yaml
# file: limit-range.yaml
# LimitRange sets defaults and limits per individual Pod/Container
apiVersion: v1
kind: LimitRange
metadata:
  name: default-limits
  namespace: production
spec:
  limits:
    - type: Container
      default:                           # Default limits (applied if not specified in Pod spec)
        cpu: "500m"
        memory: "512Mi"
      defaultRequest:                    # Default requests (applied if not specified)
        cpu: "100m"
        memory: "128Mi"
      max:                               # Maximum any single container can request
        cpu: "4"
        memory: "8Gi"
      min:                               # Minimum (prevents tiny containers that waste scheduling slots)
        cpu: "50m"
        memory: "64Mi"
```

```bash
kubectl apply -f resource-quota.yaml
kubectl apply -f limit-range.yaml

# Check quota usage
kubectl describe resourcequota production-quota -n production
# Shows: Used / Hard for each resource type
```

### Horizontal Pod Autoscaler (HPA)

The **HPA** automatically adjusts the number of Pod replicas based on observed metrics.

```yaml
# file: hpa-example.yaml
apiVersion: autoscaling/v2              # v2 supports custom and external metrics
kind: HorizontalPodAutoscaler
metadata:
  name: api-server-hpa
  namespace: production
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: api-server                     # The Deployment to scale
  minReplicas: 3                         # Never scale below 3
  maxReplicas: 20                        # Never scale above 20
  metrics:
    - type: Resource                     # Scale based on built-in resource metrics
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70         # Target 70% average CPU utilization
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 80         # Target 80% average memory utilization
  behavior:
    scaleUp:
      stabilizationWindowSeconds: 60     # Wait 60s before scaling up again (prevents flapping)
      policies:
        - type: Percent
          value: 50                      # Scale up by at most 50% of current replicas
          periodSeconds: 60
    scaleDown:
      stabilizationWindowSeconds: 300    # Wait 5 minutes before scaling down (conservative)
      policies:
        - type: Percent
          value: 25                      # Scale down by at most 25% at a time
          periodSeconds: 120
```

```bash
kubectl apply -f hpa-example.yaml

# Monitor autoscaling
kubectl get hpa -n production -w         # Watch HPA metrics and scaling decisions
# Output:
# NAME             REFERENCE              TARGETS   MINPODS   MAXPODS   REPLICAS   AGE
# api-server-hpa   Deployment/api-server   45%/70%   3         20        3          5m
```

### Network Policies (Zero-Trust)

By default, all Pods can communicate with all other Pods. **NetworkPolicies** implement
zero-trust networking — deny everything, then explicitly allow only the traffic that
should flow.

```yaml
# file: network-policy-default-deny.yaml
# Step 1: Deny ALL ingress and egress traffic in the namespace
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-all
  namespace: production
spec:
  podSelector: {}                        # Empty selector = applies to ALL Pods in namespace
  policyTypes:
    - Ingress                            # Block all incoming traffic
    - Egress                             # Block all outgoing traffic
```

```yaml
# file: network-policy-allow-api.yaml
# Step 2: Allow specific traffic flows
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-api-traffic
  namespace: production
spec:
  podSelector:
    matchLabels:
      app: api-server                    # This policy applies to api-server Pods
  policyTypes:
    - Ingress
    - Egress
  ingress:
    - from:
        - namespaceSelector:
            matchLabels:
              name: ingress              # Allow traffic from the ingress namespace
          podSelector:
            matchLabels:
              app: nginx-ingress         # Specifically from the ingress controller Pods
      ports:
        - protocol: TCP
          port: 8080                     # Only on port 8080
  egress:
    - to:
        - podSelector:
            matchLabels:
              app: postgres              # Allow outbound to Postgres Pods
      ports:
        - protocol: TCP
          port: 5432
    - to:
        - podSelector:
            matchLabels:
              app: redis                 # Allow outbound to Redis Pods
      ports:
        - protocol: TCP
          port: 6379
    - to:                                # Allow DNS resolution (required for Service discovery)
        - namespaceSelector: {}
          podSelector:
            matchLabels:
              k8s-app: kube-dns
      ports:
        - protocol: UDP
          port: 53
        - protocol: TCP
          port: 53
```

```bash
kubectl apply -f network-policy-default-deny.yaml
kubectl apply -f network-policy-allow-api.yaml

# Verify policies
kubectl get networkpolicies -n production
# Output:
# NAME                 POD-SELECTOR     AGE
# default-deny-all     <none>           30s
# allow-api-traffic    app=api-server   30s
```

> **Key insight:** The default-deny policy is the foundation. Without it, NetworkPolicies
> only *add* restrictions to specific Pods — they do not deny traffic to Pods without
> policies. Starting with default-deny ensures that any Pod without an explicit allow
> policy receives zero network access.

---

## Chapter 8: GitOps with ArgoCD and Flux

### The GitOps Principle

**GitOps** is an operational framework where Git is the single source of truth for
both application code and infrastructure configuration. Instead of running `kubectl
apply` manually or from a CI pipeline, a GitOps controller running *inside* the
cluster continuously watches a Git repository and reconciles the cluster state to
match what is committed.

```
Traditional CI/CD (Push-Based):
  Developer → Push code → CI builds image → CI runs kubectl apply → Cluster

GitOps (Pull-Based):
  Developer → Push code → CI builds image → CI updates manifest in Git
                                                     ↑
  ArgoCD/Flux (in cluster) → Watches Git repo → Detects diff → Applies to cluster
```

The key benefits:

- **Auditability:** Every change to the cluster is a Git commit with author, timestamp, and diff.
- **Rollback:** Reverting a cluster change is `git revert`. No need to remember which `kubectl` commands to undo.
- **Security:** CI/CD pipelines never need cluster credentials. The GitOps controller pulls changes, so no inbound access to the cluster API is required from external systems.
- **Drift detection:** If someone runs `kubectl edit` to make an ad-hoc change, the GitOps controller detects the drift and reverts it to match Git.

### ArgoCD: Declarative Continuous Delivery

**ArgoCD** is the most popular GitOps tool for Kubernetes. It provides a web UI, CLI,
and API for managing application deployments declaratively.

![05-kubernetes diagram 17](assets/05-kubernetes-17.svg)

#### Defining an ArgoCD Application

An ArgoCD **Application** resource defines what to deploy, from where, and to which
cluster/namespace.

```yaml
# file: argocd-application.yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: api-server                       # Application name in ArgoCD
  namespace: argocd                      # ArgoCD always lives in its own namespace
spec:
  project: default                       # ArgoCD project (for RBAC grouping)
  source:
    repoURL: https://github.com/myorg/k8s-manifests.git  # Git repo with manifests
    targetRevision: main                 # Branch, tag, or commit SHA to track
    path: apps/api-server/production     # Path within the repo containing manifests
  destination:
    server: https://kubernetes.default.svc  # The cluster to deploy to (in-cluster)
    namespace: production                # Target namespace
  syncPolicy:
    automated:                           # Enable auto-sync (deploy on every Git push)
      prune: true                        # Delete resources removed from Git
      selfHeal: true                     # Revert manual changes (drift correction)
    syncOptions:
      - CreateNamespace=true             # Create target namespace if it does not exist
      - PrunePropagationPolicy=foreground  # Wait for dependent resources to be deleted
    retry:
      limit: 5                           # Retry failed syncs up to 5 times
      backoff:
        duration: 5s
        factor: 2
        maxDuration: 3m
```

```bash
kubectl apply -f argocd-application.yaml

# Check application status via CLI
argocd app get api-server
# Output:
# Name:               api-server
# Server:             https://kubernetes.default.svc
# Namespace:          production
# Status:             Synced
# Health:             Healthy

# Manual sync (if automated sync is disabled)
argocd app sync api-server

# View sync history
argocd app history api-server
```

### Flux: Pull-Based GitOps Operator

**Flux** is an alternative GitOps tool that takes a more modular, Kubernetes-native
approach. Instead of a centralized UI, Flux uses a set of controllers (source,
kustomize, helm, notification) that each handle one responsibility.

![05-kubernetes diagram 18](assets/05-kubernetes-18.svg)

### The Complete CI/CD + GitOps Pipeline

Here is how the pieces fit together in a production workflow:

![05-kubernetes diagram 19](assets/05-kubernetes-19.svg)

#### Example CI Step: Updating Manifests

```yaml
# file: .github/workflows/deploy.yml (GitHub Actions)
name: Build and Deploy
on:
  push:
    branches: [main]

jobs:
  build-and-push:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Build and push Docker image
        run: |
          docker build -t myregistry/api-server:${{ github.sha }} .
          docker push myregistry/api-server:${{ github.sha }}

      - name: Update K8s manifests
        run: |
          # Clone the manifests repo
          git clone https://x-access-token:${{ secrets.MANIFESTS_TOKEN }}@github.com/myorg/k8s-manifests.git
          cd k8s-manifests

          # Update the image tag in the deployment manifest
          # Using kustomize edit or yq:
          cd apps/api-server/production
          kustomize edit set image myregistry/api-server=myregistry/api-server:${{ github.sha }}

          # Commit and push
          git config user.name "CI Bot"
          git config user.email "ci@myorg.com"
          git add .
          git commit -m "deploy: api-server ${{ github.sha }}"
          git push
          # ArgoCD / Flux will detect this commit and deploy automatically
```

### ArgoCD vs. Flux: When to Use Which

| Dimension | ArgoCD | Flux |
|-----------|--------|------|
| UI | Rich web dashboard | No built-in UI (use Weave GitOps or CLI) |
| Architecture | Monolithic server + repo-server | Modular controllers (source, kustomize, helm, etc.) |
| Multi-cluster | Built-in (register external clusters) | Via Cluster API or separate Flux instances |
| Helm support | First-class (renders and applies charts) | Native HelmRelease CRD |
| Notifications | Built-in (Slack, webhook, etc.) | Separate notification-controller |
| RBAC | AppProject-based | Kubernetes-native RBAC |
| Best for | Teams wanting a UI and centralized management | Teams preferring a Kubernetes-native, modular approach |
| Learning curve | Lower (UI helps) | Higher (must understand each controller) |

---

## Common Pitfalls and Misconceptions

### Pitfall 1: Not Setting Resource Requests and Limits

If you do not set resource `requests`, the scheduler has no information about how much
CPU and memory your Pod actually needs. It might schedule 50 Pods on a node that can
only handle 10, leading to OOM kills and CPU throttling.

If you do not set resource `limits`, a single misbehaving Pod can consume all node
resources and starve everything else.

```yaml
# BAD — no resource controls
containers:
  - name: api
    image: myapp:latest

# GOOD — explicit requests and limits
containers:
  - name: api
    image: myapp:v2.1.0
    resources:
      requests:
        cpu: "250m"
        memory: "256Mi"
      limits:
        cpu: "500m"
        memory: "512Mi"
```

> **Rule of thumb:** Set requests to what your application *normally* uses and limits
> to what it might use under peak load. Start with `requests = limits` for
> predictability, then tune based on observed metrics from `kubectl top`.

### Pitfall 2: Using `latest` Image Tags

The `latest` tag is mutable — it points to whatever image was pushed most recently.
This means:
- You cannot tell which version is running by looking at the manifest.
- Two Pods in the same Deployment might run different code if the image was updated between Pod starts.
- Rollbacks are impossible because `latest` at revision 3 and `latest` at revision 5 might be different images but the manifest looks identical.

**Always use specific, immutable tags:** `myapp:v2.1.0`, `myapp:abc123def` (Git SHA), or `myapp@sha256:...` (digest).

### Pitfall 3: Confusing Liveness and Readiness Probes

- **Liveness probe failure** → Kubernetes *restarts* the container. Use this for detecting deadlocks or unrecoverable states.
- **Readiness probe failure** → Kubernetes *removes the Pod from Service endpoints* (no traffic routed to it). Use this for detecting temporary inability to serve requests (loading cache, waiting for dependency).

A common mistake is making the liveness probe check a dependency (like a database).
If the database is down, the liveness probe fails, Kubernetes restarts all your Pods,
they all try to reconnect to the still-down database, fail again, and enter
CrashLoopBackOff. The correct approach: readiness probe checks the database;
liveness probe checks only the application process itself.

### Pitfall 4: Ignoring Pod Disruption Budgets

When a node is drained (for upgrades, scaling down, etc.), Kubernetes evicts all Pods
on that node. Without a **PodDisruptionBudget (PDB)**, all replicas of your
application on that node can be evicted simultaneously, causing downtime.

```yaml
# file: pdb-example.yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: api-server-pdb
spec:
  minAvailable: 2                        # At least 2 Pods must remain running during disruptions
  selector:
    matchLabels:
      app: api-server
```

### Pitfall 5: Secrets Are Not Encrypted by Default

Kubernetes Secrets are base64-encoded, not encrypted. Anyone with `get secret`
permissions in a namespace can decode them. In production:
- Enable etcd encryption at rest.
- Use an external secrets manager (AWS Secrets Manager, HashiCorp Vault, GCP Secret Manager).
- Use the External Secrets Operator to sync external secrets into Kubernetes.
- Limit RBAC: only the Pods that need a secret should have access to it.

### Pitfall 6: Neglecting Namespace Isolation

Namespaces are a logical boundary, not a security boundary by default. Without
NetworkPolicies, Pods in one namespace can freely communicate with Pods in any other
namespace. Without ResourceQuotas, one namespace can starve others of resources.
Without RBAC, users in one namespace can read or modify resources in another.

**Always pair namespaces with:** NetworkPolicies (network isolation), ResourceQuotas
(resource isolation), and RBAC RoleBindings (access control).

### Pitfall 7: Running Stateful Workloads Without Understanding StatefulSets

Using a Deployment for a database seems to work until you scale to 2 replicas and
discover both replicas are writing to the same PVC, corrupting data. **StatefulSets**
exist specifically for stateful workloads because they provide:
- Stable, unique network identities (pod-0, pod-1, pod-2).
- Ordered, graceful deployment and scaling.
- Stable persistent storage per replica (each Pod gets its own PVC).

That said, for production databases, prefer managed services (RDS, Cloud SQL) over
running databases in Kubernetes unless you have specific operational expertise.

---

## Summary and Key Takeaways

### What You Should Now Be Able To Do

- [ ] Explain why Kubernetes exists and what problems it solves that Docker Compose cannot
- [ ] Describe the role of every control plane component (API server, etcd, scheduler, controller manager) and worker node component (kubelet, kube-proxy, container runtime)
- [ ] Set up a local Kubernetes cluster using minikube or kind
- [ ] Write complete YAML manifests for Pods, Deployments, Services, Ingress, ConfigMaps, Secrets, and PVCs
- [ ] Use `kubectl` fluently for applying manifests, inspecting resources, debugging issues, and managing rollouts
- [ ] Create and manage Helm charts, install community charts, and perform upgrades and rollbacks
- [ ] Design a production Kubernetes architecture on AWS or GCP with proper VPC layout, node groups, autoscaling, resource quotas, and network policies
- [ ] Implement GitOps with ArgoCD or Flux, including automated sync, drift detection, and rollback via Git

### Key Principles to Internalize

1. **Declarative over imperative.** Describe the desired state in YAML stored in Git. Let controllers reconcile.
2. **Everything is a reconciliation loop.** Controllers observe, compare, and act. This is the heartbeat of Kubernetes.
3. **Pods are ephemeral.** Design for failure. Use Deployments, not bare Pods. Use Services, not Pod IPs.
4. **Resources must be bounded.** Always set requests and limits. Always use ResourceQuotas in shared clusters.
5. **Security is opt-in.** NetworkPolicies, RBAC, and Secret encryption are not enabled by default. You must configure them.
6. **GitOps for production.** Never `kubectl apply` from a laptop in production. Use ArgoCD or Flux with Git as the source of truth.

---

## Quick Reference Cheat Sheet

### Object Hierarchy

![05-kubernetes diagram 20](assets/05-kubernetes-20.svg)

### kubectl Quick Reference

```bash
# === CRUD ===
kubectl apply -f file.yaml              # Create or update
kubectl delete -f file.yaml             # Delete
kubectl get <resource>                   # List
kubectl describe <resource> <name>       # Detailed info
kubectl edit <resource> <name>           # Edit in terminal ($EDITOR)

# === Debugging ===
kubectl logs <pod> [-f] [--previous]     # View/stream logs
kubectl exec -it <pod> -- /bin/sh        # Shell into Pod
kubectl port-forward <pod/svc> L:R       # Forward local:remote port
kubectl top pods|nodes                   # Resource usage
kubectl get events --sort-by=.metadata.creationTimestamp  # Recent events

# === Deployments ===
kubectl rollout status deploy/<name>     # Watch rollout
kubectl rollout undo deploy/<name>       # Rollback
kubectl scale deploy/<name> --replicas=N # Scale

# === Shortcuts ===
# po=pods  svc=services  deploy=deployments  ns=namespaces
# rs=replicasets  no=nodes  ing=ingress  pvc=persistentvolumeclaims
kubectl get po,svc,deploy -n production  # Multiple resource types at once
```

### Helm Quick Reference

```bash
helm repo add <name> <url>               # Add chart repository
helm install <release> <chart> -f vals   # Install chart
helm upgrade <release> <chart> --set k=v # Upgrade release
helm rollback <release> <revision>       # Rollback
helm uninstall <release>                 # Remove release
helm list -A                             # List all releases
helm template <release> <chart>          # Render templates locally (dry run)
```

### Common Port Numbers

| Service | Default Port |
|---------|-------------|
| Kubernetes API server | 6443 |
| etcd | 2379 (client), 2380 (peer) |
| kubelet | 10250 |
| kube-proxy | 10256 |
| NodePort range | 30000-32767 |
| CoreDNS | 53 (UDP/TCP) |

---

## DSA Connections

Kubernetes is a distributed system, and its internals are rich with data structure
and algorithm applications. Understanding these connections deepens your appreciation
of why Kubernetes is designed the way it is.

### 1. etcd: B+ Tree for Distributed Key-Value Storage

etcd stores all cluster state as key-value pairs. Internally, it uses **bbolt**
(an embedded key-value database) which implements a **B+ tree** on disk. B+ trees
provide O(log n) lookups, insertions, and range scans — critical for the API server's
`list` and `watch` operations, which often query ranges of keys (e.g., "all Pods in
namespace X").

etcd also uses the **Raft consensus algorithm** for leader election and log replication
across the cluster. Raft guarantees linearizability — every read sees the most recent
write — which is essential for a system where multiple controllers are making
decisions based on shared state.

```
etcd data model:

/registry/pods/default/nginx-pod     → {Pod spec + status JSON}
/registry/pods/default/api-server-1  → {Pod spec + status JSON}
/registry/services/default/api-svc   → {Service spec JSON}

B+ tree structure (simplified):
           [/registry/pods]
          /                 \
  [/default/api-...]   [/default/nginx-...]
     (leaf: value)        (leaf: value)

Range query: "all keys under /registry/pods/default/"
→ B+ tree range scan: O(log n + k) where k = number of results
```

### 2. Scheduler Bin-Packing: NP-Hard Problem with Greedy Approximation

The Kubernetes scheduler solves a variant of the **bin-packing problem**: given Pods
with CPU and memory requirements (items of different sizes) and nodes with capacity
(bins), assign Pods to nodes to maximize utilization without exceeding capacity.

Multi-dimensional bin-packing is **NP-hard** — there is no known polynomial-time
algorithm for finding the optimal solution. The scheduler uses a **greedy heuristic**:

1. **Filter phase** — Eliminate nodes that cannot run the Pod (insufficient resources, taints, affinity violations). This is a constraint satisfaction step.
2. **Score phase** — Rank remaining nodes using a weighted sum of scoring plugins. The default `LeastRequestedPriority` prefers nodes with the most free resources (analogous to the "first fit decreasing" heuristic for bin-packing).

The scheduler processes one Pod at a time, which makes it a greedy, online algorithm.
This is suboptimal compared to batch scheduling (where you consider all Pods at once),
but it is fast and works well in practice because the scheduler re-evaluates when
conditions change.

### 3. Service Mesh Routing: Weighted Directed Graph

In a service mesh (Istio, Linkerd), the network topology is modeled as a **weighted
directed graph** where:
- **Nodes** are services (or Pod endpoints).
- **Edges** represent allowed communication paths with weights representing traffic split percentages, latency, or priority.

Traffic routing decisions (canary deployments, A/B testing, fault injection) are
graph traversal problems. Envoy proxies (the data plane) implement routing tables
that are essentially adjacency lists with weights:

```
api-service → [(payments-v1, weight=90), (payments-v2, weight=10)]
                   90% of traffic            10% canary
```

This is directly analogous to **Dijkstra's shortest path** or **weighted random
selection** algorithms, depending on the routing strategy.

### 4. Pod Eviction: Priority Queue

When a node runs out of resources (memory pressure, disk pressure), the kubelet must
evict Pods to reclaim resources. It uses a **priority queue** (min-heap) ordered by:

1. **QoS class** — BestEffort (evict first) < Burstable < Guaranteed (evict last).
2. **Priority** — Lower `spec.priorityClassName` value = evicted first.
3. **Resource usage relative to request** — Pods using most above their request are evicted first.

This is a classic priority queue application where the eviction order is determined
by a composite key. The kubelet maintains this queue and pops the lowest-priority Pod
when resources must be reclaimed.

### 5. iptables DNAT: Hash Table for Packet Routing

kube-proxy (in iptables mode) programs the Linux kernel's netfilter to implement
Service load balancing. When a packet arrives destined for a Service's ClusterIP,
iptables performs **DNAT (Destination NAT)** — rewriting the destination IP to one of
the backing Pods.

The iptables chain for a Service uses **probability-based rules** (statistically
equivalent to consistent hashing). For a Service with 3 endpoints:

```
Chain KUBE-SVC-XXXXX (Service ClusterIP)
  -m statistic --mode random --probability 0.333 → DNAT to Pod-A
  -m statistic --mode random --probability 0.500 → DNAT to Pod-B
  (fallthrough)                                   → DNAT to Pod-C
```

Lookup is O(n) where n is the number of endpoints. For large clusters, this is why
**IPVS mode** (which uses a hash table for O(1) lookups) is preferred over iptables
mode.

### 6. Consistent Hashing: StatefulSet Pod-to-Storage Assignment

StatefulSets assign stable identities (pod-0, pod-1, pod-2) and persistent storage
to each replica. The mapping from Pod identity to PVC is a form of **consistent
hashing** — each Pod name deterministically maps to a specific PVC, and adding or
removing replicas only affects the tail of the sequence.

```
Scale from 3 to 5:
  pod-0 → pvc-0  (unchanged)
  pod-1 → pvc-1  (unchanged)
  pod-2 → pvc-2  (unchanged)
  pod-3 → pvc-3  (new)
  pod-4 → pvc-4  (new)

Scale from 5 to 3:
  pod-0 → pvc-0  (unchanged)
  pod-1 → pvc-1  (unchanged)
  pod-2 → pvc-2  (unchanged)
  (pod-3, pod-4 removed — pvc-3, pvc-4 retained for potential re-attach)
```

This property — that existing assignments are not disrupted when the set grows or
shrinks — is the defining characteristic of consistent hashing.

### 7. Deployment Rollout: Sliding Window

A RollingUpdate Deployment uses a **sliding window** algorithm to replace old Pods
with new ones. The window size is controlled by `maxSurge` and `maxUnavailable`:

```
Deployment: 5 replicas, maxSurge=1, maxUnavailable=1
Window: at any moment, between 4 (5-1) and 6 (5+1) Pods exist

Step 1: Create 1 new Pod (6 total: 5 old + 1 new)
Step 2: New Pod ready → Terminate 1 old Pod (5 total: 4 old + 1 new)
Step 3: Create 1 new Pod (6 total: 4 old + 2 new)
Step 4: New Pod ready → Terminate 1 old Pod (5 total: 3 old + 2 new)
...continues until all 5 are new...
```

This is a sliding window over the replica set — the window advances one step at a
time, maintaining the invariant that the total available replicas never drops below
`replicas - maxUnavailable`.

### 8. Watch/Notify: Event-Driven Pub-Sub with Long Polling

The Kubernetes API server implements a `watch` mechanism where clients (controllers,
kubelet, kubectl) can subscribe to changes on a resource type. This is an event-driven
**pub-sub** (publish-subscribe) pattern using HTTP long-polling (or WebSockets in
newer versions).

Internally, etcd maintains a **revision-ordered event log** (analogous to a
write-ahead log). Watchers specify a `resourceVersion` (offset in the log) and
receive all events after that point. This is structurally identical to Kafka's
consumer group model — a log-structured commit log with offset-based consumption.

```
Event log (etcd revisions):
  rev 100: Pod nginx created
  rev 101: Pod nginx status → Running
  rev 102: Service api-svc updated
  rev 103: Pod nginx deleted

Watcher (since rev 101):
  → receives: rev 101, 102, 103 (and future events as they arrive)
```

---

## Further Reading

### Official Documentation
- **[Kubernetes Official Documentation](https://kubernetes.io/docs/)** — The authoritative reference. Start with "Concepts" and "Tasks" sections. The API reference is invaluable once you are writing manifests.
- **[Kubernetes the Hard Way (Kelsey Hightower)](https://github.com/kelseyhightower/kubernetes-the-hard-way)** — Build a Kubernetes cluster from scratch, manually, without scripts. The single best exercise for understanding what every component does and why. Not for production, but transformative for learning.

### Books
- **"Kubernetes in Action" by Marko Luksa (2nd edition, Manning)** — The most comprehensive book on Kubernetes. Covers architecture, networking, storage, security, and custom resources in detail. Ideal for engineers who want deep understanding, not just recipes.
- **"Kubernetes Up & Running" by Brendan Burns, Joe Beda, Kelsey Hightower (O'Reilly, 3rd edition)** — Written by three Kubernetes co-creators. More concise than "Kubernetes in Action" and excellent as a second resource or a refresher.
- **"Production Kubernetes" by Josh Rosso, Rich Lander, Alex Brand, John Harris (O'Reilly)** — Focused specifically on running Kubernetes in production. Covers multi-tenancy, security hardening, networking, observability, and GitOps. Read this when you are past the basics and need to go to production.

### Helm and GitOps
- **[Helm Documentation](https://helm.sh/docs/)** — Official Helm docs. The "Chart Template Guide" is essential for writing your own charts.
- **[ArgoCD Documentation](https://argo-cd.readthedocs.io/)** — Complete reference for ArgoCD. The "Getting Started" guide and "Application" CRD reference are the most important sections.
- **[Flux Documentation](https://fluxcd.io/docs/)** — Official Flux docs. The "Get Started" and "Guides" sections cover all common workflows.

### Deep Dives
- **[Kubernetes Networking Deep Dive (Kubernetes.io blog)](https://kubernetes.io/docs/concepts/cluster-administration/networking/)** — Understand the cluster networking model, CNI plugins, and Service implementation.
- **[etcd.io](https://etcd.io/)** — Official etcd documentation. The "Learning" section covers Raft consensus and data model internals.
- **[The Illustrated Children's Guide to Kubernetes (CNCF)](https://www.cncf.io/phippy/)** — A lighthearted, visual introduction. Surprisingly effective for building initial mental models before diving into technical material.

### Practice Platforms
- **[Killer.sh](https://killer.sh/)** — Practice environments for CKA/CKAD certification exams. Excellent for building kubectl muscle memory under time pressure.
- **[KodeKloud](https://kodekloud.com/)** — Interactive labs with hands-on Kubernetes exercises. Good for structured learning with immediate feedback.
- **[Play with Kubernetes](https://labs.play-with-k8s.com/)** — Free, browser-based Kubernetes playground. No installation required — useful for quick experiments.
