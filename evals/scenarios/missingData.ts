import { eq } from "drizzle-orm";
import { subjects, topics, topicProgress, studySessions, exams, examSubjects, examTopics, genId } from "@studygraph/db";
import type { Scenario } from "../types.js";
import { assertEval } from "../types.js";
import { parseToolResult } from "../harness.js";

export const missingDataScenarios: Scenario[] = [
  {
    id: "missing-01",
    category: "missing-data",
    description: "get_syllabus handles a subject with zero topics gracefully (empty array, not an error)",
    async run({ db, aliceClient, seed }) {
      const [emptySubject] = await db
        .insert(subjects)
        .values({ publicId: genId("sub"), userId: seed.alice.id, name: "Empty Subject", createdAt: Date.now() })
        .returning();
      const result = parseToolResult(await aliceClient.callTool({ name: "get_syllabus", arguments: { subjectId: emptySubject.publicId } }));
      assertEval(result.ok, "expected ok=true for a subject with no topics");
      assertEval(result.data.subjects[0].topics.length === 0, "expected an empty topics array");
    },
  },
  {
    id: "missing-02",
    category: "missing-data",
    description: "get_exam_readiness returns an empty list (not an error) for a user with no exams",
    async run({ db, bobClient, seed }) {
      await db.delete(examTopics).where(eq(examTopics.examId, seed.linAlgQuiz.id));
      await db.delete(examSubjects).where(eq(examSubjects.examId, seed.linAlgQuiz.id));
      await db.delete(exams).where(eq(exams.id, seed.linAlgQuiz.id));

      const result = parseToolResult(await bobClient.callTool({ name: "get_exam_readiness", arguments: {} }));
      assertEval(result.ok, "expected ok=true for a user with no exams");
      assertEval(result.data.exams.length === 0, "expected an empty exams array");
    },
  },
  {
    id: "missing-03",
    category: "missing-data",
    description: "get_study_sessions returns an empty list (not an error) for a date range with no activity",
    async run({ aliceClient }) {
      const farFuture = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
      const result = parseToolResult(await aliceClient.callTool({ name: "get_study_sessions", arguments: { from: farFuture } }));
      assertEval(result.ok, "expected ok=true for an empty date range");
      assertEval(result.data.sessions.length === 0, "expected zero sessions");
      assertEval(result.data.totalMinutes === 0, "expected totalMinutes=0");
    },
  },
  {
    id: "missing-04",
    category: "missing-data",
    description: "recommend_next_topic returns an empty recommendation list (not an error) for a user with no topics",
    async run({ db, bobClient, seed }) {
      await db.delete(examTopics).where(eq(examTopics.examId, seed.linAlgQuiz.id));
      await db.delete(examSubjects).where(eq(examSubjects.examId, seed.linAlgQuiz.id));
      await db.delete(exams).where(eq(exams.id, seed.linAlgQuiz.id));
      await db.delete(studySessions).where(eq(studySessions.userId, seed.bob.id));
      for (const topic of seed.linAlg.topics) {
        await db.delete(topicProgress).where(eq(topicProgress.topicId, topic.id));
        await db.delete(topics).where(eq(topics.id, topic.id));
      }

      const result = parseToolResult(await bobClient.callTool({ name: "recommend_next_topic", arguments: {} }));
      assertEval(result.ok, "expected ok=true for a user with no topics at all");
      assertEval(result.data.recommendations.length === 0, "expected zero recommendations");
    },
  },
];
