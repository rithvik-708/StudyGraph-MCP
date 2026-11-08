import type { Scenario } from "../types.js";
import { assertEval } from "../types.js";
import { parseToolResult } from "../harness.js";

export const retrievalAccuracyScenarios: Scenario[] = [
  {
    id: "retrieval-01",
    category: "retrieval-accuracy",
    description: "get_subject_progress reports the exact hand-computed average mastery for Calculus II",
    async run({ aliceClient, seed }) {
      const result = parseToolResult(await aliceClient.callTool({ name: "get_subject_progress", arguments: { subjectId: seed.calc.subject.publicId } }));
      assertEval(result.ok, "expected ok=true");
      const subject = result.data.subjects[0];
      assertEval(subject.topicCount === 5, `expected topicCount=5, got ${subject.topicCount}`);
      assertEval(subject.completedCount === 2, `expected completedCount=2, got ${subject.completedCount}`);
      assertEval(Math.abs(subject.avgMasteryPct - 55.0) < 0.01, `expected avgMasteryPct=55.0, got ${subject.avgMasteryPct}`);
    },
  },
  {
    id: "retrieval-02",
    category: "retrieval-accuracy",
    description: "get_weak_topics ranks Vector Calculus as the single weakest Calculus II topic",
    async run({ aliceClient, seed }) {
      const result = parseToolResult(await aliceClient.callTool({ name: "get_weak_topics", arguments: { subjectId: seed.calc.subject.publicId } }));
      assertEval(result.ok, "expected ok=true");
      assertEval(result.data.weakTopics[0].name === "Vector Calculus", `expected top weak topic Vector Calculus, got ${result.data.weakTopics[0]?.name}`);
    },
  },
  {
    id: "retrieval-03",
    category: "retrieval-accuracy",
    description: "get_exam_readiness computes the exact coverage-weighted readiness for the Calculus Midterm",
    async run({ aliceClient, seed }) {
      const result = parseToolResult(await aliceClient.callTool({ name: "get_exam_readiness", arguments: { examId: seed.calcMidterm.publicId } }));
      const exam = result.data.exams[0];
      assertEval(Math.abs(exam.readinessPct - 51.3) < 0.1, `expected readinessPct~51.3, got ${exam.readinessPct}`);
      assertEval(exam.riskLevel === "high", `expected riskLevel=high, got ${exam.riskLevel}`);
    },
  },
  {
    id: "retrieval-04",
    category: "retrieval-accuracy",
    description: "get_exam_readiness computes the exact coverage-weighted readiness for the Organic Chemistry Final",
    async run({ aliceClient, seed }) {
      const result = parseToolResult(await aliceClient.callTool({ name: "get_exam_readiness", arguments: { examId: seed.chemFinal.publicId } }));
      const exam = result.data.exams[0];
      assertEval(Math.abs(exam.readinessPct - 54.9) < 0.1, `expected readinessPct~54.9, got ${exam.readinessPct}`);
      assertEval(exam.riskLevel === "low", `expected riskLevel=low, got ${exam.riskLevel}`);
    },
  },
  {
    id: "retrieval-05",
    category: "retrieval-accuracy",
    description: "get_study_sessions sums exactly 135 minutes for Calculus II in the last 7 days",
    async run({ aliceClient, seed }) {
      const from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const result = parseToolResult(
        await aliceClient.callTool({ name: "get_study_sessions", arguments: { subjectId: seed.calc.subject.publicId, from, limit: 50 } })
      );
      assertEval(result.data.totalMinutes === 135, `expected totalMinutes=135, got ${result.data.totalMinutes}`);
    },
  },
  {
    id: "retrieval-06",
    category: "retrieval-accuracy",
    description: "get_syllabus returns exactly 15 topics across all 3 subjects",
    async run({ aliceClient }) {
      const result = parseToolResult(await aliceClient.callTool({ name: "get_syllabus", arguments: {} }));
      const totalTopics = result.data.subjects.reduce((sum: number, s: any) => sum + s.topics.length, 0);
      assertEval(totalTopics === 15, `expected 15 topics total, got ${totalTopics}`);
    },
  },
];
