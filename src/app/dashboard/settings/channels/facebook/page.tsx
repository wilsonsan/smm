import Link from "next/link";
import { ConnectedAccountStatus } from "@prisma/client";
import { requireAdminUser } from "@/lib/auth/session";
import {
  disconnectFacebookAction,
  saveFacebookSettingsAction,
  selectFacebookPageAction,
  testFacebookConnectionAction,
} from "@/app/dashboard/settings/channels/facebook/actions";
import {
  getFacebookConfiguration,
  getFacebookConnectionRecord,
  getPendingFacebookPageSelection,
  refreshFacebookConnectionHealth,
} from "@/lib/facebook";
import { getInstagramFoundationStateFromConnection } from "@/lib/instagram";
import { formatDateTimeForTimezone, getResolvedAppTimezone } from "@/lib/time";

type FacebookSettingsPageProps = {
  searchParams?: Promise<{
    status?: string;
    message?: string;
  }>;
};

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

export default async function FacebookChannelSettingsPage({ searchParams }: FacebookSettingsPageProps) {
  await requireAdminUser({ redirectTo: "/dashboard/settings", targetType: "FacebookSettingsPage" });
  const resolvedSearchParams = await searchParams;
  await refreshFacebookConnectionHealth({
    createNotification: true,
    source: "settings_page_load",
  }).catch(() => null);

  const [config, connection, pendingSelection, timezone] = await Promise.all([
    getFacebookConfiguration(),
    getFacebookConnectionRecord(),
    getPendingFacebookPageSelection(),
    getResolvedAppTimezone(),
  ]);

  const instagramFoundation = getInstagramFoundationStateFromConnection(connection);
  const hasBlockingSetupIssue = config.missingConfig.length > 0;
  const currentAppId = config.appId || "";
  const currentPageLookupValue = config.preferredPageLookupValue || "nctilepro";
  const hasConnectedPage = Boolean(connection?.pageId);
  const needsReconnect =
    connection?.status === ConnectedAccountStatus.NEEDS_RECONNECT ||
    connection?.status === ConnectedAccountStatus.EXPIRED ||
    connection?.status === ConnectedAccountStatus.INVALID ||
    connection?.status === ConnectedAccountStatus.MISSING_SCOPES ||
    connection?.status === ConnectedAccountStatus.ERROR;
  return (
    <section className="section-stack">
      <header className="page-header">
        <div>
          <h2>Connect Meta Accounts</h2>
          <p>Connect the business account authorized to manage the NC Tile Pros Facebook Page and its linked Instagram professional account.</p>
        </div>
        <div className="button-row">
          <Link href="/dashboard/settings/channels/facebook/advanced" className="secondary-button">
            Advanced
          </Link>
          <Link href="/dashboard/settings" className="ghost-link-button">
            Back To Settings
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
            <h3>Meta Connection</h3>
            <p>Only the essentials are shown here.</p>
          </div>
          <span className={`badge is-${getStatusTone(connection?.status ?? null)}`.trim()}>
            {getStatusLabel(connection?.status ?? null)}
          </span>
        </div>

        <section className="settings-subcard">
          <div className="settings-subcard-head">
            <div>
              <strong>Basic Setup</strong>
              <p>Save your Meta app details first, then connect the page.</p>
            </div>
            <span className="settings-chip">Required</span>
          </div>

          <div className="form-grid">
            <form action={saveFacebookSettingsAction} className="form-grid">
              <input type="hidden" name="returnTo" value="/dashboard/settings/channels/facebook" />
              <input type="hidden" name="facebookPageLookupValue" value={currentPageLookupValue} />
              <div className="grid-2">
                <div className="field">
                  <label htmlFor="facebookAppId">App ID</label>
                  <input
                    id="facebookAppId"
                    name="facebookAppId"
                    defaultValue={currentAppId}
                    placeholder="123456789012345"
                    inputMode="numeric"
                  />
                  <span className="hint">Shared Meta app ID used for Facebook and Instagram. Numbers only.</span>
                </div>

                <div className="field">
                  <label htmlFor="facebookAppSecret">App Secret</label>
                  <input
                    id="facebookAppSecret"
                    name="facebookAppSecret"
                    type="password"
                    autoComplete="new-password"
                    placeholder={config.appSecretConfigured ? "Saved securely. Enter only to replace it." : "Enter Meta app secret"}
                  />
                  <span className="hint">
                    {config.appSecretConfigured
                      ? `A secret is already saved from ${config.appSecretSource === "settings" ? "Settings" : "the environment"}. Leave this blank to keep it.`
                      : "Stored encrypted in app settings once saved."}
                  </span>
                </div>

                <div className="field">
                  <label>Callback URL</label>
                  <input value={config.redirectUri} readOnly />
                  <span className="hint">Use this exact callback URL in the Meta app.</span>
                </div>
              </div>
              <div className="button-row">
                <button type="submit" className="primary-button">
                  Save
                </button>
              </div>
            </form>

            <div className="button-row">
                <form action="/api/facebook/connect" method="post">
                  <input type="hidden" name="mode" value={connection?.pageId ? "reconnect" : "connect"} />
                  <input type="hidden" name="returnTo" value="/dashboard/settings/channels/facebook" />
                  <button type="submit" className="secondary-button" disabled={hasBlockingSetupIssue}>
                    {needsReconnect ? "Reconnect Facebook" : hasConnectedPage ? "Reconnect" : "Connect"}
                  </button>
                </form>
                <form action={testFacebookConnectionAction}>
                  <button type="submit" className="secondary-button" disabled={!hasConnectedPage || hasBlockingSetupIssue}>
                    Test Connection
                  </button>
                </form>
                <Link href="/dashboard/settings/channels/facebook/advanced" className="secondary-button">
                  Open Advanced
                </Link>
                <form action={disconnectFacebookAction}>
                  <button type="submit" className="danger-button" disabled={!connection}>
                    Disconnect
                  </button>
                </form>
            </div>

            {hasBlockingSetupIssue ? (
              <p className="error-text">
                Facebook setup is incomplete: {config.missingConfig.join(", ")}. Save the missing values here before starting OAuth.
              </p>
            ) : null}
            <p className={config.tokenEncryptionKeyConfigured ? "hint" : "warning-text"}>
              {config.tokenEncryptionKeyConfigured
                ? config.tokenEncryptionKeySource === "legacy_settings"
                  ? "Encrypted token storage works, but the legacy key should still be moved into the environment."
                  : "Encrypted token storage is ready."
                : "Set TOKEN_ENCRYPTION_KEY in the environment before storing connected-account secrets."}
            </p>
            <p className="hint">Connect uses the currently saved App ID and App Secret. If you changed either field, click Save before connecting.</p>
            <p className="hint">
              Users sign into this app separately. An administrator connects Meta once, and internal creators publish through the connected business destinations without connecting personal accounts.
            </p>
          </div>
        </section>

        <section className="settings-subcard">
          <div className="settings-subcard-head">
            <div>
              <strong>Connection Summary</strong>
              <p>The current page connection at a glance.</p>
            </div>
            <span className="settings-chip">Overview</span>
          </div>

          <div className="form-grid">
            <div className="grid-2">
              <div className="field">
                <label>Connected Page</label>
                <input value={connection?.pageName || "No Facebook Page selected"} readOnly />
              </div>

              <div className="field">
                <label>Page ID</label>
                <input value={connection?.pageId || "Not connected"} readOnly />
              </div>

              <div className="field">
                <label>Last checked</label>
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
                <label>Linked Instagram</label>
                <input
                  value={
                    instagramFoundation.username
                      ? `@${instagramFoundation.username}${instagramFoundation.accountId ? ` (${instagramFoundation.accountId})` : ""}`
                      : instagramFoundation.status
                  }
                  readOnly
                />
              </div>
            </div>

            {connection?.lastError ? <p className="error-text">{connection.lastError}</p> : null}
            <p className={instagramFoundation.status === "READY" ? "success-text" : "hint"}>
              {instagramFoundation.message}
            </p>
            <p className="hint">Instagram content publishing is supported. Instagram comment management and first-comment publishing are not enabled.</p>
          </div>
        </section>

        {pendingSelection ? (
          <section className="settings-subcard">
            <div className="settings-subcard-head">
              <div>
                <strong>Select Facebook Page</strong>
                <p>Meta returned multiple Pages. Choose the Page this app should use.</p>
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
          </section>
        ) : null}
      </section>
    </section>
  );
}
