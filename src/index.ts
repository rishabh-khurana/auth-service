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
import { users, userSessions } from "./db/schema";
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

interface RegisterContext extends Context {
  request: Context["request"] & { body: RegisterRequestBody };
  body: RegisterResponse;
}

interface LoginContext extends Context {
  request: Context["request"] & { body: LoginRequestBody };
  body: LoginResponse;
}

const ONE_DAY = 24 * 60 * 60 * 1000;

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

  // Generate session ID and expiration (1 hour from now)
  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + ONE_DAY); // 1 hour

  // Insert session into database
  await db.insert(userSessions).values({
    userId: user.id,
    sessionId,
    expiresAt,
  });

  // Set HttpOnly cookie with session ID
  ctx.cookies.set("sessionId", sessionId, {
    httpOnly: true,
    secure: env.nodeEnv === "production",
    sameSite: "lax",
    maxAge: ONE_DAY, // 1 hour in ms
    path: "/",
  });

  ctx.body = success({
    id: user.id,
    email: user.email,
  });
});

router.post("/auth/stateful/logout", async (ctx) => {
  // Get session ID from cookie
  const sessionId = ctx.cookies.get("sessionId");

  if (sessionId) {
    // Delete session from database
    await db.delete(userSessions).where(eq(userSessions.sessionId, sessionId));
  }

  // Clear the cookie regardless of whether session existed
  ctx.cookies.set("sessionId", "", {
    httpOnly: true,
    secure: env.nodeEnv === "production",
    sameSite: "lax",
    maxAge: 0, // Expire immediately
    path: "/",
  });

  ctx.body = success({
    message: "Logged out successfully",
  });
});

app.use(router.routes());
app.use(router.allowedMethods());

app.listen(env.port, () => {
  console.log(`Auth service running on port ${env.port}`);
});

export default app;
