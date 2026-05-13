# MCP — Model Context Protocol

---

## Table of Contents

1. [What is this exactly?](#1-what-is-this-exactly)
2. [Mental Model](#2-mental-model)
3. [How to integrate it in your projects](#3-how-to-integrate-it-in-your-projects)
4. [Advanced use cases](#4-advanced-use-cases)

---

## 1. What is this exactly?

### The Core Definition

MCP stands for **Model Context Protocol**. It is an open standard developed by Anthropic that defines a universal, structured way for AI models to communicate with external tools, data sources, and services.

The key word is **protocol**. Just like HTTP defines how web browsers talk to web servers, or like USB defines how peripherals connect to computers, MCP defines the exact rules of communication between an AI model and anything external it might want to interact with.

Before MCP, every integration between an AI assistant and an external tool was completely custom. A team at company A would write their own way of connecting Claude to their database. A team at company B would write a completely different way. None of it was reusable, none of it was standardised, and every new integration was a ground-up engineering effort.

MCP changes that. It says: here is the exact protocol. If you build to this spec, any MCP-compatible AI can use your tool. If you are an AI that speaks MCP, you can use any MCP-compatible tool.

### Where MCP Lives in Cline

In Cline, MCP is the mechanism that extends what Cline can do beyond its built-in tool set. Cline already has built-in tools — it can read files, write files, run terminal commands, search the web, etc. MCP servers add capabilities on top of those defaults.

When you add an MCP server to Cline, you are telling Cline: "There is an external service that speaks MCP. Here is how to connect to it. Add its capabilities to your toolbox."

From that point on, Cline can call tools provided by that server as naturally as it calls its own built-in tools — with the same approval flow, the same conversation context, and the same structured output handling.

### The Client-Server Architecture

MCP is built on a strict client-server model:

```
┌─────────────────────────────────────────────────────────────┐
│                        VS Code / Cline                       │
│                                                              │
│   ┌─────────────────────────────────────────────────────┐   │
│   │                   Cline Extension                    │   │
│   │                                                      │   │
│   │   ┌──────────────────────────────────────────────┐  │   │
│   │   │              MCP Client (built-in)            │  │   │
│   │   │                                               │  │   │
│   │   │   - Maintains connections to MCP servers      │  │   │
│   │   │   - Sends tool call requests                  │  │   │
│   │   │   - Receives tool results                     │  │   │
│   │   │   - Exposes tools to the LLM's context        │  │   │
│   │   └──────────────────┬───────────────────────────┘  │   │
│   └─────────────────────-│──────────────────────────────┘   │
└─────────────────────────-│──────────────────────────────────┘
                           │
              ┌────────────┴────────────┐
              │       MCP Protocol      │
              │  (stdio or SSE/HTTP)    │
              └────────────┬────────────┘
                           │
         ┌─────────────────┼─────────────────┐
         │                 │                 │
         ▼                 ▼                 ▼
  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
  │  MCP Server │  │  MCP Server │  │  MCP Server │
  │  (GitHub)   │  │ (Postgres)  │  │  (Custom)   │
  │             │  │             │  │             │
  │  Tools:     │  │  Tools:     │  │  Tools:     │
  │  - listPRs  │  │  - query    │  │  - myTool   │
  │  - createIssue  - describe   │  │  - ...      │
  │  - mergePR  │  │  - ...      │  │             │
  └─────────────┘  └─────────────┘  └─────────────┘
```

**Cline is the MCP client.** It manages connections to all configured MCP servers, discovers what tools/resources/prompts they expose, injects those descriptions into the LLM's context, and forwards tool call requests when the LLM decides to invoke them.

**MCP servers are external processes.** They run separately from Cline (either as a local subprocess or a remote HTTP server), implement the MCP protocol, and expose capabilities — tools, resources, and prompts — that the LLM can use.

### The Three Primitives MCP Servers Can Expose

MCP servers can expose three types of capabilities:

#### 1. Tools (callable functions)

Tools are the most common primitive. A tool is a function that the LLM can invoke. Tools have:
- A **name** (e.g., `create_issue`, `query_database`)
- A **description** (natural language explanation for the LLM)
- An **input schema** (JSON Schema defining parameters)
- A **return value** (text or structured content the LLM can read)

Example tool definition:
```json
{
  "name": "create_github_issue",
  "description": "Creates a new issue in a GitHub repository. Use this when the user wants to report a bug, request a feature, or track work in GitHub.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "owner": { "type": "string", "description": "Repository owner (username or org)" },
      "repo":  { "type": "string", "description": "Repository name" },
      "title": { "type": "string", "description": "Issue title" },
      "body":  { "type": "string", "description": "Issue body in markdown" },
      "labels": {
        "type": "array",
        "items": { "type": "string" },
        "description": "Labels to apply"
      }
    },
    "required": ["owner", "repo", "title"]
  }
}
```

#### 2. Resources (readable data)

Resources are data sources that the LLM can read and include in its context. Unlike tools (which perform actions), resources are passive — they expose information.

Examples:
- A resource that exposes your database schema
- A resource that serves your architecture documentation
- A resource that provides live pricing data
- A resource that lists all open tasks in your project management system

Resources have a URI (like `github://repos/myorg/myrepo/issues`) and return content (text or binary).

#### 3. Prompts (reusable templates)

Prompts are pre-written prompt templates that users or the LLM can invoke. They can be parameterised. Think of them as slash-commands that expand into rich prompt content.

Example: A `code-review` prompt template that, when invoked, expands into a detailed code-review checklist pre-populated with the language and file the user is working on.

### Configuration: Where MCP Lives in Cline

MCP server configuration location depends on which Cline surface you are using:

- **VS Code extension:** Cline Settings panel → MCP Servers → JSON editor
- **CLI:** `~/.cline/mcp.json`

The config format uses **direct server objects** — the top-level keys are server names with no wrapper key:

```json
{
  "github": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-github"],
    "env": { "GITHUB_PERSONAL_ACCESS_TOKEN": "your-token" }
  },
  "remote-server": {
    "url": "https://my-server.com/mcp",
    "headers": { "Authorization": "Bearer token" }
  }
}
```

### Transport Types: STDIO vs Remote HTTP/SSE

MCP supports two transport mechanisms:

#### STDIO (Standard Input/Output) — Local Processes

The default transport for local MCP servers. Cline launches the server as a **child process** and communicates with it over standard input and standard output. JSON-RPC messages are written to the process's stdin and read from its stdout.

- Lower latency
- Simpler setup
- Best for servers you install via npm or build locally
- Best for servers that need local file system or local network access

```
Cline Process
    │
    ├── stdin  ──writes──►  MCP Server Process
    │                              │
    └── stdout ◄──reads──  MCP Server Process
```

Configuration for STDIO:
```json
{
  "my-local-server": {
    "command": "node",
    "args": ["./build/index.js"],
    "env": { "DATABASE_URL": "postgres://localhost:5432/mydb" }
  }
}
```

#### Remote HTTP/SSE — Hosted Endpoints

For MCP servers running on a remote host (or as a persistent local service). Cline connects to an HTTP endpoint and communicates over Server-Sent Events.

- Supports multiple clients connecting to the same server
- Centralised auth — team members don't need individual API keys
- Can access internal network resources from a server with VPN access
- Best for shared team tool servers

```
Cline ──── HTTP POST (requests) ────► Remote MCP Server
Cline ◄─── HTTP SSE  (responses) ─── Remote MCP Server
```

Configuration for remote HTTP/SSE — use `url` and optional `headers`:
```json
{
  "remote-analytics-server": {
    "url": "https://mcp.mycompany.com/analytics",
    "headers": {
      "Authorization": "Bearer your-token"
    }
  }
}
```

### CLI Management (official commands)

The Cline CLI provides commands for managing MCP configuration without editing JSON by hand:

```bash
cline mcp                        # Interactive wizard: list, add, edit, enable/disable, delete
cline config mcp                 # Show current MCP config
cline config mcp --json          # JSON output for scripting
```

### MCP vs. Just Running a Terminal Command

This is a critical distinction worth understanding deeply.

Without MCP, Cline can run shell commands. So why not just run `gh issue create` or `psql -c "SELECT..."` in the terminal?

| Aspect | Terminal Command | MCP Tool |
|--------|-----------------|----------|
| **Interface** | Raw text output, unstructured | Typed, structured JSON input/output |
| **Discovery** | LLM must guess or be told what commands exist | LLM reads tool descriptions and schemas automatically |
| **Error handling** | Parse stderr, exit codes — fragile | Explicit error objects in structured format |
| **Context awareness** | LLM must construct the right shell invocation | LLM sees parameter names, types, and descriptions |
| **Security** | Full shell access — any command can run | Scoped to the tools the server exposes |
| **Reliability** | Depends on shell env, PATH, installed CLIs | Self-contained process with explicit dependencies |
| **Composability** | LLM string-parses output to chain calls | Structured output flows directly into next tool call |
| **Approval UX** | Cline shows a raw shell command for approval | Cline shows a human-readable tool name + parameters |

The practical difference: when Cline calls `create_issue` via MCP, it knows exactly what parameters it is passing (structured JSON). When the tool succeeds, it gets back structured data. When it fails, it gets a typed error. There is no brittle string parsing, no shell injection risks, no guessing about command-line flag syntax.

The LLM also has much better context about what the tool does, because the description and schema are injected into its system prompt — it does not have to guess or recall shell command syntax from training data.

---

## 2. Mental Model

### Mental Model 1: The USB Standard

Before USB, every peripheral device used a different connector. Keyboards had one plug. Mice had another. Printers, modems, joysticks — all different. Every device needed special support on each computer. Connecting a new device meant driver installation rituals and compatibility nightmares.

Then USB was invented. One standard connector. One protocol. Any USB device works with any USB host. You build a keyboard once, and it works everywhere.

**MCP is the USB of AI tools.**

Before MCP:
- Want to give Claude access to your GitHub? Write a custom integration.
- Want the same thing in GPT-4? Write another custom integration.
- Want to give both access to your database? Two more custom integrations.
- Each integration is a one-off, not reusable, not composable.

After MCP:
- Write an MCP server for GitHub once.
- Any MCP-compatible AI (Cline, Claude Desktop, any future model) can use it instantly.
- The server developer doesn't need to know anything about the AI. The AI doesn't need to know anything about the server's implementation.

The protocol is the connector. Everything else is just a device that speaks the protocol.

### Mental Model 2: A Power Strip

Imagine the LLM as an appliance — a powerful device that needs power (capabilities) to function. Out of the box, it has one plug: its built-in tools.

MCP is a **power strip** that multiplies that single plug into many sockets. Each socket is a different MCP server:

```
                    ┌────────────────────────────────────────┐
                    │            LLM (Cline)                  │
                    │                                         │
                    │          "I need to..."                 │
                    └───────────────┬─────────────────────────┘
                                    │
                                    │  (MCP Protocol)
                                    │
                    ┌───────────────▼─────────────────────────┐
                    │              Power Strip                  │
                    │           (MCP Client Layer)             │
                    └──┬──────┬──────┬──────┬──────┬──────────┘
                       │      │      │      │      │
                    ┌──▼─┐ ┌──▼─┐ ┌──▼─┐ ┌──▼─┐ ┌──▼─┐
                    │    │ │    │ │    │ │    │ │    │
                    │ GH │ │ DB │ │ WEB│ │SLAK│ │ FS │
                    │    │ │    │ │    │ │    │ │    │
                    └────┘ └────┘ └────┘ └────┘ └────┘
                   GitHub Postgres Brave  Slack  Files
```

Each "socket" is independent. You can add more sockets (more MCP servers) without touching the LLM or the other servers. You can remove one server without affecting the others. The LLM doesn't need to know how each server is implemented — it just knows which sockets are available and what they can do.

This also means: **capability is additive**. Start with one MCP server. Add another. The LLM's available toolset grows with each addition.

### Mental Model 3: A Universal Remote

Think of a universal TV remote. Before it, you had one remote for the TV, one for the cable box, one for the DVD player, one for the sound system. Each device had its own protocol, its own button layout, its own learning curve.

A universal remote unifies all of them. One interface. You press "volume up" and the right device responds. You press "play" and the DVD player obeys. The remote doesn't care how each device works internally — it just sends the right signal.

**MCP is a universal remote for external APIs.**

Without MCP, the LLM would need to:
- Know the exact GitHub REST API endpoints
- Know how to construct OAuth headers
- Know how to parse the response JSON
- Repeat this for every API it might need

With MCP:
- The MCP server for GitHub wraps the GitHub API
- The LLM just calls `create_issue(owner, repo, title, body)`
- The server handles the HTTP call, auth, error handling, response parsing
- The LLM gets back a clean, structured result

The LLM has one "remote" (the MCP protocol). Each server is a different "device" (GitHub, Postgres, Slack, your custom API). The protocol unifies them all into a single consistent interface.

### Mental Model 4: REST API for AI

When the web was young, every web service had its own custom interface. There was no standard for how web apps should talk to each other. Then REST emerged — a set of conventions (HTTP verbs, URL structure, status codes, JSON) that became the de-facto standard for web APIs.

REST didn't invent anything technically new. It standardised conventions. And that standardisation changed the entire industry. Suddenly, developers could integrate services without reading a novel-length custom API spec. Swagger/OpenAPI could auto-generate client code. Postman could inspect any REST API. The entire ecosystem of API tooling became possible.

**MCP does for AI-to-tool communication what REST did for service-to-service communication.**

Just as REST defines:
- How you structure a request (HTTP method + URL + JSON body)
- How you structure a response (status code + JSON body)
- How you discover endpoints (OpenAPI spec)

MCP defines:
- How the AI requests a tool call (JSON-RPC with tool name + arguments)
- How the server returns a result (structured content object)
- How the AI discovers capabilities (the `tools/list` initialization handshake)

And just like with REST, the ecosystem that grows around the standard is the real payoff. Tool libraries, auto-generated SDKs, MCP registries, visual builders — all of it becomes possible once the protocol is shared and open.

### The Unifying Key Insight

All four mental models point to the same core truth:

**Without a standard, every integration is a snowflake. With a standard, every integration is a building block.**

Without MCP:
- GitHub integration for Cline: custom code
- Same GitHub integration for Claude Desktop: rewrite from scratch
- Same GitHub integration for the next AI tool: rewrite again
- Every new AI needs every integration rebuilt

With MCP:
- GitHub MCP server: built once, by anyone, runs everywhere
- Adding it to Cline: one JSON config change
- Adding it to any MCP-compatible AI: same config

The leverage is compounding. The more MCP servers exist (and there are already hundreds), the more powerful every MCP-compatible AI becomes. The more MCP-compatible AIs exist, the more valuable every MCP server becomes. This is a network effect, and it is why MCP adoption has been rapid across the AI tool ecosystem.

---

## 3. How to integrate it in your projects

### Adding an MCP Server to Cline (VS Code)

MCP servers are configured in Cline's settings. Open the Cline extension, click the settings icon (top right of the Cline panel), then navigate to "MCP Servers". You will see a JSON editor.

The VS Code extension also has an **MCP Marketplace** accessible from the MCP Servers panel — it allows one-click installation of popular pre-built servers without writing any JSON manually.

The full config structure uses direct server objects (no wrapper key):

```json
{
  "github": {
    "command": "npx",
    "args": [
      "-y",
      "@modelcontextprotocol/server-github"
    ],
    "env": {
      "GITHUB_PERSONAL_ACCESS_TOKEN": "ghp_your_token_here"
    }
  },
  "postgres": {
    "command": "npx",
    "args": [
      "-y",
      "@modelcontextprotocol/server-postgres",
      "postgresql://username:password@localhost:5432/mydb"
    ]
  },
  "brave-search": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-brave-search"],
    "env": {
      "BRAVE_API_KEY": "your_brave_api_key"
    }
  }
}
```

**What each field means:**
- `command` — the executable to run (e.g., `node`, `npx`, `python`)
- `args` — command-line arguments passed to the executable
- `env` — environment variables injected into the server process (use this for API keys, connection strings — never hardcode them in args if they're sensitive)
- `url` — for remote HTTP/SSE servers, replaces `command`/`args`
- `headers` — for remote HTTP/SSE servers, HTTP headers sent with every request (use for auth tokens)

After saving, Cline restarts the MCP connections and discovers the new server's tools automatically.

### Security (from official docs)

Before installing any MCP server:

- **Install only trusted, verified servers.** Community servers are not vetted by Anthropic — review their source code or choose well-known packages.
- **Store secrets in environment variables, never hardcode them** in `args` or the config file. Secrets in `args` appear in process listings.
- **Limit `autoApprove` to safe, read-only tools only.** Any tool with write, delete, or network side effects should require manual approval.
- **Review all tool calls before approving** in sensitive contexts (production databases, systems with billing implications, etc.).

### Popular Pre-Built MCP Servers

#### `@modelcontextprotocol/server-github`

**What it does:** Allows the LLM to read and write GitHub resources — issues, pull requests, repositories, file contents, commits, branches, and more.

**Install and configure:**
```json
{
  "github": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-github"],
    "env": {
      "GITHUB_PERSONAL_ACCESS_TOKEN": "ghp_xxxxxxxxxxxxxxxxxxxx"
    }
  }
}
```

**Getting your token:** GitHub → Settings → Developer Settings → Personal Access Tokens → Fine-grained tokens. Grant: `Contents` (read/write), `Issues` (read/write), `Pull requests` (read/write), `Metadata` (read).

**Tools exposed:**
- `create_or_update_file` — write a file to a repo
- `get_file_contents` — read file contents
- `create_issue` / `update_issue` / `list_issues`
- `create_pull_request` / `get_pull_request`
- `list_commits`, `get_commit`
- `search_repositories`, `search_code`
- `fork_repository`, `create_repository`

**Real-world use:** "Cline, look at all open issues labelled `bug` in my repo and triage them by severity." Cline calls `list_issues` with `labels: ["bug"]`, reads through them, calls `update_issue` to add severity labels.

---

#### `@modelcontextprotocol/server-postgres`

**What it does:** Lets the LLM query your PostgreSQL database with read-only access (by default) and inspect the schema.

**Install and configure:**
```json
{
  "postgres": {
    "command": "npx",
    "args": [
      "-y",
      "@modelcontextprotocol/server-postgres",
      "postgresql://readonly_user:password@localhost:5432/production_db"
    ]
  }
}
```

**Security note:** Always create a dedicated read-only database user for MCP. Never pass your admin credentials.

```sql
-- Create a read-only user for MCP
CREATE USER mcp_reader WITH PASSWORD 'strong_random_password';
GRANT CONNECT ON DATABASE production_db TO mcp_reader;
GRANT USAGE ON SCHEMA public TO mcp_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO mcp_reader;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO mcp_reader;
```

**Tools exposed:**
- `query` — run a SQL SELECT statement
- `describe_table` — get column names, types, constraints for a table

**Resources exposed:**
- `postgres://localhost/mydb/schema` — full database schema as a readable resource

**Real-world use:** "What are the top 10 most purchased products this month?" Cline calls `query` with the appropriate SQL, reads the results, and explains them in plain English.

---

#### `@modelcontextprotocol/server-brave-search`

**What it does:** Gives the LLM web search capability via the Brave Search API. Results are structured (title, URL, description) — not raw HTML.

**Install and configure:**
```json
{
  "brave-search": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-brave-search"],
    "env": {
      "BRAVE_API_KEY": "BSA_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
    }
  }
}
```

**Getting your key:** Sign up at https://brave.com/search/api/. Free tier: 2,000 queries/month.

**Tools exposed:**
- `brave_web_search` — search the web, returns structured results
- `brave_local_search` — search for local businesses/places

**Real-world use:** "Research the latest benchmarks for LLM inference on consumer GPUs." Cline calls `brave_web_search` with a query, gets structured results, then reads the most relevant pages to synthesise findings.

---

#### `@modelcontextprotocol/server-filesystem`

**What it does:** Exposes a remote or configurable file system to the LLM — useful when you need to give the LLM access to files outside of the current workspace, or on a remote system.

**Install and configure:**
```json
{
  "filesystem": {
    "command": "npx",
    "args": [
      "-y",
      "@modelcontextprotocol/server-filesystem",
      "/path/to/allowed/directory"
    ]
  }
}
```

You can pass multiple directories:
```json
{
  "args": [
    "-y",
    "@modelcontextprotocol/server-filesystem",
    "/home/user/documents",
    "/var/log/myapp"
  ]
}
```

**Tools exposed:**
- `read_file` — read file contents
- `write_file` — write file contents
- `list_directory` — list directory contents
- `create_directory` — create a directory
- `move_file` — move/rename a file
- `search_files` — search for files matching a pattern
- `get_file_info` — metadata (size, timestamps, permissions)

---

#### `@modelcontextprotocol/server-slack`

**What it does:** Lets the LLM read and post to Slack channels, list users, and react to messages.

**Install and configure:**
```json
{
  "slack": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-slack"],
    "env": {
      "SLACK_BOT_TOKEN": "xoxb-your-bot-token",
      "SLACK_TEAM_ID": "T1234567890"
    }
  }
}
```

**Getting your token:** Create a Slack app at api.slack.com/apps. Add Bot Token Scopes: `channels:history`, `channels:read`, `chat:write`, `users:read`. Install to workspace.

**Tools exposed:**
- `slack_list_channels` — list all channels
- `slack_post_message` — post a message to a channel
- `slack_reply_to_thread` — reply to a thread
- `slack_get_channel_history` — read recent messages
- `slack_get_thread_replies` — read thread replies
- `slack_search_messages` — search messages

**Real-world use:** "Summarise what was discussed in #engineering today and post a TL;DR to #engineering-summary." Cline reads the channel history, summarises it, and posts the result.

---

#### `mcp-server-playwright`

**What it does:** Full browser automation via Playwright — navigate pages, click, fill forms, take screenshots, scrape content.

**Install and configure:**
```json
{
  "playwright": {
    "command": "npx",
    "args": ["-y", "@playwright/mcp"]
  }
}
```

**Tools exposed:**
- `browser_navigate` — navigate to URL
- `browser_click` — click an element
- `browser_fill` — fill an input field
- `browser_snapshot` — get aria tree / page content as text
- `browser_screenshot` — capture a screenshot
- `browser_evaluate` — run JavaScript in the page

**Real-world use:** "Go to my app's staging URL, log in with the test credentials, and run through the checkout flow. Tell me if anything breaks." Cline navigates, fills forms, clicks buttons, reads page state, and reports the outcome.

---

### Building a Custom MCP Server from Scratch

This is where MCP becomes genuinely powerful — wrapping your own backend, your own APIs, or your own data sources so the LLM can interact with them directly.

#### Setup

```bash
mkdir my-mcp-server
cd my-mcp-server
npm init -y
npm install @modelcontextprotocol/sdk zod
npm install -D typescript @types/node ts-node
npx tsc --init
```

Update `tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "./build",
    "strict": true,
    "esModuleInterop": true
  },
  "include": ["src/**/*"]
}
```

Update `package.json`:
```json
{
  "main": "build/index.js",
  "scripts": {
    "build": "tsc",
    "dev": "ts-node src/index.ts",
    "start": "node build/index.js"
  }
}
```

#### Full Working Example: Project Stats MCP Server

This server exposes tools for getting statistics about a software project — file counts, line counts, and recent git activity.

**`src/index.ts`:**
```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

// Create the MCP server
const server = new McpServer({
  name: "project-stats",
  version: "1.0.0",
});

// ─── Tool 1: Count files by extension ─────────────────────────────────────────
server.tool(
  "count_files",
  "Count files in a directory, grouped by extension. Useful for understanding a codebase's composition.",
  {
    directory: z.string().describe("Absolute path to the directory to scan"),
    extensions: z
      .array(z.string())
      .optional()
      .describe("Filter to specific extensions e.g. ['.ts', '.js']. Omit for all files."),
  },
  async ({ directory, extensions }) => {
    if (!fs.existsSync(directory)) {
      return {
        content: [{ type: "text", text: `Error: Directory not found: ${directory}` }],
        isError: true,
      };
    }

    const counts: Record<string, number> = {};
    let totalFiles = 0;

    function walk(dir: string) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        // Skip node_modules, .git, build artifacts
        if ([".git", "node_modules", "dist", "build", ".next"].includes(entry.name)) continue;
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath);
        } else {
          const ext = path.extname(entry.name) || "(no extension)";
          if (!extensions || extensions.includes(ext)) {
            counts[ext] = (counts[ext] || 0) + 1;
            totalFiles++;
          }
        }
      }
    }

    walk(directory);

    const sorted = Object.entries(counts)
      .sort(([, a], [, b]) => b - a)
      .map(([ext, count]) => `  ${ext.padEnd(20)} ${count} files`)
      .join("\n");

    return {
      content: [
        {
          type: "text",
          text: `File count for: ${directory}\nTotal: ${totalFiles} files\n\nBreakdown:\n${sorted}`,
        },
      ],
    };
  }
);

// ─── Tool 2: Count lines of code ──────────────────────────────────────────────
server.tool(
  "count_lines",
  "Count total lines of code in a directory for specific file types. Excludes blank lines and comments optionally.",
  {
    directory: z.string().describe("Absolute path to the directory"),
    extensions: z
      .array(z.string())
      .describe("File extensions to count e.g. ['.ts', '.tsx']"),
  },
  async ({ directory, extensions }) => {
    if (!fs.existsSync(directory)) {
      return {
        content: [{ type: "text", text: `Error: Directory not found: ${directory}` }],
        isError: true,
      };
    }

    let totalLines = 0;
    let totalFiles = 0;
    const fileBreakdown: Array<{ file: string; lines: number }> = [];

    function walk(dir: string) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if ([".git", "node_modules", "dist", "build", ".next"].includes(entry.name)) continue;
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath);
        } else {
          const ext = path.extname(entry.name);
          if (extensions.includes(ext)) {
            const content = fs.readFileSync(fullPath, "utf-8");
            const lines = content.split("\n").length;
            totalLines += lines;
            totalFiles++;
            fileBreakdown.push({ file: fullPath.replace(directory, "."), lines });
          }
        }
      }
    }

    walk(directory);

    // Sort by line count descending, show top 10
    const top10 = fileBreakdown
      .sort((a, b) => b.lines - a.lines)
      .slice(0, 10)
      .map((f) => `  ${String(f.lines).padStart(6)} lines  ${f.file}`)
      .join("\n");

    return {
      content: [
        {
          type: "text",
          text: [
            `Lines of code in: ${directory}`,
            `Extensions: ${extensions.join(", ")}`,
            `Total files: ${totalFiles}`,
            `Total lines: ${totalLines.toLocaleString()}`,
            `\nTop 10 largest files:`,
            top10,
          ].join("\n"),
        },
      ],
    };
  }
);

// ─── Tool 3: Recent git activity ──────────────────────────────────────────────
server.tool(
  "git_recent_activity",
  "Get a summary of recent git commits for a repository. Shows who committed what and when.",
  {
    repoPath: z.string().describe("Absolute path to the git repository"),
    days: z.number().default(7).describe("How many days back to look. Default: 7"),
    maxCommits: z.number().default(20).describe("Maximum number of commits to return. Default: 20"),
  },
  async ({ repoPath, days, maxCommits }) => {
    if (!fs.existsSync(path.join(repoPath, ".git"))) {
      return {
        content: [{ type: "text", text: `Error: Not a git repository: ${repoPath}` }],
        isError: true,
      };
    }

    try {
      const since = new Date();
      since.setDate(since.getDate() - days);
      const sinceStr = since.toISOString().split("T")[0];

      const log = execSync(
        `git -C "${repoPath}" log --since="${sinceStr}" --max-count=${maxCommits} --pretty=format:"%h|%an|%ar|%s"`,
        { encoding: "utf-8" }
      ).trim();

      if (!log) {
        return {
          content: [{ type: "text", text: `No commits found in the last ${days} days.` }],
        };
      }

      const commits = log.split("\n").map((line) => {
        const [hash, author, time, ...subjectParts] = line.split("|");
        return `  ${hash}  ${time.padEnd(15)}  ${author.padEnd(20)}  ${subjectParts.join("|")}`;
      });

      // Also get stats: files changed, insertions, deletions
      const stat = execSync(
        `git -C "${repoPath}" diff --stat HEAD~${Math.min(commits.length, 10)} HEAD 2>/dev/null || echo "N/A"`,
        { encoding: "utf-8" }
      ).trim().split("\n").slice(-1)[0];

      return {
        content: [
          {
            type: "text",
            text: [
              `Git activity for: ${repoPath}`,
              `Period: last ${days} days`,
              `\nCommits:`,
              `  HASH    TIME             AUTHOR               MESSAGE`,
              `  ${"─".repeat(80)}`,
              ...commits,
              `\nOverall diff (last ~10 commits): ${stat}`,
            ].join("\n"),
          },
        ],
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: `Error running git command: ${String(err)}` }],
        isError: true,
      };
    }
  }
);

// ─── Connect via stdio transport ──────────────────────────────────────────────
const transport = new StdioServerTransport();
await server.connect(transport);
// Server is now listening for MCP requests on stdin/stdout
```

**Build and run:**
```bash
npm run build
node build/index.js
# Server starts and waits for MCP protocol messages on stdin
```

**Add to Cline:**
```json
{
  "project-stats": {
    "command": "node",
    "args": ["/absolute/path/to/my-mcp-server/build/index.js"]
  }
}
```

After adding, Cline will automatically discover the three tools and their descriptions. You can then ask: "How many TypeScript files are in this project, and how many total lines of code?" — and Cline will call the appropriate tools.

#### Full Working Example: Weather Tool

A simpler example using an external API — useful as a template for wrapping any REST API.

**`src/weather-server.ts`:**
```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({
  name: "weather",
  version: "1.0.0",
});

const API_KEY = process.env.OPENWEATHER_API_KEY;
if (!API_KEY) throw new Error("OPENWEATHER_API_KEY environment variable is required");

server.tool(
  "get_current_weather",
  "Get the current weather conditions for a city. Returns temperature, humidity, wind speed, and a description.",
  {
    city: z.string().describe("City name, e.g. 'London' or 'New York'"),
    units: z
      .enum(["metric", "imperial", "standard"])
      .default("metric")
      .describe("Units: metric (Celsius), imperial (Fahrenheit), standard (Kelvin)"),
  },
  async ({ city, units }) => {
    try {
      const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${API_KEY}&units=${units}`;
      const response = await fetch(url);

      if (!response.ok) {
        if (response.status === 404) {
          return {
            content: [{ type: "text", text: `City not found: ${city}` }],
            isError: true,
          };
        }
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json() as any;
      const unitSymbol = units === "imperial" ? "°F" : units === "metric" ? "°C" : "K";

      return {
        content: [
          {
            type: "text",
            text: [
              `Weather in ${data.name}, ${data.sys.country}`,
              `Condition: ${data.weather[0].description}`,
              `Temperature: ${data.main.temp}${unitSymbol} (feels like ${data.main.feels_like}${unitSymbol})`,
              `Humidity: ${data.main.humidity}%`,
              `Wind: ${data.wind.speed} ${units === "imperial" ? "mph" : "m/s"} at ${data.wind.deg}°`,
              `Visibility: ${(data.visibility / 1000).toFixed(1)} km`,
            ].join("\n"),
          },
        ],
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: `Failed to fetch weather: ${String(err)}` }],
        isError: true,
      };
    }
  }
);

server.tool(
  "get_forecast",
  "Get a 5-day weather forecast for a city, with readings every 3 hours.",
  {
    city: z.string().describe("City name"),
    days: z.number().min(1).max(5).default(3).describe("Number of days to forecast (1-5)"),
  },
  async ({ city, days }) => {
    try {
      const url = `https://api.openweathermap.org/data/2.5/forecast?q=${encodeURIComponent(city)}&appid=${API_KEY}&units=metric&cnt=${days * 8}`;
      const response = await fetch(url);
      const data = await response.json() as any;

      if (!response.ok) {
        return {
          content: [{ type: "text", text: `Error: ${data.message}` }],
          isError: true,
        };
      }

      const lines = data.list.map((item: any) => {
        const time = new Date(item.dt * 1000).toLocaleString("en-GB", {
          weekday: "short",
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });
        return `  ${time}  ${String(Math.round(item.main.temp)).padStart(3)}°C  ${item.weather[0].description}`;
      });

      return {
        content: [
          {
            type: "text",
            text: [`Forecast for ${data.city.name}:`, ...lines].join("\n"),
          },
        ],
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: `Failed to fetch forecast: ${String(err)}` }],
        isError: true,
      };
    }
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
```

**Config:**
```json
{
  "weather": {
    "command": "node",
    "args": ["/path/to/weather-server/build/index.ts"],
    "env": {
      "OPENWEATHER_API_KEY": "your_api_key_here"
    }
  }
}
```

### Testing Your MCP Server Locally Before Connecting to Cline

Before wiring your server into Cline, test it independently so you can debug without the LLM in the loop.

#### Method 1: MCP Inspector (Recommended)

The official MCP Inspector is a web-based UI for testing MCP servers:

```bash
# Run the inspector against your server
npx @modelcontextprotocol/inspector node build/index.js
```

This launches a local web UI (usually at http://localhost:5173) where you can:
- See all tools your server exposes
- Fill in parameters and call tools manually
- See raw request/response JSON
- Inspect resources and prompts

#### Method 2: Direct stdio Testing

You can send raw JSON-RPC messages to your server's stdin to test it:

```bash
# Run your server with debugging
node build/index.js < test-input.json
```

**`test-input.json`** (newline-delimited JSON-RPC messages):
```json
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}
{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}
{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"count_files","arguments":{"directory":"/home/user/myproject"}}}
```

#### Method 3: Unit Testing Tool Handlers

For complex servers, unit-test the handler logic directly:

```typescript
// src/index.test.ts
import { describe, it, expect } from "vitest";

