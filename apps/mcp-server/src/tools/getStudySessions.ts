import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { DB } from "@studygraph/db";
import { getStudySessionsShape, listSessions, ValidationError, type AuthContext } from "@studygraph/core";
import { runTool } from "../response.js";

export function registerGetStudySessions(server: McpServer, db: DB, ctx: AuthContext) {
  server.registerTool(
    "get_study_sessions",
    {
      title: "Get study sessions",
      description:
        "Returns the authenticated user's logged study session history, most recent first, optionally " +
        "filtered by subject, topic, and/or a date range. Also returns the total minutes across the " +
        "returned sessions.",
      inputSchema: getStudySessionsShape,
    },
    (args) =>
      runTool(() => {
        if (args.from && args.to && Date.parse(args.from) > Date.parse(args.to)) {
          throw new ValidationError("`from` must be before `to`.");
        }
        return listSessions(db, ctx.userId, args);
      })
  );
}
