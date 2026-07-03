import { NextResponse } from "next/server";
import { beginGoogleOauth, getGoogleConfiguration, type GoogleOauthMode } from "@/lib/google";
import { assertSameOrigin, getRequestMetadataFromRequest } from "@/lib/http";
import { requireAdminSessionFromRequest } from "@/lib/auth/session";
import { RATE_LIMITS } from "@/lib/rate-limit/config";
import { enforceRateLimit, isRateLimitExceededError } from "@/lib/rate-limit";

const GOOGLE_CONNECT_RETURN_PATHS = new Set([
  "/dashboard/settings/channels/google",
  "/dashboard/settings/channels/google/advanced",
]);

function normalizeConnectMode(value: FormDataEntryValue | string | null | undefined): GoogleOauthMode {
  return value === "reconnect" ? "reconnect" : "connect";
}

function normalizeReturnTo(value: FormDataEntryValue | string | null | undefined) {
  const nextValue = typeof value === "string" ? value.trim() : "";
  return GOOGLE_CONNECT_RETURN_PATHS.has(nextValue)
    ? nextValue
    : "/dashboard/settings/channels/google";
}

function buildSettingsRedirect(returnTo: string, message: string) {
  const url = new URL(returnTo, "http://localhost");
  url.searchParams.set("status", "error");
  url.searchParams.set("message", message);
  return url.pathname + url.search;
}

async function startGoogleOauth(request: Request, input: { mode: GoogleOauthMode; returnTo: string }) {
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

  const config = await getGoogleConfiguration();
  if (config.missingConfig.length > 0) {
    return NextResponse.redirect(
      new URL(
        buildSettingsRedirect(input.returnTo, `Google setup is incomplete: ${config.missingConfig.join(", ")}.`),
        config.publicAppUrl,
      ),
    );
  }

  const connectUrl = await beginGoogleOauth({
    mode: input.mode,
    publicAppUrlOverride: config.publicAppUrl,
  });

  return NextResponse.redirect(connectUrl);
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const returnTo = normalizeReturnTo(formData.get("returnTo"));
  const mode = normalizeConnectMode(formData.get("mode"));

  try {
    return await startGoogleOauth(request, { mode, returnTo });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    if (isRateLimitExceededError(error)) {
      const config = await getGoogleConfiguration().catch(() => null);
      const publicOrigin = config?.publicAppUrl || new URL(request.url).origin;
      return NextResponse.redirect(new URL(buildSettingsRedirect(returnTo, error.message), publicOrigin));
    }

    const config = await getGoogleConfiguration().catch(() => null);
    const publicOrigin = config?.publicAppUrl || new URL(request.url).origin;
    return NextResponse.redirect(
      new URL(
        buildSettingsRedirect(
          returnTo,
          error instanceof Error ? error.message : "Google OAuth could not be started.",
        ),
        publicOrigin,
      ),
    );
  }
}

export async function GET() {
  return NextResponse.json(
    {
      error: "Use POST to start Google OAuth.",
    },
    {
      status: 405,
      headers: {
        Allow: "POST",
      },
    },
  );
}