// Extract handler logic into testable functions
async function countFilesHandler(directory: string, extensions?: string[]) {
  // ... same logic as in the tool handler
}

describe("count_files", () => {
  it("returns error for non-existent directory", async () => {
    const result = await countFilesHandler("/nonexistent/path");
    expect(result.isError).toBe(true);
  });

  it("counts TypeScript files correctly", async () => {
    const result = await countFilesHandler("/path/to/test-fixture", [".ts"]);
    expect(result.content[0].text).toContain(".ts");
  });
});
```

---

## 4. Advanced use cases

### Chaining MCP Tools in a Single Task

One of MCP's most powerful properties is that the LLM can chain tool calls across multiple MCP servers in a single coherent task, passing results from one tool into the input of the next.

**Example: Research → Fetch → Write → Commit**

User prompt: *"Research the latest Rust async runtime performance comparisons, write a summary to `docs/async-comparison.md`, and commit it."*

What Cline does internally:

```
Step 1: brave_web_search("Rust async runtime tokio vs async-std vs smol benchmark 2024")
         ↓ returns: list of URLs and snippets

Step 2: browser_navigate("https://most-relevant-result.com/article")
         ↓ returns: page content

Step 3: write_file("docs/async-comparison.md", <synthesised summary>)
         ↓ returns: ok

