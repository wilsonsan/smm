import Link from "next/link";

const SETTINGS_SECTIONS = [
  {
    eyebrow: "System Settings",
    title: "Brand, Hosting & Storage",
    description: "Core site identity, public URL, favicon, uploads directory, and timezone behavior.",
    items: [
      {
        href: "/dashboard/settings/site",
        title: "Site Settings",
        description: "Site name, favicon, public URL, upload directory, and app timezone.",
      },
    ],
  },
  {
    eyebrow: "Channel Settings",
    title: "Social Connections & Publishing",
    description: "Future channel connection points for Facebook first, with Instagram and Google kept ready.",
    items: [
      {
        href: "/dashboard/settings/channels/facebook",
        title: "Facebook",
        description: "Environment-backed app credentials and future publishing connection settings.",
      },
      {
        href: "/dashboard/settings/channels/instagram",
        title: "Instagram",
        description: "Placeholder page for the future Instagram connection and publishing setup.",
      },
      {
        href: "/dashboard/settings/channels/google",
        title: "Google",
        description: "Placeholder page for future Google Business Profile connection settings.",
      },
    ],
  },
];

export default function SettingsPage() {
  return (
    <section className="section-stack">
      <header className="page-header">
        <div>
          <h2>Settings</h2>
          <p>Open a settings area below to manage system basics or future publishing channel configuration.</p>
        </div>
      </header>

      <div className="settings-layout-grid">
        {SETTINGS_SECTIONS.map((section) => (
          <section key={section.title} className="panel settings-section-card">
            <div className="settings-section-head">
              <div>
                <span className="settings-eyebrow">{section.eyebrow}</span>
                <h3>{section.title}</h3>
                <p>{section.description}</p>
              </div>
              <span className="settings-count">{section.items.length} items</span>
            </div>

            <div className="settings-subcard-list">
              {section.items.map((item) => (
                <Link key={item.href} href={item.href} className="settings-nav-card">
                  <div className="settings-nav-card-head">
                    <strong>{item.title}</strong>
                    <span className="settings-nav-open">Open</span>
                  </div>
                  <p>{item.description}</p>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}
