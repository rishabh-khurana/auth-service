import dotenv from "dotenv";

dotenv.config();

const requiredVars = ["DATABASE_URL", "JWT_SECRET"];
const missing = requiredVars.filter((v) => !process.env[v]);

if (missing.length > 0 && process.env.NODE_ENV !== "test") {
  console.warn(`Warning: Missing required env vars: ${missing.join(", ")}`);
}

export const env = {
  databaseUrl:
    process.env.DATABASE_URL ||
    "postgresql://postgres:postgres@postgres:5432/auth",
  port: parseInt(process.env.PORT || "3420", 10),
  nodeEnv: process.env.NODE_ENV || "development",
  // we get this from KMS and its not usually stored in .env
  jwtSecret: process.env.JWT_SECRET || "dev-secret-change-in-production",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
  bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS || "10", 10),
};
