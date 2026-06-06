import { requireAdminUser } from "@/lib/auth/session";
import { logoutAction, openNotificationAction } from "@/app/dashboard/actions";
import Link from "next/link";
import { DashboardSidebarNav } from "@/components/dashboard-sidebar-nav";
import { ArrowRightIcon, LogoSparkIcon, UserIcon } from "@/components/dashboard-icons";
import { DashboardNotificationMenu } from "@/components/dashboard-notification-menu";
import { RoleBadge } from "@/components/role-badge";
import { getBrandingSettings } from "@/lib/settings";
import { getNotificationCenterSnapshot } from "@/lib/notifications";
import { formatDateTimeForTimezone, getResolvedAppTimezone } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const adminUser = await requireAdminUser();
  const [branding, notificationCenter, timezone] = await Promise.all([
    getBrandingSettings(),
    getNotificationCenterSnapshot(),
    getResolvedAppTimezone(),
  ]);
  const avatarLabel = (adminUser.displayName || adminUser.username || "A")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("");

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="sidebar-brand-mark" aria-hidden="true">
            <LogoSparkIcon />
          </div>
          <div>
            <h1>{branding.siteName}</h1>
            <p>Publishing command center</p>
          </div>
        </div>

        <DashboardSidebarNav />

        <div className="sidebar-footer">
          <Link href="/dashboard/account" className="panel sidebar-user-card">
            <div className="panel-body">
              <div className="sidebar-user-head">
                <div className="sidebar-user-avatar" aria-hidden="true">
                  {avatarLabel || <UserIcon />}
                </div>
                <div className="sidebar-user-copy">
                  <strong>{adminUser.displayName || adminUser.username}</strong>
                  <span>@{adminUser.username}</span>
                </div>
                <RoleBadge role={adminUser.role} />
              </div>
              <span className="sidebar-account-link">
                Account Settings
                <ArrowRightIcon />
              </span>
            </div>
          </Link>

          <form action={logoutAction}>
            <button type="submit" className="ghost-button sidebar-logout-button" style={{ width: "100%" }}>
              Log Out
            </button>
          </form>
        </div>
      </aside>

      <main className="main">
        <div className="dashboard-topbar">
          <div className="dashboard-topbar-spacer" />
          <DashboardNotificationMenu
            unreadCount={notificationCenter.unreadCount}
            notifications={notificationCenter.unreadNotifications.map((notification) => ({
              id: notification.id,
              title: notification.title,
              message: notification.message,
              actionUrl: notification.actionUrl,
              provider: notification.provider,
              severity: notification.severity,
              createdLabel: formatDateTimeForTimezone(notification.createdAt, timezone),
            }))}
            openNotificationAction={openNotificationAction}
          />
        </div>
        {children}
      </main>
    </div>
  );
}
