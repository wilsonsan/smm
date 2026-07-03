import Link from "next/link";
import type { PublishAttemptInsightRow, RecentActivityFeed } from "@/lib/analytics";
import { formatDateTimeForTimezone } from "@/lib/time";
import {
  ArrowRightIcon,
  FailureIcon,
  FacebookIcon,
  GoogleBusinessIcon,
  InstagramIcon,
  ScheduleIcon,
  SuccessIcon,
} from "@/components/dashboard-icons";
import { getSocialPlatformLabel } from "@/lib/analytics";
import { SocialPlatform } from "@prisma/client";

function ActivityIcon({ tone }: { tone: "info" | "success" | "error" }) {
  if (tone === "success") {
    return <SuccessIcon />;
  }

  if (tone === "error") {
    return <FailureIcon />;
  }

  return <ScheduleIcon />;
}

function FailurePlatformIcon({ platform }: { platform: SocialPlatform }) {
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

export function RecentActivityCard({
  feed,
  timezone,
  buildPageHref,
}: {
  feed: RecentActivityFeed;
  timezone: string;
  buildPageHref: (page: number) => string;
}) {
  const hasPreviousPage = feed.currentPage > 1;
  const hasNextPage = feed.currentPage < feed.totalPages;

  return (
    <div className="analytics-recent-card-stack">
      <div className="analytics-recent-list">
        {feed.items.length === 0 ? <p className="muted">No recent activity yet.</p> : null}
        {feed.items.map((item) => (
          <article key={item.id} className="analytics-recent-item">
            <span className={`analytics-recent-item-icon is-${item.tone}`.trim()}>
              <ActivityIcon tone={item.tone} />
            </span>
            <div className="analytics-recent-item-copy">
              <strong>{item.message}</strong>
              <p>{formatDateTimeForTimezone(item.createdAt, timezone)}</p>
            </div>
            <span className="analytics-recent-item-arrow">
              <ArrowRightIcon />
            </span>
          </article>
        ))}
      </div>

      {feed.totalPages > 1 ? (
        <div className="analytics-recent-pagination">
          <span className="analytics-recent-pagination-summary">
            Page {feed.currentPage} of {feed.totalPages}
          </span>
          <div className="analytics-recent-pagination-actions">
            <Link
              href={hasPreviousPage ? buildPageHref(feed.currentPage - 1) : "#"}
              aria-disabled={!hasPreviousPage}
              className={`secondary-button analytics-recent-pagination-button${
                hasPreviousPage ? "" : " is-disabled"
              }`.trim()}
            >
              Previous
            </Link>
            <Link
              href={hasNextPage ? buildPageHref(feed.currentPage + 1) : "#"}
              aria-disabled={!hasNextPage}
              className={`secondary-button analytics-recent-pagination-button${
                hasNextPage ? "" : " is-disabled"
              }`.trim()}
            >
              Next
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function RecentFailuresCard({
  items,
  timezone,
}: {
  items: PublishAttemptInsightRow[];
  timezone: string;
}) {
  return (
    <div className="analytics-recent-list">
      {items.length === 0 ? <p className="muted">No recent failures right now.</p> : null}
      {items.slice(0, 5).map((item) => (
        <article key={item.id} className="analytics-recent-failure-item">
          <div className="analytics-recent-failure-main">
            <span className={`analytics-recent-failure-platform is-${item.platform.toLowerCase()}`.trim()}>
              <FailurePlatformIcon platform={item.platform} />
            </span>
            <div className="analytics-recent-failure-copy">
              <strong>Failed to publish to {getSocialPlatformLabel(item.platform)}</strong>
              <p>{item.errorSummary}</p>
              <small>{formatDateTimeForTimezone(item.startedAt, timezone)}</small>
            </div>
          </div>
          <Link href={item.postDetailHref} className="secondary-button analytics-recent-failure-action">
            Review
          </Link>
        </article>
      ))}
    </div>
  );
}
