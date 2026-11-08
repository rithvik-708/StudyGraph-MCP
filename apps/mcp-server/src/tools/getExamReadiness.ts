import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { DB } from "@studygraph/db";
import { getExamReadinessShape, getExamReadiness, type AuthContext } from "@studygraph/core";
import { runTool } from "../response.js";

export function registerGetExamReadiness(server: McpServer, db: DB, ctx: AuthContext) {
  server.registerTool(
    "get_exam_readiness",
    {
      title: "Get exam readiness",
      description:
        "Returns readiness for one exam (via examId) or the user's upcoming exams: a coverage-weighted " +
        "readiness percentage computed from topic mastery, days remaining, a qualitative risk level " +
        "(low/medium/high), and the specific topic gaps (mastery below 70%) sorted by exam weight.",
      inputSchema: getExamReadinessShape,
    },
    (args) => runTool(() => getExamReadiness(db, ctx.userId, args))
  );
}
