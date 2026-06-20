# Linux Kernel Fundamentals for Cloud Engineers

> This document is a comprehensive guide to the Linux kernel internals that every cloud engineer, SRE, and platform engineer must understand. It covers the kernel's role as resource manager, the user/kernel space boundary, and the six subsystems that make containers possible: namespaces, cgroups, capabilities, seccomp, eBPF, and kernel networking. By the end, you will be able to inspect kernel state on a live system, explain how Docker and Kubernetes leverage these primitives, reason about container security boundaries, and connect kernel data structures to the algorithms that power them. Target audience: engineers with basic Linux CLI skills who want to go from "I can run containers" to "I understand what containers actually are."

---

## Table of Contents

1. [Why This Matters](#why-this-matters)
2. [Mental Models](#mental-models)
3. [Core Concepts](#core-concepts)
   - 3.1 [What the Kernel Is](#31-what-the-kernel-is)
   - 3.2 [Kernel Space vs User Space](#32-kernel-space-vs-user-space)
   - 3.3 [How the Kernel Boots](#33-how-the-kernel-boots)
   - 3.4 [Namespaces — Isolation Primitives](#34-namespaces--isolation-primitives)
   - 3.5 [cgroups — Resource Budgets](#35-cgroups--resource-budgets)
   - 3.6 [Capabilities — Fine-Grained Privileges](#36-capabilities--fine-grained-privileges)
   - 3.7 [seccomp — Syscall Filtering](#37-seccomp--syscall-filtering)
   - 3.8 [eBPF — Kernel Programmability](#38-ebpf--kernel-programmability)
   - 3.9 [/proc and /sys — Inspecting Kernel State](#39-proc-and-sys--inspecting-kernel-state)
   - 3.10 [Kernel Networking](#310-kernel-networking)
4. [Practical Use Cases](#practical-use-cases)
5. [Worked Examples](#worked-examples)
6. [Common Pitfalls & Misconceptions](#common-pitfalls--misconceptions)
7. [Summary & Key Takeaways](#summary--key-takeaways)
8. [Quick Reference Cheat Sheet](#quick-reference-cheat-sheet)
9. [DSA Connections](#dsa-connections)
10. [Further Reading](#further-reading)

---

## Why This Matters

When you type `kubectl run nginx --image=nginx`, a staggering amount of kernel machinery activates beneath the surface. The Kubernetes kubelet asks the container runtime (containerd or CRI-O) to create an isolated environment for your workload. That runtime does not use any magic — it calls the same Linux kernel APIs that have existed for over a decade: `clone()` with namespace flags, cgroup filesystem writes, seccomp BPF programs, and network device creation. If you do not understand these primitives, you are driving a car without knowing that it has brakes, a transmission, or a fuel system. You can operate it in fair weather, but the moment something breaks — a container escaping its memory limit, a pod unable to reach the network, a security policy silently dropping syscalls — you will be unable to diagnose, fix, or prevent the problem.

Here is why kernel knowledge specifically matters for cloud engineers:

- **Debugging production incidents.** When a container is OOM-killed, understanding cgroups v2 memory accounting tells you whether the limit was hit by the application, by kernel page cache charged to that cgroup, or by a memory leak in a sidecar. Without this, you are guessing.
- **Security posture.** Container isolation is not a hardware boundary — it is a set of kernel-level software walls. Knowing what namespaces isolate (and what they do not) is the difference between a secure cluster and one that can be trivially escaped.
- **Performance tuning.** CPU throttling in Kubernetes is governed by the CFS (Completely Fair Scheduler) bandwidth controller in cgroups. If you do not understand CFS periods and quotas, you will set resource limits that strangle your application.
- **Networking troubleshooting.** Every packet in a Kubernetes cluster traverses veth pairs, bridges, iptables chains, and conntrack tables — all kernel subsystems. When `curl` times out from one pod to another, you need to know where to look.
- **Adopting new technology.** Tools like Cilium (eBPF-based networking), Falco (eBPF-based security monitoring), and Kata Containers (lightweight VMs) are only comprehensible if you know what kernel primitives they replace or extend.

The kernel is not an academic curiosity. It is the runtime foundation of every container, every pod, and every node in your cluster. This document gives you the map.

---

## Mental Models

Before we dive into specifics, let us establish four mental models that will serve as your conceptual scaffolding throughout this document. Return to these whenever a new concept feels abstract.

### Mental Model 1: The Kernel as Resource Manager and Gatekeeper

![01-kernel diagram 1](assets/01-kernel-1.svg)

Think of the kernel as the **building superintendent** of a large apartment complex. Tenants (user-space processes) cannot directly touch the plumbing (hardware). They must submit requests to the superintendent (system calls), who decides whether to grant them and then does the actual work. The superintendent manages who lives where (process scheduling), how much water each tenant can use (cgroups), which floors they can access (namespaces), and what tools they are allowed to bring in (capabilities and seccomp).

### Mental Model 2: Namespaces as Virtual Walls Within a Building

Imagine a single physical office building. Normally, everyone can see every room, every hallway, every other person. **Namespaces** are like installing opaque walls and separate entrances so that each tenant believes they occupy the entire building alone. One tenant sees "PID 1" as their main process; another tenant also sees "PID 1" as theirs. Neither knows the other exists. The building is the same physical structure (one kernel), but each tenant has a private *view* of it.

There are seven types of walls (namespace types), each hiding a different resource: process IDs, network interfaces, mount points, hostnames, IPC queues, user IDs, and cgroup views.

### Mental Model 3: cgroups as Resource Budgets

If namespaces are the walls, **cgroups** are the utility meters. A namespace says "you cannot see your neighbor's processes." A cgroup says "you may use at most 512 MB of RAM and 0.5 CPU cores." Think of cgroups as the **departmental budget** in a company: each department (container) gets an allocation, and the finance team (kernel) enforces it. Overspend your memory budget, and you get terminated (OOM-killed). Overspend your CPU budget, and you get throttled (your time slices are withheld).

### Mental Model 4: The Syscall Boundary as a Customs Checkpoint

Every interaction between user space and kernel space goes through the **system call interface** — a narrow, well-defined gateway. Picture an international border crossing. You (a user-space process) want to send data across the network (access a kernel resource). You walk up to the customs checkpoint (invoke a system call like `sendto()`). The customs officer (kernel) inspects your request: Do you have the right paperwork (capabilities)? Is this item on the prohibited list (seccomp filter)? Is your passport valid (permission checks)? Only if everything clears does the kernel execute the operation on your behalf.

This mental model explains why containers are not VMs. A VM has its own customs checkpoint (its own kernel). A container shares the host's checkpoint — every container's syscalls go through the same kernel. The walls (namespaces) and budgets (cgroups) give the *illusion* of separation, but the checkpoint is shared. This is both the performance advantage and the security limitation of containers.

---

## Core Concepts

### 3.1 What the Kernel Is

The **kernel** is the core software component of an operating system that runs in a privileged CPU mode (ring 0 on x86) and has direct access to all hardware. It is loaded into memory at boot time and remains resident for the lifetime of the machine. Every other piece of software — from `systemd` to your web browser to a Kubernetes pod — runs in user space (ring 3) and depends on the kernel to mediate access to hardware resources.

The Linux kernel manages five fundamental resources:

| Resource | Kernel Subsystem | What It Does |
|----------|-----------------|--------------|
| **CPU time** | Process scheduler (CFS) | Decides which process runs on which core, for how long |
| **Memory** | Virtual memory manager (VMM) | Allocates pages, handles page faults, swaps to disk |
| **Storage** | Virtual Filesystem (VFS) + drivers | Provides a unified file API over ext4, XFS, NFS, overlayfs, etc. |
| **Network** | Network stack (TCP/IP, netfilter) | Manages sockets, routing tables, packet filtering |
| **Devices** | Device drivers + udev | Abstracts GPUs, NICs, block devices, USB, etc. |

The kernel is a **monolithic kernel with loadable modules**. "Monolithic" means all subsystems (scheduler, memory manager, filesystem, networking) run in the same address space in kernel mode — this is fast but means a bug in a driver can crash the whole system. "Loadable modules" means you can extend the kernel at runtime (e.g., loading a GPU driver) without recompiling the entire kernel.

```bash
# Check running kernel version
uname -r                      # e.g., 5.15.0-1056-aws

# List loaded kernel modules
lsmod                         # shows module name, size, and dependents

# Get detailed module info
modinfo overlay               # overlay filesystem module — used by Docker

# Count total loaded modules
lsmod | wc -l                 # typically 50-150 on a cloud VM
```

Output:
```
5.15.0-1056-aws
Module                  Size  Used by
overlay               151552  10
br_netfilter           32768  0
bridge                307200  1 br_netfilter
...
```

### 3.2 Kernel Space vs User Space

The CPU hardware enforces a privilege boundary called **protection rings**. On x86 processors:

- **Ring 0 (kernel space):** Full access to all CPU instructions, all memory, all hardware. The kernel runs here.
- **Ring 3 (user space):** Restricted. Cannot execute privileged instructions (e.g., writing to I/O ports), cannot access kernel memory. All applications run here.

![01-kernel diagram 2](assets/01-kernel-2.svg)

A **system call (syscall)** is the mechanism for crossing this boundary. When a user-space process needs to do anything involving hardware — read a file, allocate memory, send a network packet, create a new process — it must ask the kernel via a syscall. The x86-64 `syscall` instruction triggers a hardware-level transition from ring 3 to ring 0, saving the user-space context and jumping to the kernel's syscall handler.

**Context switching** is the broader term for the kernel saving one process's state (registers, program counter, stack pointer) and restoring another's. This happens thousands of times per second. A **mode switch** (user to kernel and back) occurs on every syscall. A **process context switch** occurs when the scheduler decides a different process should run.

```bash
# Count the number of system calls a command makes
strace -c ls /tmp              # summary of all syscalls made by `ls`

# Trace specific syscalls in real time
strace -e trace=open,read,write ls /tmp   # only show file-related syscalls

# See the syscall table your kernel supports
ausyscall --dump               # list all syscall numbers and names
```

Output (strace -c):
```
% time     seconds  usecs/call     calls    errors syscall
------ ----------- ----------- --------- --------- ----------------
 25.00    0.000050          10         5           openat
 20.00    0.000040           5         8           read
 15.00    0.000030           4         7           close
 10.00    0.000020           3         6           fstat
 ...
------ ----------- ----------- --------- --------- ----------------
100.00    0.000200                    56         3 total
```

> **Key insight:** Every container in a Kubernetes pod shares the host kernel. When a containerized process calls `write()`, that syscall is handled by the *host's* kernel, not a separate kernel. This is the fundamental difference between containers and virtual machines, and it is why kernel vulnerabilities can affect all containers on a node.

### 3.3 How the Kernel Boots

Understanding the boot process helps you debug nodes that fail to start and explains where `systemd`, which manages container runtimes, fits in.

![01-kernel diagram 3](assets/01-kernel-3.svg)

The **initrd (initial RAM disk)** or **initramfs (initial RAM filesystem)** is a small, temporary root filesystem loaded into memory alongside the kernel. It contains just enough drivers and tools to find and mount the real root filesystem. This solves a chicken-and-egg problem: the kernel needs a filesystem driver to read the disk, but the driver might be on the disk.

**`systemd`** is the most common **init system** on modern Linux distributions. It is PID 1 — the first user-space process the kernel starts. It manages service dependencies, starts daemons like `containerd` and `kubelet`, and is the ancestor of every process on the system. When Kubernetes' kubelet needs to start a pod, it communicates with `containerd`, which was started and supervised by systemd.

```bash
# Check the boot process
dmesg | head -50               # kernel ring buffer — earliest boot messages

# See systemd service tree
systemctl list-units --type=service --state=running   # all active services

# Check kubelet service
systemctl status kubelet       # is kubelet running? when did it start?

# See the initramfs contents
lsinitramfs /boot/initrd.img-$(uname -r) | head -20   # what's in the initrd
```

### 3.4 Namespaces — Isolation Primitives

A **namespace** wraps a global system resource in an abstraction that makes it appear to processes within the namespace that they have their own isolated instance of that resource. Namespaces are the *isolation* half of what makes containers work.

Linux provides seven namespace types:

| Namespace | Flag | Isolates | Container Relevance |
|-----------|------|----------|-------------------|
| **PID** | `CLONE_NEWPID` | Process IDs | Container sees its entrypoint as PID 1 |
| **Network (net)** | `CLONE_NEWNET` | Network interfaces, routing, iptables | Container gets its own `eth0`, IP, port space |
| **Mount (mnt)** | `CLONE_NEWNS` | Mount points | Container has its own filesystem tree |
| **UTS** | `CLONE_NEWUTS` | Hostname, domain name | Container can set its own hostname |
| **IPC** | `CLONE_NEWIPC` | System V IPC, POSIX message queues | Containers cannot access each other's shared memory |
| **User** | `CLONE_NEWUSER` | User/group IDs | UID 0 inside container can map to UID 65534 outside |
| **Cgroup** | `CLONE_NEWCGROUP` | Cgroup root view | Container sees its cgroup as the root |

When Docker or containerd creates a container, they call `clone()` (or `unshare()`) with a combination of these flags. The child process wakes up in a world where it is PID 1, has its own network stack, its own filesystem mounts, its own hostname — but it is still sharing the host kernel.

![01-kernel diagram 4](assets/01-kernel-4.svg)

```bash
# List all namespaces on the system
lsns                                    # shows NS type, PID, user, command

# Inspect namespaces of a specific process
ls -la /proc/1/ns/                      # PID 1's namespaces (symlinks with inode IDs)

# Compare two processes — same namespace = same inode number
readlink /proc/1/ns/net                 # e.g., net:[4026531840]
readlink /proc/$(pgrep nginx)/ns/net    # different inode = different net namespace

# Create a new namespace manually (useful for testing)
unshare --pid --fork --mount-proc bash  # new PID namespace — you are PID 1
ps aux                                  # only shows processes in this namespace
exit                                    # return to original namespace

# Enter an existing container's namespaces
nsenter -t $(pgrep nginx) -p -n -m     # enter PID, net, and mount NS of nginx
```

Output (lsns):
```
        NS TYPE   NPROCS    PID USER    COMMAND
4026531835 cgroup    145      1 root    /sbin/init
4026531836 pid       120      1 root    /sbin/init
4026531837 user      145      1 root    /sbin/init
4026531838 uts       120      1 root    /sbin/init
4026531839 ipc       120      1 root    /sbin/init
4026531840 net       120      1 root    /sbin/init
4026531841 mnt       100      1 root    /sbin/init
4026532197 mnt         2   3456 root    nginx: master process
4026532198 pid         2   3456 root    nginx: master process
4026532199 net         2   3456 root    nginx: master process
```

**How PID namespaces create the illusion of PID 1:**

When you run a container, the entrypoint process gets PID 1 *inside* the container's PID namespace. But from the host's perspective, that same process has a completely different PID (e.g., 28347). The kernel maintains a mapping. This is why `docker top <container>` shows host PIDs, while `docker exec <container> ps` shows container-local PIDs.

> **Critical insight for Kubernetes:** Pods in the same Kubernetes pod share the **network namespace** (they share `localhost` and the port space) but have separate PID namespaces by default. This is why containers in the same pod can communicate over `127.0.0.1` but cannot see each other's processes (unless `shareProcessNamespace: true` is set in the pod spec).

### 3.5 cgroups — Resource Budgets

**Control groups (cgroups)** are a kernel mechanism for organizing processes into hierarchical groups and applying resource limits, accounting, and prioritization to those groups. If namespaces answer "what can a process see?", cgroups answer "how much can a process use?"

There are two versions:

| Feature | cgroups v1 | cgroups v2 |
|---------|-----------|-----------|
| Hierarchy | Multiple trees (one per controller) | Single unified tree |
| Controllers | cpu, memory, blkio, net_cls, etc. | cpu, memory, io, pids, etc. |
| Delegation | Complex, error-prone | Clean, supports rootless containers |
| Pressure info | Not available | PSI (Pressure Stall Information) |
| Adoption | Legacy, still on older systems | Default on kernel 5.8+, used by systemd |

**cgroups v2** is the modern standard and what Kubernetes uses on recent distributions. It provides a single, unified hierarchy instead of the confusing multiple-hierarchy model of v1.

![01-kernel diagram 5](assets/01-kernel-5.svg)

The key controllers (resource limiters) are:

**CPU Controller:**
- `cpu.max`: Format `QUOTA PERIOD` (in microseconds). `"50000 100000"` means 50ms of CPU every 100ms = 50% of one core.
- `cpu.weight`: Relative priority (1-10000, default 100). Higher weight = more CPU when contending.
- In Kubernetes: `resources.limits.cpu: "500m"` translates to a quota of 50000 per 100000us period. `resources.requests.cpu` translates to `cpu.weight`.

**Memory Controller:**
- `memory.max`: Hard limit in bytes. Exceeding this triggers OOM kill.
- `memory.high`: Soft limit. Exceeding this triggers aggressive reclaim (slows the process).
- `memory.current`: Current usage.
- In Kubernetes: `resources.limits.memory: "512Mi"` sets `memory.max`.

**I/O Controller:**
- `io.max`: Per-device bandwidth and IOPS limits.
- `io.weight`: Relative I/O priority.

**PIDs Controller:**
- `pids.max`: Maximum number of processes in the cgroup. Prevents fork bombs.

```bash
# Check which cgroup version is in use
stat -fc %T /sys/fs/cgroup/              # returns "cgroup2fs" for v2, "tmpfs" for v1

# See cgroup membership of a process
cat /proc/self/cgroup                    # shows your shell's cgroup path

# Explore the cgroup hierarchy
ls /sys/fs/cgroup/                       # root cgroup directory

# Find a container's cgroup (by containerd container ID)
find /sys/fs/cgroup -name "*<container-id-prefix>*" -type d   # locate the cgroup dir

# Read current memory usage of a cgroup
cat /sys/fs/cgroup/kubepods.slice/kubepods-burstable.slice/kubepods-burstable-pod<uid>.slice/memory.current

# Read CPU limit
cat /sys/fs/cgroup/kubepods.slice/.../cpu.max   # e.g., "50000 100000" = 50% of 1 core

# Check memory limit
cat /sys/fs/cgroup/kubepods.slice/.../memory.max   # e.g., "536870912" = 512Mi

# List all processes in a cgroup
cat /sys/fs/cgroup/kubepods.slice/.../cgroup.procs   # PIDs in this cgroup

# Check OOM kill counter
cat /sys/fs/cgroup/kubepods.slice/.../memory.events   # shows oom_kill count

# PSI (Pressure Stall Information) — v2 only
cat /sys/fs/cgroup/kubepods.slice/.../cpu.pressure     # CPU starvation metrics
cat /sys/fs/cgroup/kubepods.slice/.../memory.pressure  # memory pressure metrics
```

Output (cat /proc/self/cgroup):
```
0::/user.slice/user-1000.slice/session-3.scope
```

Output (memory.events):
```
low 0
high 12
max 3
oom 1
oom_kill 1
```

> **Key insight:** Kubernetes' `requests` and `limits` map directly to cgroup settings. Requests affect scheduling decisions (which node has room?) and CPU weight (relative priority). Limits set hard caps via `cpu.max` and `memory.max`. Understanding this mapping lets you predict exactly how your pod will behave under resource contention.

### 3.6 Capabilities — Fine-Grained Privileges

Traditionally, Linux had a binary privilege model: you were either root (UID 0, all-powerful) or not root (restricted). **Capabilities** break root's privileges into approximately 40 distinct, independently grantable tokens. Instead of giving a process full root access, you grant only the specific capabilities it needs.

Some important capabilities for container engineers:

| Capability | What It Allows | Container Default |
|-----------|---------------|------------------|
| `CAP_NET_ADMIN` | Configure network interfaces, routing, firewall rules | Dropped |
| `CAP_NET_BIND_SERVICE` | Bind to ports below 1024 | Dropped (usually) |
| `CAP_SYS_ADMIN` | Mount filesystems, configure namespaces, set hostname, etc. — a "god" capability | Dropped |
| `CAP_SYS_PTRACE` | Trace/debug other processes | Dropped |
| `CAP_NET_RAW` | Use raw sockets (e.g., `ping`) | Granted by Docker, dropped by some Kubernetes policies |
| `CAP_CHOWN` | Change file ownership | Granted |
| `CAP_SETUID` | Change process UID | Granted |
| `CAP_KILL` | Send signals to other processes | Granted |

Docker drops many capabilities by default but still grants more than most containers need. Kubernetes `SecurityContext` allows you to further restrict them.

There are three capability sets per process:

- **Effective:** The capabilities the kernel actually checks when the process makes a privileged operation.
- **Permitted:** The maximum set the process could potentially have. Effective is always a subset of Permitted.
- **Inheritable:** Capabilities that can be passed to child processes through `execve()`.

```bash
# Show capabilities of the current shell
capsh --print                           # displays all capability sets

# Get capabilities of a running process
getpcaps $(pgrep containerd)            # shows effective capabilities of containerd

# Check capabilities of a specific binary
getcap /usr/bin/ping                    # e.g., cap_net_raw=ep

# Run a process with specific capabilities only
capsh --caps="cap_net_bind_service+eip" -- -c "python3 -m http.server 80"

# In Kubernetes, drop all capabilities and add only what's needed:
# securityContext:
#   capabilities:
#     drop: ["ALL"]
#     add: ["NET_BIND_SERVICE"]
```

Output (capsh --print):
```
Current: cap_chown,cap_dac_override,cap_fowner,cap_fsetid,cap_kill,cap_setgid,cap_setuid,cap_setpcap,cap_net_bind_service,cap_net_raw,cap_sys_chroot,cap_mknod,cap_audit_write,cap_setfcap=ep
Bounding set: ...
Ambient set: ...
...
```

> **Security principle:** Follow the principle of least privilege. Drop `ALL` capabilities and add back only what your application needs. Most web applications need zero capabilities. The habit of running with Docker's default capability set is a security gap that Kubernetes `PodSecurityStandards` (restricted profile) addresses.

### 3.7 seccomp — Syscall Filtering

**seccomp (Secure Computing Mode)** is a kernel facility that restricts which system calls a process is allowed to make. It operates at the syscall boundary — right at the "customs checkpoint" in our mental model. A seccomp filter is a BPF (Berkeley Packet Filter) program that inspects each syscall and decides: allow, deny (with an error code), kill the process, or log.

Why does this matter for containers? The Linux kernel exposes over 300 system calls. A typical web application uses maybe 50-80 of them. The remaining 200+ are attack surface — if a vulnerability in your application allows arbitrary code execution, the attacker can call dangerous syscalls like `mount()`, `reboot()`, `kexec_load()` (load a new kernel), or `init_module()` (load a kernel module). seccomp removes those tools from the attacker's toolbox entirely.

Docker applies a **default seccomp profile** that blocks approximately 44 dangerous syscalls while allowing the ~300 that most applications need. Kubernetes 1.27+ applies a `RuntimeDefault` seccomp profile by default when using the restricted `PodSecurityStandard`.

```bash
# Check seccomp status of a process
cat /proc/self/status | grep Seccomp    # 0 = disabled, 1 = strict, 2 = filter

# Check seccomp status of a container process
cat /proc/$(pgrep nginx)/status | grep Seccomp   # should show 2 (filter mode)

# View Docker's default seccomp profile
docker info --format '{{ .SecurityOptions }}'    # should show "seccomp"

# Run a container with no seccomp (dangerous — for testing only)
docker run --security-opt seccomp=unconfined alpine sh

# Trace which syscalls a container actually uses (to build a custom profile)
strace -c -f -p $(pgrep my-app) 2>&1 | tail -20   # frequency table of syscalls
```

Output (Seccomp check):
```
Seccomp:	2
Seccomp_filters:	1
```

A custom seccomp profile is a JSON file listing allowed syscalls:

```json
{
  "defaultAction": "SCMP_ACT_ERRNO",
  "architectures": ["SCMP_ARCH_X86_64"],
  "syscalls": [
    {
      "names": ["read", "write", "open", "close", "stat", "fstat",
                "mmap", "mprotect", "munmap", "brk", "rt_sigaction",
                "rt_sigprocmask", "ioctl", "access", "pipe", "select",
                "sched_yield", "mremap", "msync", "mincore", "madvise",
                "socket", "connect", "accept", "sendto", "recvfrom",
                "bind", "listen", "getsockname", "getpeername",
                "clone", "fork", "execve", "exit", "wait4",
                "kill", "getpid", "getppid", "getuid", "getgid",
                "gettid", "futex", "epoll_wait", "epoll_ctl",
                "openat", "newfstatat", "getrandom"],
      "action": "SCMP_ACT_ALLOW"
    }
  ]
}
```

> **Defense in depth:** seccomp is not a replacement for namespaces or capabilities — it is an additional layer. Even if an attacker gets `CAP_SYS_ADMIN` capability inside a container, a seccomp filter can still block the specific syscalls needed to escape. Each security layer addresses a different attack vector.

### 3.8 eBPF — Kernel Programmability

**eBPF (extended Berkeley Packet Filter)** is a technology that allows you to run sandboxed programs inside the Linux kernel without changing kernel source code or loading kernel modules. Think of it as a safe, restricted scripting language for the kernel. An eBPF program attaches to a **hook point** (a syscall entry, a network packet arrival, a function call inside the kernel) and runs a small, verified program each time that hook fires.

![01-kernel diagram 6](assets/01-kernel-6.svg)

eBPF is transformative for cloud engineers because of the tools built on it:

| Tool | Uses eBPF For | Replaces |
|------|--------------|---------|
| **Cilium** | Pod networking, network policy, load balancing | kube-proxy + iptables |
| **Falco** | Runtime security monitoring (syscall tracing) | auditd, manual log analysis |
| **Pixie** | Auto-instrumented observability (HTTP, gRPC, SQL) | Manual instrumentation, sidecars |
| **bpftrace** | Ad-hoc kernel and application tracing | dtrace, systemtap |
| **Tetragon** | Security-relevant event monitoring and enforcement | Complex audit rules |

The key eBPF concepts:

- **Verifier:** Before an eBPF program runs, the kernel verifier statically analyzes it to guarantee safety: no infinite loops, no out-of-bounds memory access, bounded execution time. If verification fails, the program is rejected.
- **JIT compiler:** Verified programs are compiled to native machine code for near-zero overhead.
- **Maps:** Shared data structures (hash maps, arrays, ring buffers) that allow eBPF programs to communicate with user space and with each other.
- **Hook points:** Locations in the kernel where eBPF programs can attach — XDP (eXpress Data Path, earliest network hook), tc (traffic control), kprobes (any kernel function), tracepoints (stable instrumentation points), and more.

```bash
# Check if eBPF is supported
uname -r                                # kernel 4.15+ for basic eBPF, 5.8+ for full features
ls /sys/fs/bpf/                         # BPF filesystem (if mounted)

# List loaded eBPF programs
bpftool prog list                       # shows all loaded eBPF programs

# List eBPF maps
bpftool map list                        # shows shared data structures

# Trace a kernel function with bpftrace (one-liner)
bpftrace -e 'tracepoint:syscalls:sys_enter_openat { printf("%s %s\n", comm, str(args->filename)); }'
# ^^ prints the process name and filename for every openat() call system-wide

# Check if Cilium is using eBPF for networking
cilium status                           # if using Cilium
cilium bpf endpoint list                # list eBPF-managed endpoints
```

> **Why eBPF matters for Kubernetes networking:** Traditional Kubernetes networking uses kube-proxy, which programs iptables rules for service load balancing. With thousands of services, this creates tens of thousands of iptables rules that must be linearly traversed for every packet. Cilium replaces this with eBPF hash maps, turning O(n) rule matching into O(1) lookups. On large clusters, this is a dramatic performance improvement.

### 3.9 /proc and /sys — Inspecting Kernel State

The kernel exposes its internal state through two virtual filesystems:

**`/proc`** — The **process information pseudo-filesystem.** It does not exist on disk; the kernel generates its contents on-the-fly when you read from it. Every running process has a directory `/proc/<pid>/` containing detailed information about that process.

**`/sys`** — The **sysfs filesystem.** It exposes kernel objects, their attributes, and relationships — hardware devices, drivers, kernel subsystems, and cgroup controllers.

Key `/proc` files:

| Path | Contains |
|------|---------|
| `/proc/<pid>/status` | Process state, UID, GID, capabilities, seccomp mode, memory usage |
| `/proc/<pid>/cgroup` | Cgroup membership |
| `/proc/<pid>/ns/` | Namespace inode links |
| `/proc/<pid>/cmdline` | Command line that started the process |
| `/proc/<pid>/environ` | Environment variables |
| `/proc/<pid>/fd/` | Open file descriptors (symlinks to actual files/sockets) |
| `/proc/<pid>/maps` | Memory mappings (shared libraries, heap, stack) |
| `/proc/<pid>/mountinfo` | Mount points visible to this process |
| `/proc/meminfo` | System-wide memory statistics |
| `/proc/cpuinfo` | CPU topology and features |
| `/proc/loadavg` | System load averages |
| `/proc/sys/` | Tunable kernel parameters (writable!) |

Key `/sys` paths:

| Path | Contains |
|------|---------|
| `/sys/fs/cgroup/` | cgroups v2 hierarchy |
| `/sys/class/net/` | Network interface information |
| `/sys/block/` | Block device information |
| `/sys/kernel/` | Kernel parameters and features |
| `/sys/devices/` | Physical device tree |

```bash
# Process investigation toolkit
cat /proc/$(pgrep nginx)/status         # full process status
cat /proc/$(pgrep nginx)/cgroup         # which cgroup is it in?
ls -la /proc/$(pgrep nginx)/ns/         # which namespaces?
cat /proc/$(pgrep nginx)/status | grep Seccomp   # seccomp status
ls -la /proc/$(pgrep nginx)/fd/ | wc -l          # how many open file descriptors?

# System-wide information
cat /proc/meminfo | head -10            # total, free, available, buffers, cached
cat /proc/loadavg                       # 1m, 5m, 15m load averages
cat /proc/cpuinfo | grep "model name" | head -1   # CPU model

# Tunable kernel parameters (sysctl)
cat /proc/sys/net/ipv4/ip_forward       # is IP forwarding enabled? (1 = yes)
cat /proc/sys/vm/swappiness             # how aggressively the kernel swaps
cat /proc/sys/kernel/pid_max            # maximum PID value

# Modify a kernel parameter (requires root)
echo 1 > /proc/sys/net/ipv4/ip_forward              # enable IP forwarding
sysctl -w net.ipv4.ip_forward=1                      # equivalent, more explicit
sysctl -a | grep net.bridge                          # all bridge-related params
```

> **Kubernetes node debugging:** When a node misbehaves, `/proc` and `/sys` are your first stop. `cat /proc/meminfo` tells you if the node is under memory pressure. `cat /sys/fs/cgroup/kubepods.slice/memory.pressure` tells you if pods are experiencing memory stalls. `ls /proc/$(pgrep kubelet)/fd/ | wc -l` tells you if kubelet is leaking file descriptors. These are not abstract — these are the commands you will run during a 3 AM incident.

### 3.10 Kernel Networking

Kubernetes networking is built entirely on kernel networking primitives. Understanding these primitives is essential for debugging service connectivity, network policies, and performance issues.

#### Virtual Ethernet Pairs (veth)

A **veth pair** is a pair of virtual network interfaces connected like a pipe — anything sent into one end comes out the other. Containers use veth pairs to connect their network namespace to the host network namespace.

![01-kernel diagram 7](assets/01-kernel-7.svg)

#### Linux Bridge

A **bridge** (e.g., `cbr0` or `docker0`) operates like a virtual network switch at Layer 2. It connects multiple veth endpoints so that containers on the same node can communicate directly.

#### Netfilter and iptables

**Netfilter** is the kernel's packet filtering framework. **iptables** is the user-space tool that configures netfilter rules. In Kubernetes, kube-proxy uses iptables (or IPVS) to implement Service load balancing — when a packet destined for a ClusterIP arrives, an iptables DNAT rule rewrites the destination to a pod IP.

![01-kernel diagram 8](assets/01-kernel-8.svg)

#### IP Routing

The kernel maintains a **routing table** that determines where packets go next based on their destination IP.

#### conntrack (Connection Tracking)

**conntrack** is a netfilter subsystem that tracks the state of network connections. It is essential for NAT (so return packets can be un-NAT'd) and for stateful firewalling. In Kubernetes, conntrack is critical for Service traffic — but it is also a common source of issues (conntrack table exhaustion under high traffic).

```bash
# List veth pairs and their namespace connections
ip link show type veth                   # all veth interfaces on the host

# Inspect the bridge
ip link show type bridge                 # list bridges
bridge link show                         # show which interfaces are plugged into bridges

# View routing table
ip route show                            # kernel routing table
ip route get 10.244.1.5                  # how would the kernel route to this IP?

# iptables rules (kube-proxy rules for Services)
iptables -t nat -L KUBE-SERVICES -n     # NAT rules for Kubernetes Services
iptables -t nat -L -n -v | head -50     # verbose NAT table

# conntrack
conntrack -L | head -20                  # list tracked connections
conntrack -C                             # count total tracked connections
cat /proc/sys/net/netfilter/nf_conntrack_max   # maximum table size
cat /proc/sys/net/netfilter/nf_conntrack_count # current entries

# Network namespace operations
ip netns list                            # list named network namespaces
ip netns exec <ns-name> ip addr show     # run command inside a network namespace

# Create a veth pair and bridge for experimentation
ip link add veth0 type veth peer name veth1   # create a veth pair
ip link add br0 type bridge                   # create a bridge
ip link set veth0 master br0                  # connect veth0 to bridge
ip link set br0 up                            # bring bridge up
ip link set veth0 up                          # bring veth0 up
```

> **Kubernetes networking insight:** When a pod on Node A sends a packet to a Service, here is what happens at the kernel level: (1) The packet exits the pod's veth into the host namespace. (2) An iptables DNAT rule in the PREROUTING chain rewrites the destination from the ClusterIP to a pod IP. (3) The routing table decides whether the pod is local (forward to bridge) or remote (send via the node's NIC to the overlay or underlay network). (4) conntrack records the mapping so that response packets are un-DNAT'd back to the ClusterIP.

---

## Practical Use Cases

### Use Case 1: Debugging OOM-Killed Containers

Your monitoring alerts that a pod was OOM-killed. Here is how kernel knowledge helps:

```bash
# Step 1: Find the cgroup that was OOM'd
dmesg | grep -i "oom"                    # kernel OOM killer messages
# Look for: "Memory cgroup out of memory: Killed process <pid> (java)"

# Step 2: Check the cgroup's memory limit and usage
# Find the cgroup path from dmesg output or:
cat /proc/$(pgrep java)/cgroup           # before the process was killed
cat /sys/fs/cgroup/kubepods.slice/.../memory.max     # the hard limit
cat /sys/fs/cgroup/kubepods.slice/.../memory.current # usage at OOM time

# Step 3: Check what's consuming memory
cat /sys/fs/cgroup/kubepods.slice/.../memory.stat    # detailed breakdown
# Look at: anon (heap), file (page cache), shmem (shared memory)

# Step 4: Check if kernel page cache is being charged to the cgroup
# memory.stat → "file" field shows page cache charged to this cgroup
# This can be surprising — if your app reads large files, the page cache
# is charged to the container's memory limit
```

### Use Case 2: Diagnosing CPU Throttling

Your application has latency spikes. CPU throttling by cgroups is a common culprit:

```bash
# Check if throttling is occurring
cat /sys/fs/cgroup/kubepods.slice/.../cpu.stat
# throttled_usec: total time the cgroup was throttled (microseconds)
# nr_throttled: number of times throttling occurred

# Check the configured limit
cat /sys/fs/cgroup/kubepods.slice/.../cpu.max
# "50000 100000" means 50ms of CPU every 100ms = 0.5 cores
# If your app occasionally bursts above 0.5 cores, it gets throttled

# Solution: increase cpu.max or set Kubernetes CPU limit higher
# Or: remove CPU limit entirely (controversial but common — Google's practice)
```

### Use Case 3: Investigating Container Escape Vectors

Security review of your container runtime configuration:

```bash
# Check if containers are running as root
ps -eo pid,user,comm | grep -E "containerd-shim"   # find container shim PIDs
cat /proc/<shim-pid>/status | grep -E "^(Uid|Gid|Cap)" # check effective UID

# Check namespace isolation — are any containers sharing the host PID namespace?
lsns -t pid                              # all PID namespaces
# If a container's PID namespace inode matches PID 1's, it's sharing host PID NS

# Check seccomp enforcement
for pid in $(cat /sys/fs/cgroup/kubepods.slice/.../cgroup.procs); do
    echo "PID $pid: $(cat /proc/$pid/status | grep Seccomp)"    # should show "2"
done

# Check capabilities — no container should have CAP_SYS_ADMIN
for pid in $(cat /sys/fs/cgroup/kubepods.slice/.../cgroup.procs); do
    getpcaps $pid 2>/dev/null             # list effective capabilities
done
```

### Use Case 4: Tracing Network Connectivity Issues Between Pods

A pod on node A cannot reach a pod on node B:

```bash
# Step 1: Verify the source pod's network namespace
PID=$(crictl inspect <container-id> | jq .info.pid)
nsenter -t $PID -n ip addr show          # check the pod's IP
nsenter -t $PID -n ip route show         # check the pod's routing table

# Step 2: Check the host's routing table
ip route show                            # does a route exist for the dest pod CIDR?

# Step 3: Check iptables for dropped packets
iptables -L -n -v | grep DROP            # any DROP rules matching?
iptables -t nat -L -n -v                 # are NAT rules correct?

# Step 4: Check conntrack for stale entries
conntrack -L -d <dest-pod-ip>            # any stale conntrack entries?
conntrack -D -d <dest-pod-ip>            # delete stale entries to fix

# Step 5: Check for packet loss on veth interfaces
ip -s link show veth<xxx>                # TX/RX errors, drops?
```

---

## Worked Examples

### Worked Example 1: Building a Container from Scratch (No Docker)

This example demonstrates that a "container" is just a process with namespaces and cgroups. We will create one using raw kernel APIs.

```bash
# === Step 1: Create a cgroup for resource limits ===

# Create a new cgroup directory
mkdir /sys/fs/cgroup/my-container        # creates a new cgroup

# Set memory limit to 100 MB
echo 104857600 > /sys/fs/cgroup/my-container/memory.max   # 100 * 1024 * 1024

# Set CPU limit to 25% of one core (25ms per 100ms period)
echo "25000 100000" > /sys/fs/cgroup/my-container/cpu.max

# Set PID limit (prevent fork bombs)
echo 64 > /sys/fs/cgroup/my-container/pids.max            # max 64 processes

# === Step 2: Create a minimal root filesystem ===

# Create a directory to serve as root
mkdir -p /tmp/container-root/{bin,proc,sys,dev,etc,tmp}

# Copy a statically linked shell (busybox has everything we need)
cp /bin/busybox /tmp/container-root/bin/
# Create symlinks for common commands
for cmd in sh ls ps cat echo mount mkdir ip hostname; do
    ln -s /bin/busybox /tmp/container-root/bin/$cmd
done

# === Step 3: Launch process in new namespaces ===

# unshare creates new namespaces and runs a command in them
# --pid:     new PID namespace (process sees itself as PID 1)
# --net:     new network namespace (isolated network stack)
# --mount:   new mount namespace (isolated filesystem mounts)
# --uts:     new UTS namespace (can set own hostname)
# --ipc:     new IPC namespace (isolated shared memory)
# --fork:    fork before exec (required for PID NS)
# --mount-proc: mount /proc in the new PID namespace
unshare --pid --net --mount --uts --ipc --fork --mount-proc \
    chroot /tmp/container-root /bin/sh -c '
        hostname my-container          # set container hostname
        echo "I am PID: $$"           # should print "I am PID: 1"
        ps aux                         # only shows processes in this namespace
        ls /proc                       # only our processes here
        echo "Container running!"
        exec /bin/sh                   # drop into interactive shell
    '

# === Step 4: Move the process into our cgroup (from host) ===
# In another terminal:
CONTAINER_PID=$(pgrep -f "my-container")              # find the container's host PID
echo $CONTAINER_PID > /sys/fs/cgroup/my-container/cgroup.procs  # assign to cgroup

# Verify
cat /sys/fs/cgroup/my-container/cgroup.procs           # should show the PID
cat /sys/fs/cgroup/my-container/memory.current          # current memory usage
```

Output:
```
I am PID: 1
PID   USER     TIME  COMMAND
    1 root      0:00 /bin/sh -c ...
    2 root      0:00 ps aux
Container running!
```

> **What you just saw** is fundamentally what Docker and containerd do, with additional layers: overlayfs for image layering, a more complete root filesystem, seccomp profiles, capability dropping, and SELinux/AppArmor integration. But the core mechanism is the same: `clone()`/`unshare()` with namespace flags + cgroup assignment.

### Worked Example 2: Tracing System Calls of a Kubernetes Pod

```bash
# Step 1: Find the container's PID on the node
CONTAINER_ID=$(crictl ps --name my-app -q)   # get container ID
PID=$(crictl inspect $CONTAINER_ID | jq .info.pid)   # get host PID

# Step 2: Trace all syscalls made by this process and its children
strace -f -p $PID -e trace=network -o /tmp/syscall-trace.log &
# -f: follow forks (trace child processes too)
# -p: attach to running process
# -e trace=network: only trace network-related syscalls
# -o: write output to file

# Step 3: Generate some traffic to the pod
curl http://<pod-ip>:8080/health

# Step 4: Stop tracing
kill %1                                       # stop the background strace

# Step 5: Analyze the trace
cat /tmp/syscall-trace.log
# You'll see: socket(), bind(), listen(), accept(), recvfrom(), sendto()
# Each syscall shows arguments and return values — invaluable for debugging
```

### Worked Example 3: Inspecting Kubernetes cgroup Hierarchy on a Node

```bash
# Step 1: Find the cgroup structure Kubernetes uses
ls /sys/fs/cgroup/kubepods.slice/
# Output: kubepods-besteffort.slice/  kubepods-burstable.slice/  ...

# Step 2: Find a specific pod's cgroup
# Pod UID is in the directory name
ls /sys/fs/cgroup/kubepods.slice/kubepods-burstable.slice/ | head -5
# Output: kubepods-burstable-pod<uid>.slice/

# Step 3: Find containers within the pod
POD_CGROUP="/sys/fs/cgroup/kubepods.slice/kubepods-burstable.slice/kubepods-burstable-pod<uid>.slice"
ls $POD_CGROUP
# Output: <container-id-1>/  <container-id-2>/  (one per container in the pod)

# Step 4: Read resource limits and usage
CONTAINER_CGROUP="$POD_CGROUP/<container-id>/"

echo "=== Memory ==="
echo "Limit: $(cat $CONTAINER_CGROUP/memory.max) bytes"                # hard limit
echo "Usage: $(cat $CONTAINER_CGROUP/memory.current) bytes"            # current usage
echo "OOM kills: $(cat $CONTAINER_CGROUP/memory.events | grep oom_kill)"

echo "=== CPU ==="
echo "Quota: $(cat $CONTAINER_CGROUP/cpu.max)"                         # quota period
echo "Stats: $(cat $CONTAINER_CGROUP/cpu.stat)"                        # usage, throttled

echo "=== PIDs ==="
echo "Current: $(cat $CONTAINER_CGROUP/pids.current)"                  # active processes
echo "Max: $(cat $CONTAINER_CGROUP/pids.max)"                          # limit
echo "Processes: $(cat $CONTAINER_CGROUP/cgroup.procs | wc -l)"        # count
```

Output:
```
=== Memory ===
Limit: 536870912 bytes
Usage: 234881024 bytes
OOM kills: oom_kill 0

=== CPU ===
Quota: 100000 100000
Stats: usage_usec 4523120
       user_usec 3210000
       system_usec 1313120
       nr_periods 45231
       nr_throttled 127
       throttled_usec 982300

=== PIDs ===
Current: 12
Max: max
Processes: 12
```

---

## Common Pitfalls & Misconceptions

### Pitfall 1: "Containers Are Lightweight VMs"

This is the most dangerous misconception. Containers are **not** VMs. A VM has its own kernel running on virtualized hardware. A container shares the host kernel. The implications:

- A kernel vulnerability (e.g., CVE in a syscall handler) affects **all** containers on the node. In a VM, each guest has a separate kernel.
- Namespace isolation is software-level. A misconfigured container (e.g., running with `--privileged`) can escape to the host with a single `nsenter` command.
- The `/proc` filesystem inside a container shows some host information by default — notably, `/proc/meminfo` shows **host** memory, not the container's cgroup limit. This causes applications (especially JVMs and Go runtime) to misdetect available memory. Kubernetes addresses this with the **Downward API** and tools like `cgroup-aware` runtimes.

### Pitfall 2: "CPU Limits Prevent My App from Using More CPU"

This is technically true but misleadingly simple. CPU limits in Kubernetes use CFS bandwidth control, which works on a **period** basis (default 100ms). If your limit is 500m (half a core), you get 50ms of CPU per 100ms period. If your application does a burst of CPU work for 50ms, it is fine. But if a single request needs 60ms of CPU, it will be **throttled** for 40ms until the next period. This introduces **latency spikes** even when the node has idle CPUs.

![01-kernel diagram 9](assets/01-kernel-9.svg)

Many organizations (including Google) set CPU **requests** but not CPU **limits**, relying on the scheduler for fair sharing rather than hard throttling.

### Pitfall 3: "My Container Uses Only 200 MB of Memory — Why Did It Get OOM-Killed at 512 MB?"

The kernel charges **page cache** to the container's memory cgroup. When your application reads files from disk, the kernel caches those pages in memory for performance. This cached data is charged to your cgroup's memory usage. Your application's heap may be 200 MB, but if it reads 400 MB of files, the page cache pushes total usage to 600 MB, exceeding the 512 MB limit.

```bash
# Check the breakdown
cat /sys/fs/cgroup/kubepods.slice/.../memory.stat
# anon 209715200      <-- heap/stack: 200 MB (your application)
# file 419430400      <-- page cache: 400 MB (file reads cached by kernel)
# Total: 600 MB → exceeds 512 MB limit → OOM
```

In cgroups v2, the kernel tries to reclaim page cache before killing the process, but under sudden memory pressure, it may not reclaim fast enough.

### Pitfall 4: "Running as Non-Root in the Container Makes It Secure"

Running as a non-root user inside the container is necessary but not sufficient. If the container has `CAP_SYS_ADMIN` (e.g., via `--privileged` flag), the non-root user can elevate privileges. If user namespaces are not enabled, UID 0 inside the container is UID 0 on the host — the non-root user only needs to find a way to become UID 0 inside the container (which may be easier than you think if writable setuid binaries exist).

True container security requires layers: non-root user + user namespace remapping + dropped capabilities + seccomp profile + read-only root filesystem + no-new-privileges flag.

### Pitfall 5: "Namespaces Isolate Everything"

Namespaces isolate specific resources, not everything. Notable gaps:

- **Kernel:** Shared. A kernel panic in one container takes down the node.
- **Time:** Not namespaced (until kernel 5.6+ time namespace, which is not widely used). A container with `CAP_SYS_TIME` can change the host clock.
- **`/proc/meminfo`, `/proc/cpuinfo`:** Show host values, not container-local values (partially addressed by LXCFS).
- **Kernel keyring:** Shared by default across containers.
- **Some kernel parameters (`/proc/sys/`):** Shared unless namespaced by the specific subsystem.

### Pitfall 6: "conntrack Table Exhaustion"

On busy Kubernetes nodes with thousands of connections (especially with NodePort or LoadBalancer services), the conntrack table can fill up. When it does, new connections are **silently dropped** with no error visible to the application — it just looks like network timeouts.

```bash
# Check conntrack usage
cat /proc/sys/net/netfilter/nf_conntrack_count   # current entries
cat /proc/sys/net/netfilter/nf_conntrack_max     # maximum (default often 65536)

# If count approaches max, increase the limit:
sysctl -w net.netfilter.nf_conntrack_max=262144  # increase to 256K
```

---

## Summary & Key Takeaways

The Linux kernel is not an abstraction layer you can safely ignore as a cloud engineer — it is the concrete foundation on which every container, pod, and cluster runs. Here is what you should now understand:

**The kernel is a resource manager and gatekeeper.** It mediates all access to hardware through the syscall interface. Every container operation — networking, file I/O, process creation — is a kernel operation.

**Kernel space and user space are hardware-enforced.** The CPU's protection rings create a hard boundary. Syscalls are the only way across. This is why `strace` is one of your most powerful debugging tools.

**Containers are not VMs.** They are processes with namespace isolation and cgroup resource limits, sharing the host kernel. This gives them performance advantages and security limitations.

**Six subsystems make containers possible:**

| Subsystem | Purpose | One-Sentence Summary |
|-----------|---------|---------------------|
| Namespaces | Isolation | "What can this process see?" |
| cgroups | Resource limits | "How much can this process use?" |
| Capabilities | Privilege model | "Which privileged operations can this process perform?" |
| seccomp | Syscall filtering | "Which syscalls can this process make?" |
| eBPF | Kernel programmability | "How can we extend kernel behavior without modules?" |
| Networking (netfilter, veth, bridges) | Packet handling | "How do packets flow between containers?" |

**You should now be able to:**

- [ ] Explain the difference between containers and VMs at the kernel level
- [ ] Inspect a container's namespace membership, cgroup limits, capabilities, and seccomp mode
- [ ] Debug OOM kills by reading cgroup memory stats
- [ ] Diagnose CPU throttling by reading cgroup CPU stats
- [ ] Trace network packets through veth pairs, bridges, and iptables chains
- [ ] Explain why eBPF tools like Cilium outperform iptables-based kube-proxy
- [ ] Build a minimal "container" using `unshare`, `chroot`, and cgroup filesystem writes
- [ ] Assess container security by auditing capabilities and seccomp status

---

## Quick Reference Cheat Sheet

### Process & Namespace Inspection

```bash
lsns                                     # list all namespaces on the system
ls -la /proc/<pid>/ns/                   # show namespace inodes for a process
readlink /proc/<pid>/ns/net              # get net namespace inode ID
nsenter -t <pid> -p -n -m -- <cmd>       # enter PID, net, mount NS of a process
unshare --pid --fork --mount-proc bash   # create new PID namespace for testing
```

### cgroup Inspection

```bash
stat -fc %T /sys/fs/cgroup/              # check cgroup version (cgroup2fs = v2)
cat /proc/<pid>/cgroup                   # show process cgroup membership
cat /sys/fs/cgroup/.../memory.max        # hard memory limit (bytes)
cat /sys/fs/cgroup/.../memory.current    # current memory usage
cat /sys/fs/cgroup/.../memory.stat       # detailed memory breakdown
cat /sys/fs/cgroup/.../memory.events     # OOM kill count
cat /sys/fs/cgroup/.../cpu.max           # CPU quota and period
cat /sys/fs/cgroup/.../cpu.stat          # CPU usage and throttle stats
cat /sys/fs/cgroup/.../pids.current      # number of processes in cgroup
cat /sys/fs/cgroup/.../cpu.pressure      # PSI CPU pressure (v2 only)
cat /sys/fs/cgroup/.../memory.pressure   # PSI memory pressure (v2 only)
```

### Capabilities & Security

```bash
capsh --print                            # show current shell capabilities
getpcaps <pid>                           # show capabilities of a process
getcap /path/to/binary                   # show file capabilities
cat /proc/<pid>/status | grep Seccomp    # 0=off, 1=strict, 2=filter
cat /proc/<pid>/status | grep Cap        # capability bitmasks (hex)
```

### Networking

```bash
ip link show type veth                   # list veth interfaces
ip link show type bridge                 # list bridges
bridge link show                         # show bridge members
ip route show                            # routing table
ip route get <dest-ip>                   # test route resolution
iptables -t nat -L -n -v                 # NAT rules (kube-proxy)
conntrack -L                             # list tracked connections
conntrack -C                             # count tracked connections
cat /proc/sys/net/netfilter/nf_conntrack_max   # conntrack table max size
ip netns list                            # list named network namespaces
ip netns exec <ns> <cmd>                 # run command in a network namespace
```

### Kernel & System

```bash
uname -r                                 # kernel version
dmesg | tail -50                         # kernel ring buffer (recent)
lsmod                                    # loaded kernel modules
sysctl -a                                # all kernel parameters
strace -c -f -p <pid>                    # syscall frequency summary
cat /proc/meminfo                        # system memory stats
cat /proc/loadavg                        # system load averages
cat /proc/cpuinfo | grep "model name"    # CPU model
bpftool prog list                        # loaded eBPF programs
bpftool map list                         # eBPF maps
```

---

## DSA Connections

The Linux kernel is a treasure trove of applied data structures and algorithms. Understanding these connections deepens both your kernel knowledge and your appreciation for why certain algorithms exist. Here are five of the most important:

### 1. Process Tree — N-ary Tree

Every process in Linux has exactly one parent (except PID 1, which is the root). This forms an **n-ary tree** (each node can have any number of children). The `task_struct` in the kernel contains a `parent` pointer and a `children` list.

```
              PID 1 (systemd)
             /       |        \
        PID 100   PID 200   PID 300
        (sshd)   (containerd) (kubelet)
        /    \        |
   PID 101  PID 102  PID 201
   (bash)   (bash)   (containerd-shim)
     |                    |
   PID 103              PID 202
   (vim)                (nginx)
```

**Why this matters:** When you `kill -9` a process, the kernel must reparent its children (they become children of PID 1 or the nearest subreaper). When Kubernetes sends SIGTERM to a pod, the signal propagation follows this tree. The `pstree` command visualizes this structure directly.

```bash
pstree -p 1 | head -20                  # visualize the process tree from PID 1
```

### 2. Memory Allocator — Buddy System and Slab Allocator (Free Lists)

The kernel manages physical memory pages using the **buddy system allocator**, which is fundamentally built on **free lists** — one list per order of allocation (order 0 = 4KB page, order 1 = 8KB, order 2 = 16KB, ..., up to order 10 = 4MB).

```
 Buddy System Free Lists:
 
 Order 0 (4KB):   [page] → [page] → [page] → [page] → ...
 Order 1 (8KB):   [page-pair] → [page-pair] → ...
 Order 2 (16KB):  [page-quad] → [page-quad] → ...
 ...
 Order 10 (4MB):  [page-block] → ...
```

When a 4KB allocation is needed, the allocator takes from the order-0 list. If it is empty, it splits an order-1 block into two order-0 blocks. When adjacent blocks are freed, they are **merged** (buddied) back together. This splitting and merging is O(log n) in the number of orders.

On top of the buddy allocator sits the **slab allocator** (SLUB in modern kernels), which caches frequently allocated fixed-size objects (e.g., `task_struct`, `inode`, `dentry`). Each slab is a page (or pages) divided into slots of the same size, managed by a **free list** within the slab.

```bash
cat /proc/buddyinfo                      # free pages per order per zone
cat /proc/slabinfo | head -20            # slab allocator statistics
slabtop                                  # interactive slab monitor
```

### 3. VFS Inode Table — Hash Map

The **Virtual Filesystem (VFS)** layer maintains an **inode cache** — a hash table that maps (device, inode number) pairs to in-memory `inode` structs. When you access a file, the kernel first checks this hash table for a cached inode. If found (cache hit), it avoids reading from disk. If not, it reads the inode from the filesystem and inserts it into the hash table.

```
 VFS Inode Cache (Hash Map):
 
 Hash function: hash(device_id, inode_number) → bucket_index
 
 Bucket 0:  → [inode(dev=sda1, ino=1234)] → [inode(dev=sda1, ino=5678)]
 Bucket 1:  → [inode(dev=sda2, ino=42)]
 Bucket 2:  → (empty)
 Bucket 3:  → [inode(dev=sda1, ino=91011)] → [inode(dev=sda1, ino=121314)]
 ...
```

This is a classic example of using hash maps for O(1) average-case lookup in a performance-critical path. Every file operation in the kernel hits this cache.

```bash
cat /proc/slabinfo | grep inode          # inode slab allocations
# e.g., ext4_inode_cache, proc_inode_cache — each filesystem has its own inode cache
```

### 4. Page Table — Trie / Radix Tree

Virtual-to-physical address translation uses a **multi-level page table**, which is structurally a **trie** (prefix tree). On x86-64, there are 4 or 5 levels (PGD → P4D → PUD → PMD → PTE), each level indexing a portion of the virtual address bits.

![01-kernel diagram 10](assets/01-kernel-10.svg)

Each level of the page table uses 9 bits of the virtual address as an index into a 512-entry table. This is a radix-256 trie (well, radix-512 at each level). The kernel also uses a data structure literally called `struct radix_tree` (now `struct xarray`) for page cache lookups, mapping file offsets to pages — another trie.

**Why this matters:** When a container accesses memory, the CPU walks this trie structure. TLB (Translation Lookaside Buffer) misses force a full page-table walk. Containers with large working sets can suffer TLB pressure, which is why Kubernetes supports **huge pages** (2MB or 1GB pages that reduce the number of page table entries).

### 5. Scheduler Run Queue — Red-Black Tree

The **Completely Fair Scheduler (CFS)** organizes runnable processes in a **red-black tree** (a self-balancing binary search tree), ordered by **virtual runtime** (`vruntime`). The process with the smallest `vruntime` (the one that has been given the least CPU time relative to its weight) is the leftmost node in the tree and is always the next to run.

```
 CFS Red-Black Tree (ordered by vruntime):
 
              [P3: vruntime=50]  (black)
              /                \
     [P1: vruntime=30]    [P5: vruntime=80]  (red)
     (red)        \            /
            [P2: vruntime=40] [P4: vruntime=60]
            (black)           (black)
 
 Leftmost node (P1, vruntime=30) runs next.
 
 Insertion: O(log n)
 Find-minimum (leftmost): O(1) — cached pointer
 Deletion: O(log n)
```

Red-black trees guarantee O(log n) insertion and deletion, making scheduling decisions fast even with thousands of runnable processes. The leftmost node is cached, making the "pick next task" operation O(1).

**Why this matters for Kubernetes:** When you set `resources.requests.cpu` on a pod, Kubernetes translates this to a CFS weight (via `cpu.weight` in cgroups). Higher weight means the scheduler gives that process a lower `vruntime` growth rate, so it ends up further to the left in the red-black tree and gets scheduled more often. This is how CPU requests provide proportional sharing without hard limits.

```bash
# See scheduler statistics for a process
cat /proc/<pid>/sched                    # CFS statistics including vruntime
# Includes: nr_switches, se.vruntime, se.sum_exec_runtime, etc.
```

---

## Further Reading

### Books

- **"Understanding the Linux Kernel" by Daniel P. Bovet & Marco Cesati** — The definitive deep dive into kernel internals. Dense but comprehensive. Best for: when you want to understand any subsystem in detail (scheduler, memory, filesystem). Focus on the chapters relevant to your current problem rather than reading cover-to-cover.

- **"Linux Kernel Development" by Robert Love** — More accessible than Bovet & Cesati. Covers process management, scheduling, memory, VFS, and block I/O. Best for: a first book on kernel internals if you find the Bovet book too dense.

- **"Container Security" by Liz Rice** — Covers namespaces, cgroups, capabilities, seccomp, and AppArmor/SELinux from a container security perspective. Best for: understanding exactly how container isolation works and where it can fail. Practical and cloud-focused.

- **"BPF Performance Tools" by Brendan Gregg** — The reference for eBPF-based observability and tracing. Covers bpftrace, BCC tools, and custom eBPF programs. Best for: production debugging and performance analysis on Kubernetes nodes.

- **"Systems Performance" by Brendan Gregg** — Covers CPU, memory, disk, and network performance from the kernel perspective. Best for: when you need to understand why a system is slow and how to measure it.

### Online Resources

- **kernel.org documentation (https://www.kernel.org/doc/html/latest/)** — The official kernel documentation. Specifically useful: Documentation/admin-guide/cgroup-v2.rst for cgroups v2, Documentation/networking/ for the network stack. Best for: authoritative reference when you need exact kernel behavior.

- **Brendan Gregg's blog (https://www.brendangregg.com/)** — The single best resource for Linux performance analysis. His articles on eBPF, CPU flame graphs, and "Linux Performance" checklist are essential bookmarks. Best for: practical performance debugging methodology.

- **man7.org Linux man pages (https://man7.org/linux/man-pages/)** — Michael Kerrisk's comprehensive man pages, especially the "overview" pages like namespaces(7), cgroups(7), capabilities(7). Best for: precise semantics of kernel APIs.

- **Julia Evans' blog and zines (https://jvns.ca/)** — Brilliant explanations of `strace`, networking, and Linux fundamentals through comics and clear writing. Best for: building intuition quickly. Her "bite-size" approach complements this document's depth.

- **Cilium documentation (https://docs.cilium.io/)** — Best resource for understanding eBPF-based Kubernetes networking in practice. The "Concepts" section explains how eBPF replaces iptables. Best for: understanding modern Kubernetes networking architecture.

- **Kubernetes documentation on container runtime (https://kubernetes.io/docs/concepts/containers/)** — Official docs on how Kubernetes interacts with the container runtime and thus the kernel. Best for: connecting kernel primitives to Kubernetes configuration.

### Hands-On Labs

- **"Containers from Scratch" talk by Liz Rice (YouTube)** — A live-coded demo building a container in Go using namespace and cgroup syscalls. Best for: seeing the kernel APIs in action, reinforcing that containers are just processes.

- **Play with Docker (https://labs.play-with-docker.com/)** — Free browser-based Docker environment. Best for: experimenting with namespace and cgroup inspection commands without risking your own system.

- **Katacoda / Killercoda Kubernetes scenarios** — Interactive browser-based labs for Kubernetes and Linux topics. Best for: guided practice with the exact commands covered in this document.
