import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { DB } from "@studygraph/db";
import { getWeakTopicsShape, getWeakTopics, type AuthContext } from "@studygraph/core";
import { runTool } from "../response.js";

export function registerGetWeakTopics(server: McpServer, db: DB, ctx: AuthContext) {
  server.registerTool(
    "get_weak_topics",
    {
      title: "Get weak topics",
      description:
        "Returns the authenticated user's topics that need attention: mastery below masteryThreshold, " +
        "flagged needs_review, or not practiced in over 10 days. Ranked by a weakness score " +
        "(higher = more urgent), most urgent first.",
      inputSchema: getWeakTopicsShape,
    },
    (args) => runTool(() => getWeakTopics(db, ctx.userId, args))
  );
}
