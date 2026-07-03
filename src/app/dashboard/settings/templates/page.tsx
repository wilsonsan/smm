import Link from "next/link";
import { InsertContentSettingsPanel } from "@/components/insert-content-settings-panel";
import { TemplateVariableSettingsPanel } from "@/components/template-variable-settings-panel";
import { getInsertContentTemplateSettings, getTemplateVariableSettings } from "@/lib/settings";

export default async function TemplateSettingsPage() {
  const [templateVariables, insertContentTemplates] = await Promise.all([
    getTemplateVariableSettings(),
    getInsertContentTemplateSettings(),
  ]);

  return (
    <section className="section-stack">
      <header className="page-header">
        <div>
          <h2>Templates</h2>
          <p>Manage reusable post template variables and the Insert Content buttons used while writing captions.</p>
        </div>
        <Link href="/dashboard/settings" className="secondary-button">
          Back To Settings
        </Link>
      </header>

      <InsertContentSettingsPanel initialValues={insertContentTemplates} />
      <TemplateVariableSettingsPanel initialValues={templateVariables} />
    </section>
  );
}
