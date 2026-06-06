import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required."),
  APP_URL: z.string().url().default("http://localhost:3000"),
  UPLOAD_DIR: z.string().min(1).default("./uploads"),
  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(26_214_400),
  SESSION_TTL_HOURS: z.coerce.number().int().positive().default(168),
  ADMIN_EMAIL: z.string().email().optional().or(z.literal("")),
  ADMIN_PASSWORD: z.string().min(12).optional().or(z.literal("")),
  FACEBOOK_APP_ID: z.string().optional().or(z.literal("")),
  FACEBOOK_APP_SECRET: z.string().optional().or(z.literal("")),
  FACEBOOK_PAGE_LOOKUP_VALUE: z.string().optional().or(z.literal("")),
  TOKEN_ENCRYPTION_KEY: z.string().optional().or(z.literal("")),
});

const serverEnvInput = {
  NODE_ENV: process.env.NODE_ENV,
  DATABASE_URL: process.env.DATABASE_URL,
  APP_URL: process.env.APP_URL,
  UPLOAD_DIR: process.env.UPLOAD_DIR,
  MAX_UPLOAD_BYTES: process.env.MAX_UPLOAD_BYTES,
  SESSION_TTL_HOURS: process.env.SESSION_TTL_HOURS,
  ADMIN_EMAIL: process.env.ADMIN_EMAIL,
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
  FACEBOOK_APP_ID: process.env.FACEBOOK_APP_ID,
  FACEBOOK_APP_SECRET: process.env.FACEBOOK_APP_SECRET,
  FACEBOOK_PAGE_LOOKUP_VALUE: process.env.FACEBOOK_PAGE_LOOKUP_VALUE,
  TOKEN_ENCRYPTION_KEY: process.env.TOKEN_ENCRYPTION_KEY,
};

const clientEnvFallback = {
  NODE_ENV: process.env.NODE_ENV ?? "development",
  DATABASE_URL: "client-side-unavailable",
  APP_URL: "http://localhost:3000",
  UPLOAD_DIR: "./uploads",
  MAX_UPLOAD_BYTES: 26_214_400,
  SESSION_TTL_HOURS: 168,
  ADMIN_EMAIL: "",
  ADMIN_PASSWORD: "",
  FACEBOOK_APP_ID: "",
  FACEBOOK_APP_SECRET: "",
  FACEBOOK_PAGE_LOOKUP_VALUE: "",
  TOKEN_ENCRYPTION_KEY: "",
};

export const env = envSchema.parse(typeof window === "undefined" ? serverEnvInput : clientEnvFallback);

export const isProduction = env.NODE_ENV === "production";

export const hasTokenEncryptionKeyConfigured = Boolean(env.TOKEN_ENCRYPTION_KEY?.trim());
