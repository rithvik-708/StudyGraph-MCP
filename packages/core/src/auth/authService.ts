import { eq } from "drizzle-orm";
import type { DB } from "@studygraph/db";
import { users } from "@studygraph/db";
import { verifyPassword } from "./hash.js";
import { signUserToken, verifyUserToken } from "./jwt.js";
import { InvalidCredentialsError, InvalidTokenError } from "../errors.js";

export interface AuthContext {
  userId: number; // internal PK, never exposed outside this process
  publicId: string;
  username: string;
}

export async function login(db: DB, username: string, password: string): Promise<{ token: string; publicId: string }> {
  const [user] = await db.select().from(users).where(eq(users.username, username)).limit(1);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    throw new InvalidCredentialsError();
  }
  const token = signUserToken({ sub: user.publicId, username: user.username });
  return { token, publicId: user.publicId };
}

/** Resolves a STUDYGRAPH_USER_TOKEN into a concrete AuthContext, looking up the current internal id. */
export async function resolveAuthContext(db: DB, token: string): Promise<AuthContext> {
  const payload = verifyUserToken(token);
  const [user] = await db.select().from(users).where(eq(users.publicId, payload.sub)).limit(1);
  if (!user) {
    throw new InvalidTokenError("Token refers to a user that no longer exists.");
  }
  return { userId: user.id, publicId: user.publicId, username: user.username };
}
