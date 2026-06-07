import { createHmac, timingSafeEqual } from "node:crypto";
import { URLSearchParams } from "node:url";
import { env, hasTokenEncryptionKeyConfigured } from "@/lib/env";
import { getAppSettings } from "@/lib/settings";

export type PublicPlatformMediaPlatform = "INSTAGRAM" | "GOOGLE_BUSINESS";

function buildSigningKey() {
  if (!hasTokenEncryptionKeyConfigured || !env.TOKEN_ENCRYPTION_KEY) {
    throw new Error("TOKEN_ENCRYPTION_KEY is required for signed public platform media URLs.");
  }

  return env.TOKEN_ENCRYPTION_KEY;
}

function buildSignature(input: {
  platform: PublicPlatformMediaPlatform;
  storagePath: string;
  expiresAt: string;
}) {
  return createHmac("sha256", buildSigningKey())
    .update(`${input.platform}:${input.storagePath}:${input.expiresAt}`)
    .digest("hex");
}

function isSafePublicStoragePath(platform: PublicPlatformMediaPlatform, storagePath: string) {
  if (platform === "INSTAGRAM") {
    return storagePath.startsWith("tmp/instagram/");
  }

  if (platform === "GOOGLE_BUSINESS") {
    return storagePath.startsWith("tmp/google/");
  }

  return false;
}

function isPublicBaseUrlReachable(value: string) {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:") {
      return false;
    }

    const hostname = parsed.hostname.toLowerCase();
    if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname.endsWith(".local")) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

export async function createSignedPublicPlatformMediaUrl(input: {
  platform: PublicPlatformMediaPlatform;
  storagePath: string;
  expiresInMinutes?: number;
}) {
  if (!isSafePublicStoragePath(input.platform, input.storagePath)) {
    throw new Error("The requested platform media file cannot be exposed publicly.");
  }

  const settings = await getAppSettings();
  const publicBaseUrl = settings.publicAppUrl || env.APP_URL;
  if (!isPublicBaseUrlReachable(publicBaseUrl)) {
    throw new Error("Platform media publishing requires APP_URL to be a public https URL reachable by the destination platform.");
  }

  const expiresAt = new Date(Date.now() + (input.expiresInMinutes ?? 30) * 60 * 1000).toISOString();
  const signature = buildSignature({
    platform: input.platform,
    storagePath: input.storagePath,
    expiresAt,
  });

  const url = new URL("/api/public/platform-media", publicBaseUrl);
  const searchParams = new URLSearchParams({
    platform: input.platform,
    storagePath: input.storagePath,
    expires: expiresAt,
    sig: signature,
  });
  url.search = searchParams.toString();
  return url.toString();
}

export function validateSignedPublicPlatformMediaRequest(input: {
  platform: string | null;
  storagePath: string | null;
  expiresAt: string | null;
  signature: string | null;
}) {
  if (!input.platform || (input.platform !== "INSTAGRAM" && input.platform !== "GOOGLE_BUSINESS")) {
    return {
      ok: false as const,
      reason: "invalid_request",
    };
  }

  if (!input.storagePath || !input.expiresAt || !input.signature || !isSafePublicStoragePath(input.platform, input.storagePath)) {
    return {
      ok: false as const,
      reason: "invalid_request",
    };
  }

  const expiry = new Date(input.expiresAt);
  if (Number.isNaN(expiry.getTime()) || expiry.getTime() <= Date.now()) {
    return {
      ok: false as const,
      reason: "expired",
    };
  }

  const expectedSignature = buildSignature({
    platform: input.platform,
    storagePath: input.storagePath,
    expiresAt: input.expiresAt,
  });
  const provided = Buffer.from(input.signature, "utf8");
  const expected = Buffer.from(expectedSignature, "utf8");

  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return {
      ok: false as const,
      reason: "invalid_signature",
    };
  }

  return {
    ok: true as const,
    platform: input.platform,
    storagePath: input.storagePath,
  };
}
