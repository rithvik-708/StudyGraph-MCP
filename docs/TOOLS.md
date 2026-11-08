# StudyGraph MCP — Tools Reference

All 8 tools are registered on a single `McpServer` (`apps/mcp-server/src/registerTools.ts`) and
scoped to one authenticated user for the life of the server process (see `ARCHITECTURE.md`).

**Common response shape.** Every tool returns one `text` content block containing JSON:

```json
{ "ok": true, "data": { ... } }
```
or
```json
{ "ok": false, "error": { "code": "SUBJECT_NOT_FOUND", "message": "..." } }
```

A malformed call (failing the zod `inputSchema`) is rejected by the MCP SDK itself, before any
handler runs, and comes back as a protocol-level `isError: true` result with a `"MCP error
-32602: Invalid arguments..."` message — this is a different (earlier) failure path than the
`{ ok: false }` shape above, which only ever comes from the handler itself.

**No tool input ever includes `userId`.** Every lookup is scoped to the server's single
`AuthContext` and resolved by `public_id` only. A resource that exists but belongs to another
user resolves to `NOT_FOUND`, never a distinct "forbidden" error — this avoids confirming to an
agent (or a user probing through one) that a given id belongs to someone else.

Error codes used across tools: `SUBJECT_NOT_FOUND`, `TOPIC_NOT_FOUND`, `EXAM_NOT_FOUND`,
`SESSION_NOT_FOUND`, `VALIDATION_ERROR`, `CONFIRMATION_REQUIRED`, `NO_FIELDS_PROVIDED`,
`INTERNAL_ERROR`.

---

## 1. `get_syllabus`

Returns the subject → topic hierarchy, with each topic's current status and mastery.

| Input | Type | Required | Notes |
|---|---|---|---|
| `subjectId` | string | no | Scope to one subject (public id). Omit for all subjects. |

**Output:** `{ subjects: [{ id, name, color, topics: [{ id, name, orderIndex, weight, parentTopicId, status, masteryPct, lastPracticedAt }] }] }`

**Errors:** `SUBJECT_NOT_FOUND` if `subjectId` is given and doesn't belong to the user.

---

## 2. `get_subject_progress`

Aggregate completion statistics per subject.

| Input | Type | Required | Notes |
|---|---|---|---|
| `subjectId` | string | no | Scope to one subject. Omit for all. |

**Output:** `{ subjects: [{ id, name, color, topicCount, completedCount, avgMasteryPct, lastActivityAt }] }`

**Errors:** `SUBJECT_NOT_FOUND`.

---

## 3. `get_weak_topics`

Topics needing attention, ranked by a weakness score (higher = more urgent).

| Input | Type | Required | Default | Notes |
|---|---|---|---|---|
| `subjectId` | string | no | — | Scope to one subject. |
| `limit` | number | no | 10 | 1–50. |
| `masteryThreshold` | number | no | 60 | 0–100. Topics at/above this are not weak on mastery alone. |

A topic is weak if `masteryPct < masteryThreshold`, OR `status = "needs_review"`, OR it hasn't
been practiced in over 10 days (or never). `weaknessScore = (100 - masteryPct) * topic.weight +
stalenessBonus`, where `stalenessBonus` is 50 for never-practiced topics or `2 ×
(daysSincePracticed − 10)` for stale ones.

**Output:** `{ weakTopics: [{ id, name, subjectName, masteryPct, status, lastPracticedAt, daysSincePracticed, weaknessScore }] }`

**Errors:** `SUBJECT_NOT_FOUND`.

---

## 4. `get_study_sessions`

Session history, most recent first, with a running total.

| Input | Type | Required | Default | Notes |
|---|---|---|---|---|
| `subjectId` | string | no | — | |
| `topicId` | string | no | — | |
| `from` | ISO datetime | no | — | |
| `to` | ISO datetime | no | — | |
| `limit` | number | no | 20 | 1–100. |

**Output:** `{ sessions: [{ id, subjectName, topicName, startedAt, durationMinutes, notes, focusRating }], totalMinutes }`

**Errors:** `SUBJECT_NOT_FOUND` / `TOPIC_NOT_FOUND` (filter ids not owned by the user),
`VALIDATION_ERROR` (`from` after `to`).

---

## 5. `get_exam_readiness`

Coverage-weighted readiness for one exam or all (optionally upcoming-only) exams.

| Input | Type | Required | Default | Notes |
|---|---|---|---|---|
| `examId` | string | no | — | Single exam. Omit for a list. |
| `includeUpcomingOnly` | boolean | no | true | Only applies when `examId` is omitted. |

