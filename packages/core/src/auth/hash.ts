import bcrypt from "bcryptjs";

export function hashPassword(plaintext: string): string {
  return bcrypt.hashSync(plaintext, 10);
}

export function verifyPassword(plaintext: string, hash: string): boolean {
  return bcrypt.compareSync(plaintext, hash);
}
