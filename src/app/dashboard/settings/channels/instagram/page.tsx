import Link from "next/link";

export default function InstagramChannelSettingsPage() {
  return (
    <section className="section-stack">
      <header className="page-header">
        <div>
          <h2>Instagram</h2>
          <p>Placeholder area for the future Instagram connection, media rules, and publishing settings.</p>
        </div>
        <Link href="/dashboard/settings" className="secondary-button">
          Back To Settings
        </Link>
      </header>

      <section className="panel settings-section-card">
        <div className="settings-section-head">
          <div>
            <span className="settings-eyebrow">Channel Settings</span>
            <h3>Instagram Settings</h3>
            <p>This page is intentionally parked for a later phase when Instagram activation moves from schema-only to UI.</p>
          </div>
          <span className="settings-count">Future</span>
        </div>

        <section className="settings-subcard">
          <div className="settings-subcard-head">
            <div>
              <strong>Coming Later</strong>
              <p>We will add account linking, media rules, and publishing controls here after Facebook is complete.</p>
            </div>
            <span className="settings-chip">Placeholder</span>
          </div>
        </section>
      </section>
    </section>
  );
}
