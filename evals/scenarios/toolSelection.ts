import type { Scenario } from "../types.js";
import { assertEval } from "../types.js";
import { getAllToolCallsForPrompt } from "../llmHelper.js";

function toolSelectionScenario(id: string, description: string, prompt: string, expectedTool: string): Scenario {
  return {
    id,
    category: "tool-selection",
    description,
    requiresLlm: true,
    async run({ aliceClient }) {
      // Checks the whole agent loop, not just the first turn: a model that first calls
      // get_syllabus to discover a subject's id before calling the "real" tool is behaving
      // reasonably, not incorrectly.
      const calls = await getAllToolCallsForPrompt(aliceClient, prompt);
      assertEval(calls.includes(expectedTool), `expected "${expectedTool}" to be called for prompt "${prompt}", got [${calls.join(", ")}]`);
    },
  };
}

export const toolSelectionScenarios: Scenario[] = [
  toolSelectionScenario(
    "select-01",
    "a question about weak areas in a specific subject selects get_weak_topics",
    "What topics am I weak in for Organic Chemistry?",
    "get_weak_topics"
  ),
  toolSelectionScenario(
    "select-02",
    "a request to log completed studying selects create_study_session",
    "I just studied Calculus II for 30 minutes starting now, please log it.",
    "create_study_session"
  ),
  toolSelectionScenario(
    "select-03",
    "a readiness question about an upcoming exam selects get_exam_readiness",
    "Am I ready for my upcoming Calculus exam?",
    "get_exam_readiness"
  ),
  toolSelectionScenario(
    "select-04",
    "a request for the full syllabus of a subject selects get_syllabus",
    "Show me my full syllabus for World History, including status of every topic.",
    "get_syllabus"
  ),
  toolSelectionScenario("select-05", "an open-ended 'what should I study next' question selects recommend_next_topic", "What should I study next?", "recommend_next_topic"),
  toolSelectionScenario(
    "select-06",
    "a question about recent time spent studying selects get_study_sessions",
    "How much time have I spent studying this week?",
    "get_study_sessions"
  ),
];
