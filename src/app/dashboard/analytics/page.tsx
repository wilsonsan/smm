import Link from "next/link";
import { requireAdminUser } from "@/lib/auth/session";
import {
  getAnalyticsPageData,
  parseAnalyticsFilters,
  recordAnalyticsAuditEvent,
} from "@/lib/analytics";
import { AUDIT_ACTIONS } from "@/lib/audit";
import { getResolvedAppTimezone } from "@/lib/time";
import {
  AnalyticsIcon,
  ArrowRightIcon,
  CalendarIcon,
  FailureIcon,
} from "@/components/dashboard-icons";
import { AnalyticsMetricCard } from "@/components/analytics-metric-card";
import {
  DonutSummaryChart,
  PostsOverTimeChart,
} from "@/components/analytics-dashboard-charts";
import { PlatformPerformanceTable } from "@/components/analytics-platform-performance-table";
import { SchedulingHealthCard } from "@/components/analytics-scheduling-health-card";
import {
  RecentActivityCard,
  RecentFailuresCard,
} from "@/components/analytics-recent-cards";
import { AnalyticsExportMenu } from "@/components/analytics-export-menu";

type AnalyticsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function formatComparisonLabel(percent: number | null) {
  if (percent === null) {
    return "No previous comparison";
  }

  const directionGlyph = percent >= 0 ? "↑" : "↓";
  const rounded =
    Math.abs(percent) >= 10 ? Math.round(Math.abs(percent)) : Number(Math.abs(percent).toFixed(1));
  return `${directionGlyph} ${rounded}%`;
}

