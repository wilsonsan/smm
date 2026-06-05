import { NextResponse } from "next/server";
import { AUDIT_ACTIONS, createAuditLog } from "@/lib/audit";
import { buildConfiguredAppUrl, buildFacebookConnectUrl, getFacebookConfiguration } from "@/lib/facebook";
import { getRequestMetadata, assertSameOrigin } from "@/lib/http";
import { requireAdminSessionFromRequest } from "@/lib/auth/session";

export async function GET(request: Request) {
  assertSameOrigin(request);
  const session = await requireAdminSessionFromRequest(request, { touch: false });
  const config = await getFacebookConfiguration();

  if (config.missingConfig.length > 0) {
    return NextResponse.redirect(
      await buildConfiguredAppUrl("/dashboard/settings/channels/facebook", {
        status: "error",
        message: `Facebook setup is incomplete: ${config.missingConfig.join(", ")}.`,
      }),
    );
  }

  const { ipAddress, userAgent } = await getRequestMetadata();
  await createAuditLog({
    actorAdminUserId: session.adminUserId,
    action: AUDIT_ACTIONS.FACEBOOK_CONNECT_STARTED,
    targetType: "ConnectedAccount",
    ipAddress,
    userAgent,
  });

  return NextResponse.redirect(await buildFacebookConnectUrl());
}
