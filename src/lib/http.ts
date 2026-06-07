import { headers } from "next/headers";
import { env } from "@/lib/env";
import { getAppSettings } from "@/lib/settings";

function normalizeOrigin(value: string) {
  return value.replace(/\/+$/, "");
}

function isLocalHostName(hostname: string) {
  const normalized = hostname.toLowerCase();
  return (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    normalized === "[::1]" ||
    normalized.endsWith(".local")
  );
}

function isLikelyInternalOrigin(value: string) {
  try {
    const parsed = new URL(value);
    return isLocalHostName(parsed.hostname);
  } catch {
    return false;
  }
}

export async function getRequestMetadata() {
  const requestHeaders = await headers();
  const forwardedFor = requestHeaders.get("x-forwarded-for");
  const ipAddress = forwardedFor?.split(",")[0]?.trim() || null;
  const userAgent = requestHeaders.get("user-agent");

  return {
    ipAddress,
    userAgent,
  };
}

export async function assertSameOrigin(request: Request) {
  const settings = await getAppSettings();
  const expectedOrigin = normalizeOrigin(settings.publicAppUrl || env.APP_URL);
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");

  if (origin && normalizeOrigin(origin) !== expectedOrigin) {
    throw new Response("Invalid origin.", { status: 403 });
  }

  if (!origin && referer && !normalizeOrigin(referer).startsWith(expectedOrigin)) {
    throw new Response("Invalid referer.", { status: 403 });
  }
}

export async function resolvePublicRequestOrigin(request: Request) {
  const settings = await getAppSettings();
  const requestUrl = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || "";
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "";

  if (forwardedHost) {
    const protocol =
      forwardedProto === "http" || forwardedProto === "https"
        ? forwardedProto
        : requestUrl.protocol.replace(":", "") || "https";
    return `${protocol}://${forwardedHost}`;
  }

  const requestOrigin = requestUrl.origin;
  if (!isLikelyInternalOrigin(requestOrigin)) {
    return requestOrigin;
  }

  return normalizeOrigin(settings.publicAppUrl || env.APP_URL);
}
