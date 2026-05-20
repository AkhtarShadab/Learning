# AgentDesk Plugin System
## How Plugins Work, Configuration, and Usage Patterns

---

## The Mental Model: Plugins as Capability Extensions

Think of AgentDesk's base system as a **coordination engine** — it tracks tasks, agents, comments, and files. Plugins are the **capability extensions** that connect this engine to the outside world or add specialized behaviors.

```
┌─────────────────────────────────────┐
│         AgentDesk Core              │
│  (tasks, agents, files, schedules)  │
└──────────────┬──────────────────────┘
               │ plugin interface
    ┌──────────┴──────────┐
    │                     │
┌───▼──────┐    ┌────────▼────────┐
│ Connector │    │ Skill / Behavior│
│  Plugins  │    │    Plugins      │
│(Notion,   │    │(cron, webhooks, │
│ Telegram) │    │ custom agents)  │
└──────────┘    └────────────────┘
```

Plugins come in two flavors:
1. **Connector plugins** — bridge AgentDesk to external services (see `connectors.md`)
2. **Skill/behavior plugins** — extend what agents can do (custom scripts, MCP servers, tool bundles)

---

## Claude Code Skills as Agent Plugins

The primary plugin mechanism for Claude Code agents is the **skills system** — scripts stored in `~/.claude/skills/` that extend what an agent can do.

### Anatomy of a Skill

```
~/.claude/skills/
└── agent-desk/           ← skill directory (the plugin)
    ├── SKILL.md          ← capability manifest (what this skill does)
    ├── ad-common         ← shared config/utilities sourced by other scripts
    ├── ad-tasks          ← individual command scripts
    ├── ad-task
    ├── ad-comment
    ├── ad-status
    ├── .url              ← runtime config (AgentDesk base URL)
    └── .token            ← auth token (written by installer)
```

### How Skills Are Invoked

Claude Code invokes skills through the `Skill` tool:

```
Skill({ skill: "agent-desk" })
```

This loads the skill's SKILL.md into the agent's context, making all the `ad-*` commands available. The agent then calls those commands via `Bash`.

---

## Configuring Skills/Plugins

### Runtime Configuration Files

Skills use convention-based config files in their directory:

| File | Purpose | Example |
|------|---------|---------|
| `.url` | Service base URL | `http://localhost:3838` |
| `.token` | Auth token | `f0dfbdf79b9e04d8...` |
| `SKILL.md` | Capability manifest loaded into agent context | Full docs/API reference |
| `ad-common` | Shared bash utilities sourced by scripts | Auth wrapper, URL resolution |

**Pattern:** Config files use a resolution hierarchy — environment variable → skill-dir file → fallback. This lets you override at deploy time without editing files:

```bash
AGDESK_URL=http://prod-server:3838 AGDESK_TOKEN=mytoken ad-tasks proj123
```

### Installing a New Skill

Skills are typically installed by copying their directory into `~/.claude/skills/`:

```bash
# Manual install
cp -r /path/to/my-skill ~/.claude/skills/my-skill

# Or via npm (for packaged skills)
npm install -g @zish/agent-desk  # installs and copies skill files
```

After install, the skill is immediately available to Claude Code via the `Skill` tool.

---

## MCP Servers as Plugins

Model Context Protocol (MCP) servers are a more powerful plugin type — they expose tools directly to Claude's tool-use interface.

### How MCP Plugins Work

```
Claude Code
    │
    ├── Built-in tools (Read, Write, Bash, ...)
    │
    └── MCP tools (via MCP server connection)
         ├── mcp__chrome-devtools__take_screenshot
         ├── mcp__chrome-devtools__navigate_page
         └── ... (all mcp__ prefixed tools)
```

MCP servers run as separate processes and communicate with Claude Code over a protocol. When active, their tools appear alongside built-in tools.

### Configuring MCP Servers

MCP servers are configured in `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "node",
      "args": ["/path/to/chrome-devtools-mcp/index.js"],
      "env": {
        "CDP_URL": "http://localhost:9222"
      }
    }
  }
}
```

### Available MCP Plugins

| MCP Plugin | Purpose |
|-----------|---------|
| `chrome-devtools` | Browser automation (click, fill, screenshot, evaluate JS) |
| Custom MCPs | Any capability you add via settings.json |

---

## AgentDesk Integration Plugins

AgentDesk has a first-class integration system for connecting to external services. These are "connector plugins" — see `connectors.md` for the full guide. The high-level plugin model:

```
AgentDesk integrations registry
    ├── notion     (status: connected/disconnected)
    ├── telegram   (status: connected/disconnected)
    └── ... (more coming)
```

Each integration plugin:
1. Stores credentials in AgentDesk's secure store
2. Runs a service (polling, webhook listener) that bridges events
3. Exposes `ad-<service>-*` commands to agents

---

## Writing a Custom Skill

When you need a capability that doesn't exist, you can write a skill:

### Minimal Skill Structure

```
~/.claude/skills/my-skill/
├── SKILL.md          ← required: tells Claude what this skill does
└── my-command        ← executable bash/python/node scripts
```

### SKILL.md Template

```markdown
# My Skill

## What it does
One paragraph explaining the capability this skill provides.

## Commands

| Command | Usage | Purpose |
|---------|-------|---------|
| `my-command` | `my-command <arg>` | Does X |

## Configuration
- `.url` — base URL for the service
- `.token` — API auth token
```

