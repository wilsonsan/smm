import Link from "next/link";
import type { SchedulingHealthSummary } from "@/lib/analytics";
import {
  CalendarIcon,
  ClockIcon,
  SuccessIcon,
} from "@/components/dashboard-icons";

export function SchedulingHealthCard({ summary }: { summary: SchedulingHealthSummary }) {
  return (
    <div className="analytics-health-layout">
      <div className="analytics-health-score">
        <div className="analytics-health-ring">
          <svg viewBox="0 0 160 160" aria-hidden="true">
            <circle cx="80" cy="80" r="58" className="analytics-health-ring-track" />
            <circle
              cx="80"
              cy="80"
              r="58"
              className="analytics-health-ring-fill"
              strokeDasharray={`${(summary.score / 100) * 364.42} 364.42`}
            />
          </svg>
          <div className="analytics-health-ring-copy">
            <strong>{summary.score}%</strong>
            <span>Healthy</span>
          </div>
        </div>
        <Link href="/dashboard/calendar" className="secondary-button analytics-health-calendar-button">
          View Calendar
        </Link>
      </div>

      <div className="analytics-health-insights">
        <article className="analytics-health-insight-card">
          <span className="analytics-health-insight-icon is-green">
            <SuccessIcon />
          </span>
          <div>
            <strong>{summary.noContentGapsText}</strong>
            <p>{summary.coveragePercent}% of the next 30 days currently have content coverage.</p>
          </div>
        </article>
        <article className="analytics-health-insight-card">
          <span className="analytics-health-insight-icon is-blue">
            <CalendarIcon />
          </span>
          <div>
            <strong>Best posting days</strong>
            <p>{summary.bestDaysLabel}</p>
          </div>
        </article>
        <article className="analytics-health-insight-card">
          <span className="analytics-health-insight-icon is-purple">
            <ClockIcon />
          </span>
          <div>
            <strong>Optimal times</strong>
            <p>{summary.optimalTimesLabel}</p>
          </div>
        </article>
      </div>
    </div>
  );
}
