import type { Context } from "koa";
import { env } from "../config/env";

export const ONE_HOUR = 60 * 60 * 1000;
export const ONE_DAY = 24 * 60 * 60 * 1000;

/**
 * Set the access token cookie (JWT).
 * Short-lived token for API authentication.
 */
export function setAccessTokenCookie(ctx: Context, token: string): void {
  ctx.cookies.set("accessToken", token, {
    httpOnly: true,
    secure: env.nodeEnv === "production",
    sameSite: "lax",
    maxAge: ONE_HOUR,
    path: "/",
  });
}

/**
 * Set the refresh token cookie (opaque token).
 * Long-lived token for obtaining new access tokens.
 */
export function setRefreshTokenCookie(ctx: Context, token: string): void {
  ctx.cookies.set("refreshToken", token, {
    httpOnly: true,
    secure: env.nodeEnv === "production",
    sameSite: "lax",
    maxAge: ONE_DAY,
    path: "/",
  });
}

/**
 * Set both authentication cookies (access + refresh tokens).
 * Used after successful login, registration, or token refresh.
 */
export function setAuthCookies(ctx: Context, accessToken: string, refreshToken: string): void {
  setAccessTokenCookie(ctx, accessToken);
  setRefreshTokenCookie(ctx, refreshToken);
}

/**
 * Clear authentication cookies from the client.
 * Used during logout or when tokens are invalid/expired.
 */
export function clearAuthCookies(ctx: Context): void {
  ctx.cookies.set("accessToken", "", {
    httpOnly: true,
    secure: env.nodeEnv === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });

  ctx.cookies.set("refreshToken", "", {
    httpOnly: true,
    secure: env.nodeEnv === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
}
