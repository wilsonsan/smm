import {
  AnalyticsIcon,
  HeartIcon,
  ScheduleIcon,
  SuccessIcon,
  UserIcon,
} from "@/components/dashboard-icons";
import type { AnalyticsDashboardMetricCard } from "@/lib/analytics";

function buildLinePath(points: number[], width: number, height: number) {
  if (points.length === 0) {
    return "";
  }

  const maxValue = Math.max(...points, 1);
  return points
    .map((point, index) => {
      const x = points.length === 1 ? width / 2 : (index / (points.length - 1)) * width;
      const y = height - (point / maxValue) * (height - 8) - 4;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

function buildAreaPath(points: number[], width: number, height: number) {
  if (points.length === 0) {
    return "";
  }

  const line = buildLinePath(points, width, height);
  return `${line} L ${width} ${height} L 0 ${height} Z`;
}

function MetricIcon({ metricKey }: { metricKey: AnalyticsDashboardMetricCard["key"] }) {
  switch (metricKey) {
    case "published":
      return <SuccessIcon />;
    case "scheduled":
      return <ScheduleIcon />;
    case "reach":
      return <UserIcon />;
    case "engagement":
      return <HeartIcon />;
    default:
      return <AnalyticsIcon />;
  }
}

function MiniSparkline({
  metricKey,
  tone,
  series,
}: {
  metricKey: AnalyticsDashboardMetricCard["key"];
  tone: AnalyticsDashboardMetricCard["iconTone"];
  series: number[];
}) {
  const gradientId = `analytics-metric-${metricKey}-gradient`;
  const width = 280;
  const height = 72;
  const linePath = buildLinePath(series, width, height);
  const areaPath = buildAreaPath(series, width, height);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className={`analytics-metric-sparkline is-${tone}`.trim()} aria-hidden="true">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.42" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      {areaPath ? <path d={areaPath} fill={`url(#${gradientId})`} /> : null}
      {linePath ? <path d={linePath} fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" /> : null}
    </svg>
  );
}

function formatTrend(metric: AnalyticsDashboardMetricCard) {
  if (metric.trendPercent === null) {
    return "--";
  }

  const directionGlyph =
    metric.trendDirection === "up" ? "↑" : metric.trendDirection === "down" ? "↓" : "→";
  const rounded =
    Math.abs(metric.trendPercent) >= 10
      ? Math.round(Math.abs(metric.trendPercent))
      : Number(Math.abs(metric.trendPercent).toFixed(1));

  return `${directionGlyph} ${rounded}%`;
}

export function AnalyticsMetricCard({ metric }: { metric: AnalyticsDashboardMetricCard }) {
  return (
    <article className={`analytics-metric-card is-${metric.iconTone}`.trim()}>
      <div className="analytics-metric-card-head">
        <div>
          <span className="analytics-metric-label">{metric.label}</span>
          <strong className="analytics-metric-value">{metric.displayValue}</strong>
          <p className={`analytics-metric-trend is-${metric.trendDirection}`.trim()}>
            <span>{formatTrend(metric)}</span>
            <small>{metric.trendLabel}</small>
          </p>
        </div>
        <span className={`analytics-metric-badge is-${metric.iconTone}`.trim()}>
          <MetricIcon metricKey={metric.key} />
        </span>
      </div>
      <MiniSparkline metricKey={metric.key} tone={metric.iconTone} series={metric.series} />
    </article>
  );
}
