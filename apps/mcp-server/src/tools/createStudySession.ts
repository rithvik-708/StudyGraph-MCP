import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { DB } from "@studygraph/db";
import { createStudySessionShape, createSession, ConfirmationRequiredError, type AuthContext } from "@studygraph/core";
import { runTool } from "../response.js";

export function registerCreateStudySession(server: McpServer, db: DB, ctx: AuthContext) {
  server.registerTool(
    "create_study_session",
    {
      title: "Create study session",
      description:
        "Logs a study session for the authenticated user. WRITE OPERATION: this modifies data. " +
        "Before calling this with confirm=true, first show the user the proposed subject, topic, start " +
        "time, and duration, and only proceed once they explicitly approve. Calling without confirm=true " +
        "performs no write and returns a CONFIRMATION_REQUIRED error -- use that first call only to " +
        "validate the inputs, not to silently retry with confirm=true.",
      inputSchema: createStudySessionShape,
    },
    (args) =>
      runTool(() => {
        if (args.confirm !== true) {
          throw new ConfirmationRequiredError();
        }
        return createSession(db, ctx.userId, args);
      })
  );
}
