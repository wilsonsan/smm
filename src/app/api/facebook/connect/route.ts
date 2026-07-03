import { NextResponse } from "next/server";
import { AUDIT_ACTIONS, createAuditLog } from "@/lib/audit";
import {
  buildConfiguredAppUrl,
  buildFacebookConnectUrl,
  type FacebookOauthMode,
  getFacebookConfiguration,
  getFacebookConnectionRecord,
} from "@/lib/facebook";
import { assertSameOrigin, getRequestMetadataFromRequest } from "@/lib/http";
import { requireAdminSessionFromRequest } from "@/lib/auth/session";
import { RATE_LIMITS } from "@/lib/rate-limit/config";
import { buildRateLimitHeaders, enforceRateLimit, isRateLimitExceededError } from "@/lib/rate-limit";

const FACEBOOK_CONNECT_RETURN_PATHS = new Set([
  "/dashboard/settings/channels/facebook",
  "/dashboard/settings/channels/facebook/advanced",
  "/dashboard/settings/channels/instagram",
  "/dashboard/settings/channels/instagram/advanced",
]);

function normalizeConnectMode(value: FormDataEntryValue | string | null | undefined): FacebookOauthMode {
  return value === "reconnect" ? "reconnect" : "connect";
}

function normalizeReturnTo(value: FormDataEntryValue | string | null | undefined) {
  const nextValue = typeof value === "string" ? value.trim() : "";
  return FACEBOOK_CONNECT_RETURN_PATHS.has(nextValue)
    ? nextValue
    : "/dashboard/settings/channels/facebook";
}

async function buildSettingsRedirect(input: {
  returnTo: string;
  status: "success" | "error";
  message: string;
}) {
  return NextResponse.redirect(
    await buildConfiguredAppUrl(input.returnTo, {
      status: input.status,
      message: input.message,
    }),
  );
}

async function startFacebookOauth(request: Request, input: { mode: FacebookOauthMode; returnTo: string }) {
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
  if (config.missingConfig.length > 0) {
    return buildSettingsRedirect({
      returnTo: input.returnTo,
      status: "error",
      message: `Facebook setup is incomplete: ${config.missingConfig.join(", ")}.`,
    });
  }

  const existingConnection = await getFacebookConnectionRecord();
  await createAuditLog({
    actorAdminUserId: session.adminUserId,
    action: input.mode === "reconnect" ? AUDIT_ACTIONS.FACEBOOK_RECONNECT_STARTED : AUDIT_ACTIONS.FACEBOOK_CONNECT_STARTED,
    targetType: "ConnectedAccount",
    targetId: existingConnection?.id ?? null,
    ipAddress: requestMetadata.ipAddress,
    userAgent: requestMetadata.userAgent,
  });

  return NextResponse.redirect(await buildFacebookConnectUrl({ mode: input.mode }));
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const mode = normalizeConnectMode(formData.get("mode"));
  const returnTo = normalizeReturnTo(formData.get("returnTo"));

  try {
    return await startFacebookOauth(request, { mode, returnTo });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    if (isRateLimitExceededError(error)) {
      return buildSettingsRedirect({
        returnTo,
        status: "error",
        message: error.message,
      });
    }

    return buildSettingsRedirect({
      returnTo,
      status: "error",
      message: error instanceof Error ? error.message : "Facebook OAuth could not be started.",
    });
  }
}

export async function GET() {
  return NextResponse.json(
    {
      error: "Use POST to start Facebook OAuth.",
    },
    {
      status: 405,
      headers: {
        Allow: "POST",
      },
    },
  );
}
