import { NextResponse } from "next/server";
import {
  buildGooglePendingSelectionFromCodeExchange,
  clearPendingGoogleLocationSelection,
  connectGoogleSelectedLocation,
  consumeGoogleOauthState,
  exchangeGoogleAuthorizationCode,
  setPendingGoogleLocationSelection,
} from "@/lib/google";
import { resolvePublicRequestOrigin } from "@/lib/http";

function buildGoogleSettingsUrl(status: "success" | "error", message: string) {
  const url = new URL("/dashboard/settings/channels/google", "http://localhost");
  url.searchParams.set("status", status);
  url.searchParams.set("message", message);
  return `${url.pathname}${url.search}`;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const publicOrigin = await resolvePublicRequestOrigin(request);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  if (oauthError) {
    return NextResponse.redirect(new URL(buildGoogleSettingsUrl("error", `Google authorization failed: ${oauthError}`), request.url));
  }

  if (!code) {
    return NextResponse.redirect(new URL(buildGoogleSettingsUrl("error", "Google did not return an authorization code."), request.url));
  }

  try {
    const mode = await consumeGoogleOauthState({ state });
    const exchanged = await exchangeGoogleAuthorizationCode(code, {
      publicAppUrlOverride: publicOrigin,
    });
    const pendingSelection = await buildGooglePendingSelectionFromCodeExchange({
      mode,
      accessToken: exchanged.accessToken,
      refreshToken: exchanged.refreshToken,
      tokenExpiresAt: exchanged.tokenExpiresAt,
      scopes: exchanged.scopes,
    });

    if (pendingSelection.locations.length === 1) {
      await setPendingGoogleLocationSelection(pendingSelection);
      const result = await connectGoogleSelectedLocation(pendingSelection.locations[0].locationResourceName);
      await clearPendingGoogleLocationSelection();
      return NextResponse.redirect(
        new URL(
          buildGoogleSettingsUrl(
            "success",
            mode === "reconnect"
              ? `Reconnected Google Business location: ${result.location.title}.`
              : `Connected Google Business location: ${result.location.title}.`,
          ),
          request.url,
        ),
      );
    }

    await setPendingGoogleLocationSelection(pendingSelection);
    return NextResponse.redirect(
      new URL(
        buildGoogleSettingsUrl(
          "success",
          `Google returned ${pendingSelection.locations.length} Business Profile locations. Choose the one this app should use.`,
        ),
        request.url,
      ),
    );
  } catch (error) {
    await clearPendingGoogleLocationSelection().catch(() => undefined);
    return NextResponse.redirect(
      new URL(
        buildGoogleSettingsUrl(
          "error",
          error instanceof Error ? error.message : "Google authorization could not be completed.",
        ),
        request.url,
      ),
    );
  }
}
