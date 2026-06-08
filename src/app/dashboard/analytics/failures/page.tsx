import Link from "next/link";
import { requireAdminUser, isAdminUserRole } from "@/lib/auth/session";
import { getFailureAnalytics, getSocialPlatformLabel, recordAnalyticsAuditEvent } from "@/lib/analytics";
import { AUDIT_ACTIONS } from "@/lib/audit";
import { formatDateTimeForTimezone, getResolvedAppTimezone } from "@/lib/time";
import { FailureIcon } from "@/components/dashboard-icons";

function formatAttemptDuration(durationMs: number | null) {
  if (durationMs === null) {
    return "Still running";
  }

  if (durationMs < 1000) {
    return `${durationMs} ms`;
  }

  const seconds = durationMs / 1000;
  if (seconds < 60) {
    return `${seconds.toFixed(1)} s`;
  }

  return `${(seconds / 60).toFixed(1)} min`;
}

export default async function FailureAnalyticsPage() {
  const adminUser = await requireAdminUser({
    redirectTo: "/dashboard",
    targetType: "FailureAnalyticsPage",
  });
  const timezone = await getResolvedAppTimezone();

  await recordAnalyticsAuditEvent({
    actorAdminUserId: adminUser.id,
    action: AUDIT_ACTIONS.REPORT_GENERATED,
    targetType: "FailureAnalyticsPage",
    metadata: {
      reportType: "failures",
    },
  }).catch(() => undefined);

  const failureAnalytics = await getFailureAnalytics();
  const canExport = isAdminUserRole(adminUser.role);

  return (
    <section className="section-stack analytics-page">
      <header className="page-header">
        <div>
          <h2>Failures</h2>
          <p>Recurring publish issues and the most recent platform-level failures.</p>
        </div>
        <div className="analytics-header-actions">
          <Link href="/dashboard/analytics" className="secondary-button">
            Back To Analytics
          </Link>
          {canExport ? (
            <a href="/dashboard/analytics/export?kind=failures" className="secondary-button">
              Export Failure CSV
            </a>
          ) : null}
        </div>
      </header>

      <section className="panel dashboard-module-card">
        <div className="panel-body">
          <div className="dashboard-module-heading">
            <div className="dashboard-module-title">
              <span className="dashboard-module-icon is-red">
                <FailureIcon />
              </span>
              <div>
                <h3>Most Common Failure Reasons</h3>
                <p>Use this to spot repeated token, content, or API problems.</p>
              </div>
            </div>
          </div>

          <div className="analytics-failure-reason-grid">
            {failureAnalytics.commonReasons.length === 0 ? (
              <p className="muted">No failed platform attempts are recorded yet.</p>
            ) : (
              failureAnalytics.commonReasons.map((reason) => (
                <article key={`${reason.platform}-${reason.reason}`} className="analytics-failure-item">
                  <strong>{getSocialPlatformLabel(reason.platform)}</strong>
                  <p>{reason.reason}</p>
                  <span>{reason.count}</span>
                </article>
              ))
            )}
          </div>
        </div>
      </section>

      <section className="panel dashboard-module-card">
        <div className="panel-body">
          <div className="dashboard-module-heading">
            <div className="dashboard-module-title">
              <span className="dashboard-module-icon is-red">
                <FailureIcon />
              </span>
              <div>
                <h3>Recent Failed Attempts</h3>
                <p>Latest platform failures with durations, retries, and jump links.</p>
              </div>
            </div>
          </div>

          <div className="table-wrap dashboard-table-wrap">
            <table className="dashboard-modern-table">
              <thead>
                <tr>
                  <th>Last Attempt</th>
                  <th>Platform</th>
                  <th>Creator</th>
                  <th>Error Summary</th>
                  <th>Duration</th>
                  <th>Retry Count</th>
                </tr>
              </thead>
              <tbody>
                {failureAnalytics.recentFailures.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="muted">
                      No failed attempts yet.
                    </td>
                  </tr>
                ) : (
                  failureAnalytics.recentFailures.map((attempt) => (
                    <tr key={attempt.id}>
                      <td>
                        <Link href={attempt.postDetailHref}>{formatDateTimeForTimezone(attempt.startedAt, timezone)}</Link>
                      </td>
                      <td>{getSocialPlatformLabel(attempt.platform)}</td>
                      <td>{attempt.creatorName}</td>
                      <td>{attempt.errorSummary}</td>
                      <td>{formatAttemptDuration(attempt.durationMs)}</td>
                      <td>{attempt.retryCount}</td>
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
