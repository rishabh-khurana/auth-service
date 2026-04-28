import type { Context } from "koa";
import jwt from "jsonwebtoken";
import { env } from "../config/env";

/**
 * Creates an error response object
 */
export function error(
  message: string,
  code: number,
): { status: "error"; message: string; code: number } {
  return { status: "error", message, code };
}

/**
 * Validates that email and password are present in request body
 * Returns null if valid, error response if invalid
 */
export function validateCredentials(
  email: unknown,
  password: unknown,
): { valid: true } | { valid: false; response: ReturnType<typeof error> } {
  if (!email || !password) {
    return {
      valid: false,
      response: error("Email and password are required", 400),
    };
  }
  return { valid: true };
}

/**
 * Generates a JWT token for a user
 */
export function generateToken(userId: number, email: string): string {
  return jwt.sign({ userId, email }, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn as jwt.SignOptions["expiresIn"],
  });
}

export function rejectUnauthorized(ctx: Context): void {
  ctx.status = 401;
  ctx.body = error("Missing/invalid credentials.", 401);
}

type AuthSuccessData = { token: string; user: { id: number; email: string } };

/**
 * Creates authentication success response
 */
export function authSuccess(
  token: string,
  user: { id: number; email: string },
): ReturnType<typeof success<AuthSuccessData>> {
  return success<AuthSuccessData>({ token, user });
}

export function success<T>(payload: T): {
  status: "success";
  data: T;
} {
  return { status: "success", data: payload };
}