Step 4: git MCP tool or terminal: git add + git commit
         ↓ returns: commit hash

Step 5: Reply to user with summary and commit hash
```

Each step's output feeds the next step's input. The LLM orchestrates this chain autonomously — you just describe the goal.

**Real chaining pattern — incident response:**
```
1. slack_get_channel_history("#alerts", last 1 hour)
   → finds error message mentioning DB connection failures

2. postgres query("SELECT * FROM connection_pool_stats ORDER BY created_at DESC LIMIT 20")
   → confirms pool exhaustion

3. brave_web_search("postgres connection pool exhaustion fix")
   → finds solutions

4. create_github_issue("incident: DB pool exhaustion", body with diagnosis and fix steps)
   → creates issue

5. slack_post_message("#engineering", "Incident report filed: <issue URL>")
   → notifies team
```

One natural-language instruction triggers a five-step cross-system workflow.

---

### Building an MCP Server That Wraps Your Own Backend API

The most common production use case: you have an existing backend with a REST API, and you want your AI assistant to CRUD your app's data.

**Architecture:**
```
Cline (MCP Client)
    │
    │  MCP Protocol (stdio)
    │
Your MCP Server (thin wrapper)
    │
    │  HTTP REST calls (with your auth token)
    │
Your Backend API
    │