export default async function AnalyticsPage({ searchParams }: AnalyticsPageProps) {
  const adminUser = await requireAdminUser({
    redirectTo: "/dashboard",
    targetType: "AnalyticsPage",
  });
  const resolvedSearchParams = (await searchParams) ?? {};
  const timezone = await getResolvedAppTimezone();
  const filters = parseAnalyticsFilters(resolvedSearchParams);

  await recordAnalyticsAuditEvent({
    actorAdminUserId: adminUser.id,
    action: AUDIT_ACTIONS.ANALYTICS_VIEWED,
    targetType: "AnalyticsPage",
    metadata: {
      filters,
    },
  }).catch(() => undefined);

  const analytics = await getAnalyticsPageData(filters, timezone);

  return (
    <section className="section-stack analytics-page analytics-dashboard-page">
      <header className="analytics-dashboard-header">
        <div className="analytics-dashboard-header-copy">
          <div className="analytics-dashboard-header-title-row">
            <span className="analytics-dashboard-title-icon">
              <AnalyticsIcon />
            </span>
            <div>
              <h2>Analytics</h2>
              <p>Track performance, scheduling health, and platform insights.</p>
            </div>
          </div>

          <div className="analytics-dashboard-quick-links">
            <Link href="/dashboard/analytics/history" className="secondary-button">
              Publish History
            </Link>
            <Link href="/dashboard/analytics/failures" className="secondary-button">
              Failures
            </Link>
          </div>
        </div>

        <div className="analytics-dashboard-header-actions">
          <div className="analytics-dashboard-range-stack">
            <button type="button" className="analytics-dashboard-range-pill">
              <span>{analytics.dashboard.dateRange.currentLabel}</span>
              <CalendarIcon />
            </button>
            <p className="analytics-dashboard-comparison">
              <span>Compared to {analytics.dashboard.dateRange.previousLabel}</span>
              <strong
                className={`analytics-dashboard-comparison-value is-${analytics.dashboard.dateRange.comparisonDirection}`.trim()}
              >
                {formatComparisonLabel(analytics.dashboard.dateRange.comparisonPercent)}
              </strong>
            </p>
          </div>
          <AnalyticsExportMenu />
        </div>
      </header>

      <section className="analytics-dashboard-metrics-grid">
        {analytics.dashboard.metricCards.map((metric) => (
          <AnalyticsMetricCard key={metric.key} metric={metric} />
        ))}
      </section>

      <section className="analytics-dashboard-primary-grid">
        <article className="panel analytics-dashboard-card analytics-dashboard-overview-card">
          <div className="panel-body analytics-dashboard-card-body">
            <div className="analytics-dashboard-card-head">
              <div>
                <h3>Publishing Overview</h3>
                <p>Current post-state mix across published, scheduled, draft, and failed content.</p>
              </div>
            </div>

            <DonutSummaryChart overview={analytics.dashboard.publishingOverview} />

            <div className="analytics-dashboard-success-banner">
              <span className="analytics-dashboard-success-banner-icon">↗</span>
              <span>Great job! Your publishing consistency is improving.</span>
            </div>
          </div>
        </article>

        <article className="panel analytics-dashboard-card analytics-dashboard-chart-card">
          <div className="panel-body analytics-dashboard-card-body">
            <div className="analytics-dashboard-card-head">
              <div>
                <h3>Posts Over Time</h3>
                <p>Daily publishing, scheduling, and failure activity from your recent workflow.</p>
              </div>
              <button type="button" className="analytics-dashboard-chart-pill">
                Daily
              </button>
            </div>

            <div className="analytics-dashboard-chart-legend">
              <span>
                <i className="is-published" />
                Published
              </span>
              <span>
                <i className="is-scheduled" />
                Scheduled
              </span>
              <span>
                <i className="is-failed" />
                Failed
              </span>
            </div>

            <PostsOverTimeChart points={analytics.dashboard.postsOverTime} />
          </div>
        </article>
      </section>

      <section className="analytics-dashboard-secondary-grid">
        <article className="panel analytics-dashboard-card analytics-dashboard-platform-card">
          <div className="panel-body analytics-dashboard-card-body">
            <div className="analytics-dashboard-card-head">
              <div>
                <h3>Top Performing Platforms</h3>
                <p>Publishing volume, reliability, and future-ready performance placeholders by platform.</p>
              </div>
            </div>

            <PlatformPerformanceTable rows={analytics.dashboard.platformPerformance} />

            <div className="analytics-dashboard-card-footer">
              <Link href="/dashboard/analytics/history" className="analytics-dashboard-inline-link">
                View publish history
                <ArrowRightIcon />
              </Link>
            </div>
          </div>
        </article>

        <article className="panel analytics-dashboard-card analytics-dashboard-health-card">
          <div className="panel-body analytics-dashboard-card-body">
            <div className="analytics-dashboard-card-head">
              <div>
                <h3>Scheduling Health</h3>
                <p>Coverage quality, content gaps, and the strongest publishing windows in your calendar.</p>
              </div>
            </div>

            <SchedulingHealthCard summary={analytics.dashboard.scheduleHealthSummary} />
          </div>
        </article>
      </section>

      <section className="analytics-dashboard-bottom-grid">
        <article className="panel analytics-dashboard-card">
          <div className="panel-body analytics-dashboard-card-body">
            <div className="analytics-dashboard-card-head">
              <div>
                <h3>Recent Activity</h3>
                <p>Latest successful publishes, scheduling actions, and key operational events.</p>
              </div>
            </div>

            <RecentActivityCard items={analytics.recentActivity} timezone={timezone} />
          </div>
        </article>

        <article className="panel analytics-dashboard-card">
          <div className="panel-body analytics-dashboard-card-body">
            <div className="analytics-dashboard-card-head">
              <div>
                <h3>Recent Failures</h3>
                <p>Review the most recent platform issues and jump straight into the affected post.</p>
              </div>
              <Link href="/dashboard/analytics/failures" className="secondary-button analytics-dashboard-small-action">
                <FailureIcon />
                <span>View All</span>
              </Link>
            </div>

            <RecentFailuresCard items={analytics.failureAnalytics.recentFailures} timezone={timezone} />
          </div>
        </article>
      </section>
    </section>
  );
}
