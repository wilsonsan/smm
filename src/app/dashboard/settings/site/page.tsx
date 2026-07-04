import Link from "next/link";
import { SettingsForm } from "@/components/settings-form";
import { requireAdminUser } from "@/lib/auth/session";
import { getAppSettings } from "@/lib/settings";

export default async function SiteSettingsPage() {
  await requireAdminUser({ redirectTo: "/dashboard/settings", targetType: "SiteSettingsPage" });
  const settings = await getAppSettings();

  return (
    <section className="section-stack">
      <header className="page-header">
        <div>
          <h2>Site Settings</h2>
          <p>Manage the name, app URL, upload folder, and timezone for this install.</p>
        </div>
        <Link href="/dashboard/settings" className="secondary-button">
          Back To Settings
        </Link>
      </header>

      <SettingsForm initialValues={settings} />
    </section>
  );
}
