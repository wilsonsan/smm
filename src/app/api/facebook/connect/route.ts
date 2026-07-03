import { NextResponse } from "next/server";
import { AUDIT_ACTIONS, createAuditLog } from "@/lib/audit";
import { buildConfiguredAppUrl, buildFacebookConnectUrl, getFacebookConfiguration, getFacebookConnectionRecord } from "@/lib/facebook";
import { assertSameOrigin, getRequestMetadataFromRequest } from "@/lib/http";
import { requireAdminSessionFromRequest } from "@/lib/auth/session";
import { RATE_LIMITS } from "@/lib/rate-limit/config";
import { buildRateLimitHeaders, enforceRateLimit, isRateLimitExceededError } from "@/lib/rate-limit";

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
      endpoint: requestMetadata.endpoint || "/api/facebook/connect",
      method: requestMetadata.method,
      attemptedAction: "facebook_oauth_connect",
    });
    const config = await getFacebookConfiguration();
    const requestUrl = new URL(request.url);
    const requestedMode = requestUrl.searchParams.get("mode");
    const oauthMode = requestedMode === "reconnect" ? "reconnect" : "connect";

    if (config.missingConfig.length > 0) {
      return NextResponse.redirect(
        await buildConfiguredAppUrl("/dashboard/settings/channels/facebook", {
          status: "error",
          message: `Facebook setup is incomplete: ${config.missingConfig.join(", ")}.`,
        }),
      );
    }

    const existingConnection = await getFacebookConnectionRecord();
    await createAuditLog({
      actorAdminUserId: session.adminUserId,
      action: oauthMode === "reconnect" ? AUDIT_ACTIONS.FACEBOOK_RECONNECT_STARTED : AUDIT_ACTIONS.FACEBOOK_CONNECT_STARTED,
      targetType: "ConnectedAccount",
      targetId: existingConnection?.id ?? null,
      ipAddress: requestMetadata.ipAddress,
      userAgent: requestMetadata.userAgent,
    });

    return NextResponse.redirect(await buildFacebookConnectUrl({ mode: oauthMode }));
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

    throw error;
  }
}
