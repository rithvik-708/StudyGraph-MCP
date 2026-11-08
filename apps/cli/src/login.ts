/**
 * Issues a STUDYGRAPH_USER_TOKEN for a user by verifying real credentials against the
 * database (bcrypt-hashed password check), then signing a JWT. The MCP server never
 * handles raw passwords -- only this short-lived step does, and only locally.
 *
 * Usage: npm run login -- <username> <password>
 */
import "dotenv/config";
import { createInterface } from "node:readline/promises";
import { getDb } from "@studygraph/db";
import { login } from "@studygraph/core";

async function promptMissingArgs(username?: string, password?: string) {
  if (username && password) return { username, password };
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const u = username ?? (await rl.question("Username: "));
    const p = password ?? (await rl.question("Password: "));
    return { username: u, password: p };
  } finally {
    rl.close();
  }
}

async function main() {
  const [argUsername, argPassword] = process.argv.slice(2);
  const { username, password } = await promptMissingArgs(argUsername, argPassword);

  const { db, sqlite } = getDb();
  try {
    const { token, publicId } = await login(db, username, password);
    console.log(`\nLogin successful for ${username} (${publicId}).\n`);
    console.log("Set this as STUDYGRAPH_USER_TOKEN in your .env file or MCP client config:\n");
    console.log(token);
    console.log();
  } catch (err) {
    console.error("Login failed:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  } finally {
    sqlite.close();
  }
}

main();
