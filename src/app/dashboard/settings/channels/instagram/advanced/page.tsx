import Link from "next/link";
import { getInstagramDiagnostics } from "@/lib/instagram";
import { formatDateTimeForTimezone, getResolvedAppTimezone } from "@/lib/time";

function getStatusTone(status: Awaited<ReturnType<typeof getInstagramDiagnostics>>["foundation"]["status"]) {
  if (status === "READY") {
    return "published";
  }

  if (status === "LOOKUP_ERROR") {
    return "failed";
  }

  return "draft";
}

export default async function InstagramAdvancedChannelSettingsPage() {
  const [diagnostics, timezone] = await Promise.all([
    getInstagramDiagnostics({ refreshHealth: true }),
    getResolvedAppTimezone(),
  ]);
  const instagramFoundation = diagnostics.foundation;

  return (
    <section className="section-stack">
      <header className="page-header">
        <div>
          <h2>Instagram Advanced</h2>
          <p>Detailed Instagram diagnostics, permissions, and publish-readiness details from the existing Meta connection.</p>
        </div>
        <div className="button-row">
          <Link href="/dashboard/settings/channels/instagram" className="secondary-button">
            Back To Instagram
          </Link>
          <Link href="/dashboard/settings" className="ghost-link-button">
            Settings Home
          </Link>
        </div>
      </header>

      <section className="panel settings-section-card">
        <div className="settings-section-head">
          <div>
            <span className="settings-eyebrow">Channel Settings</span>
            <h3>Instagram Diagnostics</h3>
            <p>This page confirms the linked Instagram account, checks the required Meta permissions, and summarizes image-only publish readiness.</p>
          </div>
          <span className={`badge is-${getStatusTone(instagramFoundation.status)}`.trim()}>
            {instagramFoundation.status}
          </span>
        </div>

        <section className="settings-subcard">
          <div className="settings-subcard-head">
            <div>
              <strong>Linked Instagram Account</strong>
              <p>Resolved from the currently connected Facebook Page token.</p>
            </div>
            <span className="settings-chip">Diagnostics</span>
          </div>

          <div className="form-grid">
            <div className="grid-2">
              <div className="field">
                <label>Facebook Page</label>
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
                <label>Instagram status</label>
                <input value={instagramFoundation.status} readOnly />
              </div>

              <div className="field">
                <label>Instagram account ID</label>
                <input value={instagramFoundation.accountId || "Not detected"} readOnly />
              </div>

              <div className="field">
                <label>Instagram username</label>
                <input value={instagramFoundation.username ? `@${instagramFoundation.username}` : "Not detected"} readOnly />
              </div>

              <div className="field">
                <label>Lookup source</label>
                <input value={instagramFoundation.source || "No linked Instagram field returned"} readOnly />
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
            </div>

            {instagramFoundation.errorMessage ? (
              <p className="warning-text">{instagramFoundation.errorMessage}</p>
            ) : null}

            <p className={instagramFoundation.status === "READY" ? "success-text" : "hint"}>
              {instagramFoundation.message}
            </p>
          </div>
        </section>

        <section className="settings-subcard">
          <div className="settings-subcard-head">
            <div>
              <strong>Permissions & Last Test</strong>
              <p>These are the scopes and the latest Instagram account test result derived from the current Meta session.</p>
            </div>
            <span className="settings-chip">Meta</span>
          </div>

          <div className="form-grid">
            <div className="grid-2">
              <div className="field">
                <label>Required permissions</label>
                <input value={diagnostics.requiredScopes.join(", ")} readOnly />
              </div>

              <div className="field">
                <label>Missing permissions</label>
                <input value={diagnostics.missingScopes.length > 0 ? diagnostics.missingScopes.join(", ") : "None"} readOnly />
              </div>

              <div className="field">
                <label>Last test result</label>
                <input value={diagnostics.lastTestResult.success ? "Success" : "Needs attention"} readOnly />
              </div>

              <div className="field">
                <label>Last tested at</label>
                <input
                  value={
                    diagnostics.lastTestResult.testedAt
                      ? formatDateTimeForTimezone(new Date(diagnostics.lastTestResult.testedAt), timezone)
                      : "Not tested yet"
                  }
                  readOnly
                />
              </div>

              <div className="field">
                <label>Instagram account type</label>
                <input value={diagnostics.lastTestResult.accountDetails?.accountType || "Not returned"} readOnly />
              </div>

              <div className="field">
                <label>Instagram media count</label>
                <input
                  value={
                    typeof diagnostics.lastTestResult.accountDetails?.mediaCount === "number"
                      ? String(diagnostics.lastTestResult.accountDetails.mediaCount)
                      : "Not returned"
                  }
                  readOnly
                />
              </div>
            </div>

            <p className={diagnostics.lastTestResult.success ? "success-text" : "warning-text"}>
              {diagnostics.lastTestResult.message}
            </p>
          </div>
        </section>

        <section className="settings-subcard">
          <div className="settings-subcard-head">
            <div>
              <strong>Posting Readiness</strong>
              <p>Instagram Post Now currently supports image-only publishing through the linked Meta account.</p>
            </div>
            <span className="settings-chip">Phase 8</span>
          </div>

          <div className="settings-subcard-list">
            <div className="settings-nav-card">
              <div className="settings-nav-card-head">
                <strong>Image-only publishing</strong>
              </div>
              <p>Instagram posts require at least one image. Text-only Instagram posting remains blocked.</p>
            </div>

            <div className="settings-nav-card">
              <div className="settings-nav-card-head">
                <strong>Temporary Instagram optimizer</strong>
              </div>
              <p>Each publish generates a temporary 1080px JPEG from the stored original, uses it for the Meta publish flow, then cleans it up.</p>
            </div>

            <div className="settings-nav-card">
              <div className="settings-nav-card-head">
                <strong>If Instagram is missing</strong>
              </div>
              <p>Link an Instagram Business or Creator account to the connected Facebook Page in Meta Business Suite, then reconnect Meta so the app can detect it again.</p>
            </div>
          </div>
        </section>
      </section>
    </section>
  );
}
