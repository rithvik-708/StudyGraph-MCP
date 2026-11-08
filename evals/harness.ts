/** Spins up an in-process MCP server + client pair against a freshly seeded in-memory DB. */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createDb, seedDemoData, type DB } from "@studygraph/db";
import { resolveAuthContext, signUserToken } from "@studygraph/core";
import { registerTools } from "../apps/mcp-server/src/registerTools.js";

process.env.JWT_SECRET ??= "eval-secret";

export interface EvalEnv {
  db: DB;
  seed: Awaited<ReturnType<typeof seedDemoData>>;
  aliceClient: Client;
  bobClient: Client;
}

async function buildClientFor(db: DB, publicId: string): Promise<Client> {
  const token = signUserToken({ sub: publicId, username: publicId });
  const ctx = await resolveAuthContext(db, token);

  const server = new McpServer({ name: "studygraph-mcp-eval", version: "1.0.0" });
  registerTools(server, db, ctx);

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "eval-client", version: "1.0.0" });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return client;
}

export async function setupEvalEnv(): Promise<EvalEnv> {
  const { sqlite, db } = createDb(":memory:");
  const seed = await seedDemoData(db, sqlite);
  const aliceClient = await buildClientFor(db, seed.alice.publicId);
  const bobClient = await buildClientFor(db, seed.bob.publicId);
  return { db, seed, aliceClient, bobClient };
}

/** Parses a CallToolResult's first text content block as JSON ({ok, data} or {ok, error}), or returns the raw error marker for protocol-level validation failures. */
export function parseToolResult(result: any): { ok: boolean; data?: any; error?: { code: string; message: string }; isProtocolError?: boolean } {
  if (result.isError && !result.content?.[0]?.text?.startsWith("{")) {
    return { ok: false, isProtocolError: true, error: { code: "PROTOCOL_VALIDATION_ERROR", message: result.content?.[0]?.text ?? "" } };
  }
  const textBlock = result.content?.find((c: any) => c.type === "text");
  if (!textBlock?.text) throw new Error("Tool result had no text content block");
  return JSON.parse(textBlock.text);
}
