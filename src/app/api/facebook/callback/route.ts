import { NextResponse } from "next/server";
import { AUDIT_ACTIONS, createAuditLog } from "@/lib/audit";
import { getCurrentAdminSession } from "@/lib/auth/session";
import {
  clearPendingFacebookPageSelection,
  getFacebookOauthCallbackData,
  saveFacebookConnectedPage,
  setPendingFacebookPageSelection,
  validateFacebookOauthState,
} from "@/lib/facebook";

function buildFacebookSettingsUrl(request: Request, status: "success" | "error", message: string) {
  const url = new URL("/dashboard/settings/channels/facebook", request.url);
  url.searchParams.set("status", status);
  url.searchParams.set("message", message);
  return url;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const state = requestUrl.searchParams.get("state");
  const oauthError = requestUrl.searchParams.get("error_description") || requestUrl.searchParams.get("error");

  if (!(await validateFacebookOauthState(state))) {
    return NextResponse.redirect(
      buildFacebookSettingsUrl(request, "error", "Facebook OAuth state validation failed. Start the connection again."),
    );
  }

  if (oauthError) {
    return NextResponse.redirect(buildFacebookSettingsUrl(request, "error", `Facebook authorization failed: ${oauthError}`));
  }

  if (!code) {
    return NextResponse.redirect(
      buildFacebookSettingsUrl(request, "error", "Facebook did not return an authorization code."),
    );
  }

  try {
    await clearPendingFacebookPageSelection();
    const callbackData = await getFacebookOauthCallbackData({ code });

    if (callbackData.pages.length === 0) {
      return NextResponse.redirect(
        buildFacebookSettingsUrl(
          request,
          "error",
          "No manageable Facebook Pages were returned for this Meta account. Confirm the requested Page permissions and Page ownership, then try again.",
        ),
      );
    }

    if (callbackData.pages.length === 1) {
      const page = callbackData.pages[0];
      const connectedAccount = await saveFacebookConnectedPage({
        accountId: callbackData.accountId,
        accountName: callbackData.accountName,
        pageId: page.id,
        pageName: page.name,
        pageAccessToken: page.accessToken,
        pageUrl: page.link ?? null,
        scopes: callbackData.scopes,
        tokenExpiresAt: callbackData.tokenExpiresAt,
      });

      const currentSession = await getCurrentAdminSession();
      await createAuditLog({
        actorAdminUserId: currentSession?.adminUserId ?? null,
        action: AUDIT_ACTIONS.FACEBOOK_CONNECTED,
        targetType: "ConnectedAccount",
        targetId: connectedAccount.id,
        metadata: {
          pageId: page.id,
          pageName: page.name,
          scopes: callbackData.scopes,
          autoSelected: true,
        },
      });

      return NextResponse.redirect(
        buildFacebookSettingsUrl(request, "success", `Connected Facebook Page: ${page.name}.`),
      );
    }

    await setPendingFacebookPageSelection({
      accountId: callbackData.accountId,
      accountName: callbackData.accountName,
      pages: callbackData.pages,
      scopes: callbackData.scopes,
      tokenExpiresAt: callbackData.tokenExpiresAt?.toISOString() ?? null,
    });

    return NextResponse.redirect(
      buildFacebookSettingsUrl(
        request,
        "success",
        "Facebook authorization succeeded. Choose which Page to connect below.",
      ),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Facebook authorization failed.";
    return NextResponse.redirect(buildFacebookSettingsUrl(request, "error", message));
  }
}
