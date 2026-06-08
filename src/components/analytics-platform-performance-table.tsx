import {
  FacebookIcon,
  GoogleBusinessIcon,
  InstagramIcon,
} from "@/components/dashboard-icons";
import type { PlatformPerformanceRow } from "@/lib/analytics";
import { getSocialPlatformLabel } from "@/lib/analytics";
import { SocialPlatform } from "@prisma/client";

function PlatformIcon({ platform }: { platform: SocialPlatform }) {
  switch (platform) {
    case SocialPlatform.FACEBOOK:
      return <FacebookIcon />;
    case SocialPlatform.INSTAGRAM:
      return <InstagramIcon />;
    case SocialPlatform.GOOGLE_BUSINESS:
      return <GoogleBusinessIcon />;
    default:
      return null;
  }
}

function formatTrend(row: PlatformPerformanceRow) {
  if (row.publishedTrendPercent === null) {
    return "No prior baseline";
  }

  const glyph =
    row.publishedTrendDirection === "up"
      ? "↑"
      : row.publishedTrendDirection === "down"
        ? "↓"
        : "→";
  const rounded =
    Math.abs(row.publishedTrendPercent) >= 10
      ? Math.round(Math.abs(row.publishedTrendPercent))
      : Number(Math.abs(row.publishedTrendPercent).toFixed(1));
  return `${glyph} ${rounded}%`;
}

function formatSuccessRate(value: number | null) {
  if (value === null) {
    return "--";
  }

  return `${value.toFixed(1)}%`;
}

export function PlatformPerformanceTable({ rows }: { rows: PlatformPerformanceRow[] }) {
  return (
    <div className="analytics-performance-table-wrap">
      <table className="analytics-performance-table">
        <thead>
          <tr>
            <th>Platform</th>
            <th>Published</th>
            <th>Reach</th>
            <th>Engagement</th>
            <th>Success Rate</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.platform}>
              <td>
                <div className="analytics-platform-row">
                  <span className={`analytics-platform-row-icon is-${row.platform.toLowerCase()}`.trim()}>
                    <PlatformIcon platform={row.platform} />
                  </span>
                  <div>
                    <strong>{getSocialPlatformLabel(row.platform)}</strong>
                    <small>
                      {row.scheduledCount} scheduled · {row.failedCount} failed
                    </small>
                  </div>
                </div>
              </td>
              <td>
                <div className="analytics-performance-metric">
                  <strong>{row.publishedCount}</strong>
                  <small>{formatTrend(row)}</small>
                </div>
              </td>
              <td>
                <div className="analytics-performance-metric">
                  <strong>{row.reachDisplay}</strong>
                  <small>{row.reachTrendLabel}</small>
                </div>
              </td>
              <td>
                <div className="analytics-performance-metric">
                  <strong>{row.engagementDisplay}</strong>
                  <small>{row.engagementTrendLabel}</small>
                </div>
              </td>
              <td>
                <div className="analytics-success-rate">
                  <strong>{formatSuccessRate(row.successRate)}</strong>
                  <div className="analytics-success-rate-track">
                    <span
                      className="analytics-success-rate-fill"
                      style={{ width: `${row.successBarPercent}%` }}
                    />
                  </div>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
