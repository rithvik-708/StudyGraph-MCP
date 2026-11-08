import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { DB } from "@studygraph/db";
import {
  getSyllabusShape,
  listSubjects,
  requireSubject,
  toPublicSubject,
  listTopicsForSubject,
  getProgressByTopicIds,
  toPublicTopic,
  type AuthContext,
} from "@studygraph/core";
import { runTool } from "../response.js";

export function registerGetSyllabus(server: McpServer, db: DB, ctx: AuthContext) {
  server.registerTool(
    "get_syllabus",
    {
      title: "Get syllabus",
      description:
        "Returns the authenticated user's syllabus: subjects and, for each, its ordered list of topics " +
        "with current status and mastery percentage. Scope to one subject with subjectId, or omit it to " +
        "get the full syllabus across all subjects.",
      inputSchema: getSyllabusShape,
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
          result.push({
            ...toPublicSubject(subject),
            topics: topicRows.map((t) => toPublicTopic(t, progressMap.get(t.id))),
          });
        }
        return { subjects: result };
      })
  );
}
