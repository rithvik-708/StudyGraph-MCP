/**
 * Provider-agnostic LLM tool-use loop, shared by the live demo (demo/run-demo.ts) and the
 * llm-driven evals (evals/scenarios/toolSelection.ts). Picks Anthropic if ANTHROPIC_API_KEY is
 * set, otherwise NVIDIA NIM's OpenAI-compatible endpoint if NIM_API_KEY is set, otherwise null
 * (callers skip/refuse rather than silently falling back to a default).
 */
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";

export type Provider = "anthropic" | "nim";

export function detectProvider(): Provider | null {
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.NIM_API_KEY) return "nim";
  return null;
}

export function hasLlmProvider(): boolean {
  return detectProvider() !== null;
}

export interface TranscriptEntry {
  turn: number;
  role: "assistant" | "tool_result";
  [key: string]: unknown;
}

export interface AgentLoopResult {
  finalText: string;
  transcript: TranscriptEntry[];
}

async function mcpToolResultText(client: Client, name: string, args: Record<string, unknown>): Promise<string> {
  const result = await client.callTool({ name, arguments: args });
  const textBlock = (result.content as Array<{ type: string; text?: string }>).find((c) => c.type === "text");
  return textBlock?.text ?? "";
}

// ---------------------------------------------------------------------------
// Anthropic
// ---------------------------------------------------------------------------

const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5-5";

async function anthropicTools(client: Client): Promise<Anthropic.Tool[]> {
  const { tools } = await client.listTools();
  return tools.map((t) => ({ name: t.name, description: t.description ?? "", input_schema: t.inputSchema as Anthropic.Tool.InputSchema }));
}

async function getFirstTurnToolCallsAnthropic(client: Client, prompt: string): Promise<string[]> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const tools = await anthropicTools(client);
  const message = await anthropic.messages.create({ model: ANTHROPIC_MODEL, max_tokens: 1024, tools, messages: [{ role: "user", content: prompt }] });
  return message.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use").map((b) => b.name);
}

async function runAnthropicAgentLoop(client: Client, prompt: string, maxTurns: number, log?: (msg: string) => void): Promise<AgentLoopResult> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const tools = await anthropicTools(client);
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: prompt }];
  const transcript: TranscriptEntry[] = [];
  let finalText = "";

  for (let turn = 0; turn < maxTurns; turn++) {
    const response = await anthropic.messages.create({ model: ANTHROPIC_MODEL, max_tokens: 2048, tools, messages });
    transcript.push({ turn, role: "assistant", content: response.content, stopReason: response.stop_reason });
    messages.push({ role: "assistant", content: response.content });

    const toolUses = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    const textBlocks = response.content.filter((b): b is Anthropic.TextBlock => b.type === "text");
    if (textBlocks.length > 0) finalText = textBlocks.map((b) => b.text).join("\n");

    if (toolUses.length === 0 || response.stop_reason !== "tool_use") break;

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const toolUse of toolUses) {
      log?.(`  -> calling tool: ${toolUse.name}(${JSON.stringify(toolUse.input)})`);
      const text = await mcpToolResultText(client, toolUse.name, toolUse.input as Record<string, unknown>);
      transcript.push({ turn, role: "tool_result", tool: toolUse.name, arguments: toolUse.input, result: text });
      toolResults.push({ type: "tool_result", tool_use_id: toolUse.id, content: text });
    }
    messages.push({ role: "user", content: toolResults });
  }

  return { finalText, transcript };
}

// ---------------------------------------------------------------------------
// NVIDIA NIM (OpenAI-compatible chat completions with function/tool calling)
// ---------------------------------------------------------------------------

const NIM_MODEL = process.env.NIM_MODEL ?? "nvidia/nemotron-3.5-lightning-30b-a3b";

function nimClient(): OpenAI {
  return new OpenAI({ apiKey: process.env.NIM_API_KEY, baseURL: process.env.NIM_BASE_URL ?? "https://integrate.api.nvidia.com/v1" });
}

