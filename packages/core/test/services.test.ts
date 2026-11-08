import { describe, it, expect, beforeAll } from "vitest";
import { setupTestDb, authContextFor } from "./fixtures.js";
import {
  listSubjects,
  getWeakTopics,
  getExamReadiness,
  recommendNextTopic,
  listSessions,
  createSession,
  updateProgress,
  createStudySessionShape,
  ConfirmationRequiredError,
  NoFieldsProvidedError,
} from "../src/index.js";

let db: Awaited<ReturnType<typeof setupTestDb>>["db"];
let seed: Awaited<ReturnType<typeof setupTestDb>>["seed"];
let aliceId: number;

beforeAll(async () => {
  const setup = await setupTestDb();
  db = setup.db;
  seed = setup.seed;
  aliceId = (await authContextFor(db, seed.alice.publicId)).userId;
});

describe("subjectsService", () => {
  it("lists all of alice's subjects", async () => {
    const rows = await listSubjects(db, aliceId);
    expect(rows.map((r) => r.name).sort()).toEqual(["Calculus II", "Organic Chemistry", "World History"]);
  });
});

describe("recommendationService.getWeakTopics", () => {
  it("ranks Vector Calculus as the weakest Calculus II topic", async () => {
    const result = await getWeakTopics(db, aliceId, { subjectId: seed.calc.subject.publicId, limit: 10, masteryThreshold: 60 });
    expect(result.weakTopics.map((t) => t.name)).toEqual(["Vector Calculus", "Sequences and Series", "Parametric Equations"]);
  });

  it("excludes topics at or above the mastery threshold that are also recently practiced", async () => {
    const result = await getWeakTopics(db, aliceId, { subjectId: seed.calc.subject.publicId, limit: 10, masteryThreshold: 60 });
    expect(result.weakTopics.map((t) => t.name)).not.toContain("Integration Techniques");
    expect(result.weakTopics.map((t) => t.name)).not.toContain("Polar Coordinates");
  });
});

describe("recommendationService.getExamReadiness", () => {
  it("computes the coverage-weighted readiness percentage for the Calculus Midterm", async () => {
    const result = await getExamReadiness(db, aliceId, { examId: seed.calcMidterm.publicId, includeUpcomingOnly: true });
    expect(result.exams).toHaveLength(1);
    expect(result.exams[0].readinessPct).toBeCloseTo(51.3, 1);
    expect(result.exams[0].riskLevel).toBe("high");
    expect(result.exams[0].gaps.map((g) => g.name)).toEqual(["Sequences and Series", "Vector Calculus", "Parametric Equations"]);
  });

  it("computes readiness for the Organic Chemistry Final as lower risk (further away)", async () => {
    const result = await getExamReadiness(db, aliceId, { examId: seed.chemFinal.publicId, includeUpcomingOnly: true });
    expect(result.exams[0].readinessPct).toBeCloseTo(54.9, 1);
    expect(result.exams[0].riskLevel).toBe("low");
  });

  it("returns all upcoming exams when examId is omitted", async () => {
    const result = await getExamReadiness(db, aliceId, { includeUpcomingOnly: true });
    expect(result.exams.map((e) => e.name).sort()).toEqual(["Calculus Midterm", "Organic Chemistry Final"]);
  });
});

describe("recommendationService.recommendNextTopic", () => {
  it("recommends Vector Calculus first, driven by low mastery plus imminent exam coverage", async () => {
    const result = await recommendNextTopic(db, aliceId, { horizonDays: 14 });
    expect(result.recommendations.length).toBeGreaterThan(0);
    expect(result.recommendations.length).toBeLessThanOrEqual(5);
    expect(result.recommendations[0].name).toBe("Vector Calculus");
    expect(result.recommendations[0].relatedExam?.name).toBe("Calculus Midterm");
    expect(result.recommendations[1].name).toBe("Sequences and Series");
  });

  it("excludes exams outside the horizon window from boosting priority", async () => {
    const result = await recommendNextTopic(db, aliceId, { subjectId: seed.chem.subject.publicId, horizonDays: 14 });
    // Organic Chemistry Final is 20 days out, beyond the 14-day horizon, so no recommendation
    // in this subject-scoped call should carry a relatedExam.
    expect(result.recommendations.every((r) => r.relatedExam === null)).toBe(true);
  });
});

describe("sessionsService", () => {
  it("sums total minutes for Calculus II sessions in the last 7 days", async () => {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const result = await listSessions(db, aliceId, { subjectId: seed.calc.subject.publicId, from: sevenDaysAgo, limit: 50 });
    expect(result.totalMinutes).toBe(135); // 45 + 60 + 30, excludes the 12-day-old 90-minute session
  });

  it("creates a session without confirm being part of the service contract (confirm is tool-layer only)", async () => {
    const created = await createSession(db, aliceId, {
      subjectId: seed.calc.subject.publicId,
      topicId: seed.calc.topics[0].publicId,
      startedAt: new Date().toISOString(),
      durationMinutes: 25,
    });
    expect(created.subjectName).toBe("Calculus II");
    expect(created.durationMinutes).toBe(25);
  });
});

describe("progressService", () => {
  it("rejects an update with neither masteryPct nor status", async () => {
    await expect(updateProgress(db, aliceId, { topicId: seed.calc.topics[0].publicId })).rejects.toBeInstanceOf(NoFieldsProvidedError);
  });

  it("updates mastery and reflects immediately in getWeakTopics", async () => {
    await updateProgress(db, aliceId, { topicId: seed.calc.topics[2].publicId, masteryPct: 95, status: "completed" });
    const result = await getWeakTopics(db, aliceId, { subjectId: seed.calc.subject.publicId, limit: 10, masteryThreshold: 60 });
    expect(result.weakTopics.map((t) => t.name)).not.toContain("Parametric Equations");
  });
});

describe("tool-layer confirm gate (shape-level contract)", () => {
  it("createStudySessionShape defaults confirm to false", () => {
    const parsed = createStudySessionShape.confirm.parse(undefined);
    expect(parsed).toBe(false);
  });

  it("ConfirmationRequiredError carries the CONFIRMATION_REQUIRED code", () => {
    const e = new ConfirmationRequiredError();
    expect(e.code).toBe("CONFIRMATION_REQUIRED");
  });
});
