import { NextResponse } from "next/server";
import { AUDIT_ACTIONS, createAuditLog } from "@/lib/audit";
import { requireAdminSessionFromRequest } from "@/lib/auth/session";
import { buildConfiguredAppUrl, buildFacebookConnectUrl, clearFacebookOauthDebugResult, getFacebookConfiguration } from "@/lib/facebook";
import { assertSameOrigin, getRequestMetadata } from "@/lib/http";

export async function GET(request: Request) {
  await assertSameOrigin(request);
  const session = await requireAdminSessionFromRequest(request, { touch: false, requireAdmin: true });
  const config = await getFacebookConfiguration();

  if (config.missingConfig.length > 0) {
    return NextResponse.redirect(
      await buildConfiguredAppUrl("/dashboard/settings/channels/facebook", {
        status: "error",
        message: `Facebook setup is incomplete: ${config.missingConfig.join(", ")}.`,
      }),
    );
  }

  await clearFacebookOauthDebugResult();

  const { ipAddress, userAgent } = await getRequestMetadata();
  await createAuditLog({
    actorAdminUserId: session.adminUserId,
    action: AUDIT_ACTIONS.FACEBOOK_CONNECT_STARTED,
    targetType: "ConnectedAccount",
    ipAddress,
    userAgent,
    metadata: {
      mode: "debug",
    },
  });

  return NextResponse.redirect(await buildFacebookConnectUrl({ mode: "debug" }));
}
