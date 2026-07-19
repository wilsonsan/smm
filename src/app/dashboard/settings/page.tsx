import Link from "next/link";
import { AdminUserRole } from "@prisma/client";
import { isProduction } from "@/lib/env";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { isMetaInstagramEnabled } from "@/lib/meta-instagram-capability";

const SETTINGS_SECTIONS = [
  {
    eyebrow: "General",
    title: "App Basics",
    description: "The core settings this install uses every day.",
    items: [
      {
        href: "/dashboard/settings/site",
        title: "Site Settings",
        description: "Name, favicon, public app URL, upload folder, and timezone.",
      },
      {
        href: "/dashboard/settings/operations",
        title: "System Status",
        description: "Worker health, publish activity, and connection checks.",
      },
      ...(isProduction
        ? []
        : [
            {
              href: "/dashboard/settings/developer",
              title: "Developer",
              description: "Temporary composer overrides for local testing.",
            },
          ]),
    ],
  },
  {
    eyebrow: "Posts",
    title: "Composer Defaults",
    description: "The post-writing shortcuts your team actually uses.",
    items: [
      {
        href: "/dashboard/settings/insert-content",
        title: "Insert Content",
        description: "Signature, phone, email, and website buttons for the caption editor.",
      },
      {
        href: "/dashboard/settings/hashtags",
        title: "Hashtags",
        description: "Reusable hashtag groups for quick adding in the composer.",
      },
    ],
  },
  {
    eyebrow: "Channels",
    title: "Social Connections",
    description: "Connect the platforms the app publishes to.",
    items: [
      {
        href: "/dashboard/settings/channels/facebook",
        title: "Facebook",
        description: "Facebook Page connection, publishing access, and quick health checks.",
      },
      ...(isMetaInstagramEnabled()
        ? [
            {
              href: "/dashboard/settings/channels/instagram",
              title: "Instagram",
              description: "Instagram readiness, reconnect, and quick testing.",
            },
          ]
        : []),
      {
        href: "/dashboard/settings/channels/google",
        title: "Google",
        description: "Google OAuth, Business Profile connection, and preview identity.",
      },
    ],
  },
  {
    eyebrow: "Access & Recovery",
    title: "Users And Cleanup",
    description: "Manage who can sign in and handle intentional cleanup.",
    items: [
      {
        href: "/dashboard/settings/users",
        title: "Users",
        description: "Create, edit, and remove team accounts.",
      },
      {
        href: "/dashboard/settings/deletion",
        title: "Deletion",
        description: "Clear the gallery library after storage resets or broken rebuilds.",
      },
    ],
  },
];

export default async function SettingsPage() {
  const adminUser = await requireAuthenticatedUser();
  const visibleSections =
    adminUser.role === AdminUserRole.ADMIN
      ? SETTINGS_SECTIONS
      : SETTINGS_SECTIONS.filter((section) => section.title === "Composer Defaults");

  return (
    <section className="section-stack">
      <header className="page-header">
        <div>
          <h2>Settings</h2>
          <p>
            {adminUser.role === AdminUserRole.ADMIN
              ? "Pick the area you want to update."
              : "Update the composer defaults you use while creating posts."}
          </p>
        </div>
      </header>

      <div className="settings-layout-grid">
        {visibleSections.map((section) => (
          <section key={section.title} className="panel settings-section-card">
            <div className="settings-section-head">
              <div>
                <span className="settings-eyebrow">{section.eyebrow}</span>
                <h3>{section.title}</h3>
                <p>{section.description}</p>
              </div>
            </div>

            <div className="settings-subcard-list">
              {section.items.map((item) => (
                <Link key={item.href} href={item.href} className="settings-nav-card">
                  <div className="settings-nav-card-head">
                    <strong>{item.title}</strong>
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
