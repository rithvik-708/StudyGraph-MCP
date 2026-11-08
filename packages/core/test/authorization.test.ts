import { describe, it, expect, beforeAll } from "vitest";
import { setupTestDb, authContextFor } from "./fixtures.js";
import {
  requireSubject,
  requireTopic,
  requireExam,
  listSessions,
  createSession,
  updateProgress,
  SubjectNotFoundError,
  TopicNotFoundError,
  ExamNotFoundError,
} from "../src/index.js";

let db: Awaited<ReturnType<typeof setupTestDb>>["db"];
let seed: Awaited<ReturnType<typeof setupTestDb>>["seed"];
let aliceId: number;
let bobId: number;

beforeAll(async () => {
  const setup = await setupTestDb();
  db = setup.db;
  seed = setup.seed;
  const aliceCtx = await authContextFor(db, seed.alice.publicId);
  const bobCtx = await authContextFor(db, seed.bob.publicId);
  aliceId = aliceCtx.userId;
  bobId = bobCtx.userId;
});

describe("cross-user authorization boundaries", () => {
  it("denies alice access to bob's subject by public id (NOT_FOUND, not FORBIDDEN)", async () => {
    await expect(requireSubject(db, aliceId, seed.linAlg.subject.publicId)).rejects.toBeInstanceOf(SubjectNotFoundError);
  });

  it("denies bob access to alice's subject by public id", async () => {
    await expect(requireSubject(db, bobId, seed.calc.subject.publicId)).rejects.toBeInstanceOf(SubjectNotFoundError);
  });

  it("denies alice access to bob's topic by public id", async () => {
    await expect(requireTopic(db, aliceId, seed.linAlg.topics[0].publicId)).rejects.toBeInstanceOf(TopicNotFoundError);
  });

  it("denies bob access to alice's topic by public id", async () => {
    await expect(requireTopic(db, bobId, seed.calc.topics[0].publicId)).rejects.toBeInstanceOf(TopicNotFoundError);
  });

  it("denies alice access to bob's exam by public id", async () => {
    await expect(requireExam(db, aliceId, seed.linAlgQuiz.publicId)).rejects.toBeInstanceOf(ExamNotFoundError);
  });

  it("denies bob access to alice's exam by public id", async () => {
    await expect(requireExam(db, bobId, seed.calcMidterm.publicId)).rejects.toBeInstanceOf(ExamNotFoundError);
  });

  it("does not return another user's sessions when filtering by the other user's subject id", async () => {
    await expect(listSessions(db, bobId, { subjectId: seed.calc.subject.publicId, limit: 20 })).rejects.toBeInstanceOf(SubjectNotFoundError);
  });

  it("rejects creating a session against another user's subject", async () => {
    await expect(
      createSession(db, bobId, {
        subjectId: seed.calc.subject.publicId,
        startedAt: new Date().toISOString(),
        durationMinutes: 30,
      })
    ).rejects.toBeInstanceOf(SubjectNotFoundError);
  });

  it("rejects updating progress on another user's topic", async () => {
    await expect(updateProgress(db, bobId, { topicId: seed.calc.topics[0].publicId, masteryPct: 99 })).rejects.toBeInstanceOf(TopicNotFoundError);
  });

  it("each user only sees their own subjects via listSessions default scope (no leakage check via totals)", async () => {
    const aliceSessions = await listSessions(db, aliceId, { limit: 50 });
    const bobSessions = await listSessions(db, bobId, { limit: 50 });
    expect(aliceSessions.sessions.every((s) => s.subjectName !== "Linear Algebra")).toBe(true);
    expect(bobSessions.sessions.every((s) => s.subjectName === "Linear Algebra")).toBe(true);
  });
});