Your Database
```

**Full example — a project management app wrapper:**

```typescript
// src/project-api-server.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const BASE_URL = process.env.API_BASE_URL ?? "http://localhost:4000";
const API_TOKEN = process.env.API_TOKEN;

if (!API_TOKEN) throw new Error("API_TOKEN required");

// Typed fetch helper
async function apiFetch<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_TOKEN}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`API ${res.status}: ${error}`);
  }

  return res.json() as Promise<T>;
}

const server = new McpServer({ name: "project-api", version: "1.0.0" });

// List tasks with optional filters
server.tool(
  "list_tasks",
  "List tasks from the project management system. Can filter by status, assignee, or project.",
  {
    status: z
      .enum(["todo", "in_progress", "review", "done", "all"])
      .default("all")
      .describe("Filter by task status"),
    assignee: z.string().optional().describe("Filter by assignee username"),
    projectId: z.string().optional().describe("Filter by project ID"),
    limit: z.number().default(20).describe("Max results"),
  },
  async (params) => {
    const query = new URLSearchParams();
    if (params.status !== "all") query.set("status", params.status);
    if (params.assignee) query.set("assignee", params.assignee);
    if (params.projectId) query.set("project_id", params.projectId);
    query.set("limit", String(params.limit));

    try {
      const tasks = await apiFetch<any[]>("GET", `/api/tasks?${query}`);
      const formatted = tasks.map((t) =>
        `[${t.id}] ${t.title} | ${t.status} | Assignee: ${t.assignee ?? "unassigned"} | Due: ${t.due_date ?? "none"}`
      ).join("\n");
      return { content: [{ type: "text", text: formatted || "No tasks found." }] };
    } catch (err) {
      return { content: [{ type: "text", text: String(err) }], isError: true };
    }
  }
);

