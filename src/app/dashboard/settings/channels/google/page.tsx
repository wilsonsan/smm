import Link from "next/link";

export default function GoogleChannelSettingsPage() {
  return (
    <section className="section-stack">
      <header className="page-header">
        <div>
          <h2>Google</h2>
          <p>Placeholder area for future Google Business Profile connection and publishing settings.</p>
        </div>
        <Link href="/dashboard/settings" className="secondary-button">
          Back To Settings
        </Link>
      </header>

      <section className="panel settings-section-card">
        <div className="settings-section-head">
          <div>
            <span className="settings-eyebrow">Channel Settings</span>
            <h3>Google Settings</h3>
            <p>This page stays ready for a later phase when Google Business Profile moves beyond schema groundwork.</p>
          </div>
          <span className="settings-count">Future</span>
        </div>

        <section className="settings-subcard">
          <div className="settings-subcard-head">
            <div>
              <strong>Coming Later</strong>
              <p>Connection details, posting rules, and publish controls will live here once Google support starts.</p>
            </div>
            <span className="settings-chip">Placeholder</span>
          </div>
        </section>
      </section>
    </section>
  );
}
