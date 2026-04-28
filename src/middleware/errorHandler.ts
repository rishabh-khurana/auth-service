import { Context, Next } from 'koa';
import { env } from '../config/env';

export class AppError extends Error {
  public statusCode: number;
  public isOperational: boolean;

  constructor(message: string, statusCode: number = 500) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

export async function errorHandler(ctx: Context, next: Next): Promise<void> {
  try {
    await next();
  } catch (err) {
    if (err instanceof AppError) {
      ctx.status = err.statusCode;
      ctx.body = {
        error: err.message,
      };
    } else if (err instanceof Error) {
      console.error('Unhandled error:', err);
      ctx.status = 500;
      ctx.body = {
        error: env.nodeEnv === 'development' ? err.message : 'Internal server error',
      };
    } else {
      ctx.status = 500;
      ctx.body = {
        error: 'Unknown error',
      };
    }
  }
}
