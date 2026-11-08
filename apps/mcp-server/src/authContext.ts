import type { DB } from "@studygraph/db";
import { resolveAuthContext, type AuthContext } from "@studygraph/core";

/**
 * Resolves the single AuthContext this MCP server process will serve for its entire
 * lifetime, from STUDYGRAPH_USER_TOKEN. The server refuses to start if this fails --
 * it must never silently run unauthenticated or fall back to a default user.
 */
export async function loadServerAuthContext(db: DB): Promise<AuthContext> {
  const token = process.env.STUDYGRAPH_USER_TOKEN;
  if (!token) {
    throw new Error(
      "STUDYGRAPH_USER_TOKEN is not set. Run `npm run login` to obtain a token for a user, " +
        "then set it in this server's environment (e.g. your Claude Desktop/Code MCP config's `env` block)."
    );
  }
  return resolveAuthContext(db, token);
}
