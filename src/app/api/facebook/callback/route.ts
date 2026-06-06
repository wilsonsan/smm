import { NextResponse } from "next/server";
import { AUDIT_ACTIONS, createAuditLog } from "@/lib/audit";
import { getCurrentAdminSession } from "@/lib/auth/session";
import {
  FACEBOOK_REQUIRED_SCOPES,
  buildConfiguredAppUrl,
  clearFacebookOauthDebugResult,
  clearPendingFacebookPageSelection,
  consumeFacebookOauthMode,
  getFacebookConnectionRecord,
  getFacebookOauthDebugData,
  getFacebookOauthCallbackData,
  saveFacebookConnectedPage,
  setFacebookOauthDebugResult,
  setPendingFacebookPageSelection,
  validateFacebookOauthState,
} from "@/lib/facebook";

function buildFacebookSettingsUrl(status: "success" | "error", message: string) {
  return buildConfiguredAppUrl("/dashboard/settings/channels/facebook", {
    status,
    message,
  });
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const state = requestUrl.searchParams.get("state");
  const oauthError = requestUrl.searchParams.get("error_description") || requestUrl.searchParams.get("error");

  if (!(await validateFacebookOauthState(state))) {
    return NextResponse.redirect(
      await buildFacebookSettingsUrl("error", "Facebook OAuth state validation failed. Start the connection again."),
    );
  }

  if (oauthError) {
    return NextResponse.redirect(await buildFacebookSettingsUrl("error", `Facebook authorization failed: ${oauthError}`));
  }

  if (!code) {
    return NextResponse.redirect(
      await buildFacebookSettingsUrl("error", "Facebook did not return an authorization code."),
    );
  }

  let oauthMode: "connect" | "reconnect" | "debug" = "connect";
  try {
    oauthMode = await consumeFacebookOauthMode();
    const currentSession = await getCurrentAdminSession();
    await clearPendingFacebookPageSelection();

    if (oauthMode === "debug") {
      const debugData = await getFacebookOauthDebugData({ code });
      await setFacebookOauthDebugResult(debugData);

      return NextResponse.redirect(
        await buildFacebookSettingsUrl(
          debugData.emptyAccountsMessage ? "error" : "success",
          debugData.emptyAccountsMessage || "Facebook OAuth debug completed.",
        ),
      );
    }

    await clearFacebookOauthDebugResult();
    const callbackData = await getFacebookOauthCallbackData({ code });
    const existingConnection = await getFacebookConnectionRecord();

    if (callbackData.pages.length === 0) {
      const missingScopes = FACEBOOK_REQUIRED_SCOPES.filter((scope) => !callbackData.scopes.includes(scope));
      const grantedScopesLabel = callbackData.scopes.length > 0 ? callbackData.scopes.join(", ") : "none returned";
      const diagnosticsLabel = `Accounts returned: ${callbackData.diagnostics.rawAccountsCount}. Accounts with page access tokens: ${callbackData.diagnostics.rawAccountsWithPageAccessTokenCount}. Hydrated page access tokens: ${callbackData.diagnostics.hydratedPageAccessTokenCount}. Accounts source: ${callbackData.diagnostics.accountsSource}.`;
      const message =
        missingScopes.length > 0
          ? `No manageable Facebook Pages were returned for ${callbackData.accountName}. Facebook granted: ${grantedScopesLabel}. Missing required scopes: ${missingScopes.join(", ")}. ${diagnosticsLabel} Reconnect and approve every requested Page permission.`
          : callbackData.diagnostics.rawAccountsCount > 0
            ? `Facebook returned ${callbackData.diagnostics.rawAccountsCount} Page record(s) for ${callbackData.accountName}, but none produced a usable Page access token. Facebook granted: ${grantedScopesLabel}. ${diagnosticsLabel} This is usually a token-issuance or app-access problem rather than a missing account. Run OAuth Debug from Facebook Settings to inspect the raw account data.`
            : `No manageable Facebook Pages were returned for ${callbackData.accountName}. Facebook granted: ${grantedScopesLabel}. ${diagnosticsLabel} This usually means that this Meta/Facebook account does not currently manage a Facebook Page, the app is still in Development mode and this account is not added as an app role, or the Page is owned through Business Manager without the needed Page access for this user.`;

      if (oauthMode === "reconnect") {
        await createAuditLog({
          actorAdminUserId: currentSession?.adminUserId ?? null,
          action: AUDIT_ACTIONS.FACEBOOK_RECONNECT_FAILED,
          targetType: "ConnectedAccount",
          targetId: existingConnection?.id ?? null,
          metadata: {
            reason: "NO_MANAGEABLE_PAGES",
            diagnostics: callbackData.diagnostics,
          },
        });
      }

      return NextResponse.redirect(
        await buildFacebookSettingsUrl(
          "error",
          message,
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

      await createAuditLog({
        actorAdminUserId: currentSession?.adminUserId ?? null,
        action: oauthMode === "reconnect" ? AUDIT_ACTIONS.FACEBOOK_RECONNECT_SUCCEEDED : AUDIT_ACTIONS.FACEBOOK_CONNECTED,
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
        await buildFacebookSettingsUrl(
          "success",
          oauthMode === "reconnect" ? `Reconnected Facebook Page: ${page.name}.` : `Connected Facebook Page: ${page.name}.`,
        ),
      );
    }

    if (oauthMode === "reconnect" && existingConnection?.pageId) {
      const matchingPage = callbackData.pages.find((page) => page.id === existingConnection.pageId);

      if (matchingPage) {
        const connectedAccount = await saveFacebookConnectedPage({
          accountId: callbackData.accountId,
          accountName: callbackData.accountName,
          pageId: matchingPage.id,
          pageName: matchingPage.name,
          pageAccessToken: matchingPage.accessToken,
          pageUrl: matchingPage.link ?? null,
          scopes: callbackData.scopes,
          tokenExpiresAt: callbackData.tokenExpiresAt,
        });

        await createAuditLog({
          actorAdminUserId: currentSession?.adminUserId ?? null,
          action: AUDIT_ACTIONS.FACEBOOK_RECONNECT_SUCCEEDED,
          targetType: "ConnectedAccount",
          targetId: connectedAccount.id,
          metadata: {
            pageId: matchingPage.id,
            pageName: matchingPage.name,
            scopes: callbackData.scopes,
            preservedExistingPageSelection: true,
          },
        });

        return NextResponse.redirect(
          await buildFacebookSettingsUrl("success", `Reconnected Facebook Page: ${matchingPage.name}.`),
        );
      }
    }

    await setPendingFacebookPageSelection({
      accountId: callbackData.accountId,
      accountName: callbackData.accountName,
      pages: callbackData.pages,
      scopes: callbackData.scopes,
      tokenExpiresAt: callbackData.tokenExpiresAt?.toISOString() ?? null,
      mode: oauthMode === "reconnect" ? "reconnect" : "connect",
    });

    return NextResponse.redirect(
      await buildFacebookSettingsUrl(
        "success",
        oauthMode === "reconnect"
          ? "Facebook reconnection succeeded. Choose which Page to keep connected below."
          : "Facebook authorization succeeded. Choose which Page to connect below.",
      ),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Facebook authorization failed.";
    if (oauthMode === "reconnect") {
      const currentSession = await getCurrentAdminSession();
      await createAuditLog({
        actorAdminUserId: currentSession?.adminUserId ?? null,
        action: AUDIT_ACTIONS.FACEBOOK_RECONNECT_FAILED,
        targetType: "ConnectedAccount",
        metadata: {
          message,
        },
      });
    }
    return NextResponse.redirect(await buildFacebookSettingsUrl("error", message));
  }
}
