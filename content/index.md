# Learning

A personal knowledge base of deep-dive engineering notes — written to *understand*
systems from first principles, not just to use them. Each topic is broken down
session by session, building intuition from the ground up.

## Contents

### [`bridgeonline/`](./bridgeonline) — Building a real-time multiplayer Bridge game

A session-by-session developer guide covering the design and implementation of
**BridgeOnline**: a four-player, real-time Contract Bridge web app. The notes trace
the whole system — domain logic, real-time sync, persistence, voice, testing, and
the bugs found along the way.

| Module | Topic |
|---|---|
| [00 — Project Overview](./bridgeonline/00-project-overview.md) | What the app is and why it's worth studying |
| [01 — Architecture & Design](./bridgeonline/01-architecture-and-design.md) | How the system fits together |
| [02 — Game Logic as Pure Functions](./bridgeonline/02-game-logic-pure-functions.md) | Bridge rules and DSA inside the engine |
| [03 — Database Design with Prisma](./bridgeonline/03-database-prisma.md) | Schema, FK constraints, ORMs |
| [04 — Real-Time with Socket.io](./bridgeonline/04-realtime-socketio.md) | Events, rooms, pub-sub, state sync |
| [05 — Testing Strategy](./bridgeonline/05-testing-strategy.md) | Unit → Integration → E2E |
| [06 — WebRTC & Voice Chat](./bridgeonline/06-webrtc-voice.md) | P2P, SDP, ICE, mesh topology |
| [07 — Scalability](./bridgeonline/07-scalability.md) | Redis, queues, reconnection, observability |
| [08 — TypeScript & Next.js Patterns](./bridgeonline/08-typescript-nextjs-patterns.md) | Async params, Prisma JSON, enum narrowing |
| [09 — Game State Bugs & Defensive Coding](./bridgeonline/09-game-state-bugs-and-defensive-coding.md) | Guard clauses, spec tests, API testing |
| [10 — E2E, Playwright & Node.js 24](./bridgeonline/10-e2e-playwright-nodejs24.md) | webServer env, CDP, multi-browser contexts |
| [11 — Full Game Simulation & Play-Route Bugs](./bridgeonline/11-full-game-simulation-and-play-route-bugs.md) | End-to-end play debugging |
| [12 — Turn Order Fix & Passed-Out UI](./bridgeonline/12-turn-order-fix-and-passed-out-ui.md) | Turn order, passed-out hand handling |

### [`cloud/`](./cloud) — Cloud computing & Kubernetes from first principles

Notes on the mental models, architecture, and mechanics of modern cloud computing.

- **[`basic_learning.md`](./cloud/basic_learning.md)** — Cloud from first principles to production
- **[`MentalModels/`](./cloud/MentalModels)** — Utility model, statistical multiplexing, virtualization, fault tolerance, networking, elasticity, cost
- **[`Architecture/`](./cloud/Architecture)** — Global infra, compute, storage, networking, load balancing, databases, serverless, containers, security, observability
- **[`kubernetes/`](./cloud/kubernetes)** — The ladder from kernel → OS → VM → Docker → Kubernetes

## How these notes are written

Each document explains *why* a thing exists before *how* it works, builds on the
previous one, and assumes strong DSA fundamentals. `DOUBTS.md` files capture open
questions worth revisiting.
