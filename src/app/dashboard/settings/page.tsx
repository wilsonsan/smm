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
      {
        href: "/dashboard/settings/operations",
        title: "System Status",
        description: "Worker health, publish activity, connected Facebook Page, and operational checks.",
      },
      {
        href: "/dashboard/settings/developer",
        title: "Developer",
        description: "Toggle dev-only platform overrides so the New Post composer can be tested without live channel logins.",
      },
    ],
  },
  {
    eyebrow: "Posts",
    title: "Templates & Composer Helpers",
    description: "Manage reusable caption tools, variable outcomes, and hashtag groups used while writing posts.",
    items: [
      {
        href: "/dashboard/settings/templates",
        title: "Templates",
        description: "View, add, remove, and edit post template variables with a cleaner variable library and editor.",
      },
      {
        href: "/dashboard/settings/hashtags",
        title: "Hashtags",
        description: "Manage hashtag groups and Facebook hashtag defaults on a dedicated page.",
      },
    ],
  },
  {
    eyebrow: "Channel Settings",
    title: "Social Connections & Publishing",
    description: "Manage the live Facebook, Instagram, and Google Business Profile publishing connections.",
    items: [
      {
        href: "/dashboard/settings/channels/facebook",
        title: "Facebook",
        description: "Basic Meta credentials, connect/reconnect, and quick Facebook connection checks.",
      },
      {
        href: "/dashboard/settings/channels/instagram",
        title: "Instagram",
        description: "Simple Instagram readiness view with Meta connect/test actions and an advanced diagnostics page.",
      },
      {
        href: "/dashboard/settings/channels/google",
        title: "Google",
        description: "Google OAuth credentials, Business Profile connection controls, and quick location health checks.",
      },
    ],
  },
  {
    eyebrow: "Deletion & Recovery",
    title: "Danger Zone",
    description: "Use this area for intentional cleanup when saved media records no longer match what is on disk.",
    items: [
      {
        href: "/dashboard/settings/deletion",
        title: "Deletion",
        description: "Clear the gallery library and remove broken or missing media records after rebuilds or storage resets.",
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
        <Link href="/dashboard/settings/users" className="secondary-button">
          Users
        </Link>
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
