import { randomBytes } from "node:crypto";

/** Generates an opaque external id like "top_9f2a1c4b8e3d7a60". Never a sequential integer. */
export function genId(prefix: string): string {
  return `${prefix}_${randomBytes(8).toString("hex")}`;
}
