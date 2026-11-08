import { and, asc, eq } from "drizzle-orm";
import type { DB } from "@studygraph/db";
import { topics, topicProgress } from "@studygraph/db";
import { TopicNotFoundError } from "../errors.js";

export type TopicRow = typeof topics.$inferSelect;
export type TopicProgressRow = typeof topicProgress.$inferSelect;

export async function listTopicsForSubject(db: DB, userId: number, subjectId: number): Promise<TopicRow[]> {
  return db
    .select()
    .from(topics)
    .where(and(eq(topics.subjectId, subjectId), eq(topics.userId, userId)))
    .orderBy(asc(topics.orderIndex));
}

export async function listAllTopics(db: DB, userId: number): Promise<TopicRow[]> {
  return db.select().from(topics).where(eq(topics.userId, userId)).orderBy(asc(topics.orderIndex));
}

/** Resolves a topic's public id to its row, verifying ownership. Throws TopicNotFoundError otherwise. */
export async function requireTopic(db: DB, userId: number, publicId: string): Promise<TopicRow> {
  const [row] = await db
    .select()
    .from(topics)
    .where(and(eq(topics.publicId, publicId), eq(topics.userId, userId)))
    .limit(1);
  if (!row) throw new TopicNotFoundError(publicId);
  return row;
}

export async function getProgressByTopicIds(db: DB, userId: number, topicIds: number[]): Promise<Map<number, TopicProgressRow>> {
  if (topicIds.length === 0) return new Map();
  const rows = await db.select().from(topicProgress).where(eq(topicProgress.userId, userId));
  const map = new Map<number, TopicProgressRow>();
  for (const row of rows) {
    if (topicIds.includes(row.topicId)) map.set(row.topicId, row);
  }
  return map;
}

export function toPublicTopic(row: TopicRow, progress?: TopicProgressRow | null) {
  return {
    id: row.publicId,
    name: row.name,
    orderIndex: row.orderIndex,
    weight: row.weight,
    parentTopicId: row.parentTopicId ?? null,
    status: progress?.status ?? "not_started",
    masteryPct: progress?.masteryPct ?? 0,
    lastPracticedAt: progress?.lastPracticedAt ? new Date(progress.lastPracticedAt).toISOString() : null,
  };
}
