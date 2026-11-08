import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createDb, seedDemoData } from "@studygraph/db";
import { resolveAuthContext, signUserToken, type AuthContext } from "@studygraph/core";
import { registerTools } from "../src/registerTools.js";

process.env.JWT_SECRET ??= "test-secret";

export async function buildTestServer(forUserPublicId: string) {
  const { sqlite, db } = createDb(":memory:");
  const seed = await seedDemoData(db, sqlite);

  const targetPublicId = forUserPublicId === "alice" ? seed.alice.publicId : forUserPublicId === "bob" ? seed.bob.publicId : forUserPublicId;
  const token = signUserToken({ sub: targetPublicId, username: targetPublicId });
  const ctx: AuthContext = await resolveAuthContext(db, token);

  const server = new McpServer({ name: "studygraph-mcp-test", version: "1.0.0" });
  registerTools(server, db, ctx);

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "1.0.0" });

  await server.connect(serverTransport);
  await client.connect(clientTransport);

  return { client, server, db, seed, ctx, sqlite };
}

/** Parses a CallToolResult's first text content block as JSON ({ok, data} or {ok, error}). */
export function parseResult(result: { content: Array<{ type: string; text?: string }> }) {
  const textBlock = result.content.find((c) => c.type === "text");
  if (!textBlock?.text) throw new Error("Tool result had no text content block");
  return JSON.parse(textBlock.text);
}
