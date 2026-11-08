import type { Scenario } from "../types.js";
import { assertEval } from "../types.js";
import { parseToolResult } from "../harness.js";

export const incorrectAssumptionsScenarios: Scenario[] = [
  {
    id: "assume-01",
    category: "incorrect-assumptions",
    description: "agent assumes a subject id it invented/misremembered exists",
    async run({ aliceClient }) {
      const result = parseToolResult(await aliceClient.callTool({ name: "get_syllabus", arguments: { subjectId: "sub_doesnotexist12345" } }));
      assertEval(result.ok === false && result.error?.code === "SUBJECT_NOT_FOUND", `expected SUBJECT_NOT_FOUND, got ${JSON.stringify(result)}`);
    },
  },
  {
    id: "assume-02",
    category: "incorrect-assumptions",
    description: "agent assumes create_study_session succeeds without ever setting confirm",
    async run({ aliceClient, seed }) {
      const result = parseToolResult(
        await aliceClient.callTool({
          name: "create_study_session",
          arguments: { subjectId: seed.calc.subject.publicId, startedAt: new Date().toISOString(), durationMinutes: 22 },
        })
      );
      assertEval(result.ok === false && result.error?.code === "CONFIRMATION_REQUIRED", `expected CONFIRMATION_REQUIRED, got ${JSON.stringify(result)}`);
    },
  },
  {
    id: "assume-03",
    category: "incorrect-assumptions",
    description: "agent assumes an exam id it invented/misremembered exists",
    async run({ aliceClient }) {
      const result = parseToolResult(await aliceClient.callTool({ name: "get_exam_readiness", arguments: { examId: "exm_doesnotexist12345" } }));
      assertEval(result.ok === false && result.error?.code === "EXAM_NOT_FOUND", `expected EXAM_NOT_FOUND, got ${JSON.stringify(result)}`);
    },
  },
  {
    id: "assume-04",
    category: "incorrect-assumptions",
    description: "agent passes an inverted date range (from after to) to get_study_sessions",
    async run({ aliceClient }) {
      const now = new Date();
      const from = now.toISOString();
      const to = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
      const result = parseToolResult(await aliceClient.callTool({ name: "get_study_sessions", arguments: { from, to } }));
      assertEval(result.ok === false && result.error?.code === "VALIDATION_ERROR", `expected VALIDATION_ERROR, got ${JSON.stringify(result)}`);
    },
  },
];
