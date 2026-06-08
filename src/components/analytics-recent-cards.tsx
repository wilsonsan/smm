import Link from "next/link";
import type { PublishAttemptInsightRow, RecentActivityItem } from "@/lib/analytics";
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

function ActivityIcon({ tone }: { tone: RecentActivityItem["tone"] }) {
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
  items,
  timezone,
}: {
  items: RecentActivityItem[];
  timezone: string;
}) {
  return (
    <div className="analytics-recent-list">
      {items.length === 0 ? <p className="muted">No recent activity yet.</p> : null}
      {items.slice(0, 6).map((item) => (
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
