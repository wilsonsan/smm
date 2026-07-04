import Link from "next/link";
import { saveFacebookSettingsAction } from "@/app/dashboard/settings/channels/facebook/actions";
import { testInstagramConnectionAction } from "@/app/dashboard/settings/channels/instagram/actions";
import { requireAdminUser } from "@/lib/auth/session";
import { getFacebookConfiguration } from "@/lib/facebook";
import { getInstagramDiagnostics } from "@/lib/instagram";
import { formatDateTimeForTimezone, getResolvedAppTimezone } from "@/lib/time";

type InstagramSettingsPageProps = {
  searchParams?: Promise<{
    status?: string;
    message?: string;
  }>;
};

function getStatusTone(status: Awaited<ReturnType<typeof getInstagramDiagnostics>>["foundation"]["status"]) {
  if (status === "READY") {
    return "published";
  }

  if (status === "LOOKUP_ERROR") {
    return "failed";
  }

  return "draft";
}

export default async function InstagramChannelSettingsPage({ searchParams }: InstagramSettingsPageProps) {
  await requireAdminUser({ redirectTo: "/dashboard/settings", targetType: "InstagramSettingsPage" });
  const resolvedSearchParams = await searchParams;
  const [diagnostics, config, timezone] = await Promise.all([
    getInstagramDiagnostics({ refreshHealth: true }),
    getFacebookConfiguration(),
    getResolvedAppTimezone(),
  ]);
  const instagramFoundation = diagnostics.foundation;
  const isReady = instagramFoundation.status === "READY";
  const hasBlockingSetupIssue = config.missingConfig.length > 0;
  return (
    <section className="section-stack">
      <header className="page-header">
        <div>
          <h2>Instagram</h2>
          <p>Check Instagram readiness and reconnect Meta when needed.</p>
        </div>
        <div className="button-row">
          <Link href="/dashboard/settings/channels/instagram/advanced" className="secondary-button">
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
            <h3>Instagram Connection</h3>
            <p>Instagram shares the same Meta app as Facebook.</p>
          </div>
          <span className={`badge is-${getStatusTone(instagramFoundation.status)}`.trim()}>
            {instagramFoundation.status}
          </span>
        </div>

        <section className="settings-subcard">
          <div className="settings-subcard-head">
            <div>
              <strong>Basic Setup</strong>
              <p>Save the shared Meta app details here before connecting.</p>
            </div>
            <span className="settings-chip">Required</span>
          </div>

          <div className="form-grid">
            <form action={saveFacebookSettingsAction} className="form-grid">
              <input type="hidden" name="returnTo" value="/dashboard/settings/channels/instagram" />
              <input type="hidden" name="facebookPageLookupValue" value={config.preferredPageLookupValue || "nctilepro"} />
              <div className="grid-2">
                <div className="field">
                  <label htmlFor="instagramMetaAppId">App ID</label>
                  <input
                    id="instagramMetaAppId"
                    name="facebookAppId"
                    defaultValue={config.appId}
                    placeholder="123456789012345"
                    inputMode="numeric"
                  />
                  <span className="hint">Shared Meta app ID. Numbers only.</span>
                </div>

                <div className="field">
                  <label htmlFor="instagramMetaAppSecret">App Secret</label>
                  <input
                    id="instagramMetaAppSecret"
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
                  <label>Callback URL</label>
                  <input value={config.redirectUri} readOnly />
                  <span className="hint">Use this same callback URL in the Meta app for the shared OAuth flow.</span>
                </div>
              </div>

              <div className="button-row">
                <button type="submit" className="primary-button">
                  Save
                </button>
              </div>
            </form>

            {config.missingConfig.length > 0 ? (
              <p className="error-text">
                Meta setup is incomplete: {config.missingConfig.join(", ")}. Save the missing values before connecting Instagram.
              </p>
            ) : null}
            <p className={config.tokenEncryptionKeyConfigured ? "hint" : "warning-text"}>
              {config.tokenEncryptionKeyConfigured
                ? config.tokenEncryptionKeySource === "legacy_settings"
                  ? "Encrypted token storage works, but the legacy key should still be moved into the environment."
                  : "Encrypted token storage is ready."
                : "Set TOKEN_ENCRYPTION_KEY in the environment before storing connected-account secrets."}
            </p>
            <p className="hint">Connect Meta uses the currently saved App ID and App Secret. If you just changed either field, click Save first.</p>
          </div>
        </section>

        <section className="settings-subcard">
          <div className="settings-subcard-head">
            <div>
              <strong>Connection Summary</strong>
              <p>The current Instagram publishing readiness.</p>
            </div>
            <span className="settings-chip">Status</span>
          </div>

          <div className="form-grid">
            <div className="grid-2">
              <div className="field">
                <label>Connected Facebook Page</label>
                <input
                  value={
                    instagramFoundation.pageName
                      ? `${instagramFoundation.pageName}${instagramFoundation.pageId ? ` (${instagramFoundation.pageId})` : ""}`
                      : "No Facebook Page connected"
                  }
                  readOnly
                />
              </div>

              <div className="field">
                <label>Instagram account</label>
                <input
                  value={
                    instagramFoundation.username
                      ? `@${instagramFoundation.username}${instagramFoundation.accountId ? ` (${instagramFoundation.accountId})` : ""}`
                      : "Not detected"
                  }
                  readOnly
                />
              </div>

              <div className="field">
                <label>Last checked</label>
                <input
                  value={
                    instagramFoundation.lastCheckedAt
                      ? formatDateTimeForTimezone(new Date(instagramFoundation.lastCheckedAt), timezone)
                      : "Not checked yet"
                  }
                  readOnly
                />
              </div>

              <div className="field">
                <label>Missing permissions</label>
                <input value={diagnostics.missingScopes.length > 0 ? diagnostics.missingScopes.join(", ") : "None"} readOnly />
              </div>
            </div>

            <p className={isReady ? "success-text" : "hint"}>{instagramFoundation.message}</p>
            {!isReady ? (
              <p className="warning-text">
                If Instagram is missing, make sure the connected Facebook Page has a linked Instagram Business or Creator account in Meta Business Suite, then reconnect Meta.
              </p>
            ) : null}

            <div className="button-row">
              <form action="/api/facebook/connect" method="post">
                <input type="hidden" name="mode" value="reconnect" />
                <input type="hidden" name="returnTo" value="/dashboard/settings/channels/instagram" />
                <button type="submit" className="primary-button" disabled={hasBlockingSetupIssue}>
                  {isReady ? "Reconnect Meta" : "Connect Meta"}
                </button>
              </form>
              <form action={testInstagramConnectionAction}>
                <button type="submit" className="secondary-button" disabled={hasBlockingSetupIssue}>
                  Test Connection
                </button>
              </form>
              <Link href="/dashboard/settings/channels/instagram/advanced" className="secondary-button">
                Open Advanced
              </Link>
            </div>
          </div>
        </section>
      </section>
    </section>
  );
}
