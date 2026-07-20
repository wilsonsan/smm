import { headers } from "next/headers";
import Link from "next/link";
import { ConnectedAccountStatus } from "@prisma/client";
import { requireAdminUser } from "@/lib/auth/session";
import {
  clearFacebookDebugResultAction,
  clearFacebookPendingSelectionAction,
  connectFacebookResolvedPageAction,
  disconnectFacebookAction,
  runFacebookPageIdDiagnosticsAction,
  saveFacebookSettingsAction,
  selectFacebookPageAction,
  testFacebookConnectionAction,
} from "@/app/dashboard/settings/channels/facebook/actions";
import {
  getFacebookConfiguration,
  refreshFacebookConnectionHealth,
  getFacebookConnectionRecord,
  getFacebookOauthDebugResult,
  getPendingFacebookPageSelection,
} from "@/lib/facebook";
import { getInstagramFoundationStateFromConnection } from "@/lib/instagram";
import { formatDateTimeForTimezone, getResolvedAppTimezone } from "@/lib/time";
import { FacebookDiagnosticsPanel } from "@/components/facebook-diagnostics-panel";

type FacebookAdvancedSettingsPageProps = {
  searchParams?: Promise<{
    status?: string;
    message?: string;
  }>;
};

function normalizeOrigin(value: string | null | undefined) {
  return (value || "").replace(/\/+$/, "");
}

async function getDetectedRequestOrigin() {
  const requestHeaders = await headers();
  const forwardedProto = requestHeaders.get("x-forwarded-proto");
  const forwardedHost = requestHeaders.get("x-forwarded-host");
  const host = forwardedHost || requestHeaders.get("host");

  if (!host) {
    return "";
  }

  const protocol = forwardedProto || "https";
  return `${protocol}://${host}`;
}

function getStatusLabel(status: ConnectedAccountStatus | null) {
  if (status === ConnectedAccountStatus.CONNECTED) {
    return "CONNECTED";
  }

  if (status === ConnectedAccountStatus.NEEDS_RECONNECT) {
    return "NEEDS RECONNECT";
  }

  if (status === ConnectedAccountStatus.EXPIRED) {
    return "EXPIRED";
  }

  if (status === ConnectedAccountStatus.INVALID) {
    return "INVALID";
  }

  if (status === ConnectedAccountStatus.MISSING_SCOPES) {
    return "MISSING SCOPES";
  }

  if (status === ConnectedAccountStatus.ERROR) {
    return "ERROR";
  }

  return "DISCONNECTED";
}

function getStatusTone(status: ConnectedAccountStatus | null) {
  if (status === ConnectedAccountStatus.CONNECTED) {
    return "published";
  }

  if (
    status === ConnectedAccountStatus.EXPIRED ||
    status === ConnectedAccountStatus.INVALID ||
    status === ConnectedAccountStatus.MISSING_SCOPES ||
    status === ConnectedAccountStatus.ERROR
  ) {
    return "failed";
  }

  if (status === ConnectedAccountStatus.NEEDS_RECONNECT) {
    return "scheduled";
  }

  return "draft";
}

function getManualResolvedPage(debugResult: Awaited<ReturnType<typeof getFacebookOauthDebugResult>>) {
  if (!debugResult?.manualPageIdTest) {
    return null;
  }

  for (const result of debugResult.manualPageIdTest.endpointResults) {
    if (!result.success || !result.endpoint.includes("fields=id,name,access_token")) {
      continue;
    }

    const payload = result.sanitizedJson;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      continue;
    }

    const id = "id" in payload && typeof payload.id === "string" ? payload.id : "";
    const name = "name" in payload && typeof payload.name === "string" ? payload.name : "";
    const accessTokenValue =
      "access_token" in payload && typeof payload.access_token === "string" ? payload.access_token : "";

    if (id && name && accessTokenValue === "[REDACTED_PRESENT]") {
      return {
        pageId: id,
        pageName: name,
      };
    }
  }

  return null;
}