// Create a task
server.tool(
  "create_task",
  "Create a new task in the project management system.",
  {
    title: z.string().describe("Task title"),
    description: z.string().optional().describe("Task description (markdown supported)"),
    projectId: z.string().describe("Project ID to assign this task to"),
    assignee: z.string().optional().describe("Username to assign to"),
    dueDate: z.string().optional().describe("Due date in YYYY-MM-DD format"),
    priority: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  },
  async (params) => {
    try {
      const task = await apiFetch<any>("POST", "/api/tasks", {
        title: params.title,
        description: params.description,
        project_id: params.projectId,
        assignee: params.assignee,
        due_date: params.dueDate,
        priority: params.priority,
      });
      return {
        content: [
          {
            type: "text",
            text: `Created task [${task.id}]: "${task.title}" in project ${task.project_id}`,
          },
        ],
      };
    } catch (err) {
      return { content: [{ type: "text", text: String(err) }], isError: true };
    }
  }
);

// Update task status
server.tool(
  "update_task_status",
  "Update the status of an existing task.",
  {
    taskId: z.string().describe("Task ID to update"),
    status: z.enum(["todo", "in_progress", "review", "done"]),
    comment: z.string().optional().describe("Optional comment to add when updating status"),
  },
  async ({ taskId, status, comment }) => {
    try {
      await apiFetch("PATCH", `/api/tasks/${taskId}`, { status, comment });
      return { content: [{ type: "text", text: `Task ${taskId} updated to: ${status}` }] };
    } catch (err) {
      return { content: [{ type: "text", text: String(err) }], isError: true };
    }
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
```

**Config:**
```json
{
  "project-api": {
    "command": "node",
    "args": ["/path/to/project-api-server/build/index.js"],
    "env": {
      "API_BASE_URL": "https://api.myapp.com",
      "API_TOKEN": "your-service-account-token"
    }
  }
}
```

Now you can say: "What tasks are currently in review? Move all of them to done and add a comment 'merged'." Cline calls `list_tasks(status: "review")`, then calls `update_task_status` for each one.

---

### MCP Server with Authentication

#### Pattern 1: API Keys via Environment Variables (Simplest)

Never put secrets in `args` — they appear in process listings. Always use `env`:

```json
{
  "my-api": {
    "command": "node",
    "args": ["/path/to/server/build/index.js"],
    "env": {
      "API_KEY": "sk-...",
      "API_SECRET": "your-secret"
    }
  }
}
```

In your server code:
```typescript
const apiKey = process.env.API_KEY;
const apiSecret = process.env.API_SECRET;

if (!apiKey || !apiSecret) {
  throw new Error("API_KEY and API_SECRET environment variables are required");
}
```

#### Pattern 2: OAuth Token Refresh

For APIs that use OAuth access tokens (which expire), your MCP server should handle token refresh:

```typescript
import * as fs from "fs";

interface TokenStore {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // Unix timestamp
}

const TOKEN_PATH = process.env.TOKEN_PATH ?? "/home/user/.config/my-mcp/tokens.json";

async function getValidAccessToken(): Promise<string> {
  const stored: TokenStore = JSON.parse(fs.readFileSync(TOKEN_PATH, "utf-8"));

  // If token is still valid (with 60s buffer), return it
  if (Date.now() < stored.expiresAt - 60_000) {
    return stored.accessToken;
  }

  // Refresh the token
  const response = await fetch("https://oauth.example.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: stored.refreshToken,
      client_id: process.env.CLIENT_ID!,
      client_secret: process.env.CLIENT_SECRET!,
    }),
  });

  const tokens = await response.json() as any;

  // Persist the new tokens
  const newStore: TokenStore = {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? stored.refreshToken,
    expiresAt: Date.now() + tokens.expires_in * 1000,
  };
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(newStore, null, 2));

  return newStore.accessToken;
}

