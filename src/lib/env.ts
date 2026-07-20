import { z } from "zod";

const isServerBuildPhase =
  typeof window === "undefined" &&
  (process.env.NEXT_PHASE === "phase-production-build" || process.env.npm_lifecycle_event === "build");

const booleanEnv = (defaultValue: boolean) =>
  z
    .union([z.boolean(), z.string(), z.undefined()])
    .transform((value) => {
      if (typeof value === "boolean") {
        return value;
      }

      if (typeof value === "string") {
        const normalized = value.trim().toLowerCase();
        if (["1", "true", "yes", "on"].includes(normalized)) {
          return true;
        }
        if (["0", "false", "no", "off", ""].includes(normalized)) {
          return false;
        }
      }

      return defaultValue;
    });

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required."),
  APP_URL: z.string().url().default("http://localhost:3000"),
  UPLOAD_DIR: z.string().min(1).default("./uploads"),
  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(26_214_400),
  SESSION_TTL_HOURS: z.coerce.number().int().positive().default(168),
  WORKER_MODE: z.enum(["manual", "service"]).default("manual"),
  WORKER_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(60_000),
  ADMIN_EMAIL: z.string().email().optional().or(z.literal("")),
  ADMIN_PASSWORD: z.string().optional().or(z.literal("")),
  FACEBOOK_APP_ID: z.string().optional().or(z.literal("")),
  FACEBOOK_APP_SECRET: z.string().optional().or(z.literal("")),
  FACEBOOK_PAGE_LOOKUP_VALUE: z.string().optional().or(z.literal("")),
  META_INSTAGRAM_PUBLISHING_ENABLED: booleanEnv(true),
  META_INSTAGRAM_COMMENTS_ENABLED: booleanEnv(false),
  GOOGLE_CLIENT_ID: z.string().optional().or(z.literal("")),
  GOOGLE_CLIENT_SECRET: z.string().optional().or(z.literal("")),
  TOKEN_ENCRYPTION_KEY: z.string().optional().or(z.literal("")),
  REDIS_URL: z.string().url().optional().or(z.literal("")),
  RATE_LIMIT_REDIS_PREFIX: z.string().optional().or(z.literal("")).default("smm:rate-limit"),
  TRUST_PROXY_HEADERS: booleanEnv(false),
});

const serverEnvInput = {
  NODE_ENV: process.env.NODE_ENV,
  // Next.js evaluates server modules during production build even though the real
  // runtime container environment is not available yet. Use a harmless placeholder
  // there so the build can finish without baking secrets into the image.
  DATABASE_URL: process.env.DATABASE_URL ?? (isServerBuildPhase ? "build-time-placeholder" : undefined),
  APP_URL: process.env.APP_URL,
  UPLOAD_DIR: process.env.UPLOAD_DIR,
  MAX_UPLOAD_BYTES: process.env.MAX_UPLOAD_BYTES,
  SESSION_TTL_HOURS: process.env.SESSION_TTL_HOURS,
  WORKER_MODE: process.env.WORKER_MODE,
  WORKER_POLL_INTERVAL_MS: process.env.WORKER_POLL_INTERVAL_MS,
  ADMIN_EMAIL: process.env.ADMIN_EMAIL,
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
  FACEBOOK_APP_ID: process.env.FACEBOOK_APP_ID,
  FACEBOOK_APP_SECRET: process.env.FACEBOOK_APP_SECRET,
  FACEBOOK_PAGE_LOOKUP_VALUE: process.env.FACEBOOK_PAGE_LOOKUP_VALUE,
  META_INSTAGRAM_PUBLISHING_ENABLED: process.env.META_INSTAGRAM_PUBLISHING_ENABLED,
  META_INSTAGRAM_COMMENTS_ENABLED: process.env.META_INSTAGRAM_COMMENTS_ENABLED,
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  TOKEN_ENCRYPTION_KEY: process.env.TOKEN_ENCRYPTION_KEY,
  REDIS_URL: process.env.REDIS_URL,
  RATE_LIMIT_REDIS_PREFIX: process.env.RATE_LIMIT_REDIS_PREFIX,
  TRUST_PROXY_HEADERS: process.env.TRUST_PROXY_HEADERS,
};

const clientEnvFallback = {
  NODE_ENV: process.env.NODE_ENV ?? "development",
  DATABASE_URL: "client-side-unavailable",
  APP_URL: "http://localhost:3000",
  UPLOAD_DIR: "./uploads",
  MAX_UPLOAD_BYTES: 26_214_400,
  SESSION_TTL_HOURS: 168,
  WORKER_MODE: "manual",
  WORKER_POLL_INTERVAL_MS: 60_000,
  ADMIN_EMAIL: "",
  ADMIN_PASSWORD: "",
  FACEBOOK_APP_ID: "",
  FACEBOOK_APP_SECRET: "",
  FACEBOOK_PAGE_LOOKUP_VALUE: "",
  META_INSTAGRAM_PUBLISHING_ENABLED: true,
  META_INSTAGRAM_COMMENTS_ENABLED: false,
  GOOGLE_CLIENT_ID: "",
  GOOGLE_CLIENT_SECRET: "",
  TOKEN_ENCRYPTION_KEY: "",
  REDIS_URL: "",
  RATE_LIMIT_REDIS_PREFIX: "smm:rate-limit",
  TRUST_PROXY_HEADERS: false,
};

export const env = envSchema.parse(typeof window === "undefined" ? serverEnvInput : clientEnvFallback);

export const isProduction = env.NODE_ENV === "production";
export const isSecureAppUrl = (() => {
  try {
    return new URL(env.APP_URL).protocol === "https:";
  } catch {
    return false;
  }
})();

export const hasTokenEncryptionKeyConfigured = Boolean(env.TOKEN_ENCRYPTION_KEY?.trim());
