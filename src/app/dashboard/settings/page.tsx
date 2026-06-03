import { SettingsForm } from "@/components/settings-form";
import { env } from "@/lib/env";
import { getAppSettings } from "@/lib/settings";

export default async function SettingsPage() {
  const settings = await getAppSettings();

  return (
    <section className="section-stack">
      <header className="page-header">
        <div>
          <h2>Settings</h2>
          <p>Database-backed non-secret configuration now, environment-backed secrets until platform connections are added.</p>
        </div>
      </header>

      <SettingsForm
        initialValues={settings}
        envFlags={{
          facebookAppIdConfigured: Boolean(env.FACEBOOK_APP_ID),
          facebookAppSecretConfigured: Boolean(env.FACEBOOK_APP_SECRET),
        }}
      />
    </section>
  );
}

