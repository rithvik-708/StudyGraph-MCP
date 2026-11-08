import { eq } from "drizzle-orm";
import type { DB } from "@studygraph/db";
import { topicProgress } from "@studygraph/db";
import { requireTopic, toPublicTopic, type TopicProgressRow } from "./topicsService.js";
import { NoFieldsProvidedError } from "../errors.js";

export interface UpdateProgressInput {
  topicId: string; // public id
  masteryPct?: number;
  status?: "not_started" | "in_progress" | "completed" | "needs_review";
  markPracticedNow?: boolean;
}

export async function getProgressForTopic(db: DB, topicInternalId: number): Promise<TopicProgressRow | undefined> {
  const [row] = await db.select().from(topicProgress).where(eq(topicProgress.topicId, topicInternalId)).limit(1);
  return row;
}

export async function updateProgress(db: DB, userId: number, input: UpdateProgressInput) {
  if (input.masteryPct === undefined && input.status === undefined) {
    throw new NoFieldsProvidedError("Provide masteryPct and/or status to update.");
  }

  const topic = await requireTopic(db, userId, input.topicId);
  const existing = await getProgressForTopic(db, topic.id);
  const now = Date.now();
  const markPracticed = input.markPracticedNow ?? true;

  if (!existing) {
    const [created] = await db
      .insert(topicProgress)
      .values({
        topicId: topic.id,
        userId,
        status: input.status ?? "in_progress",
        masteryPct: input.masteryPct ?? 0,
        lastPracticedAt: markPracticed ? now : null,
        updatedAt: now,
      })
      .returning();
    return toPublicTopic(topic, created);
  }

  const [updated] = await db
    .update(topicProgress)
    .set({
      status: input.status ?? existing.status,
      masteryPct: input.masteryPct ?? existing.masteryPct,
      lastPracticedAt: markPracticed ? now : existing.lastPracticedAt,
      updatedAt: now,
    })
    .where(eq(topicProgress.id, existing.id))
    .returning();

  return toPublicTopic(topic, updated);
}
