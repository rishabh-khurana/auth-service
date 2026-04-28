import Koa, { type Context } from "koa";
import Router from "koa-router";
import bodyParser from "koa-bodyparser";
import cors from "@koa/cors";
import bcrypt from "bcrypt";
import { eq } from "drizzle-orm";
import { errorHandler } from "./middleware/errorHandler";
import { env } from "./config/env";
import { db } from "./db";
import { users } from "./db/schema";
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
} from "./utils/response";

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

router.post("/auth/register", async (ctx: RegisterContext) => {
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

router.post("/auth/login", async (ctx: LoginContext) => {
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

app.use(router.routes());
app.use(router.allowedMethods());

app.listen(env.port, () => {
  console.log(`Auth service running on port ${env.port}`);
});

export default app;
