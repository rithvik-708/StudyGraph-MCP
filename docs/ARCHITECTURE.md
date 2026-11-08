# StudyGraph — Architecture

StudyGraph is a student study-management application exposed to AI agents through the
Model Context Protocol (MCP). This document describes the system as designed and built:
the data model, the authentication/authorization model, the service layer, and how the
MCP server sits on top of it.

## 1. Component Overview

```
                 ┌─────────────────────────┐
                 │   Claude Desktop/Code    │
                 │   (or any MCP client)    │
                 └────────────┬─────────────┘
                              │ stdio (JSON-RPC, MCP)
                 ┌────────────▼─────────────┐
                 │   apps/mcp-server         │
                 │   - resolves AuthContext  │
                 │     from STUDYGRAPH_USER_ │
                 │     TOKEN at startup      │
                 │   - registers 8 tools     │
                 │   - zod input validation  │
                 └────────────┬─────────────┘
                              │ function calls (userId always first arg)
                 ┌────────────▼─────────────┐
                 │   packages/core           │
                 │   - services/*            │
                 │   - auth (jwt, bcrypt)    │
                 │   - errors, zod types     │
                 └────────────┬─────────────┘
                              │ Drizzle queries (always filtered by user_id)
                 ┌────────────▼─────────────┐
                 │   packages/db             │
                 │   - schema.ts (Drizzle)   │
                 │   - SQLite (better-sqlite3)│
                 └───────────────────────────┘
```

`apps/cli` (the `login` command) and `demo/` sit alongside the MCP server and talk to the
same `packages/core` services directly — there is no separate HTTP API layer. This is a
deliberate simplification: StudyGraph's "application" and its "agent interface" share one
service layer, so the authorization guarantees in that layer apply identically regardless
of which entry point is used.

## 2. Database Schema

SQLite via Drizzle ORM. See `packages/db/src/schema.ts` for the authoritative definitions.

| Table | Purpose | Key columns |
|---|---|---|
| `users` | Account + credentials | `public_id`, `username`, `email`, `password_hash`, `display_name` |
| `subjects` | Top-level syllabus grouping, owned by a user | `user_id`, `name` |
| `topics` | Syllabus entries within a subject; optional parent for sub-topics | `subject_id`, `user_id`, `parent_topic_id`, `order_index`, `weight` |
| `topic_progress` | One row per topic: mastery/status | `topic_id` (unique), `mastery_pct`, `status`, `last_practiced_at` |
| `study_sessions` | Logged study activity | `user_id`, `subject_id`, `topic_id?`, `started_at`, `duration_minutes`, `focus_rating?` |
| `exams` | Upcoming/past exams | `user_id`, `name`, `exam_date`, `weight` |
| `exam_subjects` | Which subjects an exam covers (many-to-many) | `exam_id`, `subject_id` |
| `exam_topics` | Fine-grained topic coverage + weight for an exam | `exam_id`, `topic_id`, `coverage_weight` |

Design notes:

- **`public_id` vs integer `id`**: every user-facing entity has both an internal
  auto-increment integer primary key and a random external `public_id` (e.g.
  `top_8f3a2b...`). Only `public_id` ever crosses the service/tool boundary. This prevents
  an agent (or a user manipulating an agent) from enumerating sequential integer IDs to
  probe other users' data.
- **Denormalized `user_id` on `topics`**: topics already belong to a subject which belongs
  to a user, but duplicating `user_id` onto `topics` (and other child tables) lets every
  authorization check be a single indexed equality filter instead of a join, which keeps
  the "every query is scoped by user" invariant easy to verify by inspection.
- **`topic_progress` is 1:1 with `topic`**: kept as a separate table (rather than columns
  on `topics`) so that "progress" has one obvious owner module (`progressService`) and so
  a topic can exist in the syllabus before any progress has been recorded.
- **`exam_topics` is optional fine-grained coverage**: if an exam has no `exam_topics`
  rows, exam-readiness calculations fall back to all topics under the exam's
  `exam_subjects`, each weighted by `topics.weight`.

## 3. Authentication & Authorization

StudyGraph uses a conventional username/password + JWT model for the underlying
application (`packages/core/src/auth`):

1. A user's password is hashed with bcrypt (`bcryptjs`) at creation time; the plaintext is
   never stored.
2. `npm run login` prompts for username/password, verifies against `password_hash`, and on
   success signs a JWT (`{ sub: user.public_id }`) with `JWT_SECRET`, expiring per
   `JWT_EXPIRES_IN`.

