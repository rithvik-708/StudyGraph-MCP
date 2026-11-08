import { and, asc, eq, gte } from "drizzle-orm";
import type { DB } from "@studygraph/db";
import { exams, examSubjects, examTopics, topics } from "@studygraph/db";
import { ExamNotFoundError } from "../errors.js";

export type ExamRow = typeof exams.$inferSelect;

export interface CoverageEntry {
  topicId: number; // internal id
  coverageWeight: number;
}

export async function listExams(db: DB, userId: number, opts: { includeUpcomingOnly: boolean }): Promise<ExamRow[]> {
  const conditions = [eq(exams.userId, userId)];
  if (opts.includeUpcomingOnly) {
    conditions.push(gte(exams.examDate, Date.now()));
  }
  return db
    .select()
    .from(exams)
    .where(and(...conditions))
    .orderBy(asc(exams.examDate));
}

export async function requireExam(db: DB, userId: number, publicId: string): Promise<ExamRow> {
  const [row] = await db
    .select()
    .from(exams)
    .where(and(eq(exams.publicId, publicId), eq(exams.userId, userId)))
    .limit(1);
  if (!row) throw new ExamNotFoundError(publicId);
  return row;
}

/**
 * Topic coverage for an exam: explicit exam_topics rows if any exist, otherwise every topic
 * belonging to the exam's linked subjects, weighted by the topic's own syllabus `weight`.
 */
export async function getExamCoverage(db: DB, examInternalId: number): Promise<CoverageEntry[]> {
  const explicit = await db.select().from(examTopics).where(eq(examTopics.examId, examInternalId));
  if (explicit.length > 0) {
    return explicit.map((row) => ({ topicId: row.topicId, coverageWeight: row.coverageWeight }));
  }

  const subjectLinks = await db.select().from(examSubjects).where(eq(examSubjects.examId, examInternalId));
  const coverage: CoverageEntry[] = [];
  for (const link of subjectLinks) {
    const subjectTopics = await db.select().from(topics).where(eq(topics.subjectId, link.subjectId));
    for (const topic of subjectTopics) {
      coverage.push({ topicId: topic.id, coverageWeight: topic.weight });
    }
  }
  return coverage;
}