// Use in your tool handlers:
server.tool("my_tool", "...", { /* schema */ }, async (params) => {
  const token = await getValidAccessToken();
  const res = await fetch("https://api.example.com/endpoint", {
    headers: { Authorization: `Bearer ${token}` },
  });
  // ...
});
```

#### Pattern 3: Credential Setup Tool

For interactive OAuth flows, expose a setup tool that guides the user through auth once:

```typescript
server.tool(
  "authenticate",
  "Complete the OAuth setup for this MCP server. Run this once before using other tools. Opens the auth URL in your browser.",
  {
    clientId: z.string().describe("OAuth client ID from your app registration"),
    clientSecret: z.string().describe("OAuth client secret"),
  },
  async ({ clientId, clientSecret }) => {
    const authUrl = `https://oauth.example.com/authorize?client_id=${clientId}&response_type=code&redirect_uri=http://localhost:8080/callback`;
    return {
      content: [
        {
          type: "text",
          text: [
            "Open this URL in your browser to authenticate:",
            authUrl,
            "",
            "After authorising, you will be redirected to localhost:8080/callback.",
            "Copy the 'code' parameter from the URL and call 'exchange_code' with it.",
          ].join("\n"),
        },
      ],
    };
  }
);
```

---

### Remote MCP Servers (SSE Transport) — Shared Team Tool Server

Instead of every developer running MCP servers locally, you can deploy a shared MCP server on a team server and have everyone connect over HTTP (SSE transport).

**Why remote MCP:**
- One database connection pool shared across all team members
- Centralised auth — team members don't need individual API keys
- Server has access to internal network resources (VPN-gated databases, internal APIs)
- Consistent tool versions — update once, everyone gets it

**Server implementation (same MCP code, different transport):**

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import express from "express";

const app = express();
const PORT = process.env.PORT ?? 3100;

// Simple bearer token auth middleware
app.use((req, res, next) => {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (token !== process.env.SHARED_SECRET) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
});

// Each SSE connection gets its own MCP server instance
app.get("/mcp", async (req, res) => {
  const server = new McpServer({ name: "team-tools", version: "1.0.0" });

  // Register tools here (same as before)
  server.tool("query_db", "...", { sql: z.string() }, async ({ sql }) => {
    // ... query the internal database
  });

  const transport = new SSEServerTransport("/messages", res);
  await server.connect(transport);
});

app.post("/messages", express.json(), async (req, res) => {
  // SSEServerTransport routes POST messages back to the server
});

app.listen(PORT, () => {
  console.log(`Team MCP server listening on port ${PORT}`);
});
```

