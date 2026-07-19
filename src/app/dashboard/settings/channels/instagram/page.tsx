import Link from "next/link";
import { requireAdminUser } from "@/lib/auth/session";
import { META_INSTAGRAM_UNAVAILABLE_MESSAGE } from "@/lib/meta-instagram-capability";

type InstagramSettingsPageProps = {
  searchParams?: Promise<{
    status?: string;
    message?: string;
  }>;
};

export default async function InstagramChannelSettingsPage({ searchParams }: InstagramSettingsPageProps) {
  await requireAdminUser({ redirectTo: "/dashboard/settings", targetType: "InstagramSettingsPage" });
  const resolvedSearchParams = await searchParams;

  return (
    <section className="section-stack">
      <header className="page-header">
        <div>
          <h2>Instagram</h2>
          <p>{META_INSTAGRAM_UNAVAILABLE_MESSAGE}</p>
        </div>
        <div className="button-row">
          <Link href="/dashboard/settings/channels/facebook" className="secondary-button">
            Open Facebook
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
            <h3>Instagram Publishing</h3>
            <p>Instagram publishing is disabled in production until Meta approves the required Instagram permissions.</p>
          </div>
          <span className="badge is-draft">UNAVAILABLE</span>
        </div>

        <section className="settings-subcard">
          <div className="settings-subcard-head">
            <div>
              <strong>Current Status</strong>
              <p>The app continues to preserve historical Instagram records, but it will not create or publish new Instagram work right now.</p>
            </div>
            <span className="settings-chip">Read only</span>
          </div>

          <div className="form-grid">
            <p className="warning-text">{META_INSTAGRAM_UNAVAILABLE_MESSAGE}</p>
            <p className="hint">
              Facebook Page publishing still works from the shared Meta connection. Creators and administrators should remove Instagram from new posts until Meta approval is in place and this capability is intentionally re-enabled.
            </p>
          </div>
        </section>
      </section>
    </section>
  );
}
