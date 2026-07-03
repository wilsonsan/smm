import { NextResponse } from "next/server";
import { beginGoogleOauth, type GoogleOauthMode } from "@/lib/google";
import { assertSameOrigin, getRequestMetadataFromRequest, resolvePublicRequestOrigin } from "@/lib/http";
import { requireAdminSessionFromRequest } from "@/lib/auth/session";
import { RATE_LIMITS } from "@/lib/rate-limit/config";
import { buildRateLimitHeaders, enforceRateLimit, isRateLimitExceededError } from "@/lib/rate-limit";

function buildSettingsRedirect(message: string) {
  const url = new URL("/dashboard/settings/channels/google", "http://localhost");
  url.searchParams.set("status", "error");
  url.searchParams.set("message", message);
  return url.pathname + url.search;
}

export async function GET(request: Request) {
  try {
    await assertSameOrigin(request);
    const session = await requireAdminSessionFromRequest(request, { touch: false, requireAdmin: true });
    const requestMetadata = getRequestMetadataFromRequest(request);
    await enforceRateLimit(RATE_LIMITS.connectedAccounts.actionsPerHour, {
      actorAdminUserId: session.adminUserId,
      userId: session.adminUserId,
      ipAddress: requestMetadata.ipAddress,
      userAgent: requestMetadata.userAgent,
      endpoint: requestMetadata.endpoint || "/api/google/connect",
      method: requestMetadata.method,
      attemptedAction: "google_oauth_connect",
    });

    const url = new URL(request.url);
    const publicOrigin = await resolvePublicRequestOrigin(request);
    const mode = (url.searchParams.get("mode") === "reconnect" ? "reconnect" : "connect") as GoogleOauthMode;
    const connectUrl = await beginGoogleOauth({
      mode,
      publicAppUrlOverride: publicOrigin,
    });
    return NextResponse.redirect(connectUrl);
  } catch (error) {
    if (isRateLimitExceededError(error)) {
      return NextResponse.json(
        {
          error: error.message,
        },
        {
          status: 429,
          headers: buildRateLimitHeaders(error),
        },
      );
    }

    const publicOrigin = await resolvePublicRequestOrigin(request);
    const fallback = new URL(
      buildSettingsRedirect(error instanceof Error ? error.message : "Google OAuth could not be started."),
      publicOrigin,
    );
    return NextResponse.redirect(fallback);
  }
}