**Deploy with Docker:**
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY build ./build
ENV PORT=3100
CMD ["node", "build/server.js"]
```

**Team members connect via remote config:**
```json
{
  "team-tools": {
    "url": "https://mcp.internal.mycompany.com/mcp",
    "headers": {
      "Authorization": "Bearer team-shared-secret"
    }
  }
}
```

**Architecture:**
```
Developer A's Cline ──► https://mcp.internal.com/mcp ──► Internal DB
Developer B's Cline ──►                                ──► Internal API
Developer C's Cline ──►                                ──► Shared Resources
```

---

### MCP Resources (Exposing Readable Data as Context)

Resources are a powerful but often underused MCP primitive. Instead of the LLM calling a tool to get data, resources let you expose data that the LLM can read directly into its context — like reading a file.

**Use resources for:**
- Documentation (architecture docs, API specs, runbooks)
- Configuration files the LLM should know about
- Database schemas
- Lists of entities (all projects, all users, all endpoints)

**Implementing resources:**

```typescript
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const server = new McpServer({ name: "project-knowledge", version: "1.0.0" });

// Static resource — the architecture doc
server.resource(
  "architecture",
  "docs://architecture",
  {
    name: "System Architecture",
    description: "High-level architecture documentation for this codebase. Read this before making structural changes.",
    mimeType: "text/markdown",
  },
  async (uri) => {
    const content = fs.readFileSync("/path/to/docs/ARCHITECTURE.md", "utf-8");
    return {
      contents: [{ uri: uri.href, mimeType: "text/markdown", text: content }],
    };
  }
);

// Dynamic resource — database schema
server.resource(
  "db-schema",
  "db://schema",
  {
    name: "Database Schema",
    description: "Current database schema. Reference this when writing SQL queries.",
    mimeType: "text/plain",
  },
  async (uri) => {
    const schema = await db.query(`
      SELECT table_name, column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public'
      ORDER BY table_name, ordinal_position
    `);
    const text = schema.rows
      .map((r: any) => `${r.table_name}.${r.column_name}: ${r.data_type}${r.is_nullable === 'YES' ? ' (nullable)' : ''}`)
      .join("\n");
    return {
      contents: [{ uri: uri.href, mimeType: "text/plain", text }],
    };
  }
);

// Template resource — individual table schema
server.resource(
  "table-schema",
  new ResourceTemplate("db://tables/{tableName}", { list: undefined }),
  {
    name: "Table Schema",
    description: "Schema for a specific database table",
    mimeType: "text/plain",
  },
  async (uri, { tableName }) => {
    const result = await db.query(
      `SELECT column_name, data_type, column_default, is_nullable, character_maximum_length
       FROM information_schema.columns
       WHERE table_name = $1 AND table_schema = 'public'
       ORDER BY ordinal_position`,
      [tableName]
    );
    const text = result.rows
      .map((r: any) => `  ${r.column_name.padEnd(30)} ${r.data_type}${r.character_maximum_length ? `(${r.character_maximum_length})` : ''}${r.column_default ? ` DEFAULT ${r.column_default}` : ''}${r.is_nullable === 'NO' ? ' NOT NULL' : ''}`)
      .join("\n");
    return {
      contents: [{ uri: uri.href, mimeType: "text/plain", text: `Table: ${tableName}\n\n${text}` }],
    };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
```

When Cline reads these resources, it gets rich context about your system before making changes — without you having to paste docs into the chat.

---

### MCP Prompts (Reusable Prompt Templates)

Prompts are pre-written templates that expand into rich prompt content when invoked. They are useful for standardising how the AI approaches recurring tasks.

```typescript
server.prompt(
  "code-review",
  "Perform a thorough code review for a specific file or PR",
  {
    filePath: z.string().optional().describe("File to review"),
    language: z.string().optional().describe("Programming language"),
    focusAreas: z.string().optional().describe("Specific concerns: 'security', 'performance', 'readability'"),
  },
  async ({ filePath, language, focusAreas }) => {
    return {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              `Please perform a thorough code review${filePath ? ` of ${filePath}` : ""}.`,
              ``,
              `Review checklist:`,
              `- [ ] Correctness: Does the code do what it's supposed to?`,
              `- [ ] Edge cases: Are all error paths handled?`,
              `- [ ] Security: Any injection risks, auth bypasses, or data exposure?`,
              `- [ ] Performance: Any N+1 queries, blocking operations, or memory leaks?`,
              `- [ ] Readability: Is the code clear and well-named?`,
              `- [ ] Tests: Is coverage adequate?`,
              language ? `\nLanguage-specific considerations for ${language}: apply idiomatic patterns.` : "",
              focusAreas ? `\nPrimary focus for this review: ${focusAreas}` : "",
              `\nFor each issue found, specify: severity (critical/major/minor), location, and suggested fix.`,
            ].filter(Boolean).join("\n"),
          },
        },
      ],
    };
  }
);
```

Users can invoke this prompt from Cline's interface, and it expands into a structured, detailed code review request.

---

### Building a "Project Knowledge" MCP Server

A particularly high-value MCP server for any dev team: a server that exposes your codebase's institutional knowledge as resources.

**What to expose:**
- Architecture documentation
- ADRs (Architecture Decision Records)
- API contracts (OpenAPI specs)
- Environment variable catalogue
- Deployment procedures
- Oncall runbooks

```typescript
import * as fs from "fs";
import * as path from "path";

const DOCS_ROOT = process.env.DOCS_ROOT ?? "/path/to/project/docs";

// Auto-discover and expose all markdown files as resources
const mdFiles = getAllMarkdownFiles(DOCS_ROOT);

for (const filePath of mdFiles) {
  const relativePath = path.relative(DOCS_ROOT, filePath);
  const resourceName = relativePath.replace(/\//g, "-").replace(".md", "");
  const uri = `docs://${relativePath}`;

  server.resource(
    resourceName,
    uri,
    {
      name: relativePath,
      description: `Documentation: ${relativePath}`,
      mimeType: "text/markdown",
    },
    async () => {
      return {
        contents: [
          {
            uri,
            mimeType: "text/markdown",
            text: fs.readFileSync(filePath, "utf-8"),
          },
        ],
      };
    }
  );
}

function getAllMarkdownFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...getAllMarkdownFiles(fullPath));
    else if (entry.name.endsWith(".md")) results.push(fullPath);
  }
  return results;
}
```

Now when you ask Cline "how does our auth flow work?", it reads the `auth-flow.md` resource from your docs and answers from your actual project documentation, not from hallucinated assumptions.

---

### Security Considerations

MCP significantly extends what the LLM can do. That power demands thoughtful security posture.

#### Principle of Least Privilege

Each MCP server should have only the permissions it absolutely needs.

```sql
-- Bad: connect as your main app user with write access to everything
postgresql://app_user:password@localhost/db

-- Good: dedicated read-only user
postgresql://mcp_readonly:password@localhost/db

