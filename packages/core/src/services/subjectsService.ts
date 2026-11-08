import { and, eq } from "drizzle-orm";
import type { DB } from "@studygraph/db";
import { subjects } from "@studygraph/db";
import { SubjectNotFoundError } from "../errors.js";

export type SubjectRow = typeof subjects.$inferSelect;

export async function listSubjects(db: DB, userId: number): Promise<SubjectRow[]> {
  return db.select().from(subjects).where(eq(subjects.userId, userId));
}

/** Resolves a subject's public id to its row, verifying ownership. Throws SubjectNotFoundError otherwise. */
export async function requireSubject(db: DB, userId: number, publicId: string): Promise<SubjectRow> {
  const [row] = await db
    .select()
    .from(subjects)
    .where(and(eq(subjects.publicId, publicId), eq(subjects.userId, userId)))
    .limit(1);
  if (!row) throw new SubjectNotFoundError(publicId);
  return row;
}

export function toPublicSubject(row: SubjectRow) {
  return {
    id: row.publicId,
    name: row.name,
    color: row.color,
  };
}