**MCP-specific model.** MCP servers that run over stdio are spawned as one process per
client connection (Claude Desktop/Code starts one process per configured server entry).
There is no per-tool-call "request header" the way there would be in an HTTP API. StudyGraph
therefore treats **the whole server process as scoped to one authenticated user**:

- The process reads `STUDYGRAPH_USER_TOKEN` from its environment exactly once, at startup
  (`apps/mcp-server/src/authContext.ts`).
- The token is verified (signature + expiry) and decoded into an `AuthContext { userId,
  username }`.
- If the token is missing or invalid, the server refuses to start and exits with a clear
  error — it never starts in an "unauthenticated" state that silently serves no data or,
  worse, falls back to some default user.
- This `AuthContext` is captured in a closure and threaded into every one of the 8 tool
  handlers. **No tool's input schema includes a `userId` or `username` field.** An agent
  cannot access another user's data by passing a crafted argument, because there is no
  argument that selects the user — the user is fixed for the lifetime of the process.
- Every `packages/core` service function takes `userId` as its first parameter, and that
  parameter is only ever supplied from `AuthContext` by the tool handlers — never from
  parsed tool input. See `SECURITY.md` for the full enforcement story.

**Limitation (documented, not hidden):** the token is validated once at process start, not
per call. For a long-lived server process this means a token that expires mid-session is
not re-checked until the next restart. This is an acceptable tradeoff for a local,
single-user demo server; a production variant would use short-lived tokens with periodic
re-validation or a refresh flow.

## 4. Service Layer (`packages/core/src/services`)

Each service is a small set of plain async functions, all taking `userId` first:

- `subjectsService` — list/get subjects, verify ownership of a `subjectId`.
- `topicsService` — syllabus tree construction (subjects → topics, ordered), verify
  ownership of a `topicId`.
- `progressService` — read/update `topic_progress` rows.
- `sessionsService` — create and query `study_sessions`.
- `examsService` — list/get exams and their coverage mappings.
- `recommendationService` — the derived/computed logic that doesn't map 1:1 to a table:
  - `getWeakTopics(userId, opts)` — topics below a mastery threshold, stale, or flagged
    `needs_review`, ranked by a weakness score.
  - `getExamReadiness(userId, opts)` — coverage-weighted readiness percentage per exam,
    days remaining, and a qualitative risk level.
  - `recommendNextTopic(userId, opts)` — combines weak topics + exam readiness + syllabus
    order into a ranked top-5 list with a human-readable `reason` per item. This is a
    deterministic, server-side computation — it is **not** itself an LLM call. The MCP tool
    `recommend_next_topic` hands an agent grounded, computed data; any further natural-language
    reasoning happens in the calling agent (see Phase 6 demo), not inside the tool.

All services throw typed errors from `packages/core/src/errors.ts` (e.g.
`SubjectNotFoundError`, `ValidationError`) which the MCP tool layer maps to the structured
`{ ok: false, error: { code, message } }` response shape.

## 5. MCP Server (`apps/mcp-server`)

- Built on `@modelcontextprotocol/sdk`'s `McpServer`, communicating over stdio
  (`StdioServerTransport`) — the standard transport for Claude Desktop and Claude Code
  local server integrations.
- `registerTools.ts` registers all 8 tools against a single `McpServer` instance, each with
  a zod input schema, a description, and a handler closed over `AuthContext` and the
  `packages/core` services.
- Every tool handler follows the same shape: parse/validate input (zod does this
  automatically before the handler runs) → call one or more core services with
  `ctx.userId` → map the result through a "public" field-whitelisting mapper → return
  structured JSON content.
- The two write tools (`create_study_session`, `update_study_progress`) implement a
  single-round-trip "propose, then confirm" pattern via a required `confirm: true` literal
  input field, rather than performing any mutation on the first call. See `TOOLS.md` and
  `SECURITY.md`.

See `TOOLS.md` for the full per-tool specification.

## 6. Why Not a Separate REST API?

A conventional design would put a REST/GraphQL API between the database and both a web
frontend and the MCP server. StudyGraph has no web frontend to build, and introducing an
HTTP layer here would only add an extra hop with no additional authorization guarantee —
the real enforcement point is the service layer regardless of transport. Keeping
`packages/core` as the single shared service layer, called directly by both the MCP server
and the `login`/demo scripts, keeps the "one user, one set of queries, always filtered by
`user_id`" invariant in one place rather than duplicated across an API and an MCP layer.
