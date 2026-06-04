import { requireAdminUser } from "@/lib/auth/session";
import { logoutAction } from "@/app/dashboard/actions";
import Link from "next/link";
import { DashboardSidebarNav } from "@/components/dashboard-sidebar-nav";
import { RoleBadge } from "@/components/role-badge";
import { getBrandingSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const adminUser = await requireAdminUser();
  const branding = await getBrandingSettings();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="sidebar-brand-mark" aria-hidden="true">
            SM
          </div>
          <div>
            <h1>{branding.siteName}</h1>
          </div>
        </div>

        <DashboardSidebarNav />

        <div className="sidebar-footer">
          <div className="panel sidebar-user-card">
            <div className="panel-body">
              <div className="sidebar-user-head">
                <strong>{adminUser.username}</strong>
                <RoleBadge role={adminUser.role} />
              </div>
              <Link href="/dashboard/account" className="sidebar-account-link">
                Account Settings
              </Link>
            </div>
          </div>

          <form action={logoutAction}>
            <button type="submit" className="ghost-button" style={{ width: "100%" }}>
              Log Out
            </button>
          </form>
        </div>
      </aside>

      <main className="main">{children}</main>
    </div>
  );
}
