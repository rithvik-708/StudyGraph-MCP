import type { DB } from "@studygraph/db";
import { subjects as subjectsTable, exams as examsTable, examSubjects } from "@studygraph/db";
import { eq } from "drizzle-orm";
import { requireSubject } from "./subjectsService.js";
import { listAllTopics, listTopicsForSubject, getProgressByTopicIds, type TopicRow, type TopicProgressRow } from "./topicsService.js";
import { listExams, getExamCoverage, requireExam, type ExamRow } from "./examsService.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const STALE_DAYS = 10;
const DEFAULT_WEAK_THRESHOLD = 60;
const GAP_THRESHOLD = 70;

interface TopicSignal {
  topicInternalId: number;
  topicPublicId: string;
  name: string;
  subjectId: number;
  subjectName: string;
  weight: number;
  masteryPct: number;
  status: TopicProgressRow["status"];
  lastPracticedAt: number | null;
  daysSincePracticed: number | null;
  isWeak: boolean;
  weaknessScore: number;
}

async function getTopicSignals(db: DB, userId: number, subjectId?: string, masteryThreshold = DEFAULT_WEAK_THRESHOLD): Promise<TopicSignal[]> {
  let topicRows: TopicRow[];
  let subjectMap = new Map<number, string>();

  if (subjectId) {
    const subject = await requireSubject(db, userId, subjectId);
    topicRows = await listTopicsForSubject(db, userId, subject.id);
    subjectMap.set(subject.id, subject.name);
  } else {
    topicRows = await listAllTopics(db, userId);
    const allSubjects = await db.select().from(subjectsTable).where(eq(subjectsTable.userId, userId));
    for (const s of allSubjects) subjectMap.set(s.id, s.name);
  }

  const progressMap = await getProgressByTopicIds(
    db,
    userId,
    topicRows.map((t) => t.id)
  );

  const now = Date.now();

  return topicRows.map((topic) => {
    const progress = progressMap.get(topic.id);
    const masteryPct = progress?.masteryPct ?? 0;
    const status = progress?.status ?? "not_started";
    const lastPracticedAt = progress?.lastPracticedAt ?? null;
    const daysSincePracticed = lastPracticedAt === null ? null : Math.floor((now - lastPracticedAt) / DAY_MS);

    const isStale = lastPracticedAt === null || (daysSincePracticed !== null && daysSincePracticed > STALE_DAYS);
    const isWeak = masteryPct < masteryThreshold || status === "needs_review" || isStale;

    const stalenessBonus = lastPracticedAt === null ? 50 : Math.max(0, (daysSincePracticed ?? 0) - STALE_DAYS) * 2;
    const weaknessScore = (100 - masteryPct) * topic.weight + stalenessBonus;

    return {
      topicInternalId: topic.id,
      topicPublicId: topic.publicId,
      name: topic.name,
      subjectId: topic.subjectId,
      subjectName: subjectMap.get(topic.subjectId) ?? "Unknown subject",
      weight: topic.weight,
      masteryPct,
      status,
      lastPracticedAt,
      daysSincePracticed,
      isWeak,
      weaknessScore,
    };
  });
}

export interface GetWeakTopicsOptions {
  subjectId?: string;
  limit: number;
  masteryThreshold: number;
}

export async function getWeakTopics(db: DB, userId: number, opts: GetWeakTopicsOptions) {
  const signals = await getTopicSignals(db, userId, opts.subjectId, opts.masteryThreshold);
  const weak = signals
    .filter((s) => s.isWeak)
    .sort((a, b) => b.weaknessScore - a.weaknessScore)
    .slice(0, opts.limit);

  return {
    weakTopics: weak.map((s) => ({
      id: s.topicPublicId,
      name: s.name,
      subjectName: s.subjectName,
      masteryPct: s.masteryPct,
      status: s.status,
      lastPracticedAt: s.lastPracticedAt ? new Date(s.lastPracticedAt).toISOString() : null,
      daysSincePracticed: s.daysSincePracticed,
      weaknessScore: Math.round(s.weaknessScore * 10) / 10,
    })),
  };
}

export interface GetExamReadinessOptions {
  examId?: string;
  includeUpcomingOnly: boolean;
}

function computeRiskLevel(readinessPct: number, daysRemaining: number): "low" | "medium" | "high" {
  const timeWeight = daysRemaining <= 7 ? 1.5 : daysRemaining <= 14 ? 1.0 : 0.6;
  const riskScore = (100 - readinessPct) * timeWeight;
  if (riskScore > 60) return "high";
  if (riskScore > 30) return "medium";
  return "low";
}

