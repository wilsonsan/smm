import { NextResponse } from "next/server";
import { beginGoogleOauth, type GoogleOauthMode } from "@/lib/google";
import { resolvePublicRequestOrigin } from "@/lib/http";

function buildSettingsRedirect(message: string) {
  const url = new URL("/dashboard/settings/channels/google", "http://localhost");
  url.searchParams.set("status", "error");
  url.searchParams.set("message", message);
  return url.pathname + url.search;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const publicOrigin = await resolvePublicRequestOrigin(request);
    const mode = (url.searchParams.get("mode") === "reconnect" ? "reconnect" : "connect") as GoogleOauthMode;
    const connectUrl = await beginGoogleOauth({
      mode,
      publicAppUrlOverride: publicOrigin,
    });
    return NextResponse.redirect(connectUrl);
  } catch (error) {
    const fallback = new URL(buildSettingsRedirect(error instanceof Error ? error.message : "Google OAuth could not be started."), request.url);
    return NextResponse.redirect(fallback);
  }
}
