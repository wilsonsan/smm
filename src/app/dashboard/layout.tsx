import Link from "next/link";
import { requireAdminUser } from "@/lib/auth/session";
import { logoutAction } from "@/app/dashboard/actions";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const adminUser = await requireAdminUser();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <h1>SMM Scheduler</h1>
        <p>Private social media operations workspace for drafting, scheduling, uploads, and future publishing.</p>

        <nav className="sidebar-nav" aria-label="Dashboard navigation">
          <Link className="sidebar-link" href="/dashboard">
            Dashboard
          </Link>
          <Link className="sidebar-link" href="/dashboard/posts">
            Posts
          </Link>
          <Link className="sidebar-link" href="/dashboard/posts/new">
            New Post
          </Link>
          <Link className="sidebar-link" href="/dashboard/calendar">
            Calendar
          </Link>
          <Link className="sidebar-link" href="/dashboard/settings">
            Settings
          </Link>
        </nav>

        <div className="sidebar-footer">
          <div className="panel-body panel">
            <strong>{adminUser.displayName || adminUser.email}</strong>
            <p className="muted">Admin-only session</p>
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
