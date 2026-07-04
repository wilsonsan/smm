import Link from "next/link";
import Image from "next/image";
import { ConnectedAccountStatus } from "@prisma/client";
import { requireAdminUser } from "@/lib/auth/session";
import {
  clearGooglePendingSelectionAction,
  disconnectGoogleAction,
  saveGooglePreviewIdentityAction,
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
import { getGooglePreviewSettings } from "@/lib/settings";
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
  await requireAdminUser({ redirectTo: "/dashboard/settings", targetType: "GoogleSettingsPage" });
  const resolvedSearchParams = await searchParams;
  await refreshGoogleConnectionHealth({
    createNotification: true,
    source: "settings_page_load",
  }).catch(() => null);

  const [config, connection, diagnostics, pendingSelection, timezone, googlePreviewSettings] = await Promise.all([
    getGoogleConfiguration(),
    getGoogleConnectionRecord(),
    getGoogleDiagnostics({ refreshHealth: false }),
    getPendingGoogleLocationSelection(),
    getResolvedAppTimezone(),
    getGooglePreviewSettings(),
  ]);

  const hasBlockingSetupIssue = config.missingConfig.length > 0;
  const hasConnectedLocation = Boolean(connection?.locationId);
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
          <h2>Google</h2>
          <p>Save your Google app details, connect the location, and set the preview identity here.</p>
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
              <p>Save the Google OAuth app details first, then connect the Business Profile.</p>
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
                  <label>Callback URL</label>
                  <input value={config.redirectUri} readOnly />
                  <span className="hint">Use this exact callback URL in the Google OAuth client.</span>
                </div>
              </div>

              <div className="button-row">
                <button type="submit" className="primary-button">
                  Save
                </button>
              </div>
            </form>

            <div className="button-row">
              <form action="/api/google/connect" method="post">
                <input type="hidden" name="mode" value={connection?.locationId ? "reconnect" : "connect"} />
                <input type="hidden" name="returnTo" value="/dashboard/settings/channels/google" />
                <button type="submit" className="secondary-button" disabled={hasBlockingSetupIssue}>
                  {needsReconnect ? "Reconnect Google" : hasConnectedLocation ? "Reconnect" : "Connect"}
                </button>
              </form>
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
            <p className={config.tokenEncryptionKeyConfigured ? "hint" : "warning-text"}>
              {config.tokenEncryptionKeyConfigured
                ? config.tokenEncryptionKeySource === "legacy_settings"
                  ? "Encrypted token storage works, but the legacy key should still be moved into the environment."
                  : "Encrypted token storage is ready."
                : "Set TOKEN_ENCRYPTION_KEY in the environment before storing connected-account secrets."}
            </p>
            <p className="hint">Connect uses the currently saved Client ID and Client Secret. If you changed either field, click Save before connecting.</p>
          </div>
        </section>

        <section className="settings-subcard">
          <div className="settings-subcard-head">
            <div>
              <strong>Connection Summary</strong>
              <p>The current Google account and Business Profile link.</p>
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
                <input value={connection?.locationName || "No Google Business Profile location selected"} readOnly />
              </div>

              <div className="field">
                <label>Location ID</label>
                <input value={connection?.locationId || "Not connected"} readOnly />
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
            </div>

            {connection?.lastError ? <p className="error-text">{connection.lastError}</p> : null}
            <p className="hint">{diagnostics.lastTest.message}</p>
          </div>
        </section>

        <section className="settings-subcard">
          <div className="settings-subcard-head">
            <div>
              <strong>Preview Identity</strong>
              <p>Choose the name and image shown in the Google live preview.</p>
            </div>
            <span className="settings-chip">Composer</span>
          </div>

          <form action={saveGooglePreviewIdentityAction} className="form-grid">
            <input type="hidden" name="returnTo" value="/dashboard/settings/channels/google" />
            <div className="grid-2">
              <div className="field">
                <label htmlFor="googlePreviewDisplayName">Business display name</label>
                <input
                  id="googlePreviewDisplayName"
                  name="displayName"
                  defaultValue={googlePreviewSettings.displayName}
                  placeholder={connection?.locationName || "NC Tile Pros"}
                />
                <span className="hint">Leave blank to fall back to the connected Business Profile name.</span>
              </div>

              <div className="field">
                <label htmlFor="googlePreviewImage">Profile image</label>
                <input
                  id="googlePreviewImage"
                  name="previewImage"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                />
                <span className="hint">Uploads here stay outside the gallery and are only used for the Google live preview.</span>
              </div>
            </div>

            {googlePreviewSettings.imagePath ? (
              <div className="field">
                <label>Current preview image</label>
                <div className="settings-preview-identity">
                  <Image
                    src="/api/admin/settings-images/google-preview"
                    alt="Google preview identity"
                    className="settings-preview-avatar"
                    width={96}
                    height={96}
                  />
                  <label className="checkbox-row">
                    <input type="checkbox" name="clearImage" />
                    <span>Remove custom image and fall back to the connected profile.</span>
                  </label>
                </div>
              </div>
            ) : null}

            <div className="button-row">
              <button type="submit" className="primary-button">
                Save Preview Identity
              </button>
            </div>
          </form>
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
