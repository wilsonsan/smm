import Link from "next/link";
import { ChevronDownIcon, DownloadIcon } from "@/components/dashboard-icons";

export function AnalyticsExportMenu() {
  return (
    <details className="analytics-export-menu">
      <summary className="analytics-export-menu-trigger">
        <span className="analytics-export-menu-trigger-icon">
          <DownloadIcon />
        </span>
        <span>Export Reports</span>
        <ChevronDownIcon />
      </summary>
      <div className="analytics-export-menu-panel">
        <a href="/dashboard/analytics/export?kind=history" className="analytics-export-menu-link">
          Export Publish History CSV
        </a>
        <a href="/dashboard/analytics/export?kind=users" className="analytics-export-menu-link">
          Export User Statistics CSV
        </a>
        <a href="/dashboard/analytics/export?kind=failures" className="analytics-export-menu-link">
          Export Failure Logs CSV
        </a>
        <div className="analytics-export-menu-divider" />
        <Link href="/dashboard/analytics/history" className="analytics-export-menu-link">
          Open Publish History
        </Link>
        <Link href="/dashboard/analytics/failures" className="analytics-export-menu-link">
          Open Failures
        </Link>
      </div>
    </details>
  );
}
