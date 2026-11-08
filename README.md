# StudyGraph MCP

An agent-native interface for a student study-management app: syllabi, topics, progress
tracking, study sessions, and exams, exposed to AI agents through the [Model Context Protocol
(MCP)](https://modelcontextprotocol.io).

Built from scratch as a single project — a minimal real app (SQLite + Drizzle, JWT auth) and a
TypeScript MCP server on top of it — rather than wrapping a pre-existing codebase. See
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for why, and the full design.

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — components, schema, auth model
- [`docs/TOOLS.md`](docs/TOOLS.md) — full spec for all 8 MCP tools
- [`docs/SECURITY.md`](docs/SECURITY.md) — authorization, validation, confirmation, data minimization
- [`docs/EVALUATIONS.md`](docs/EVALUATIONS.md) — generated eval results (run `npm run eval` to refresh)

## Setup

Requires Node.js 20+.

```bash
npm install
cp .env.example .env          # edit JWT_SECRET if you like; defaults work locally
npm run seed                  # creates data/studygraph.db with 2 demo users
npm run login -- alice StudyHard!1
```

`login` prints a JWT. Paste it into `.env` as `STUDYGRAPH_USER_TOKEN` (or into your MCP client's
config, see below). The demo dataset also has a second user, `bob` / `StudyHard!2`, with minimal
data — used by the eval suite to test cross-user authorization boundaries.

Run the tests and the MCP server directly:

```bash
npm test                      # vitest: core services + MCP server integration tests
npm run mcp-server            # starts the server over stdio (for manual/dev use)
npm run eval                  # runs the 34-scenario eval suite, writes docs/EVALUATIONS.md
npm run demo                  # live agent demo (needs ANTHROPIC_API_KEY or NIM_API_KEY)
npm run demo -- --offline     # same 4 tools, raw output, no LLM key needed
```

### LLM provider for the demo/evals

The live demo and the 6 tool-selection evals need an LLM that supports tool calling. Set
either:

- `ANTHROPIC_API_KEY` (Claude), or
- `NIM_API_KEY` + `NIM_BASE_URL` + `NIM_MODEL` to use [NVIDIA NIM](https://build.nvidia.com)'s
  OpenAI-compatible endpoint instead — handy if you don't have an Anthropic key. Any
  NIM-hosted model with tool-calling support works; `nvidia/nemotron-3.5-lightning-30b-a3b` is
  confirmed working and is the default in `.env.example`.

If both are set, Anthropic is used. `llm/provider.ts` is the single place this choice is made;
both `npm run demo` and `npm run eval` go through it.

## Connecting to Claude Desktop

Add an entry to `claude_desktop_config.json` (Windows:
`%APPDATA%\Claude\claude_desktop_config.json`; macOS:
`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "studygraph": {
      "command": "node",
      "args": ["--import", "tsx", "C:/path/to/studygraph-mcp/apps/mcp-server/src/index.ts"],
      "env": {
        "DATABASE_PATH": "C:/path/to/studygraph-mcp/data/studygraph.db",
        "JWT_SECRET": "<same value as in your .env>",
        "STUDYGRAPH_USER_TOKEN": "<token from npm run login>"
      }
    }
  }
}
```

Restart Claude Desktop, then ask it something like *"What should I study next?"* — it will call
`recommend_next_topic` (and likely `get_weak_topics` / `get_exam_readiness` first) on its own.

## Connecting to Claude Code

From the project directory (or any directory):

```bash
claude mcp add studygraph --env DATABASE_PATH=/path/to/studygraph-mcp/data/studygraph.db --env JWT_SECRET=<same value as in your .env> --env STUDYGRAPH_USER_TOKEN=<token from npm run login> -- node --import tsx /path/to/studygraph-mcp/apps/mcp-server/src/index.ts
```

or add the equivalent block to a project `.mcp.json`:

```json
{
  "mcpServers": {
    "studygraph": {
      "command": "node",
      "args": ["--import", "tsx", "/path/to/studygraph-mcp/apps/mcp-server/src/index.ts"],
      "env": {
        "DATABASE_PATH": "/path/to/studygraph-mcp/data/studygraph.db",
        "JWT_SECRET": "<same value as in your .env>",
        "STUDYGRAPH_USER_TOKEN": "<token from npm run login>"
      }
    }
  }
}
```

## The demo

`npm run demo` answers, live, using a real Claude tool-use loop against the running MCP server:

> What should I study next, considering my upcoming exams, syllabus completion, and weak topics?

Every number in the final answer traces back to an actual tool call — the full transcript
(every tool call and result) is written to `demo/transcript.json`. Without an LLM key, use
`npm run demo -- --offline`, which calls the same 4 read tools directly and prints their raw
JSON under an `[OFFLINE MODE]` banner — useful for inspecting the data without an LLM in the
loop, but it is not a substitute for the live demo.

## Project layout

```
packages/db/       Drizzle schema, SQLite client, seed data
packages/core/      Auth, services, shared zod types, error types
apps/mcp-server/    The MCP server: 8 tools over stdio
apps/cli/           `npm run login`
llm/                Provider-agnostic LLM tool-use loop (Anthropic or NVIDIA NIM)
evals/              34 scenarios across 7 categories + runner
demo/               Live agent demo + offline fallback
docs/               ARCHITECTURE / TOOLS / SECURITY / EVALUATIONS
```
