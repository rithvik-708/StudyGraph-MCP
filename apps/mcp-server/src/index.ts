import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { getDb } from "@studygraph/db";
import { loadServerAuthContext } from "./authContext.js";
import { registerTools } from "./registerTools.js";

async function main() {
  const { db } = getDb();

  // Resolve exactly once at startup. If this fails, the process exits rather than
  // starting in an unauthenticated or default-user state.
  const ctx = await loadServerAuthContext(db);
  console.error(`StudyGraph MCP server starting for user "${ctx.username}" (${ctx.publicId}).`);

  const server = new McpServer({ name: "studygraph-mcp", version: "1.0.0" });
  registerTools(server, db, ctx);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("StudyGraph MCP server connected over stdio.");
}

main().catch((err) => {
  console.error("StudyGraph MCP server failed to start:", err instanceof Error ? err.message : err);
  process.exit(1);
});
