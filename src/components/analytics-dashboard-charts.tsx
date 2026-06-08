import type { CSSProperties } from "react";
import type { PostsOverTimePoint, PublishingOverviewData } from "@/lib/analytics";

function DonutLegendItem({
  label,
  count,
  percent,
  tone,
}: {
  label: string;
  count: number;
  percent: number;
  tone: string;
}) {
  return (
    <div className="analytics-donut-legend-item">
      <div className="analytics-donut-legend-label">
        <span className={`analytics-donut-dot is-${tone}`.trim()} />
        <span>{label}</span>
      </div>
      <div className="analytics-donut-legend-values">
        <strong>{count}</strong>
        <small>{Math.round(percent)}%</small>
      </div>
    </div>
  );
}

export function DonutSummaryChart({ overview }: { overview: PublishingOverviewData }) {
  const size = 220;
  const strokeWidth = 18;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  const safeSlices =
    overview.totalPosts === 0
      ? [
          {
            key: "empty",
            label: "No posts yet",
            count: 0,
            percent: 100,
            tone: "muted",
          },
        ]
      : overview.slices;

  return (
    <div className="analytics-donut-layout">
      <div className="analytics-donut-visual">
        <svg viewBox={`0 0 ${size} ${size}`} className="analytics-donut-chart" aria-hidden="true">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            className="analytics-donut-track"
            strokeWidth={strokeWidth}
            fill="none"
          />
          {safeSlices.map((slice) => {
            const length = circumference * (slice.percent / 100);
            const dashArray = `${length} ${circumference - length}`;
            const circle = (
              <circle
                key={slice.key}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                className={`analytics-donut-segment is-${slice.tone}`.trim()}
                strokeWidth={strokeWidth}
                fill="none"
                strokeDasharray={dashArray}
                strokeDashoffset={-offset}
              />
            );
            offset += length;
            return circle;
          })}
        </svg>
        <div className="analytics-donut-center">
          <strong>{overview.totalPosts}</strong>
          <span>Total Posts</span>
        </div>
      </div>

      <div className="analytics-donut-legend">
        {overview.slices.map((slice) => (
          <DonutLegendItem
            key={slice.key}
            label={slice.label}
            count={slice.count}
            percent={slice.percent}
            tone={slice.tone}
          />
        ))}
      </div>
    </div>
  );
}

function buildBarStyle(value: number, maxValue: number) {
  const heightPercent = maxValue > 0 ? Math.max((value / maxValue) * 100, value > 0 ? 8 : 0) : 0;
  return {
    height: `${heightPercent}%`,
  } satisfies CSSProperties;
}

export function PostsOverTimeChart({ points }: { points: PostsOverTimePoint[] }) {
  const maxValue = Math.max(
    1,
    ...points.flatMap((point) => [point.published, point.scheduled, point.failed]),
  );

  return (
    <div className="analytics-posts-chart">
      <div className="analytics-posts-chart-bars">
        {points.map((point, index) => {
          const shouldShowLabel = index % 6 === 0 || index === points.length - 1;
          return (
            <div key={point.dateKey} className="analytics-posts-chart-group">
              <div className="analytics-posts-chart-columns">
                <span
                  className="analytics-posts-chart-bar is-published"
                  style={buildBarStyle(point.published, maxValue)}
                  title={`${point.label}: ${point.published} published`}
                />
                <span
                  className="analytics-posts-chart-bar is-scheduled"
                  style={buildBarStyle(point.scheduled, maxValue)}
                  title={`${point.label}: ${point.scheduled} scheduled`}
                />
                <span
                  className="analytics-posts-chart-bar is-failed"
                  style={buildBarStyle(point.failed, maxValue)}
                  title={`${point.label}: ${point.failed} failed`}
                />
              </div>
              <span className="analytics-posts-chart-label">{shouldShowLabel ? point.shortLabel : ""}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
