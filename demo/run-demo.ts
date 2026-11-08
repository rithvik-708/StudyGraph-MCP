/**
 * Phase 6 demo: drives a real LLM tool-use loop (Anthropic if ANTHROPIC_API_KEY is set,
 * otherwise NVIDIA NIM if NIM_API_KEY is set), backed by a live StudyGraph MCP server
 * subprocess, to answer:
 *
 *   "What should I study next, considering my upcoming exams, syllabus completion,
 *    and weak topics?"
 *
 * The agent only knows what the MCP tools return -- every number in its final answer must
 * trace back to a tool_result in demo/transcript.json. Requires STUDYGRAPH_USER_TOKEN (run
 * `npm run login` to get one).
 *
 * Usage: npm run demo
 *        npm run demo -- --offline   (delegates to demo/offline-demo.ts, no LLM key needed)
 */
import "dotenv/config";
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { detectProvider, runAgentLoop } from "../llm/provider.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROMPT = "What should I study next, considering my upcoming exams, syllabus completion, and weak topics?";

async function runOffline() {
  const { runOfflineDemo } = await import("./offline-demo.js");
  await runOfflineDemo();
}

async function main() {
  if (process.argv.includes("--offline")) {
    return runOffline();
  }

  const provider = detectProvider();
  if (!provider) {
    console.error(
      "No LLM provider configured, so the live agent demo can't run.\n" +
        "Set ANTHROPIC_API_KEY or NIM_API_KEY in .env, or run the offline fallback instead:\n\n" +
        "  npm run demo -- --offline\n\n" +
        "(The offline fallback calls the same tools directly and prints their raw data, " +
        "without an LLM synthesizing the recommendation.)"
    );
    process.exitCode = 1;
    return;
  }
  if (!process.env.STUDYGRAPH_USER_TOKEN) {
    console.error("STUDYGRAPH_USER_TOKEN is not set. Run `npm run login` first and set it in .env.");
    process.exitCode = 1;
    return;
  }

  const repoRoot = join(__dirname, "..");
  const childEnv: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined) childEnv[k] = v;
  }

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["--import", "tsx", join(repoRoot, "apps", "mcp-server", "src", "index.ts")],
    cwd: repoRoot,
    env: childEnv,
    stderr: "inherit",
  });

  const mcpClient = new Client({ name: "studygraph-demo", version: "1.0.0" });
  await mcpClient.connect(transport);
  console.log(`Connected to the StudyGraph MCP server. Using LLM provider: ${provider}.\n`);
  console.log(`User: ${PROMPT}\n`);

  const { finalText, transcript } = await runAgentLoop(mcpClient, PROMPT, { log: (msg) => console.log(msg) });

  console.log(`\nAssistant: ${finalText}\n`);

  writeFileSync(join(__dirname, "transcript.json"), JSON.stringify(transcript, null, 2));
  console.log(`Full transcript (every tool call and result) written to demo/transcript.json`);

  await mcpClient.close();
}

main().catch((err) => {
  console.error("Demo failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
