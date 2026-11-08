# StudyGraph MCP — Security

This document describes how StudyGraph satisfies the Phase 3 requirements: respecting the
application's own authorization, preventing cross-user data access, keeping credentials in
environment variables, validating all tool inputs, requiring explicit confirmation for writes,
and avoiding unnecessary exposure of personal information.

## 1. Authentication

- Passwords are hashed with bcrypt (`bcryptjs`, cost factor 10) at seed/creation time. Plaintext
  passwords are never stored and never logged.
- `npm run login` verifies a username/password against the stored hash and signs a JWT
  (`{ sub: user.public_id }`, expiring per `JWT_EXPIRES_IN`). This is the only place in the
  system that handles a raw password.
- `JWT_SECRET` and all other secrets live in environment variables only (`.env`, gitignored;
  `.env.example` documents every variable with no real values). Nothing is hardcoded.

## 2. The MCP server is single-user per process, by construction

- At startup, the server reads `STUDYGRAPH_USER_TOKEN`, verifies it, and resolves exactly one
  `AuthContext { userId, publicId, username }` (`apps/mcp-server/src/authContext.ts`). If the
  token is missing or invalid, **the process refuses to start** — it never falls back to a
  default user or serves an "unauthenticated" empty state.
- This `AuthContext` is captured in a closure and passed into every one of the 8 tool handlers.
  **No tool's input schema includes a `userId` field** (see every shape in
  `packages/core/src/types.ts`). There is no argument an agent could pass, intentionally or by
  hallucination, that would select a different user — the user is fixed for the life of the
  process.

## 3. Cross-user data access is blocked at the data-access layer, not just the tool layer

- Every service function in `packages/core/src/services/*.ts` takes `userId` as its first
  parameter, and every one of the 8 tool handlers supplies it only from `AuthContext` — never
  from parsed tool input.
- Every Drizzle query that touches `subjects`, `topics`, `topic_progress`, `study_sessions`,
  `exams`, `exam_subjects`, or `exam_topics` filters by `user_id` (directly, or via a join through
  an already-`user_id`-filtered row). This is enforced close to the database, so a future tool
  added on top of these services inherits the guarantee automatically instead of having to
  re-implement it.
- All user-facing lookups go through `public_id` (e.g. `top_9f2a1c4b...`), never the internal
  auto-increment integer `id`. A `require*` helper (`requireSubject`, `requireTopic`,
  `requireExam`) resolves a `public_id` **and** checks `row.userId === userId` in the same query;
  a mismatch returns `NOT_FOUND`. It deliberately never returns a distinct "forbidden" error,
  so an agent (or someone directing one) can't use the error type to confirm that a given id
  belongs to someone else.
- `packages/core/test/authorization.test.ts` and `apps/mcp-server/test/server.test.ts` seed two
  independent users (alice, bob) and assert that every resource type is unreachable across the
  user boundary — including for the write tools, where a cross-user write must both fail *and*
  leave no row behind. `evals/scenarios/authorization.ts` repeats this at the full eval-suite
  level (5 scenarios) against every tool category that takes an id.

## 4. Input validation

- Every tool's `inputSchema` is a zod shape (`packages/core/src/types.ts`), enforced by the MCP
  SDK before the handler runs: unknown input shapes, out-of-range numbers (e.g.
  `durationMinutes` 1–600, `masteryPct` 0–100, `limit` capped at 50/100), bad enum values, and
  malformed dates are all rejected at the protocol layer, not inside application logic.
- Numeric caps on `limit` fields exist specifically to bound how much data a single call can
  pull back, as a basic abuse/DoS guard against a misbehaving or malicious client.
- A handful of cross-field checks that zod alone can't express (e.g. `from` must be before `to`
  in `get_study_sessions`; at least one of `masteryPct`/`status` must be given to
  `update_study_progress`) are enforced explicitly in the service layer and surfaced as
  `VALIDATION_ERROR` / `NO_FIELDS_PROVIDED`.
- `evals/scenarios/invalidInput.ts` (6 scenarios) and `evals/scenarios/incorrectAssumptions.ts`
  (4 scenarios) exercise these paths end-to-end through the MCP protocol.

## 5. Explicit confirmation for writes

Both write tools (`create_study_session`, `update_study_progress`) take a `confirm` boolean that
**defaults to `false`**. The handler checks `confirm === true` *before* calling any service
mutation; anything else short-circuits with `CONFIRMATION_REQUIRED` and **zero database writes**
occur. The tool descriptions instruct the calling agent explicitly: show the user the proposed
change first, and only resend the call with `confirm: true` after they approve it. This is
verified both by direct tests (`apps/mcp-server/test/server.test.ts`) and by evals
(`workflow-02`/`workflow-03`, `assume-02`) that check no row was written when confirmation is
missing.

## 6. Minimizing exposed personal information

- Tool outputs never include: `password_hash`, `email`, another user's `display_name`, or any
  internal integer `id`. Only `public_id` (surfaced as `id`) ever appears.
- Each entity has a dedicated mapper (`toPublicSubject`, `toPublicTopic`, the inline session
  mapper in `sessionsService.ts`) that **whitelists** fields to return; services never spread a
  raw DB row into a tool's output, so a new column added to the schema later doesn't
  automatically leak until someone deliberately adds it to a mapper.
- None of the 8 tools ever need or return the authenticated user's own `email` or
  `display_name` either — there was no requirement to display "logged in as," so that
  information simply isn't threaded through to any tool output.

## 7. Known limitations (acknowledged, not hidden)

- **Token validity is checked once, at process start**, not per call. A long-lived MCP server
  process will keep serving a user whose token has since expired, until the process is
  restarted. A production system would re-validate per call or use short-lived tokens with a
  refresh flow; for a local, single-user demo server this tradeoff is acceptable and is
  documented here rather than silently assumed away.
- There is no rate limiting beyond the `limit` caps on read tools — appropriate for a
  single-user local process, not for a multi-tenant network-exposed deployment.
- `JWT_SECRET`'s default in `.env.example` is a placeholder (`change-me-in-production`) and is
  **not** suitable for anything beyond local development.
