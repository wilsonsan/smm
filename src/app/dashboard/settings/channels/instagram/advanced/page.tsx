import Link from "next/link";
import { requireAdminUser } from "@/lib/auth/session";
import { META_INSTAGRAM_UNAVAILABLE_MESSAGE } from "@/lib/meta-instagram-capability";

export default async function InstagramAdvancedChannelSettingsPage() {
  await requireAdminUser({ redirectTo: "/dashboard/settings", targetType: "InstagramAdvancedSettingsPage" });

  return (
    <section className="section-stack">
      <header className="page-header">
        <div>
          <h2>Instagram Advanced</h2>
          <p>{META_INSTAGRAM_UNAVAILABLE_MESSAGE}</p>
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
            <p>Instagram publishing is intentionally disabled, so advanced diagnostics are also unavailable in the production app.</p>
          </div>
          <span className="badge is-draft">UNAVAILABLE</span>
        </div>

        <section className="settings-subcard">
          <div className="settings-subcard-head">
            <div>
              <strong>What remains available</strong>
              <p>Historical Instagram posts, audit trails, and publish attempts are still preserved for reporting and review.</p>
            </div>
            <span className="settings-chip">History kept</span>
          </div>

          <div className="form-grid">
            <p className="warning-text">{META_INSTAGRAM_UNAVAILABLE_MESSAGE}</p>
            <p className="hint">
              Re-enable this route only after Meta approves the required Instagram permissions and the server capability flag is intentionally turned back on.
            </p>
          </div>
        </section>
      </section>
    </section>
  );
}
