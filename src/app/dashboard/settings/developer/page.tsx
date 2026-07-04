import Link from "next/link";
import { notFound } from "next/navigation";
import { DeveloperSettingsPanel } from "@/components/developer-settings-panel";
import { requireAdminUser } from "@/lib/auth/session";
import { isProduction } from "@/lib/env";
import { getDeveloperSettings } from "@/lib/settings";

export default async function DeveloperSettingsPage() {
  await requireAdminUser({ redirectTo: "/dashboard/settings", targetType: "DeveloperSettingsPage" });
  if (isProduction) {
    notFound();
  }

  const settings = await getDeveloperSettings();

  return (
    <section className="section-stack">
      <header className="page-header">
        <div>
          <h2>Developer</h2>
          <p>Use dev-only platform overrides to unlock Facebook, Instagram, and Google in the composer without live channel logins while testing New Post features.</p>
        </div>
        <Link href="/dashboard/settings" className="secondary-button">
          Back To Settings
        </Link>
      </header>

      <DeveloperSettingsPanel initialValues={settings} />
    </section>
  );
}
