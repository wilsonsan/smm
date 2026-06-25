import Link from "next/link";
import { HashtagSettingsPanel } from "@/components/hashtag-settings-panel";
import { getHashtagSettings } from "@/lib/settings";

export default async function HashtagSettingsPage() {
  const hashtagSettings = await getHashtagSettings();

  return (
    <section className="section-stack">
      <header className="page-header">
        <div>
          <h2>Hashtags</h2>
          <p>Manage reusable hashtag groups and platform defaults without mixing them into your template variable editor.</p>
        </div>
        <Link href="/dashboard/settings" className="secondary-button">
          Back To Settings
        </Link>
      </header>

      <HashtagSettingsPanel initialValues={hashtagSettings} />
    </section>
  );
}