`readinessPct` is the coverage-weighted average of topic `masteryPct` (weighted by
`exam_topics.coverage_weight`, falling back to each topic's own syllabus `weight` if the exam has
no fine-grained coverage rows). `riskLevel` combines the readiness gap with urgency:
`riskScore = (100 - readinessPct) × timeWeight` where `timeWeight` is 1.5 (≤7 days), 1.0 (≤14
days), or 0.6 (further out); `riskScore > 60` → `"high"`, `> 30` → `"medium"`, else `"low"`
(`"unknown"` if the exam has no linked topics at all). `gaps` lists covered topics under 70%
mastery, sorted by coverage weight descending.

**Output:** `{ exams: [{ id, name, examDate, daysRemaining, readinessPct, riskLevel, gaps: [{ topicId, name, masteryPct, coverageWeight }] }] }`

**Errors:** `EXAM_NOT_FOUND`. An empty `exams` array (not an error) means no exams exist yet.

---

## 6. `recommend_next_topic`

Up to 5 ranked "study this next" recommendations, combining weak-topic signals with upcoming
exam coverage. **Deterministic and server-computed** — not an LLM call itself; an agent's own
reasoning (e.g. the Phase 6 demo) is layered on top of this grounded data, never a substitute
for it.

| Input | Type | Required | Default | Notes |
|---|---|---|---|---|
| `subjectId` | string | no | — | Scope to one subject. |
| `horizonDays` | number | no | 14 | 1–180. Only exams within this many days boost priority. |

For each weak topic, `priorityScore = weaknessScore + examBoost`, where `examBoost` is nonzero
only if an upcoming exam (within `horizonDays`) covers that topic:
`examBoost = coverageWeight × max(0.2, 2 − daysRemaining / horizonDays) × 20`. Ties are broken by
insertion order. Each recommendation includes a human-readable `reason`.

**Output:** `{ recommendations: [{ topicId, name, subjectName, reason, masteryPct, relatedExam: { examId, name, daysRemaining } | null, priorityScore }] }`

**Errors:** `SUBJECT_NOT_FOUND`. An empty `recommendations` array (not an error) means nothing
currently qualifies as weak.

---

## 7. `create_study_session` — WRITE

Logs a study session. **Requires confirmation.**

| Input | Type | Required | Default | Notes |
|---|---|---|---|---|
| `subjectId` | string | yes | — | |
| `topicId` | string | no | — | Must belong to `subjectId`. |
| `startedAt` | ISO datetime | yes | — | |
| `durationMinutes` | number | yes | — | 1–600. |
| `notes` | string | no | — | ≤1000 chars. |
| `focusRating` | number | no | — | 1–5. |
| `confirm` | boolean | no | `false` | Must be `true` to actually write. |

Calling with `confirm` omitted or `false` performs **no write** and returns
`CONFIRMATION_REQUIRED`. The intended pattern: the agent calls once (or reasons about the inputs)
without `confirm`, shows the user the proposed session, and only resends with `confirm: true`
after explicit approval.

**Output:** `{ session: { id, subjectName, topicName, startedAt, durationMinutes, notes, focusRating } }` (or the `CONFIRMATION_REQUIRED` error, with no `session`)

**Errors:** `SUBJECT_NOT_FOUND`, `TOPIC_NOT_FOUND` (missing, or doesn't belong to `subjectId`),
`CONFIRMATION_REQUIRED`, protocol-level validation (durationMinutes/notes/focusRating bounds, bad
date format, missing required fields).

---

## 8. `update_study_progress` — WRITE

Updates a topic's mastery and/or status. **Requires confirmation.**

| Input | Type | Required | Default | Notes |
|---|---|---|---|---|
| `topicId` | string | yes | — | |
| `masteryPct` | number | no | — | 0–100. At least one of this/`status` required. |
| `status` | enum | no | — | `not_started \| in_progress \| completed \| needs_review`. |
| `markPracticedNow` | boolean | no | `true` | Sets `lastPracticedAt` to now. |
| `confirm` | boolean | no | `false` | Must be `true` to actually write. |

Same confirm-gate pattern as `create_study_session`. Affects downstream `get_weak_topics` /
`recommend_next_topic` output on the very next call.

**Output:** `{ progress: { id, name, status, masteryPct, lastPracticedAt, ... } }` (topic shape; see `update_study_progress` test for exact fields) or the `CONFIRMATION_REQUIRED` error.

**Errors:** `TOPIC_NOT_FOUND`, `CONFIRMATION_REQUIRED`, `NO_FIELDS_PROVIDED` (neither `masteryPct`
nor `status` given), protocol-level validation.

---

## Connecting to Claude Desktop / Claude Code

Both read the server's config from the same shape — see `README.md` for the exact JSON snippet
and where each client expects it. In both cases:

1. `npm run seed` (once) to populate the demo database.
2. `npm run login -- <username> <password>` to get a `STUDYGRAPH_USER_TOKEN` for `alice` or `bob`.
3. Point the client at `node --import tsx <repo>/apps/mcp-server/src/index.ts` with
   `STUDYGRAPH_USER_TOKEN` (and `JWT_SECRET`, `DATABASE_PATH`) in the server's `env` block.
