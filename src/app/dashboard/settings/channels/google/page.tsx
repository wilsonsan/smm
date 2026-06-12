import Link from "next/link";
import { ConnectedAccountStatus } from "@prisma/client";
import {
  clearGooglePendingSelectionAction,
  disconnectGoogleAction,
  saveGoogleSettingsAction,
  selectGoogleLocationAction,
  testGoogleConnectionAction,
} from "@/app/dashboard/settings/channels/google/actions";
import {
  getGoogleConfiguration,
  getGoogleConnectionRecord,
  getGoogleDiagnostics,
  getPendingGoogleLocationSelection,
  refreshGoogleConnectionHealth,
} from "@/lib/google";
import { formatDateTimeForTimezone, getResolvedAppTimezone } from "@/lib/time";

type GoogleSettingsPageProps = {
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

export default async function GoogleChannelSettingsPage({ searchParams }: GoogleSettingsPageProps) {
  const resolvedSearchParams = await searchParams;
  await refreshGoogleConnectionHealth({
    createNotification: true,
    source: "settings_page_load",
  }).catch(() => null);

  const [config, connection, diagnostics, pendingSelection, timezone] = await Promise.all([
    getGoogleConfiguration(),
    getGoogleConnectionRecord(),
    getGoogleDiagnostics({ refreshHealth: false }),
    getPendingGoogleLocationSelection(),
    getResolvedAppTimezone(),
  ]);

  const hasBlockingSetupIssue = config.missingConfig.length > 0;
  const hasConnectedLocation = Boolean(connection?.locationId);
  const needsReconnect =
    connection?.status === ConnectedAccountStatus.NEEDS_RECONNECT ||
    connection?.status === ConnectedAccountStatus.EXPIRED ||
    connection?.status === ConnectedAccountStatus.INVALID ||
    connection?.status === ConnectedAccountStatus.MISSING_SCOPES ||
    connection?.status === ConnectedAccountStatus.ERROR;
  const connectHref =
    hasBlockingSetupIssue
      ? undefined
      : connection?.locationId
        ? "/api/google/connect?mode=reconnect"
        : "/api/google/connect";

  return (
    <section className="section-stack">
      <header className="page-header">
        <div>
          <h2>Google</h2>
          <p>Keep the main Google Business Profile settings simple here, and use the advanced page for deeper diagnostics and publishing detail.</p>
        </div>
        <div className="button-row">
          <Link href="/dashboard/settings/channels/google/advanced" className="secondary-button">
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
            <h3>Google Business Connection</h3>
            <p>Only the essentials live here: Google OAuth app credentials, the callback URL, and the core connection controls.</p>
          </div>
          <span className={`badge is-${getStatusTone(connection?.status ?? null)}`.trim()}>
            {getStatusLabel(connection?.status ?? null)}
          </span>
        </div>

        <section className="settings-subcard">
          <div className="settings-subcard-head">
            <div>
              <strong>Basic Setup</strong>
              <p>Save the Google OAuth credentials here first, then use Connect and Test Connection for the live Business Profile link.</p>
            </div>
            <span className="settings-chip">Required</span>
          </div>

          <div className="form-grid">
            <form action={saveGoogleSettingsAction} className="form-grid">
              <input type="hidden" name="returnTo" value="/dashboard/settings/channels/google" />
              <div className="grid-2">
                <div className="field">
                  <label htmlFor="googleClientId">Client ID</label>
                  <input
                    id="googleClientId"
                    name="googleClientId"
                    defaultValue={config.clientId}
                    placeholder="Google OAuth Client ID"
                  />
                  <span className="hint">Use the Google OAuth Web Client ID for this dev host.</span>
                </div>

                <div className="field">
                  <label htmlFor="googleClientSecret">Client Secret</label>
                  <input
                    id="googleClientSecret"
                    name="googleClientSecret"
                    type="password"
                    autoComplete="new-password"
                    placeholder={config.clientSecretConfigured ? "Saved securely. Enter only to replace it." : "Enter Google Client Secret"}
                  />
                  <span className="hint">
                    {config.clientSecretConfigured
                      ? `A secret is already saved from ${config.clientSecretSource === "settings" ? "Settings" : "the environment"}. Leave this blank to keep it.`
                      : "Stored encrypted in app settings once saved."}
                  </span>
                </div>

                <div className="field">
                  <label htmlFor="googleTokenEncryptionKey">Token Encryption Key</label>
                  <input
                    id="googleTokenEncryptionKey"
                    name="tokenEncryptionKey"
                    type="password"
                    autoComplete="new-password"
                    placeholder={
                      config.tokenEncryptionKeyConfigured
                        ? "Saved for app use. Enter only to replace it."
                        : "Enter token encryption key"
                    }
                  />
                  <span className="hint">
                    {config.tokenEncryptionKeyConfigured
                      ? `A key is already available from ${config.tokenEncryptionKeySource === "settings" ? "Settings" : "the environment"}. Leave this blank to keep it.`
                      : "This key encrypts saved Google and Meta tokens at rest."}
                  </span>
                </div>

                <div className="field">
                  <label>Callback URL</label>
                  <input value={config.redirectUri} readOnly />
                  <span className="hint">Use this exact callback URL in the Google OAuth client.</span>
                </div>

                <div className="field">
                  <label>Public app URL</label>
                  <input value={config.publicAppUrl} readOnly />
                </div>
              </div>

              <div className="button-row">
                <button type="submit" className="primary-button">
                  Save
                </button>
              </div>
            </form>

            <div className="button-row">
              <a
                href={connectHref}
                className="secondary-button"
                aria-disabled={hasBlockingSetupIssue}
                style={hasBlockingSetupIssue ? { pointerEvents: "none", opacity: 0.6 } : undefined}
              >
                {needsReconnect ? "Reconnect Google" : hasConnectedLocation ? "Reconnect" : "Connect"}
              </a>
              <form action={testGoogleConnectionAction}>
                <button type="submit" className="secondary-button" disabled={!hasConnectedLocation || hasBlockingSetupIssue}>
                  Test Connection
                </button>
              </form>
              <Link href="/dashboard/settings/channels/google/advanced" className="secondary-button">
                Open Advanced
              </Link>
              <form action={disconnectGoogleAction}>
                <button type="submit" className="danger-button" disabled={!connection}>
                  Disconnect
                </button>
              </form>
            </div>

            {hasBlockingSetupIssue ? (
              <p className="error-text">
                Google setup is incomplete: {config.missingConfig.join(", ")}. Save the missing values here before starting OAuth.
              </p>
            ) : null}
            <p className="hint">Connect uses the currently saved Client ID and Client Secret. If you changed either field, click Save before connecting.</p>
          </div>
        </section>

        <section className="settings-subcard">
          <div className="settings-subcard-head">
            <div>
              <strong>Connection Summary</strong>
              <p>Quick status for the active Google account and Business Profile location.</p>
            </div>
            <span className="settings-chip">Overview</span>
          </div>

          <div className="form-grid">
            <div className="grid-2">
              <div className="field">
                <label>Connected Google account</label>
                <input value={diagnostics.location.accountEmail || connection?.accountName || "No Google account connected yet"} readOnly />
              </div>

              <div className="field">
                <label>Connected Business Profile location</label>
                <input
                  value={
                    connection?.locationName
                      ? `${connection.locationName}${connection.locationId ? ` (${connection.locationId})` : ""}`
                      : "No Google Business Profile location selected"
                  }
                  readOnly
                />
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
                <label>Last tested result</label>
                <input value={diagnostics.lastTest.message} readOnly />
              </div>
            </div>

            {connection?.lastError ? <p className="error-text">{connection.lastError}</p> : null}
          </div>
        </section>

        {pendingSelection ? (
          <section className="settings-subcard">
            <div className="settings-subcard-head">
              <div>
                <strong>Select Google Business Profile Location</strong>
                <p>Google returned multiple locations. Choose the location this app should use.</p>
              </div>
              <span className="settings-chip">{pendingSelection.locations.length} locations</span>
            </div>

            <div className="settings-subcard-list">
              {pendingSelection.locations.map((location) => (
                <form key={location.locationResourceName} action={selectGoogleLocationAction} className="settings-nav-card">
                  <input type="hidden" name="locationName" value={location.locationResourceName} />
                  <div className="settings-nav-card-head">
                    <strong>{location.title}</strong>
                    <button type="submit" className="secondary-button">
                      Use This Location
                    </button>
                  </div>
                  <p>
                    Location ID: {location.locationId}
                    {location.storeCode ? ` | Store Code: ${location.storeCode}` : ""}
                  </p>
                </form>
              ))}
              <form action={clearGooglePendingSelectionAction}>
                <button type="submit" className="ghost-link-button">
                  Clear Selection
                </button>
              </form>
            </div>
          </section>
        ) : null}
      </section>
    </section>
  );
}
