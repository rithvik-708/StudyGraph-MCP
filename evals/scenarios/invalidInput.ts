import type { Scenario } from "../types.js";
import { assertEval } from "../types.js";
import { parseToolResult } from "../harness.js";

export const invalidInputScenarios: Scenario[] = [
  {
    id: "invalid-01",
    category: "invalid-input",
    description: "create_study_session rejects a negative duration",
    async run({ aliceClient, seed }) {
      const result = parseToolResult(
        await aliceClient.callTool({
          name: "create_study_session",
          arguments: { subjectId: seed.calc.subject.publicId, startedAt: new Date().toISOString(), durationMinutes: -10, confirm: true },
        })
      );
      assertEval(result.ok === false, "expected rejection of negative duration");
    },
  },
  {
    id: "invalid-02",
    category: "invalid-input",
    description: "update_study_progress rejects masteryPct > 100",
    async run({ aliceClient, seed }) {
      const result = parseToolResult(
        await aliceClient.callTool({ name: "update_study_progress", arguments: { topicId: seed.calc.topics[0].publicId, masteryPct: 150, confirm: true } })
      );
      assertEval(result.ok === false, "expected rejection of masteryPct > 100");
    },
  },
  {
    id: "invalid-03",
    category: "invalid-input",
    description: "create_study_session rejects a malformed startedAt date",
    async run({ aliceClient, seed }) {
      const result = parseToolResult(
        await aliceClient.callTool({
          name: "create_study_session",
          arguments: { subjectId: seed.calc.subject.publicId, startedAt: "not-a-date", durationMinutes: 30, confirm: true },
        })
      );
      assertEval(result.ok === false, "expected rejection of malformed date");
    },
  },
  {
    id: "invalid-04",
    category: "invalid-input",
    description: "create_study_session rejects a missing required subjectId",
    async run({ aliceClient }) {
      const result = parseToolResult(
        await aliceClient.callTool({
          name: "create_study_session",
          arguments: { startedAt: new Date().toISOString(), durationMinutes: 30, confirm: true },
        })
      );
      assertEval(result.ok === false, "expected rejection of missing subjectId");
    },
  },
  {
    id: "invalid-05",
    category: "invalid-input",
    description: "get_study_sessions rejects a limit above the maximum of 100",
    async run({ aliceClient }) {
      const result = parseToolResult(await aliceClient.callTool({ name: "get_study_sessions", arguments: { limit: 100000 } }));
      assertEval(result.ok === false, "expected rejection of oversized limit");
    },
  },
  {
    id: "invalid-06",
    category: "invalid-input",
    description: "update_study_progress rejects an invalid status enum value",
    async run({ aliceClient, seed }) {
      const result = parseToolResult(
        await aliceClient.callTool({
          name: "update_study_progress",
          arguments: { topicId: seed.calc.topics[0].publicId, status: "mastered_forever", confirm: true },
        })
      );
      assertEval(result.ok === false, "expected rejection of invalid status enum");
    },
  },
];