async function computeExamReadiness(db: DB, userId: number, exam: ExamRow) {
  const coverage = await getExamCoverage(db, exam.id);
  const now = Date.now();
  const daysRemaining = Math.max(0, Math.ceil((exam.examDate - now) / DAY_MS));

  if (coverage.length === 0) {
    return {
      id: exam.publicId,
      name: exam.name,
      examDate: new Date(exam.examDate).toISOString(),
      daysRemaining,
      readinessPct: null as number | null,
      riskLevel: "unknown" as const,
      gaps: [] as Array<{ topicId: string; name: string; masteryPct: number; coverageWeight: number }>,
    };
  }

  const progressMap = await getProgressByTopicIds(
    db,
    userId,
    coverage.map((c) => c.topicId)
  );
  const topicRows = await listAllTopics(db, userId);
  const topicById = new Map(topicRows.map((t) => [t.id, t]));

  let weightedSum = 0;
  let weightTotal = 0;
  const gaps: Array<{ topicId: string; name: string; masteryPct: number; coverageWeight: number }> = [];

  for (const entry of coverage) {
    const topic = topicById.get(entry.topicId);
    if (!topic) continue; // topic no longer exists; skip rather than fail the whole exam
    const masteryPct = progressMap.get(entry.topicId)?.masteryPct ?? 0;
    weightedSum += masteryPct * entry.coverageWeight;
    weightTotal += entry.coverageWeight;
    if (masteryPct < GAP_THRESHOLD) {
      gaps.push({ topicId: topic.publicId, name: topic.name, masteryPct, coverageWeight: entry.coverageWeight });
    }
  }

  const readinessPct = weightTotal > 0 ? Math.round((weightedSum / weightTotal) * 10) / 10 : 0;
  gaps.sort((a, b) => b.coverageWeight - a.coverageWeight);

  return {
    id: exam.publicId,
    name: exam.name,
    examDate: new Date(exam.examDate).toISOString(),
    daysRemaining,
    readinessPct,
    riskLevel: computeRiskLevel(readinessPct, daysRemaining),
    gaps,
  };
}

export async function getExamReadiness(db: DB, userId: number, opts: GetExamReadinessOptions) {
  if (opts.examId) {
    const exam = await requireExam(db, userId, opts.examId);
    return { exams: [await computeExamReadiness(db, userId, exam)] };
  }

  const examRows = await listExams(db, userId, { includeUpcomingOnly: opts.includeUpcomingOnly });
  const results = [];
  for (const exam of examRows) {
    results.push(await computeExamReadiness(db, userId, exam));
  }
  return { exams: results };
}

export interface RecommendNextTopicOptions {
  subjectId?: string;
  horizonDays: number;
}

export async function recommendNextTopic(db: DB, userId: number, opts: RecommendNextTopicOptions) {
  const signals = await getTopicSignals(db, userId, opts.subjectId);

  // Upcoming exams within the horizon, optionally restricted to the given subject.
  const examRows = await listExams(db, userId, { includeUpcomingOnly: true });
  const now = Date.now();

  type ExamBoost = { examId: string; examName: string; daysRemaining: number; coverageWeight: number };
  const boostByTopic = new Map<number, ExamBoost>();

  for (const exam of examRows) {
    const daysRemaining = Math.ceil((exam.examDate - now) / DAY_MS);
    if (daysRemaining > opts.horizonDays) continue;

    if (opts.subjectId) {
      const links = await db.select().from(examSubjects).where(eq(examSubjects.examId, exam.id));
      const subject = await requireSubject(db, userId, opts.subjectId);
      if (!links.some((l) => l.subjectId === subject.id)) continue;
    }

    const coverage = await getExamCoverage(db, exam.id);
    for (const entry of coverage) {
      const existing = boostByTopic.get(entry.topicId);
      // Keep the most urgent (soonest) exam that touches this topic.
      if (!existing || daysRemaining < existing.daysRemaining) {
        boostByTopic.set(entry.topicId, {
          examId: exam.publicId,
          examName: exam.name,
          daysRemaining,
          coverageWeight: entry.coverageWeight,
        });
      }
    }
  }

  const scored = signals
    .filter((s) => s.isWeak)
    .map((s) => {
      const boost = boostByTopic.get(s.topicInternalId);
      const urgencyFactor = boost ? Math.max(0.2, 2 - boost.daysRemaining / opts.horizonDays) : 0;
      const examBoost = boost ? boost.coverageWeight * urgencyFactor * 20 : 0;
      const priorityScore = Math.round((s.weaknessScore + examBoost) * 10) / 10;

      const reasonParts: string[] = [];
      reasonParts.push(`${Math.round(s.masteryPct)}% mastery`);
      if (s.lastPracticedAt === null) {
        reasonParts.push("never practiced");
      } else if (s.daysSincePracticed !== null && s.daysSincePracticed > STALE_DAYS) {
        reasonParts.push(`not practiced in ${s.daysSincePracticed} days`);
      }
      if (s.status === "needs_review") reasonParts.push("flagged for review");
      if (boost) {
        reasonParts.push(`tested by "${boost.examName}" in ${boost.daysRemaining} day${boost.daysRemaining === 1 ? "" : "s"}`);
      }

      return {
        topicId: s.topicPublicId,
        name: s.name,
        subjectName: s.subjectName,
        reason: reasonParts.join(", "),
        masteryPct: s.masteryPct,
        relatedExam: boost ? { examId: boost.examId, name: boost.examName, daysRemaining: boost.daysRemaining } : null,
        priorityScore,
      };
    })
    .sort((a, b) => b.priorityScore - a.priorityScore)
    .slice(0, 5);

  return { recommendations: scored };
}
