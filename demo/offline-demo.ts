/**
 * Offline fallback for the Phase 6 demo: calls the same 4 read tools a real agent would use
 * to answer "what should I study next" (get_syllabus, get_weak_topics, get_exam_readiness,
 * recommend_next_topic), directly against a live MCP server subprocess, and prints their raw
 * JSON. No LLM is involved -- this is NOT a substitute for the live agent demo (`npm run demo`),
 * it only exists so the tools and data can be inspected without an ANTHROPIC_API_KEY.
 *
 * Usage: npm run demo -- --offline
 */
import "dotenv/config";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function parse(result: any) {
  const textBlock = result.content?.find((c: any) => c.type === "text");
  return textBlock?.text ? JSON.parse(textBlock.text) : null;
}

export async function runOfflineDemo() {
  console.log("[OFFLINE MODE -- raw tool data only, not an LLM-synthesized recommendation]\n");

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

  const client = new Client({ name: "studygraph-offline-demo", version: "1.0.0" });
  await client.connect(transport);

  const syllabus = parse(await client.callTool({ name: "get_syllabus", arguments: {} }));
  console.log("== get_syllabus ==");
  for (const subject of syllabus.data.subjects) {
    const done = subject.topics.filter((t: any) => t.status === "completed").length;
    console.log(`  ${subject.name}: ${done}/${subject.topics.length} topics completed`);
  }

  const weak = parse(await client.callTool({ name: "get_weak_topics", arguments: { limit: 5 } }));
  console.log("\n== get_weak_topics (top 5) ==");
  for (const t of weak.data.weakTopics) {
    console.log(`  ${t.name} (${t.subjectName}) -- mastery ${t.masteryPct}%, last practiced: ${t.lastPracticedAt ?? "never"}`);
  }

  const readiness = parse(await client.callTool({ name: "get_exam_readiness", arguments: {} }));
  console.log("\n== get_exam_readiness (upcoming exams) ==");
  for (const e of readiness.data.exams) {
    console.log(`  ${e.name}: ${e.readinessPct}% ready, ${e.daysRemaining} days remaining, risk=${e.riskLevel}`);
  }

  const recommendation = parse(await client.callTool({ name: "recommend_next_topic", arguments: {} }));
  console.log("\n== recommend_next_topic ==");
  for (const r of recommendation.data.recommendations) {
    console.log(`  ${r.name} (${r.subjectName}): ${r.reason}`);
  }

  await client.close();
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1].replace(/\\/g, "/")}`;
if (isMain) {
  runOfflineDemo().catch((err) => {
    console.error("Offline demo failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