export default async function FacebookAdvancedChannelSettingsPage({
  searchParams,
}: FacebookAdvancedSettingsPageProps) {
  await requireAdminUser({ redirectTo: "/dashboard/settings", targetType: "FacebookAdvancedSettingsPage" });
  const resolvedSearchParams = await searchParams;
  await refreshFacebookConnectionHealth({
    createNotification: true,
    source: "settings_page_load",
  }).catch(() => null);
  const [config, connection, debugResult, pendingSelection, timezone, detectedRequestOrigin] = await Promise.all([
    getFacebookConfiguration(),
    getFacebookConnectionRecord(),
    getFacebookOauthDebugResult(),
    getPendingFacebookPageSelection(),
    getResolvedAppTimezone(),
    getDetectedRequestOrigin(),
  ]);

  const pageUrl =
    connection?.metadata && typeof connection.metadata === "object" && !Array.isArray(connection.metadata)
      ? String((connection.metadata as Record<string, unknown>).pageUrl ?? "")
      : "";

  const effectiveAppId = config.appId || "";
  const preferredPageLookupValue = config.preferredPageLookupValue || "nctilepro";
  const hasBlockingSetupIssue = config.missingConfig.length > 0;
  const missingScopes = config.requiredScopes.filter((scope) => !connection?.scopes.includes(scope));
  const publicUrlMismatch =
    Boolean(detectedRequestOrigin) &&
    normalizeOrigin(detectedRequestOrigin) !== normalizeOrigin(config.publicAppUrl);
  const manualResolvedPage = getManualResolvedPage(debugResult);
  const needsReconnect =
    connection?.status === ConnectedAccountStatus.NEEDS_RECONNECT ||
    connection?.status === ConnectedAccountStatus.EXPIRED ||
    connection?.status === ConnectedAccountStatus.INVALID ||
    connection?.status === ConnectedAccountStatus.MISSING_SCOPES ||
    connection?.status === ConnectedAccountStatus.ERROR;
  const hasConnectedPage = Boolean(connection?.pageId);
  const instagramFoundation = getInstagramFoundationStateFromConnection(connection);

  return (
    <section className="section-stack">
      <header className="page-header">
        <div>
          <h2>Facebook Advanced</h2>
          <p>Full Facebook diagnostics, redirect/runtime checks, manual page lookup, and deep connection troubleshooting.</p>
        </div>
        <div className="button-row">
          <Link href="/dashboard/settings/channels/facebook" className="secondary-button">
            Back To Facebook
          </Link>
          <Link href="/dashboard/settings" className="ghost-link-button">
            Settings Home
          </Link>
        </div>
      </header>

      {resolvedSearchParams?.message ? (
        <section className="panel">
          <div className="panel-body">
            <p className={resolvedSearchParams.status === "error" ? "error-text" : "success-text"}>
              {resolvedSearchParams.message}
            </p>
          </div>
        </section>
      ) : null}

      <section className="panel settings-section-card">
        <div className="settings-section-head">
          <div>
            <span className="settings-eyebrow">Channel Settings</span>
            <h3>Advanced Facebook Settings</h3>
            <p>Meta app configuration stays self-hosted, and Page access tokens are encrypted before they touch storage.</p>
          </div>
          <span className="settings-count">{connection?.pageName ? "Connected" : "Ready to connect"}</span>
        </div>

        <section className="settings-subcard">
          <div className="settings-subcard-head">
            <div>
              <strong>App & Redirect Setup</strong>
              <p>Use this exact redirect URI in the Meta app configuration, and manage the saved Meta credentials from here when you need the deeper setup details.</p>
            </div>
            <span className="settings-chip">OAuth</span>
          </div>

          <div className="form-grid">
            <form action={saveFacebookSettingsAction} className="form-grid">
              <input type="hidden" name="returnTo" value="/dashboard/settings/channels/facebook/advanced" />
              <input type="hidden" name="mode" value={connection?.pageId ? "reconnect" : "connect"} />
              <div className="grid-2">
                <div className="field">
                  <label htmlFor="facebookAppId">Facebook App ID</label>
                  <input
                    id="facebookAppId"
                    name="facebookAppId"
                    defaultValue={effectiveAppId}
                    placeholder="123456789012345"
                  />
                  <span className="hint">Saved here if you want an override. Leaving it blank falls back to `FACEBOOK_APP_ID` from the environment.</span>
                </div>

                <div className="field">
                  <label htmlFor="facebookAppSecret">Facebook App Secret</label>
                  <input
                    id="facebookAppSecret"
                    name="facebookAppSecret"
                    type="password"
                    autoComplete="new-password"
                    placeholder={config.appSecretConfigured ? "Saved securely. Enter only to replace it." : "Enter Meta app secret"}
                  />
                  <span className="hint">
                    {config.appSecretConfigured
                      ? `A secret is already available from ${config.appSecretSource === "settings" ? "Settings" : "the environment"}. Leave this blank to keep it.`
                      : "Stored encrypted in app settings once saved."}
                  </span>
                </div>

                <div className="field">
                  <label>Token Encryption Key</label>
                  <input
                    value={
                      config.tokenEncryptionKeyConfigured
                        ? config.tokenEncryptionKeySource === "legacy_settings"
                          ? "Legacy key still stored in Settings"
                          : "Configured through the environment"
                        : "Missing"
                    }
                    readOnly
                  />
                  <span className="hint">
                    {config.tokenEncryptionKeyConfigured
                      ? config.tokenEncryptionKeySource === "legacy_settings"
                        ? "Move TOKEN_ENCRYPTION_KEY into the environment, then save these channel settings once to migrate off the legacy stored key."
                        : "The root encryption key is now environment-managed and is not saved through Settings."
                      : "Set TOKEN_ENCRYPTION_KEY in the environment before storing connected-account secrets."}
                  </span>
                </div>

                <div className="field">
                  <label htmlFor="facebookPageLookupValue">Preferred Page lookup</label>
                  <input
                    id="facebookPageLookupValue"
                    name="facebookPageLookupValue"
                    defaultValue={preferredPageLookupValue}
                    placeholder="nctilepro"
                  />
                  <span className="hint">When `/me/accounts` returns zero, the app will try this Page username or ID directly before giving up.</span>
                </div>

                <div className="field">
                  <label>Effective public app URL</label>
                  <input value={config.publicAppUrl} readOnly />
                  <span className="hint">This is the base URL the Facebook OAuth flow will trust for callbacks and local redirects.</span>
                </div>

                <div className="field">
                  <label>Redirect URI</label>
                  <input value={config.redirectUri} readOnly />
                </div>

                <div className="field">
                  <label>Detected request origin</label>
                  <input value={detectedRequestOrigin || "Could not detect request origin"} readOnly />
                  <span className="hint">Useful for spotting reverse-proxy host/protocol mismatches.</span>
                </div>

                <div className="field">
                  <label>Required scopes</label>
                  <input value={config.requiredScopes.join(", ")} readOnly />
                </div>

                <div className="field">
                  <label>Optional diagnostic scopes</label>
                  <input value={config.optionalDiagnosticScopes.join(", ")} readOnly />
                  <span className="hint">`business_management` is not required for basic Page connect, but it can help diagnose Business Manager owned Pages when `/me/accounts` returns zero.</span>
                </div>
              </div>

              <div className="button-row">
                <button type="submit" className="primary-button">
                  Save Facebook Settings
                </button>
                <button
                  type="submit"
                  formAction="/api/facebook/connect"
                  formMethod="post"
                  className="secondary-button"
                  disabled={hasBlockingSetupIssue}
                >
                  {connection?.pageId ? "Reconnect Facebook" : "Connect Facebook"}
                </button>
                <a
                  href={hasBlockingSetupIssue ? undefined : "/api/facebook/debug"}
                  className="secondary-button"
                  aria-disabled={hasBlockingSetupIssue}
                  style={hasBlockingSetupIssue ? { pointerEvents: "none", opacity: 0.6 } : undefined}
                >
                  Run Facebook Diagnostics
                </a>
              </div>
            </form>

            {hasBlockingSetupIssue ? (
              <p className="error-text">
                Facebook setup is incomplete: {config.missingConfig.join(", ")}. Add those values before starting OAuth.
              </p>
            ) : null}
            {publicUrlMismatch ? (
              <p className="warning-text">
                The detected request origin ({detectedRequestOrigin}) does not match the configured public app URL ({config.publicAppUrl}).
                Facebook callbacks may redirect incorrectly until the proxy or app URL is aligned.
              </p>
            ) : null}
          </div>
        </section>

        <section className="settings-subcard">
          <div className="settings-subcard-head">
            <div>
              <strong>Advanced Facebook Debug</strong>
              <p>Run a server-side diagnostics pass against the current Meta app so we can compare token sources, raw sanitized Graph responses, and Business Manager fallbacks without exposing any tokens.</p>
            </div>
            <span className="settings-chip">Debug</span>
          </div>

          {debugResult ? (
            <FacebookDiagnosticsPanel
              debugResult={debugResult}
              manualResolvedPage={manualResolvedPage}
              timezone={timezone}
              onClearAction={clearFacebookDebugResultAction}
              onRunPageIdDiagnosticsAction={runFacebookPageIdDiagnosticsAction}
              onConnectResolvedPageAction={connectFacebookResolvedPageAction}
            />
          ) : (
            <div className="form-grid">
              <p className="hint">No Facebook diagnostics snapshot is stored yet. Use the Run Facebook Diagnostics button above to inspect token exchange, `/me`, `/me/accounts`, and Business Manager fallback responses.</p>
            </div>
          )}
        </section>

        <section className="settings-subcard">
          <div className="settings-subcard-head">
            <div>
              <strong>Runtime Diagnostics</strong>
              <p>These checks confirm the local environment is ready for Facebook OAuth, encrypted token storage, and publishing.</p>
            </div>
            <span className="settings-chip">Health</span>
          </div>

          <div className="settings-subcard-list">
            {config.checks.map((check) => (
              <div key={check.key} className="settings-nav-card">
                <div className="settings-nav-card-head">
                  <strong>{check.label}</strong>
                  <span className={`badge is-${check.configured ? "published" : "failed"}`.trim()}>
                    {check.configured ? "Configured" : "Missing"}
                  </span>
                </div>
                <p>{check.detail}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="settings-subcard">
          <div className="settings-subcard-head">
            <div>
              <strong>Connected Page Status</strong>
              <p>Only one Facebook Page is active in this phase so manual publishing and the worker share the same token.</p>
            </div>
            <span className={`badge is-${getStatusTone(connection?.status ?? null)}`.trim()}>
              {getStatusLabel(connection?.status ?? null)}
            </span>
          </div>

          <div className="form-grid">
            <div className="grid-2">
              <div className="field">
                <label>Connected account</label>
                <input value={connection?.accountName || "No Facebook account connected yet"} readOnly />
              </div>

              <div className="field">
                <label>Connected Page</label>
                <input value={connection?.pageName || "No Facebook Page selected"} readOnly />
              </div>

              <div className="field">
                <label>Page ID</label>
                <input value={connection?.pageId || "Not connected"} readOnly />
              </div>

              <div className="field">
                <label>Granted scopes</label>
                <input value={connection?.scopes.join(", ") || "Not connected"} readOnly />
              </div>

              <div className="field">
                <label>Missing required scopes</label>
                <input value={missingScopes.length > 0 ? missingScopes.join(", ") : "None"} readOnly />
              </div>

              <div className="field">
                <label>Token expiry</label>
                <input
                  value={
                    connection?.tokenExpiresAt
                      ? formatDateTimeForTimezone(connection.tokenExpiresAt, timezone)
                      : "No token expiry reported"
                  }
                  readOnly
                />
              </div>

              <div className="field">
                <label>Last connection test</label>
                <input
                  value={
                    connection?.lastTestedAt
                      ? formatDateTimeForTimezone(connection.lastTestedAt, timezone)
                      : "Not tested yet"
                  }
                  readOnly
                />
              </div>

              <div className="field">
                <label>Last successful token test</label>
                <input
                  value={
                    connection?.lastSuccessfulTestAt
                      ? formatDateTimeForTimezone(connection.lastSuccessfulTestAt, timezone)
                      : "No successful test recorded yet"
                  }
                  readOnly
                />
              </div>

              <div className="field">
                <label>Last failed token test</label>
                <input
                  value={
                    connection?.lastFailedTestAt
                      ? formatDateTimeForTimezone(connection.lastFailedTestAt, timezone)
                      : "No failed test recorded"
                  }
                  readOnly
                />
              </div>

              <div className="field">
                <label>Linked Instagram status</label>
                <input value={instagramFoundation.status} readOnly />
              </div>

              <div className="field">
                <label>Linked Instagram account</label>
                <input
                  value={
                    instagramFoundation.username
                      ? `@${instagramFoundation.username}${instagramFoundation.accountId ? ` (${instagramFoundation.accountId})` : ""}`
                      : "No linked Instagram account detected"
                  }
                  readOnly
                />
              </div>
            </div>

            {pageUrl ? (
              <p className="hint">
                Connected Page link:{" "}
                <a href={pageUrl} target="_blank" rel="noreferrer">
                  {pageUrl}
                </a>
              </p>
            ) : null}

            <p className={instagramFoundation.status === "READY" ? "success-text" : "hint"}>
              {instagramFoundation.message}
            </p>

            {connection?.lastError ? <p className="error-text">{connection.lastError}</p> : null}
            {needsReconnect ? (
              <p className="warning-text">
                Facebook needs to be reconnected before posting again. Use Reconnect Facebook below and complete the Meta OAuth flow.
              </p>
            ) : null}
            {connection?.status === ConnectedAccountStatus.ERROR || missingScopes.length > 0 ? (
              <p className="warning-text">
                Reconnect this Facebook Page if the token is invalid, the app changed mode, or required scopes are
                missing.
              </p>
            ) : null}

            <div className="button-row">
              <form action={testFacebookConnectionAction}>
                <button
                  type="submit"
                  className="secondary-button"
                  disabled={!hasConnectedPage || hasBlockingSetupIssue}
                >
                  Test Connection
                </button>
              </form>

              <form action="/api/facebook/connect" method="post">
                <input type="hidden" name="mode" value={hasConnectedPage ? "reconnect" : "connect"} />
                <input type="hidden" name="returnTo" value="/dashboard/settings/channels/facebook/advanced" />
                <button type="submit" className="primary-button" disabled={hasBlockingSetupIssue}>
                  {needsReconnect ? "Reconnect Facebook" : "Reconnect"}
                </button>
              </form>

              <form action={disconnectFacebookAction}>
                <button type="submit" className="danger-button" disabled={!connection}>
                  Disconnect
                </button>
              </form>
            </div>
          </div>
        </section>

        <section className="settings-subcard">
          <div className="settings-subcard-head">
            <div>
              <strong>Troubleshooting</strong>
              <p>If Facebook login succeeds but no Page comes back, the account is authorized but Meta still is not returning a manageable Page.</p>
            </div>
            <span className="settings-chip">Help</span>
          </div>

          <div className="settings-subcard-list">
            <div className="settings-nav-card">
              <div className="settings-nav-card-head">
                <strong>Check the Facebook account</strong>
              </div>
              <p>Make sure the exact Facebook account you used in OAuth can open the target Facebook Page and has Page access inside Meta Business Suite.</p>
            </div>

            <div className="settings-nav-card">
              <div className="settings-nav-card-head">
                <strong>Check Meta app mode</strong>
              </div>
              <p>If the Meta app is still in Development mode, this Facebook account must be added to the Meta app as an admin, developer, or tester.</p>
            </div>

            <div className="settings-nav-card">
              <div className="settings-nav-card-head">
                <strong>Approve every requested permission</strong>
              </div>
              <p>During Connect Facebook, approve all requested Page permissions. The callback now records the actually granted scopes, not just the requested ones.</p>
            </div>

            <div className="settings-nav-card">
              <div className="settings-nav-card-head">
                <strong>Reconnect after changing access</strong>
              </div>
              <p>If you add Page access or change app mode, disconnect and reconnect Facebook so the app gets a fresh user token and a fresh Page list.</p>
            </div>
          </div>
        </section>

        {pendingSelection ? (
          <section className="settings-subcard">
            <div className="settings-subcard-head">
              <div>
                <strong>Select Facebook Page</strong>
                <p>Meta returned multiple Pages for {pendingSelection.accountName}. Choose the one this app should publish to.</p>
              </div>
              <span className="settings-chip">{pendingSelection.pages.length} pages</span>
            </div>

            <div className="settings-subcard-list">
              {pendingSelection.pages.map((page) => (
                <form key={page.id} action={selectFacebookPageAction} className="settings-nav-card">
                  <input type="hidden" name="pageId" value={page.id} />
                  <div className="settings-nav-card-head">
                    <strong>{page.name}</strong>
                    <button type="submit" className="secondary-button">
                      Use This Page
                    </button>
                  </div>
                  <p>
                    Page ID: {page.id}
                    {page.tasks?.length ? ` | Tasks: ${page.tasks.join(", ")}` : ""}
                  </p>
                </form>
              ))}
            </div>

            <div className="button-row">
              <form action={clearFacebookPendingSelectionAction}>
                <button type="submit" className="ghost-link-button">
                  Clear Pending Selection
                </button>
              </form>
            </div>
          </section>
        ) : null}
      </section>
    </section>
  );
}
