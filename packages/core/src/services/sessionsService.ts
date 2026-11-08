import { and, desc, eq, gte, lte } from "drizzle-orm";
import type { DB } from "@studygraph/db";
import { studySessions, subjects, topics, genId } from "@studygraph/db";
import { requireSubject, toPublicSubject } from "./subjectsService.js";
import { requireTopic, toPublicTopic } from "./topicsService.js";
import { TopicNotFoundError } from "../errors.js";

export type StudySessionRow = typeof studySessions.$inferSelect;

export interface CreateSessionInput {
  subjectId: string; // public id
  topicId?: string; // public id
  startedAt: string; // ISO
  durationMinutes: number;
  notes?: string;
  focusRating?: number;
}

export interface ListSessionsFilter {
  subjectId?: string;
  topicId?: string;
  from?: string;
  to?: string;
  limit: number;
}

function toPublicSession(row: StudySessionRow, subjectName: string, topicName: string | null) {
  return {
    id: row.publicId,
    subjectName,
    topicName,
    startedAt: new Date(row.startedAt).toISOString(),
    durationMinutes: row.durationMinutes,
    notes: row.notes,
    focusRating: row.focusRating,
  };
}

export async function createSession(db: DB, userId: number, input: CreateSessionInput) {
  const subject = await requireSubject(db, userId, input.subjectId);

  let topicInternalId: number | null = null;
  let topicName: string | null = null;
  if (input.topicId) {
    const topic = await requireTopic(db, userId, input.topicId);
    if (topic.subjectId !== subject.id) {
      throw new TopicNotFoundError(input.topicId);
    }
    topicInternalId = topic.id;
    topicName = topic.name;
  }

  const startedAtMs = Date.parse(input.startedAt);
  const now = Date.now();

  const [created] = await db
    .insert(studySessions)
    .values({
      publicId: genId("ses"),
      userId,
      subjectId: subject.id,
      topicId: topicInternalId,
      startedAt: startedAtMs,
      durationMinutes: input.durationMinutes,
      notes: input.notes ?? null,
      focusRating: input.focusRating ?? null,
      createdAt: now,
    })
    .returning();

  return toPublicSession(created, subject.name, topicName);
}

export async function listSessions(db: DB, userId: number, filter: ListSessionsFilter) {
  const conditions = [eq(studySessions.userId, userId)];

  if (filter.subjectId) {
    const subject = await requireSubject(db, userId, filter.subjectId);
    conditions.push(eq(studySessions.subjectId, subject.id));
  }
  if (filter.topicId) {
    const topic = await requireTopic(db, userId, filter.topicId);
    conditions.push(eq(studySessions.topicId, topic.id));
  }
  if (filter.from) {
    conditions.push(gte(studySessions.startedAt, Date.parse(filter.from)));
  }
  if (filter.to) {
    conditions.push(lte(studySessions.startedAt, Date.parse(filter.to)));
  }

  const rows = await db
    .select()
    .from(studySessions)
    .where(and(...conditions))
    .orderBy(desc(studySessions.startedAt))
    .limit(filter.limit);

  // Resolve subject/topic names for display without leaking other users' data
  // (both are already scoped to userId above via the required-ownership lookups
  // for filters, and via subjectId/topicId stored on the user's own rows otherwise).
  const subjectNameCache = new Map<number, string>();
  const topicNameCache = new Map<number, string>();

  const allSubjects = await db.select().from(subjects).where(eq(subjects.userId, userId));
  for (const s of allSubjects) subjectNameCache.set(s.id, s.name);
  const allTopics = await db.select().from(topics).where(eq(topics.userId, userId));
  for (const t of allTopics) topicNameCache.set(t.id, t.name);

  const sessions = rows.map((row) =>
    toPublicSession(row, subjectNameCache.get(row.subjectId) ?? "Unknown subject", row.topicId ? topicNameCache.get(row.topicId) ?? null : null)
  );

  const totalMinutes = rows.reduce((sum, r) => sum + r.durationMinutes, 0);

  return { sessions, totalMinutes };
}
