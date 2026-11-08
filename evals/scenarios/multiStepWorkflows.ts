import type { Scenario } from "../types.js";
import { assertEval } from "../types.js";
import { parseToolResult } from "../harness.js";

export const multiStepWorkflowScenarios: Scenario[] = [
  {
    id: "workflow-01",
    category: "multi-step-workflow",
    description: "the full recommend-next-topic chain (syllabus -> weak topics -> exam readiness -> recommendation) is internally consistent",
    async run({ aliceClient, seed }) {
      const syllabus = parseToolResult(await aliceClient.callTool({ name: "get_syllabus", arguments: {} }));
      const weak = parseToolResult(await aliceClient.callTool({ name: "get_weak_topics", arguments: { limit: 20 } }));
      const readiness = parseToolResult(await aliceClient.callTool({ name: "get_exam_readiness", arguments: {} }));
      const recommendation = parseToolResult(await aliceClient.callTool({ name: "recommend_next_topic", arguments: {} }));

      assertEval(syllabus.ok && weak.ok && readiness.ok && recommendation.ok, "expected all four calls to succeed");

      const top = recommendation.data.recommendations[0];
      assertEval(!!top, "expected at least one recommendation");
      assertEval(
        weak.data.weakTopics.some((t: any) => t.name === top.name),
        `expected top recommendation "${top.name}" to also appear in get_weak_topics`
      );
      if (top.relatedExam) {
        assertEval(
          readiness.data.exams.some((e: any) => e.name === top.relatedExam.name),
          `expected related exam "${top.relatedExam.name}" to also appear in get_exam_readiness`
        );
      }
      assertEval(top.name === "Vector Calculus", `expected the grounded top recommendation to be Vector Calculus, got ${top.name}`);
    },
  },
  {
    id: "workflow-02",
    category: "multi-step-workflow",
    description: "a logged study session immediately shows up in subsequent get_study_sessions and get_subject_progress calls",
    async run({ aliceClient, seed }) {
      const before = parseToolResult(await aliceClient.callTool({ name: "get_study_sessions", arguments: { subjectId: seed.history.subject.publicId } }));

      const created = parseToolResult(
        await aliceClient.callTool({
          name: "create_study_session",
          arguments: {
            subjectId: seed.history.subject.publicId,
            topicId: seed.history.topics[2].publicId, // Cold War
            startedAt: new Date().toISOString(),
            durationMinutes: 50,
            confirm: true,
          },
        })
      );
      assertEval(created.ok, "expected the session write to succeed");

      const after = parseToolResult(await aliceClient.callTool({ name: "get_study_sessions", arguments: { subjectId: seed.history.subject.publicId } }));
      assertEval(after.data.sessions.length === before.data.sessions.length + 1, "expected exactly one new session to appear");
      assertEval(
        after.data.sessions.some((s: any) => s.durationMinutes === 50 && s.topicName === "Cold War"),
        "expected the newly logged session to be retrievable"
      );
    },
  },
  {
    id: "workflow-03",
    category: "multi-step-workflow",
    description: "updating a topic's mastery above the threshold removes it from get_weak_topics on the very next call",
    async run({ aliceClient, seed }) {
      const before = parseToolResult(await aliceClient.callTool({ name: "get_weak_topics", arguments: { subjectId: seed.chem.subject.publicId } }));
      assertEval(
        before.data.weakTopics.some((t: any) => t.name === "Reaction Mechanisms"),
        "expected Reaction Mechanisms to start out weak"
      );

      const updated = parseToolResult(
        await aliceClient.callTool({
          name: "update_study_progress",
          arguments: { topicId: seed.chem.topics[1].publicId, masteryPct: 90, status: "completed", confirm: true },
        })
      );
      assertEval(updated.ok, "expected the progress update to succeed");

      const after = parseToolResult(await aliceClient.callTool({ name: "get_weak_topics", arguments: { subjectId: seed.chem.subject.publicId } }));
      assertEval(
        !after.data.weakTopics.some((t: any) => t.name === "Reaction Mechanisms"),
        "expected Reaction Mechanisms to no longer be weak after the update"
      );
    },
  },
];
