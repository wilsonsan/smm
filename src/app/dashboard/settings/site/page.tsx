import Link from "next/link";
import { SettingsForm } from "@/components/settings-form";
import { getAppSettings } from "@/lib/settings";

export default async function SiteSettingsPage() {
  const settings = await getAppSettings();

  return (
    <section className="section-stack">
      <header className="page-header">
        <div>
          <h2>Site Settings</h2>
          <p>Manage the app name, favicon, public URL, uploads directory, and timezone used across the scheduler.</p>
        </div>
        <Link href="/dashboard/settings" className="secondary-button">
          Back To Settings
        </Link>
      </header>

      <SettingsForm initialValues={settings} />
    </section>
  );
}
