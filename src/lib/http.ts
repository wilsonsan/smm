import { headers } from "next/headers";
import { env } from "@/lib/env";

function normalizeOrigin(value: string) {
  return value.replace(/\/+$/, "");
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

export function assertSameOrigin(request: Request) {
  const expectedOrigin = normalizeOrigin(env.APP_URL);
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");

  if (origin && normalizeOrigin(origin) !== expectedOrigin) {
    throw new Response("Invalid origin.", { status: 403 });
  }

  if (!origin && referer && !normalizeOrigin(referer).startsWith(expectedOrigin)) {
    throw new Response("Invalid referer.", { status: 403 });
  }
}

