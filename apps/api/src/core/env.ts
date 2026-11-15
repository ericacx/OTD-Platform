import { z } from "zod";

const bool = z
  .enum(["true", "false", "1", "0"])
  .optional()
  .transform((v) => v === "true" || v === "1");

const DEV_SECRET = "otd-dev-secret-otd-dev-secret-otd-dev-secret";

export const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().default(3000),
    DATABASE_URL: z.string().default("pglite:.data/pglite"),
    JWT_SECRET: z.string().min(32).default(DEV_SECRET),
    ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().default(900),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().default(14),
    FILE_STORAGE_DIR: z.string().default(".data/files"),
    CORS_ORIGIN: z.string().default("http://localhost:5173"),
    ANTHROPIC_API_KEY: z.string().optional(),
    AI_MODEL: z.string().default("claude-opus-5-5"),
    REDIS_URL: z.string().optional(),
    AUTO_MIGRATE: bool,
    AUTO_SEED: bool,
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === "production" && env.JWT_SECRET === DEV_SECRET) {
      ctx.addIssue({ code: "custom", path: ["JWT_SECRET"], message: "JWT_SECRET must be set in production" });
    }
  });

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  return envSchema.parse(source);
}
