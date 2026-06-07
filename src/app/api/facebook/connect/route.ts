import { NextResponse } from "next/server";
import { AUDIT_ACTIONS, createAuditLog } from "@/lib/audit";
import { buildConfiguredAppUrl, buildFacebookConnectUrl, getFacebookConfiguration, getFacebookConnectionRecord } from "@/lib/facebook";
import { getRequestMetadata, assertSameOrigin } from "@/lib/http";
import { requireAdminSessionFromRequest } from "@/lib/auth/session";

export async function GET(request: Request) {
  await assertSameOrigin(request);
  const session = await requireAdminSessionFromRequest(request, { touch: false, requireAdmin: true });
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
  const { ipAddress, userAgent } = await getRequestMetadata();
  await createAuditLog({
    actorAdminUserId: session.adminUserId,
    action: oauthMode === "reconnect" ? AUDIT_ACTIONS.FACEBOOK_RECONNECT_STARTED : AUDIT_ACTIONS.FACEBOOK_CONNECT_STARTED,
    targetType: "ConnectedAccount",
    targetId: existingConnection?.id ?? null,
    ipAddress,
    userAgent,
  });

  return NextResponse.redirect(await buildFacebookConnectUrl({ mode: oauthMode }));
}
