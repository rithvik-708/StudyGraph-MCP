import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { DB } from "@studygraph/db";
import { updateStudyProgressShape, updateProgress, ConfirmationRequiredError, type AuthContext } from "@studygraph/core";
import { runTool } from "../response.js";

export function registerUpdateStudyProgress(server: McpServer, db: DB, ctx: AuthContext) {
  server.registerTool(
    "update_study_progress",
    {
      title: "Update study progress",
      description:
        "Updates mastery percentage and/or status for one of the authenticated user's topics (e.g. after " +
        "a quiz or self-assessment). WRITE OPERATION: this modifies data and affects downstream " +
        "recommendations. Before calling with confirm=true, first show the user the proposed change and " +
        "only proceed once they explicitly approve. Calling without confirm=true performs no write and " +
        "returns a CONFIRMATION_REQUIRED error. At least one of masteryPct or status must be provided.",
      inputSchema: updateStudyProgressShape,
    },
    (args) =>
      runTool(() => {
        if (args.confirm !== true) {
          throw new ConfirmationRequiredError();
        }
        return updateProgress(db, ctx.userId, args);
      })
  );
}
