import Link from "next/link";
import { InsertContentSettingsPanel } from "@/components/insert-content-settings-panel";
import { getInsertContentTemplateSettings } from "@/lib/settings";

export default async function InsertContentSettingsPage() {
  const insertContentTemplates = await getInsertContentTemplateSettings();

  return (
    <section className="section-stack">
      <header className="page-header">
        <div>
          <h2>Insert Content</h2>
          <p>Save the quick-insert details your team drops into captions most often.</p>
        </div>
        <Link href="/dashboard/settings" className="secondary-button">
          Back To Settings
        </Link>
      </header>

      <InsertContentSettingsPanel initialValues={insertContentTemplates} />
    </section>
  );
}
