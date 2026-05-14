import Koa, { type Context } from "koa";
import Router from "koa-router";
import bodyParser from "koa-bodyparser";
import cors from "@koa/cors";
import bcrypt from "bcrypt";
import { eq } from "drizzle-orm";
import crypto from "crypto";
import { errorHandler } from "./middleware/errorHandler";
import { env } from "./config/env";
import { db } from "./db";
import { users, refreshTokens } from "./db/schema";
import type {
  RegisterRequestBody,
  RegisterResponse,
  LoginRequestBody,
  LoginResponse,
} from "./types/api";
import {
  error,
  validateCredentials,
  generateToken,
  authSuccess,
  success,
} from "./utils/response";
import { clearAuthCookies, setAuthCookies, ONE_DAY } from "./utils/cookies";
import { getPublicKey } from "./utils/secrets";

interface RegisterContext extends Context {
  request: Context["request"] & { body: RegisterRequestBody };
  body: RegisterResponse;
}

interface LoginContext extends Context {
  request: Context["request"] & { body: LoginRequestBody };
  body: LoginResponse;
}

const app = new Koa();
const router = new Router<unknown, RegisterContext | LoginContext>();

app.use(errorHandler);
app.use(cors());
app.use(bodyParser());

router.get("/health", (ctx) => {
  ctx.body = { status: "ok", timestamp: new Date().toISOString() };
});

router.post("/auth/stateless/register", async (ctx: RegisterContext) => {
  const { email, password } = ctx.request.body;

  const validation = validateCredentials(email, password);
  if (!validation.valid) {
    ctx.status = 400;
    ctx.body = validation.response;
    return;
  }

  const passwordHash = await bcrypt.hash(password, env.bcryptRounds);

  /** Throws an Error if same email exists */
  const [user] = await db
    .insert(users)
    .values({
      email,
      passwordHash,
    })
    .returning();

  const token = generateToken(user.id, user.email);

  ctx.body = authSuccess(token, { id: user.id, email: user.email });
});

router.post("/auth/stateless/login", async (ctx: LoginContext) => {
  const { email, password } = ctx.request.body;

  const validation = validateCredentials(email, password);
  if (!validation.valid) {
    ctx.status = 400;
    ctx.body = validation.response;
    return;
  }

  const user = await db.query.users.findFirst({
    where: eq(users.email, email),
  });

  if (!user) {
    ctx.status = 401;
    ctx.body = error("Invalid email or password", 401);
    return;
  }

  const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
  if (!isPasswordValid) {
    ctx.status = 401;
    ctx.body = error("Invalid email or password", 401);
    return;
  }

  const token = generateToken(user.id, user.email);

  ctx.body = authSuccess(token, { id: user.id, email: user.email });
});

// ============================================================================
// STATEFUL AUTHENTICATION (Session-based)
// ============================================================================

router.post("/auth/stateful/register", async (ctx: RegisterContext) => {
  const { email, password } = ctx.request.body;

  // Validate credentials
  const validation = validateCredentials(email, password);
  if (!validation.valid) {
    ctx.status = 400;
    ctx.body = validation.response;
    return;
  }

  const hashedPassword = await bcrypt.hash(password, env.bcryptRounds);

  // Create user with error handling for duplicate email
  let user;
  try {
    [user] = await db
      .insert(users)
      .values({
        email,
        passwordHash: hashedPassword,
      })
      .returning();
  } catch (err) {
    // Check for unique constraint violation (PostgreSQL error code 23505)
    if (err instanceof Error && err.message.includes("unique constraint")) {
      ctx.status = 409;
      ctx.body = error("User with this email already exists", 409);
      return;
    }
    throw err;
  }

  // Generate access token (JWT, stateless, not stored in DB) - 1 hour expiry
  const accessToken = generateToken(user.id, user.email);

  // Generate refresh token (opaque, stored in DB) - 1 day expiry
  const refreshToken = crypto.randomBytes(32).toString("hex");
  const refreshTokenExpiresAt = new Date(Date.now() + ONE_DAY);

  // Store refresh token in database
  await db.insert(refreshTokens).values({
    userId: user.id,
    token: refreshToken,
    expiresAt: refreshTokenExpiresAt,
  });

  // Set HttpOnly cookies
  // Note: In production, use ambiguous names like "sessionId" instead of "accessToken"
  setAuthCookies(ctx, accessToken, refreshToken);

  ctx.body = success({
    id: user.id,
    email: user.email,
  });
});

