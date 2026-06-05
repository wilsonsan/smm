import { headers } from "next/headers";
import Link from "next/link";
import { ConnectedAccountStatus } from "@prisma/client";
import {
  clearFacebookDebugResultAction,
  clearFacebookPendingSelectionAction,
  disconnectFacebookAction,
  saveFacebookSettingsAction,
  selectFacebookPageAction,
  testFacebookConnectionAction,
} from "@/app/dashboard/settings/channels/facebook/actions";
import {
  getFacebookConfiguration,
  getFacebookConnectionRecord,
  getFacebookOauthDebugResult,
  getPendingFacebookPageSelection,
} from "@/lib/facebook";
import { formatDateTimeForTimezone, getResolvedAppTimezone } from "@/lib/time";

type FacebookSettingsPageProps = {
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

  if (status === ConnectedAccountStatus.ERROR) {
    return "ERROR";
  }

  return "DISCONNECTED";
}

export default async function FacebookChannelSettingsPage({ searchParams }: FacebookSettingsPageProps) {
  const resolvedSearchParams = await searchParams;
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
  const hasBlockingSetupIssue = config.missingConfig.length > 0;
  const missingScopes = config.requiredScopes.filter((scope) => !connection?.scopes.includes(scope));
  const publicUrlMismatch =
    Boolean(detectedRequestOrigin) &&
    normalizeOrigin(detectedRequestOrigin) !== normalizeOrigin(config.publicAppUrl);

  return (
    <section className="section-stack">
      <header className="page-header">
        <div>
          <h2>Facebook</h2>
          <p>Connect a Facebook Page, verify the connection, and use it for manual or scheduled publishing.</p>
        </div>
        <Link href="/dashboard/settings" className="secondary-button">
          Back To Settings
        </Link>
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
            <h3>Facebook Connection Settings</h3>
            <p>Meta app configuration stays self-hosted, and Page access tokens are encrypted before they touch storage.</p>
          </div>
          <span className="settings-count">{connection?.pageName ? "Connected" : "Ready to connect"}</span>
        </div>

        <section className="settings-subcard">
          <div className="settings-subcard-head">
            <div>
              <strong>App & Redirect Setup</strong>
              <p>Use this exact redirect URI in the Meta app configuration, and keep the app secret only in environment variables.</p>
            </div>
            <span className="settings-chip">OAuth</span>
          </div>

          <div className="form-grid">
            <form action={saveFacebookSettingsAction} className="form-grid">
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
                  <label>Facebook App Secret</label>
                  <input value={config.missingConfig.includes("FACEBOOK_APP_SECRET") ? "Not configured" : "Configured via environment"} readOnly />
                  <span className="hint">The app secret never gets stored in the database.</span>
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
              </div>

              <div className="button-row">
                <button type="submit" className="primary-button">
                  Save Facebook Settings
                </button>
                <a
                  href={hasBlockingSetupIssue ? undefined : "/api/facebook/connect"}
                  className="secondary-button"
                  aria-disabled={hasBlockingSetupIssue}
                  style={hasBlockingSetupIssue ? { pointerEvents: "none", opacity: 0.6 } : undefined}
                >
                  Connect Facebook
                </a>
                <a
                  href={hasBlockingSetupIssue ? undefined : "/api/facebook/debug"}
                  className="secondary-button"
                  aria-disabled={hasBlockingSetupIssue}
                  style={hasBlockingSetupIssue ? { pointerEvents: "none", opacity: 0.6 } : undefined}
                >
                  OAuth Debug
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
              <strong>OAuth Debug</strong>
              <p>Run a temporary Facebook OAuth debug pass and inspect the sanitized `/me`, `/me/permissions`, and `/me/accounts` results.</p>
            </div>
            <span className="settings-chip">Debug</span>
          </div>

          {debugResult ? (
            <div className="form-grid">
              <div className="grid-2">
                <div className="field">
                  <label>Debug account name</label>
                  <input value={debugResult.profile.name} readOnly />
                </div>

                <div className="field">
                  <label>Debug account id</label>
                  <input value={debugResult.profile.id} readOnly />
                </div>

                <div className="field">
                  <label>Granted scopes</label>
                  <input value={debugResult.grantedScopes.join(", ") || "None returned"} readOnly />
                </div>

                <div className="field">
                  <label>Token expiry</label>
                  <input
                    value={
                      debugResult.tokenExpiresAt
                        ? formatDateTimeForTimezone(debugResult.tokenExpiresAt, timezone)
                        : "No token expiry reported"
                    }
                    readOnly
                  />
                </div>

                <div className="field">
                  <label>Accounts source</label>
                  <input
                    value={
                      debugResult.diagnostics.accountsSource === "short_lived"
                        ? "Short-lived user token fallback"
                        : "Long-lived user token"
                    }
                    readOnly
                  />
                </div>

                <div className="field">
                  <label>Account diagnostics</label>
                  <input
                    value={`raw: ${debugResult.diagnostics.rawAccountsCount} | raw with token: ${debugResult.diagnostics.rawAccountsWithPageAccessTokenCount} | hydrated: ${debugResult.diagnostics.hydratedPageAccessTokenCount}`}
                    readOnly
                  />
                </div>
              </div>

              {debugResult.emptyAccountsMessage ? <p className="warning-text">{debugResult.emptyAccountsMessage}</p> : null}
              {debugResult.diagnostics.usedShortLivedFallback ? (
                <p className="warning-text">
                  The long-lived token did not fully resolve page accounts, so the app also checked the short-lived
                  OAuth token during this debug pass.
                </p>
              ) : null}

              <div className="settings-subcard-list">
                <div className="settings-nav-card">
                  <div className="settings-nav-card-head">
                    <strong>/me?fields=id,name</strong>
                  </div>
                  <p>
                    id: {debugResult.profile.id}
                    {" | "}
                    name: {debugResult.profile.name}
                  </p>
                </div>

                <div className="settings-nav-card">
                  <div className="settings-nav-card-head">
                    <strong>/me/permissions</strong>
                  </div>
                  <p>
                    {debugResult.permissions.length > 0
                      ? debugResult.permissions.map((entry) => `${entry.permission}: ${entry.status}`).join(", ")
                      : "No permission records returned."}
                  </p>
                </div>

                <div className="settings-nav-card">
                  <div className="settings-nav-card-head">
                    <strong>/me/accounts?fields=id,name,tasks,access_token</strong>
                  </div>
                  {debugResult.accounts.length > 0 ? (
                    <div className="settings-subcard-list">
                      {debugResult.accounts.map((account) => (
                        <div key={account.id} className="settings-nav-card">
                          <div className="settings-nav-card-head">
                            <strong>{account.name}</strong>
                          </div>
                          <p>Page ID: {account.id}</p>
                          <p>Tasks: {account.tasks.length > 0 ? account.tasks.join(", ") : "None returned"}</p>
                          <p>hasPageAccessToken: {account.hasPageAccessToken ? "true" : "false"}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p>OAuth succeeded, but this Meta app could not see any manageable Pages.</p>
                  )}
                </div>
              </div>

              <div className="button-row">
                <form action={clearFacebookDebugResultAction}>
                  <button type="submit" className="ghost-link-button">
                    Clear Debug Results
                  </button>
                </form>
              </div>
            </div>
          ) : (
            <div className="form-grid">
              <p className="hint">No OAuth debug results are stored yet. Use the OAuth Debug button above to inspect what Meta returns for this account.</p>
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
            <span className={`badge is-${connection?.status === ConnectedAccountStatus.ERROR ? "failed" : connection?.status === ConnectedAccountStatus.CONNECTED ? "published" : "draft"}`.trim()}>
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
            </div>

            {pageUrl ? (
              <p className="hint">
                Connected Page link:{" "}
                <a href={pageUrl} target="_blank" rel="noreferrer">
                  {pageUrl}
                </a>
              </p>
            ) : null}

            {connection?.lastError ? <p className="error-text">{connection.lastError}</p> : null}
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
                  disabled={!connection?.pageId || hasBlockingSetupIssue}
                >
                  Test Connection
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
