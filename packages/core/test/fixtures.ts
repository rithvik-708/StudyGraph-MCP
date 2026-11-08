import { createDb, seedDemoData, type DB } from "@studygraph/db";
import { resolveAuthContext, signUserToken, type AuthContext } from "../src/index.js";

process.env.JWT_SECRET ??= "test-secret";

export async function setupTestDb() {
  const { sqlite, db } = createDb(":memory:");
  const seed = await seedDemoData(db, sqlite);
  return { sqlite, db, seed };
}

export async function authContextFor(db: DB, publicId: string): Promise<AuthContext> {
  const token = signUserToken({ sub: publicId, username: publicId });
  return resolveAuthContext(db, token);
}