### Example Command Script

```bash
#!/bin/bash
# my-command — Does X
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Read config
BASE_URL="$(cat "$SCRIPT_DIR/.url" 2>/dev/null || echo "http://localhost:8080")"
TOKEN="$(cat "$SCRIPT_DIR/.token" 2>/dev/null || echo "")"

# Make API call
curl -sf -H "Authorization: Bearer $TOKEN" "$BASE_URL/api/endpoint"
```

Make it executable: `chmod +x ~/.claude/skills/my-skill/my-command`

---

## Plugin Usage Patterns

### Pattern 1: Layered Skill Loading

Load a skill at the start of a session to make its commands available, then use those commands throughout:

```
Session start:
  Skill({ skill: "agent-desk" })  → loads SKILL.md, makes ad-* available
  
Session work:
  Bash("ad-tasks projectId")
  Bash("ad-task taskId")
  Bash("ad-status taskId in-progress")
```

### Pattern 2: Config Override for Multiple Environments

Use environment variables to point a skill at different environments:

```bash
# Development
AGDESK_URL=http://localhost:3737 ad-projects

# Production
AGDESK_URL=http://prod.example.com:3838 ad-projects
```

### Pattern 3: Skill Composition

Skills can source each other's config files to share configuration:

```bash
# In my-skill/my-command:
source "$(dirname "$0")/../agent-desk/ad-common"  # reuse auth wrapper
agdesk_curl "$AGDESK_BASE/tasks/..."
```

---

## Anti-Patterns

| Anti-pattern | Problem | Fix |
|-------------|---------|-----|
| Hardcoding URLs in skill scripts | Breaks when environment changes | Read from `.url` file with env var override |
| Storing tokens in skill scripts | Security risk | Use `.token` file with proper permissions |
| Massive SKILL.md files | Bloats agent context on every load | Keep SKILL.md concise; link to separate docs for details |
| Skills with no SKILL.md | Agent can't discover the capability | Always include a SKILL.md manifest |
| MCP tools for simple HTTP calls | Overkill, harder to debug | Use `Bash` + `curl` or `ad-*` scripts for simple API calls |

---

## DSA Connections

### Strategy Pattern — Plugin Dispatch and Interchangeable Capability Extensions

The **strategy pattern** defines a family of interchangeable algorithms behind a common interface, allowing the client to select and swap strategies at runtime without modifying the calling code. AgentDesk's plugin system implements this precisely: skill plugins (`agent-desk`, `db-tools`, `git-helper`) and MCP plugins (`chrome-devtools`, custom MCPs) are all concrete strategies conforming to the same structural interface — a manifest describing capabilities, an invocation mechanism, and structured output the agent can parse. When Claude Code executes `Skill({ skill: "agent-desk" })`, it is selecting a strategy at runtime from the skill registry; the core agent loop does not change regardless of which plugin is invoked. Adding a new plugin is adding a new strategy: create a directory with a SKILL.md manifest and executable scripts, and it drops into the registry without modifying the agent's orchestration code. This open-closed design is why the document shows skills, MCP servers, and integration plugins coexisting seamlessly — they are all strategies behind the same dispatch interface.

### Hash Map — Config Resolution and Plugin Registry Lookup

A **hash map** provides O(1) average-time key-value lookup by hashing a key to an array index, making it the canonical structure for registries and configuration stores. The plugin system uses hash maps at multiple levels: the MCP server configuration in `settings.json` maps server names (`"chrome-devtools"`) to their connection details (command, args, env) as a JSON object — a literal hash map that the runtime reads to initialize plugin connections. The skill directory (`~/.claude/skills/`) is a filesystem-backed hash map where each subdirectory name is a key and its contents (SKILL.md, scripts, config files) are the value. The config resolution hierarchy — environment variable, then skill-dir file, then fallback — is a chain of hash map lookups: first check the env hash map (`process.env`), then the file-based map (`.url`, `.token`), then the hardcoded default. This layered lookup enables the "Config Override for Multiple Environments" pattern where `AGDESK_URL=http://prod-server:3838` overrides the `.url` file without editing it, exactly as a hash map's `get` method checks successive backing stores.

### Trie — Skill Name Discovery and Command Prefix Matching

A **trie** (prefix tree) is a tree data structure where each node represents a character, enabling O(k) prefix-based search where k is the query length. When Claude Code encounters a task and evaluates which skill to activate, it matches the task description against all installed skill names and descriptions. The skill invocation mechanism — `Skill({ skill: "agent-desk" })` — requires exact name matching, but the discovery phase where the agent browses available skills (especially via the `/` slash-command menu) benefits from prefix matching: typing `/ag` in the chat narrows candidates to skills whose names start with those characters. The `ad-*` command namespace within the agent-desk skill is itself a prefix-partitioned command set: `ad-tasks`, `ad-task`, `ad-comment`, `ad-status`, `ad-plan` all share the `ad-` prefix, making tab-completion and command discovery an O(k) trie walk rather than a linear scan of all available commands. Real-world CLI autocompletion systems (bash completion, zsh completion) use trie variants internally for exactly this pattern of prefix-based command resolution.