async function nimTools(client: Client): Promise<OpenAI.Chat.ChatCompletionTool[]> {
  const { tools } = await client.listTools();
  return tools.map((t) => ({
    type: "function" as const,
    function: { name: t.name, description: t.description ?? "", parameters: t.inputSchema as Record<string, unknown> },
  }));
}

async function getFirstTurnToolCallsNim(client: Client, prompt: string): Promise<string[]> {
  const openai = nimClient();
  const tools = await nimTools(client);
  const response = await openai.chat.completions.create({
    model: NIM_MODEL,
    max_tokens: 1024,
    tools,
    messages: [{ role: "user", content: prompt }],
  });
  return (response.choices[0]?.message.tool_calls ?? []).filter((tc) => tc.type === "function").map((tc) => tc.function.name);
}

async function runNimAgentLoop(client: Client, prompt: string, maxTurns: number, log?: (msg: string) => void): Promise<AgentLoopResult> {
  const openai = nimClient();
  const tools = await nimTools(client);
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [{ role: "user", content: prompt }];
  const transcript: TranscriptEntry[] = [];
  let finalText = "";

  for (let turn = 0; turn < maxTurns; turn++) {
    const response = await openai.chat.completions.create({ model: NIM_MODEL, max_tokens: 2048, tools, messages });
    const message = response.choices[0]?.message;
    if (!message) break;

    transcript.push({ turn, role: "assistant", content: message.content, toolCalls: message.tool_calls, finishReason: response.choices[0]?.finish_reason });
    messages.push(message);

    if (message.content) finalText = message.content;

    const toolCalls = (message.tool_calls ?? []).filter((tc) => tc.type === "function");
    if (toolCalls.length === 0) break;

    for (const toolCall of toolCalls) {
      const args = toolCall.function.arguments ? JSON.parse(toolCall.function.arguments) : {};
      log?.(`  -> calling tool: ${toolCall.function.name}(${JSON.stringify(args)})`);
      const text = await mcpToolResultText(client, toolCall.function.name, args);
      transcript.push({ turn, role: "tool_result", tool: toolCall.function.name, arguments: args, result: text });
      messages.push({ role: "tool", tool_call_id: toolCall.id, content: text });
    }
  }

  return { finalText, transcript };
}

// ---------------------------------------------------------------------------
// Public, provider-agnostic API
// ---------------------------------------------------------------------------

export async function getFirstTurnToolCalls(client: Client, prompt: string): Promise<string[]> {
  const provider = detectProvider();
  if (provider === "anthropic") return getFirstTurnToolCallsAnthropic(client, prompt);
  if (provider === "nim") return getFirstTurnToolCallsNim(client, prompt);
  throw new Error("No LLM provider configured (set ANTHROPIC_API_KEY or NIM_API_KEY).");
}

/**
 * Runs the full agent loop (not just the first turn) and returns every tool name called, in
 * order. Tool-selection evals use this rather than getFirstTurnToolCalls: a model that first
 * calls get_syllabus to discover a subject's id before calling the "real" tool is behaving
 * reasonably, and a strict first-turn check would unfairly fail that valid strategy.
 */
export async function getAllToolCallsForPrompt(client: Client, prompt: string): Promise<string[]> {
  const { transcript } = await runAgentLoop(client, prompt, { maxTurns: 4 });
  return transcript.filter((e) => e.role === "tool_result").map((e) => e.tool as string);
}

export async function runAgentLoop(client: Client, prompt: string, opts: { maxTurns?: number; log?: (msg: string) => void } = {}): Promise<AgentLoopResult> {
  const provider = detectProvider();
  const maxTurns = opts.maxTurns ?? 8;
  if (provider === "anthropic") return runAnthropicAgentLoop(client, prompt, maxTurns, opts.log);
  if (provider === "nim") return runNimAgentLoop(client, prompt, maxTurns, opts.log);
  throw new Error("No LLM provider configured (set ANTHROPIC_API_KEY or NIM_API_KEY).");
}
