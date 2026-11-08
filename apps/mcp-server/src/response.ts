import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { AppError } from "@studygraph/core";

export function ok(data: unknown): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify({ ok: true, data }, null, 2) }],
  };
}

function err(code: string, message: string): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify({ ok: false, error: { code, message } }, null, 2) }],
    isError: true,
  };
}

/** Wraps a tool handler body: AppErrors become structured {ok:false} results; anything else becomes a generic internal error (and is logged to stderr, never leaked to the client). */
export async function runTool(fn: () => Promise<unknown>): Promise<CallToolResult> {
  try {
    const data = await fn();
    return ok(data);
  } catch (e) {
    if (e instanceof AppError) {
      return err(e.code, e.message);
    }
    console.error("Unexpected error in tool handler:", e);
    return err("INTERNAL_ERROR", "An unexpected error occurred while processing this tool call.");
  }
}
