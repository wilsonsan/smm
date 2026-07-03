import { requireAuthenticatedUser } from "@/lib/auth/session";
import { logoutAction, openNotificationAction } from "@/app/dashboard/actions";
import Link from "next/link";
import { DashboardSidebarNav } from "@/components/dashboard-sidebar-nav";
import { DashboardMobileNav } from "@/components/dashboard-mobile-nav";
import { ArrowRightIcon, LogoSparkIcon, UserIcon } from "@/components/dashboard-icons";
import { DashboardTopbar } from "@/components/dashboard-topbar";
import { getBrandingSettings } from "@/lib/settings";
import { getNotificationCenterSnapshot } from "@/lib/notifications";
import { formatDateTimeForTimezone, getResolvedAppTimezone } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const adminUser = await requireAuthenticatedUser();
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
          <div className="sidebar-brand-copy">
            <h1>{branding.siteName}</h1>
          </div>
        </div>

        <DashboardSidebarNav role={adminUser.role} />

        <div className="sidebar-footer">
          <Link href="/dashboard/account" className="panel sidebar-user-card">
            <div className="panel-body">
              <div className="sidebar-user-head">
                <div className="sidebar-user-avatar" aria-hidden="true">
                  {avatarLabel || <UserIcon />}
                </div>
                <div className="sidebar-user-copy">
                  <span>@{adminUser.username}</span>
                </div>
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
        <DashboardTopbar
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
        {children}
      </main>
      <DashboardMobileNav role={adminUser.role} />
    </div>
  );
}
