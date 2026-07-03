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

  const directionGlyph = percent >= 0 ? "\u2191" : "\u2193";
  const rounded =
    Math.abs(percent) >= 10 ? Math.round(Math.abs(percent)) : Number(Math.abs(percent).toFixed(1));
  return `${directionGlyph} ${rounded}%`;
}

function normalizePositiveInteger(input: string | string[] | undefined, fallback: number) {
  const value = Array.isArray(input) ? input[0] : input;
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export default async function AnalyticsPage({ searchParams }: AnalyticsPageProps) {
  const adminUser = await requireAdminUser({
    redirectTo: "/dashboard",
    targetType: "AnalyticsPage",
  });
  const resolvedSearchParams = (await searchParams) ?? {};
  const timezone = await getResolvedAppTimezone();
  const filters = parseAnalyticsFilters(resolvedSearchParams);
  const recentActivityPage = normalizePositiveInteger(resolvedSearchParams.activityPage, 1);

  await recordAnalyticsAuditEvent({
    actorAdminUserId: adminUser.id,
    action: AUDIT_ACTIONS.ANALYTICS_VIEWED,
    targetType: "AnalyticsPage",
    metadata: {
      filters,
    },
  }).catch(() => undefined);

  const analytics = await getAnalyticsPageData(filters, timezone, {
    recentActivityPage,
  });

  const buildActivityPageHref = (page: number) => {
    const nextParams = new URLSearchParams();

    for (const [key, value] of Object.entries(resolvedSearchParams)) {
      if (key === "activityPage") {
        continue;
      }

      if (Array.isArray(value)) {
        for (const entry of value) {
          if (entry) {
            nextParams.append(key, entry);
          }
        }
        continue;
      }

      if (value) {
        nextParams.set(key, value);
      }
    }

    nextParams.set("activityPage", String(page));
    const query = nextParams.toString();
    return query ? `/dashboard/analytics?${query}` : "/dashboard/analytics";
  };

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
              </div>
            </div>

            <DonutSummaryChart overview={analytics.dashboard.publishingOverview} />
          </div>
        </article>

        <article className="panel analytics-dashboard-card analytics-dashboard-chart-card">
          <div className="panel-body analytics-dashboard-card-body">
            <div className="analytics-dashboard-card-head">
              <div>
                <h3>Posts Over Time</h3>
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
              </div>
            </div>

            <RecentActivityCard
              feed={analytics.recentActivity}
              timezone={timezone}
              buildPageHref={buildActivityPageHref}
            />
          </div>
        </article>

        <article className="panel analytics-dashboard-card">
          <div className="panel-body analytics-dashboard-card-body">
            <div className="analytics-dashboard-card-head">
              <div>
                <h3>Recent Failures</h3>
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
