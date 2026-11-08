import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { DB } from "@studygraph/db";
import {
  getSubjectProgressShape,
  listSubjects,
  requireSubject,
  toPublicSubject,
  listTopicsForSubject,
  getProgressByTopicIds,
  type AuthContext,
} from "@studygraph/core";
import { runTool } from "../response.js";

export function registerGetSubjectProgress(server: McpServer, db: DB, ctx: AuthContext) {
  server.registerTool(
    "get_subject_progress",
    {
      title: "Get subject progress",
      description:
        "Returns aggregate completion statistics for one subject (via subjectId) or all of the " +
        "authenticated user's subjects: topic count, how many are completed, average mastery " +
        "percentage, and the most recent activity timestamp.",
      inputSchema: getSubjectProgressShape,
    },
    (args) =>
      runTool(async () => {
        const subjectRows = args.subjectId ? [await requireSubject(db, ctx.userId, args.subjectId)] : await listSubjects(db, ctx.userId);

        const result = [];
        for (const subject of subjectRows) {
          const topicRows = await listTopicsForSubject(db, ctx.userId, subject.id);
          const progressMap = await getProgressByTopicIds(
            db,
            ctx.userId,
            topicRows.map((t) => t.id)
          );

          const completedCount = topicRows.filter((t) => progressMap.get(t.id)?.status === "completed").length;
          const masteryValues = topicRows.map((t) => progressMap.get(t.id)?.masteryPct ?? 0);
          const avgMasteryPct = masteryValues.length > 0 ? Math.round((masteryValues.reduce((a, b) => a + b, 0) / masteryValues.length) * 10) / 10 : 0;
          const lastActivityTimestamps = topicRows.map((t) => progressMap.get(t.id)?.lastPracticedAt).filter((v): v is number => typeof v === "number");
          const lastActivityAt = lastActivityTimestamps.length > 0 ? new Date(Math.max(...lastActivityTimestamps)).toISOString() : null;

          result.push({
            ...toPublicSubject(subject),
            topicCount: topicRows.length,
            completedCount,
            avgMasteryPct,
            lastActivityAt,
          });
        }
        return { subjects: result };
      })
  );
}
