import Link from "next/link";
import { TemplateVariableSettingsPanel } from "@/components/template-variable-settings-panel";
import { getTemplateVariableSettings } from "@/lib/settings";

export default async function TemplateSettingsPage() {
  const templateVariables = await getTemplateVariableSettings();

  return (
    <section className="section-stack">
      <header className="page-header">
        <div>
          <h2>Templates</h2>
          <p>Manage reusable post template variables and keep their names, token formats, and outcomes easy to maintain.</p>
        </div>
        <Link href="/dashboard/settings" className="secondary-button">
          Back To Settings
        </Link>
      </header>

      <TemplateVariableSettingsPanel initialValues={templateVariables} />
    </section>
  );
}
