import Link from "next/link";
import { testGoogleConnectionAdvancedAction } from "@/app/dashboard/settings/channels/google/actions";
import { requireAdminUser } from "@/lib/auth/session";
import { getGoogleDiagnostics } from "@/lib/google";
import { formatDateTimeForTimezone, getResolvedAppTimezone } from "@/lib/time";

type GoogleAdvancedSettingsPageProps = {
  searchParams?: Promise<{
    status?: string;
    message?: string;
  }>;
};

export default async function GoogleAdvancedSettingsPage({ searchParams }: GoogleAdvancedSettingsPageProps) {
  await requireAdminUser({ redirectTo: "/dashboard/settings", targetType: "GoogleAdvancedSettingsPage" });
  const resolvedSearchParams = await searchParams;
  const [diagnostics, timezone] = await Promise.all([
    getGoogleDiagnostics({ refreshHealth: true }),
    getResolvedAppTimezone(),
  ]);

  return (
    <section className="section-stack">
      <header className="page-header">
        <div>
          <h2>Google Advanced</h2>
          <p>Diagnostics, token state, and the latest Google Business Profile publish details.</p>
        </div>
        <div className="button-row">
          <Link href="/dashboard/settings/channels/google" className="secondary-button">
            Back To Google
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
            <span className="settings-eyebrow">Advanced Diagnostics</span>
            <h3>Google Business Profile</h3>
            <p>Use this page when you need to confirm token health, connected location details, or the latest publish behavior.</p>
          </div>
          <form action={testGoogleConnectionAdvancedAction}>
            <button type="submit" className="secondary-button">
              Run Diagnostics
            </button>
          </form>
        </div>

        <div className="settings-subcard-list">
          <section className="settings-subcard">
            <div className="settings-subcard-head">
              <div>
                <strong>Connection</strong>
                <p>Connected account and selected location.</p>
              </div>
            </div>
            <div className="grid-2">
              <div className="field">
                <label>Connected account</label>
                <input value={diagnostics.location.accountEmail || diagnostics.location.accountName || "Not connected"} readOnly />
              </div>
              <div className="field">
                <label>Location</label>
                <input value={diagnostics.location.name || "No location selected"} readOnly />
              </div>
              <div className="field">
                <label>Location ID</label>
                <input value={diagnostics.location.id || "Not connected"} readOnly />
              </div>
              <div className="field">
                <label>Status</label>
                <input value={diagnostics.connection?.status || "DISCONNECTED"} readOnly />
              </div>
            </div>
          </section>

          <section className="settings-subcard">
            <div className="settings-subcard-head">
              <div>
                <strong>Token State</strong>
                <p>Refresh token, expiration, and scope health.</p>
              </div>
            </div>
            <div className="grid-2">
              <div className="field">
                <label>Refresh token stored</label>
                <input value={diagnostics.tokenStatus.hasRefreshToken ? "Yes" : "No"} readOnly />
              </div>
              <div className="field">
                <label>Token expiration</label>
                <input
                  value={
                    diagnostics.tokenStatus.expiresAt
                      ? formatDateTimeForTimezone(new Date(diagnostics.tokenStatus.expiresAt), timezone)
                      : "Unknown"
                  }
                  readOnly
                />
              </div>
              <div className="field">
                <label>Missing permissions</label>
                <input
                  value={
                    diagnostics.tokenStatus.missingScopes.length > 0
                      ? diagnostics.tokenStatus.missingScopes.join(", ")
                      : "None"
                  }
                  readOnly
                />
              </div>
              <div className="field">
                <label>Last test</label>
                <input
                  value={
                    diagnostics.lastTest.testedAt
                      ? formatDateTimeForTimezone(new Date(diagnostics.lastTest.testedAt), timezone)
                      : "Not tested yet"
                  }
                  readOnly
                />
              </div>
            </div>
            <p className={diagnostics.lastTest.success ? "success-text" : "error-text"}>
              {diagnostics.lastTest.message}
            </p>
          </section>

          <section className="settings-subcard">
            <div className="settings-subcard-head">
              <div>
                <strong>Latest Publish</strong>
                <p>Most recent Google Business publish data stored on the connection.</p>
              </div>
            </div>
            <div className="grid-2">
              <div className="field">
                <label>Last publish</label>
                <input
                  value={
                    diagnostics.lastPublish.at
                      ? formatDateTimeForTimezone(new Date(diagnostics.lastPublish.at), timezone)
                      : "No Google publish yet"
                  }
                  readOnly
                />
              </div>
              <div className="field">
                <label>Last platform post ID</label>
                <input value={diagnostics.lastPublish.postId || "No Google post ID yet"} readOnly />
              </div>
            </div>
            {diagnostics.lastPublish.lastError ? (
              <p className="error-text">{diagnostics.lastPublish.lastError}</p>
            ) : (
              <p className="hint">No Google publish error is currently stored.</p>
            )}
          </section>
        </div>
      </section>
    </section>
  );
}
