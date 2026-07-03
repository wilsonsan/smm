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

type HeaderSource = Pick<Headers, "get">;

function getTrustedForwardedIp(headerSource: HeaderSource) {
  if (!env.TRUST_PROXY_HEADERS) {
    return null;
  }

  const prioritizedHeaders = [
    "cf-connecting-ip",
    "true-client-ip",
    "x-real-ip",
    "x-forwarded-for",
  ];

  for (const headerName of prioritizedHeaders) {
    const rawValue = headerSource.get(headerName);
    if (!rawValue) {
      continue;
    }

    const firstValue = rawValue.split(",")[0]?.trim();
    if (firstValue) {
      return firstValue;
    }
  }

  return null;
}

function buildRequestMetadata(headerSource: HeaderSource, input?: { method?: string | null; endpoint?: string | null }) {
  const ipAddress = getTrustedForwardedIp(headerSource);
  const userAgent = headerSource.get("user-agent");

  return {
    ipAddress,
    userAgent,
    method: input?.method ?? null,
    endpoint: input?.endpoint ?? null,
  };
}

export async function getRequestMetadata() {
  const requestHeaders = await headers();
  return buildRequestMetadata(requestHeaders);
}

export function getRequestMetadataFromRequest(request: Request) {
  return buildRequestMetadata(request.headers, {
    method: request.method,
    endpoint: new URL(request.url).pathname,
  });
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

  if (!origin && !referer) {
    throw new Response("Missing origin metadata.", { status: 403 });
  }
}

export async function resolvePublicRequestOrigin(request: Request) {
  const settings = await getAppSettings();
  const requestUrl = new URL(request.url);
  const forwardedHost = env.TRUST_PROXY_HEADERS
    ? request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || ""
    : "";
  const forwardedProto = env.TRUST_PROXY_HEADERS
    ? request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || ""
    : "";

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