router.post("/auth/stateful/login", async (ctx: LoginContext) => {
  const { email, password } = ctx.request.body;

  // Validate credentials
  const validation = validateCredentials(email, password);
  if (!validation.valid) {
    ctx.status = 400;
    ctx.body = validation.response;
    return;
  }

  // Find user by email
  const user = await db.query.users.findFirst({
    where: eq(users.email, email),
  });

  if (!user) {
    ctx.status = 401;
    ctx.body = error("Invalid email or password", 401);
    return;
  }

  // Verify password
  const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
  if (!isPasswordValid) {
    ctx.status = 401;
    ctx.body = error("Invalid email or password", 401);
    return;
  }

  // Generate access token (JWT, stateless) - 1 hour expiry
  const accessToken = generateToken(user.id, user.email);

  // Generate refresh token (opaque, stored in DB) - 1 day expiry
  const refreshToken = crypto.randomBytes(32).toString("hex");
  const refreshTokenExpiresAt = new Date(Date.now() + ONE_DAY);

  // Store refresh token in database
  await db.insert(refreshTokens).values({
    userId: user.id,
    token: refreshToken,
    expiresAt: refreshTokenExpiresAt,
  });

  // Set HttpOnly cookies
  setAuthCookies(ctx, accessToken, refreshToken);

  ctx.body = success({
    id: user.id,
    email: user.email,
  });
});

router.post("/auth/stateful/refresh", async (ctx) => {
  // Get refresh token from cookie
  const currentRefreshToken = ctx.cookies.get("refreshToken");

  if (!currentRefreshToken) {
    clearAuthCookies(ctx);
    ctx.status = 401;
    ctx.body = error("No refresh token provided", 401);
    return;
  }

  // Look up refresh token in database
  const storedToken = await db.query.refreshTokens.findFirst({
    where: eq(refreshTokens.token, currentRefreshToken),
  });

  if (!storedToken) {
    clearAuthCookies(ctx);
    ctx.status = 401;
    ctx.body = error("Invalid refresh token", 401);
    return;
  }

  // Check if token is expired - clean it up and clear cookies
  if (storedToken.expiresAt < new Date()) {
    // Delete expired token from database
    await db.delete(refreshTokens).where(eq(refreshTokens.id, storedToken.id));
    clearAuthCookies(ctx);
    ctx.status = 401;
    ctx.body = error("Refresh token expired", 401);
    return;
  }

  // Get user info
  const user = await db.query.users.findFirst({
    where: eq(users.id, storedToken.userId),
  });

  if (!user) {
    // Clean up orphaned token
    await db.delete(refreshTokens).where(eq(refreshTokens.id, storedToken.id));
    clearAuthCookies(ctx);
    ctx.status = 401;
    ctx.body = error("User not found", 401);
    return;
  }

  // Single-use rotation: Delete old refresh token
  await db.delete(refreshTokens).where(eq(refreshTokens.id, storedToken.id));

  // Generate new access token (JWT)
  const newAccessToken = generateToken(user.id, user.email);

  // Generate new refresh token (opaque)
  const newRefreshToken = crypto.randomBytes(32).toString("hex");
  const newRefreshTokenExpiresAt = new Date(Date.now() + ONE_DAY);

  // Store new refresh token
  await db.insert(refreshTokens).values({
    userId: user.id,
    token: newRefreshToken,
    expiresAt: newRefreshTokenExpiresAt,
  });

  // Set new cookies
  setAuthCookies(ctx, newAccessToken, newRefreshToken);

  ctx.body = success({
    id: user.id,
    email: user.email,
  });
});

router.post("/auth/stateful/logout", async (ctx) => {
  // Get refresh token from cookie
  const refreshToken = ctx.cookies.get("refreshToken");

  if (refreshToken) {
    // Delete refresh token from database
    await db.delete(refreshTokens).where(eq(refreshTokens.token, refreshToken));
  }

  // Clear both cookies
  clearAuthCookies(ctx);

  ctx.body = success({
    message: "Logged out successfully",
  });
});

router.get("/.well-known/jwks.json", (ctx) => {
  const jwkObject = getPublicKey();
  ctx.body = {
    keys: [jwkObject],
  };
});

app.use(router.routes());
app.use(router.allowedMethods());

app.listen(env.port, () => {
  console.log(`Auth service running on port ${env.port}`);
});

export default app;
