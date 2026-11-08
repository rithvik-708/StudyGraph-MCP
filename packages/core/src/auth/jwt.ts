import jwt from "jsonwebtoken";
import { InvalidTokenError } from "../errors.js";

export interface TokenPayload {
  sub: string; // user public_id
  username: string;
}

function getSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not set. Set it in your environment (see .env.example).");
  }
  return secret;
}

export function signUserToken(payload: TokenPayload): string {
  const expiresIn = (process.env.JWT_EXPIRES_IN ?? "30d") as jwt.SignOptions["expiresIn"];
  return jwt.sign(payload, getSecret(), { expiresIn });
}

export function verifyUserToken(token: string): TokenPayload {
  try {
    const decoded = jwt.verify(token, getSecret());
    if (typeof decoded === "string" || !decoded.sub || !decoded.username) {
      throw new InvalidTokenError("Token payload is missing required fields.");
    }
    return { sub: decoded.sub as string, username: decoded.username as string };
  } catch (err) {
    if (err instanceof InvalidTokenError) throw err;
    throw new InvalidTokenError();
  }
}
