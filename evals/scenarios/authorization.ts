import type { Scenario } from "../types.js";
import { assertEval } from "../types.js";
import { parseToolResult } from "../harness.js";

export const authorizationScenarios: Scenario[] = [
  {
    id: "auth-01",
    category: "authorization",
    description: "alice cannot read bob's subject via get_syllabus (NOT_FOUND, no existence leak)",
    async run({ aliceClient, seed }) {
      const result = parseToolResult(await aliceClient.callTool({ name: "get_syllabus", arguments: { subjectId: seed.linAlg.subject.publicId } }));
      assertEval(result.ok === false && result.error?.code === "SUBJECT_NOT_FOUND", `expected SUBJECT_NOT_FOUND, got ${JSON.stringify(result)}`);
    },
  },
  {
    id: "auth-02",
    category: "authorization",
    description: "bob cannot read alice's subject via get_weak_topics",
    async run({ bobClient, seed }) {
      const result = parseToolResult(await bobClient.callTool({ name: "get_weak_topics", arguments: { subjectId: seed.calc.subject.publicId } }));
      assertEval(result.ok === false && result.error?.code === "SUBJECT_NOT_FOUND", `expected SUBJECT_NOT_FOUND, got ${JSON.stringify(result)}`);
    },
  },
  {
    id: "auth-03",
    category: "authorization",
    description: "alice cannot read bob's exam via get_exam_readiness",
    async run({ aliceClient, seed }) {
      const result = parseToolResult(await aliceClient.callTool({ name: "get_exam_readiness", arguments: { examId: seed.linAlgQuiz.publicId } }));
      assertEval(result.ok === false && result.error?.code === "EXAM_NOT_FOUND", `expected EXAM_NOT_FOUND, got ${JSON.stringify(result)}`);
    },
  },
  {
    id: "auth-04",
    category: "authorization",
    description: "bob cannot create a study session against alice's subject, even with confirm=true",
    async run({ bobClient, aliceClient, seed }) {
      const before = parseToolResult(await aliceClient.callTool({ name: "get_study_sessions", arguments: { subjectId: seed.calc.subject.publicId, limit: 50 } }));
      const result = parseToolResult(
        await bobClient.callTool({
          name: "create_study_session",
          arguments: { subjectId: seed.calc.subject.publicId, startedAt: new Date().toISOString(), durationMinutes: 15, confirm: true },
        })
      );
      assertEval(result.ok === false && result.error?.code === "SUBJECT_NOT_FOUND", `expected SUBJECT_NOT_FOUND, got ${JSON.stringify(result)}`);
      const after = parseToolResult(await aliceClient.callTool({ name: "get_study_sessions", arguments: { subjectId: seed.calc.subject.publicId, limit: 50 } }));
      assertEval(after.data.sessions.length === before.data.sessions.length, "expected no session to have been written to alice's subject");
    },
  },
  {
    id: "auth-05",
    category: "authorization",
    description: "alice cannot update progress on bob's topic, even with confirm=true",
    async run({ aliceClient, seed }) {
      const result = parseToolResult(
        await aliceClient.callTool({
          name: "update_study_progress",
          arguments: { topicId: seed.linAlg.topics[0].publicId, masteryPct: 1, confirm: true },
        })
      );
      assertEval(result.ok === false && result.error?.code === "TOPIC_NOT_FOUND", `expected TOPIC_NOT_FOUND, got ${JSON.stringify(result)}`);
    },
  },
];
