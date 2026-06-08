import Link from "next/link";
import { requireAdminUser, isAdminUserRole } from "@/lib/auth/session";
import {
  ANALYTICS_PLATFORM_FILTERS,
  ANALYTICS_STATUS_FILTERS,
  getPublishHistory,
  getSocialPlatformLabel,
  getUserAnalyticsRows,
  parseAnalyticsFilters,
  recordAnalyticsAuditEvent,
} from "@/lib/analytics";
import { AUDIT_ACTIONS } from "@/lib/audit";
import { formatDateTimeForTimezone, getResolvedAppTimezone } from "@/lib/time";
import { PlatformChipList, PlatformLinkButtons } from "@/components/platform-chip-list";

type PublishHistoryPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function PublishHistoryPage({ searchParams }: PublishHistoryPageProps) {
  const adminUser = await requireAdminUser({
    redirectTo: "/dashboard",
    targetType: "PublishHistoryPage",
  });
  const resolvedSearchParams = (await searchParams) ?? {};
  const timezone = await getResolvedAppTimezone();
  const filters = parseAnalyticsFilters(resolvedSearchParams);

  await recordAnalyticsAuditEvent({
    actorAdminUserId: adminUser.id,
    action: AUDIT_ACTIONS.REPORT_GENERATED,
    targetType: "PublishHistoryPage",
    metadata: {
      reportType: "publish_history",
      filters,
    },
  }).catch(() => undefined);

  const [historyRows, users] = await Promise.all([
    getPublishHistory(filters, timezone),
    getUserAnalyticsRows(),
  ]);
  const canExport = isAdminUserRole(adminUser.role);
  const exportQuery = new URLSearchParams();
  exportQuery.set("kind", "history");
  if (filters.platform !== "ALL") {
    exportQuery.set("platform", filters.platform);
  }
  if (filters.userId) {
    exportQuery.set("userId", filters.userId);
  }
  if (filters.status !== "ALL") {
    exportQuery.set("status", filters.status);
  }
  if (filters.from) {
    exportQuery.set("from", filters.from);
  }
  if (filters.to) {
    exportQuery.set("to", filters.to);
  }

  return (
    <section className="section-stack analytics-page">
      <header className="page-header">
        <div>
          <h2>Publish History</h2>
          <p>Historical record of scheduled, published, failed, and draft content.</p>
        </div>
        <div className="analytics-header-actions">
          <Link href="/dashboard/analytics" className="secondary-button">
            Back To Analytics
          </Link>
          {canExport ? (
            <a href={`/dashboard/analytics/export?${exportQuery.toString()}`} className="secondary-button">
              Export CSV
            </a>
          ) : null}
        </div>
      </header>

      <section className="panel dashboard-module-card">
        <div className="panel-body">
          <form method="get" className="analytics-filter-grid">
            <label className="field">
              <span>Platform</span>
              <select name="platform" defaultValue={filters.platform}>
                {ANALYTICS_PLATFORM_FILTERS.map((platform) => (
                  <option key={platform} value={platform}>
                    {platform === "ALL" ? "All platforms" : getSocialPlatformLabel(platform)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>User</span>
              <select name="userId" defaultValue={filters.userId}>
                <option value="">All users</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.displayName}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Status</span>
              <select name="status" defaultValue={filters.status}>
                {ANALYTICS_STATUS_FILTERS.map((status) => (
                  <option key={status} value={status}>
                    {status === "ALL" ? "All statuses" : status === "PARTIAL_FAILED" ? "Partial Failed" : status}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>From</span>
              <input type="date" name="from" defaultValue={filters.from} />
            </label>
            <label className="field">
              <span>To</span>
              <input type="date" name="to" defaultValue={filters.to} />
            </label>
            <div className="analytics-filter-actions">
              <button type="submit" className="primary-button">
                Apply Filters
              </button>
              <Link href="/dashboard/analytics/history" className="secondary-button">
                Reset
              </Link>
            </div>
          </form>
        </div>
      </section>

      <section className="panel dashboard-module-card">
        <div className="panel-body">
          <div className="table-wrap dashboard-table-wrap">
            <table className="dashboard-modern-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Platform(s)</th>
                  <th>Creator</th>
                  <th>Status</th>
                  <th>Description Preview</th>
                  <th>Published Links</th>
                </tr>
              </thead>
              <tbody>
                {historyRows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="muted">
                      No posts match the current filters.
                    </td>
                  </tr>
                ) : (
                  historyRows.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <Link href={`/dashboard/posts/${row.id}`}>
                          {row.date ? formatDateTimeForTimezone(row.date, timezone) : "No time"}
                        </Link>
                      </td>
                      <td>
                        <PlatformChipList platforms={row.platforms} />
                      </td>
                      <td>{row.creatorName}</td>
                      <td>
                        <span className={`badge is-${row.statusTone}`.trim()}>{row.statusLabel}</span>
                      </td>
                      <td>{row.descriptionPreview}</td>
                      <td>
                        <PlatformLinkButtons links={row.publishedLinks} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </section>
  );
}
