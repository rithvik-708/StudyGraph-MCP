import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { DB } from "@studygraph/db";
import { recommendNextTopicShape, recommendNextTopic, type AuthContext } from "@studygraph/core";
import { runTool } from "../response.js";

export function registerRecommendNextTopic(server: McpServer, db: DB, ctx: AuthContext) {
  server.registerTool(
    "recommend_next_topic",
    {
      title: "Recommend next topic",
      description:
        "Returns up to 5 ranked topic recommendations for what the user should study next, combining " +
        "weak-topic signals (low mastery, staleness, needs_review) with upcoming exam coverage within " +
        "horizonDays. Each recommendation includes a human-readable reason and, if applicable, the " +
        "related upcoming exam. This is deterministic, computed directly from the user's own data -- " +
        "it is not an AI-generated guess.",
      inputSchema: recommendNextTopicShape,
    },
    (args) => runTool(() => recommendNextTopic(db, ctx.userId, args))
  );
}
