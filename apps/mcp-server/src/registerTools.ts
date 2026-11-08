import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { DB } from "@studygraph/db";
import type { AuthContext } from "@studygraph/core";
import { registerGetSyllabus } from "./tools/getSyllabus.js";
import { registerGetSubjectProgress } from "./tools/getSubjectProgress.js";
import { registerGetWeakTopics } from "./tools/getWeakTopics.js";
import { registerGetStudySessions } from "./tools/getStudySessions.js";
import { registerGetExamReadiness } from "./tools/getExamReadiness.js";
import { registerRecommendNextTopic } from "./tools/recommendNextTopic.js";
import { registerCreateStudySession } from "./tools/createStudySession.js";
import { registerUpdateStudyProgress } from "./tools/updateStudyProgress.js";

/** Registers all 8 StudyGraph tools on the given server, scoped to a single resolved AuthContext. */
export function registerTools(server: McpServer, db: DB, ctx: AuthContext) {
  registerGetSyllabus(server, db, ctx);
  registerGetSubjectProgress(server, db, ctx);
  registerGetWeakTopics(server, db, ctx);
  registerGetStudySessions(server, db, ctx);
  registerGetExamReadiness(server, db, ctx);
  registerRecommendNextTopic(server, db, ctx);
  registerCreateStudySession(server, db, ctx);
  registerUpdateStudyProgress(server, db, ctx);
}