-- Even better: user restricted to specific tables
GRANT SELECT ON TABLE products, orders TO mcp_reader;
-- No access to users, sessions, payment_methods tables
```

For GitHub, create a fine-grained token scoped to only the repositories the MCP server needs, with only the permissions (read vs. write for each resource type) it actually uses.

#### Input Validation in Tool Handlers

Never trust tool arguments as safe. The LLM constructs them, and while it is well-intentioned, inputs should always be validated before use:

```typescript
server.tool("run_query", "Run a SQL query", { sql: z.string() }, async ({ sql }) => {
  // NEVER: run arbitrary SQL
  // await db.query(sql);  ← SQL injection risk if prompt is manipulated

  // Validate: only allow SELECT statements
  const trimmed = sql.trim().toUpperCase();
  if (!trimmed.startsWith("SELECT")) {
    return {
      content: [{ type: "text", text: "Error: Only SELECT queries are allowed." }],
      isError: true,
    };
  }

  // Use a timeout to prevent runaway queries
  const result = await Promise.race([
    db.query(sql),
    new Promise((_, reject) => setTimeout(() => reject(new Error("Query timeout")), 5000)),
  ]);

  return { content: [{ type: "text", text: JSON.stringify(result.rows, null, 2) }] };
});
```

#### Sandboxing Local Servers

For MCP servers that run as local processes, consider:

- Running them as a dedicated OS user with restricted permissions
- Using a Docker container with limited capabilities
- Restricting network access (block outbound internet if the server only needs local resources)

```bash
# Run MCP server as restricted user
sudo -u mcp-sandbox node /path/to/server/build/index.js

# Or with Docker
docker run --rm \
  --network=host \
  --read-only \
  -v /path/to/allowed/dir:/data:ro \
  -e API_KEY="$API_KEY" \
  my-mcp-server:latest
```

#### Audit Logging

For production or team deployments, log every tool invocation:

```typescript
// Middleware-style logging wrapper
function withAuditLog<T>(
  toolName: string,
  handler: (args: T) => Promise<any>
) {
  return async (args: T) => {
    const startTime = Date.now();
    const logEntry = {
      timestamp: new Date().toISOString(),
      tool: toolName,
      args: sanitizeForLog(args), // Remove secrets from logs
      user: process.env.MCP_USER_ID ?? "unknown",
    };

    try {
      const result = await handler(args);
      appendLog({ ...logEntry, status: "success", durationMs: Date.now() - startTime });
      return result;
    } catch (err) {
      appendLog({ ...logEntry, status: "error", error: String(err), durationMs: Date.now() - startTime });
      throw err;
    }
  };
}

// Usage
server.tool("delete_record", "...", { id: z.string() },
  withAuditLog("delete_record", async ({ id }) => {
    // ...
  })
);

function appendLog(entry: object) {
  fs.appendFileSync(
    process.env.AUDIT_LOG_PATH ?? "/var/log/mcp-audit.jsonl",
    JSON.stringify(entry) + "\n"
  );
}
```

#### Secrets Never in Tool Arguments or Logs

Structure your server so secrets (API keys, passwords, tokens) come from environment variables, not from tool arguments. This ensures they never appear in:
- Cline's approval dialogs
- The LLM's context (it sees tool arguments)
- Audit logs

---

### Combining MCP with `.clinerules`

`.clinerules` (the Cline rules file in your project root) can instruct Cline on which MCP tools to prefer for specific tasks. This reduces ambiguity and improves consistency.

**Example `.clinerules`:**
```markdown
# Tool Preferences

## Database queries
When the user asks a question that requires database data, use the `postgres` MCP server's
`query` tool rather than running psql in the terminal. Always explain the query before
running it.

## GitHub operations
Prefer MCP tools (github server) over gh CLI commands for GitHub interactions.
Exceptions: complex git operations that aren't exposed as MCP tools.

## Web research
For any research task, use brave-search MCP first to find relevant URLs, then use
the browser MCP to read the most promising page in full. Synthesise — don't just
paste raw search results.

## File operations
Use the built-in file tools for workspace files. Use the filesystem MCP server only
for files outside the workspace (specified by the user with an absolute path).

## When to NOT use MCP
Do not use MCP tools for simple operations that a built-in Cline tool handles well.
Prefer built-in file read/write over MCP filesystem for workspace files.
```

This way, when you have both a `postgres` MCP server and the ability to run `psql` in the terminal, Cline consistently chooses the structured MCP path because your `.clinerules` say so.

---

### Comparison: Built-in Tools vs MCP Tools

| Capability | Built-in Cline Tool | MCP Tool |
|-----------|--------------------|---------| 
| **File R/W** | Yes (workspace) | Via server-filesystem (any path) |
| **Terminal commands** | Yes (run_command) | No — but MCP is usually a better alternative |
| **GitHub** | No | Yes — via server-github |
| **Database queries** | No | Yes — via server-postgres, server-sqlite |
| **Web search** | Yes (built-in) | Yes — via server-brave-search (structured) |
| **Browser automation** | No | Yes — via mcp-server-playwright |
| **Your custom API** | No | Yes — build your own server |
| **Structured output** | Partial | Yes — typed JSON |
| **Scoped permissions** | Full workspace | Per-server, per-tool |
| **Auth handling** | N/A | In the server process |
| **Shareability** | N/A | Server runs once for the team |

---

### Quick Reference Card

```
┌─────────────────────────────────────────────────────────────────┐
│                    MCP Quick Reference                           │
├─────────────────────────────────────────────────────────────────┤
│  CONFIG LOCATION                                                 │
│  VS Code: Cline Settings → MCP Servers (JSON editor)            │
│  CLI: ~/.cline/mcp.json                                          │
│                                                                  │
│  CLI MANAGEMENT                                                  │
│  cline mcp                   # interactive wizard                │
│  cline config mcp            # show current config               │
│  cline config mcp --json     # JSON output for scripting         │
│                                                                  │
│  STDIO SERVER CONFIG (no wrapper key)                            │
│  { "my-server": { "command": "node",                            │
│      "args": ["./build/index.js"],                               │
│      "env": { "API_KEY": "..." } } }                             │
│                                                                  │
│  REMOTE HTTP/SSE SERVER CONFIG                                   │
│  { "remote": { "url": "https://host/mcp",                       │
│      "headers": { "Authorization": "Bearer ..." } } }           │
│                                                                  │
│  BUILD YOUR SERVER                                               │
│  npm install @modelcontextprotocol/sdk zod                       │
│  server.tool(name, description, zodSchema, handler)              │
│  server.resource(name, uri, metadata, handler)                   │
│  server.prompt(name, description, zodSchema, handler)            │
│  await server.connect(new StdioServerTransport())                │
│                                                                  │
│  TEST LOCALLY                                                    │
│  npx @modelcontextprotocol/inspector node build/index.js         │
│                                                                  │
│  POPULAR SERVERS                                                 │
│  @modelcontextprotocol/server-github                             │
│  @modelcontextprotocol/server-postgres                           │
│  @modelcontextprotocol/server-brave-search                       │
│  @modelcontextprotocol/server-filesystem                         │
│  @modelcontextprotocol/server-slack                              │
│  @playwright/mcp                                                 │
│                                                                  │
│  SECURITY CHECKLIST                                              │
│  - Install only trusted, verified servers                        │
│  - Secrets in env vars, never in args                            │
│  - Limit autoApprove to safe read-only tools                     │
│  - Review tool calls in sensitive contexts                       │
└─────────────────────────────────────────────────────────────────┘
```
