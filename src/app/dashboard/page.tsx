/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { DateTime } from "luxon";
import { SocialPostStatus } from "@prisma/client";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { ClickableTableRow } from "@/components/clickable-table-row";
import {
  ArrowRightIcon,
  CalendarIcon,
  ComposeIcon,
  DraftIcon,
  FailureIcon,
  GalleryIcon,
  PostsIcon,
  ScheduleIcon,
} from "@/components/dashboard-icons";
import { getMediaVariantUrl, getPreferredPreviewVariant } from "@/lib/media-presentation";
import { getPostCaptionPreview, getPostStatusTone, resolvePostCalendarAt } from "@/lib/posts";
import { prisma } from "@/lib/prisma";
import { formatDateTimeForTimezone, getResolvedAppTimezone } from "@/lib/time";

function formatDateRangeLabel(start: DateTime, endExclusive: DateTime) {
  const end = endExclusive.minus({ days: 1 });
  const startLabel = start.toFormat("MMM d");
  const endLabel = end.toFormat(start.month === end.month ? "d, yyyy" : "MMM d, yyyy");
  return `${startLabel} - ${endLabel}`;
}

type QuickActionCard = {
  href: string;
  title: string;
  description: string;
  accentClass: string;
  Icon: typeof ComposeIcon;
};

export default async function DashboardPage() {
  const adminUser = await requireAuthenticatedUser();
  const timezone = await getResolvedAppTimezone();
  const now = DateTime.now().setZone(timezone);
  const weekStart = now.startOf("week");
  const weekEnd = weekStart.plus({ weeks: 1 });
  const postScope = {};

  const [totalPosts, draftPosts, recentPosts, scheduledThisWeekCount, failedPostsNeedingAttention] =
    await Promise.all([
      prisma.socialPost.count({
        where: postScope,
      }),
      prisma.socialPost.count({
        where: { ...postScope, status: SocialPostStatus.DRAFT },
      }),
      prisma.socialPost.findMany({
        where: postScope,
        orderBy: { updatedAt: "desc" },
        take: 6,
        include: {
          platforms: true,
          mediaAsset: {
            include: {
              variants: true,
            },
          },
        },
      }),
      prisma.socialPost.count({
        where: {
          ...postScope,
          status: SocialPostStatus.SCHEDULED,
          scheduledAt: {
            gte: weekStart.toUTC().toJSDate(),
            lt: weekEnd.toUTC().toJSDate(),
          },
        },
      }),
      prisma.socialPost.count({
        where: {
          ...postScope,
          status: SocialPostStatus.FAILED,
        },
      }),
    ]);

  const quickActions: QuickActionCard[] = [
    {
      href: "/dashboard/posts/new",
      title: "New Post",
      description: "Create a draft or schedule a Facebook post.",
      accentClass: "is-purple",
      Icon: ComposeIcon,
    },
    {
      href: "/dashboard/calendar",
      title: "Calendar",
      description: "Manage your content calendar and upcoming publishes.",
      accentClass: "is-blue",
      Icon: CalendarIcon,
    },
    {
      href: "/dashboard/media",
      title: "Gallery",
      description: "Review your media assets and content variants.",
      accentClass: "is-green",
      Icon: GalleryIcon,
    },
  ] as const;

  const metricCards = [
    {
      label: "Total Posts",
      value: totalPosts,
      supporting: "All time",
      accentClass: "is-blue",
      Icon: PostsIcon,
    },
    {
      label: "Drafts",
      value: draftPosts,
      supporting: "Saved drafts",
      accentClass: "is-purple",
      Icon: DraftIcon,
    },
    {
      label: "Scheduled This Week",
      value: scheduledThisWeekCount,
      supporting: "Upcoming posts",
      accentClass: "is-green",
      Icon: ScheduleIcon,
    },
    {
      label: "Failed Posts",
      value: failedPostsNeedingAttention,
      supporting: "Needs attention",
      accentClass: "is-red",
      Icon: FailureIcon,
    },
  ] as const;

  return (
    <section className="dashboard-home">
      <header className="dashboard-hero">
        <div className="dashboard-hero-copy">
          <h2>Welcome back, {adminUser.displayName || adminUser.username}</h2>
        </div>

        <div className="dashboard-hero-toolbar">
          <Link href="/dashboard/calendar" className="dashboard-toolbar-button dashboard-date-range-pill">
            <CalendarIcon />
            <span>{formatDateRangeLabel(weekStart, weekEnd)}</span>
          </Link>
        </div>
      </header>

      <section className="panel dashboard-action-shell">
        <div className="panel-body">
          <div className="dashboard-action-grid">
            {quickActions.map(({ href, title, description, accentClass, Icon }) => (
              <Link key={href} href={href} className={`dashboard-action-card ${accentClass}`.trim()}>
                <div className="dashboard-action-icon">
                  <Icon />
                </div>
                <div className="dashboard-action-copy">
                  <strong>{title}</strong>
                  <span>{description}</span>
                </div>
                <span className="dashboard-action-arrow" aria-hidden="true">
                  <ArrowRightIcon />
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <div className="dashboard-kpi-grid">
        {metricCards.map(({ label, value, supporting, accentClass, Icon }) => (
          <article key={label} className={`dashboard-kpi-card ${accentClass}`.trim()}>
            <div className="dashboard-kpi-icon">
              <Icon />
            </div>
            <div className="dashboard-kpi-copy">
              <span>{label}</span>
              <strong>{value}</strong>
              <p>{supporting}</p>
            </div>
          </article>
        ))}
      </div>

      <section className="panel dashboard-module-card dashboard-recent-card">
        <div className="panel-body">
          <div className="dashboard-module-heading">
            <div className="dashboard-module-title">
              <span className="dashboard-module-icon is-purple">
                <PostsIcon />
              </span>
              <div>
                <h3>Recent Posts</h3>
                <p>The latest drafts, scheduled posts, and publish outcomes.</p>
              </div>
            </div>
            <Link href="/dashboard/calendar" className="secondary-button dashboard-secondary-inline">
              <CalendarIcon />
              <span>Open Calendar</span>
            </Link>
          </div>

          <div className="table-wrap dashboard-table-wrap">
            <table className="dashboard-modern-table">
              <thead>
                <tr>
                  <th>Preview</th>
                  <th>Caption Preview</th>
                  <th>Status</th>
                  <th>Time</th>
                  <th>Platform</th>
                </tr>
              </thead>
              <tbody>
                {recentPosts.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="muted">
                      No posts yet.
                    </td>
                  </tr>
                ) : (
                  recentPosts.map((post) => {
                    const previewVariant = getPreferredPreviewVariant(post.mediaAsset?.variants ?? []);
                    const calendarAt = resolvePostCalendarAt(post);
                    const tone = getPostStatusTone(post.status);

                    return (
                      <ClickableTableRow key={post.id} href={`/dashboard/posts/${post.id}`}>
                        <td>
                          {previewVariant ? (
                            <img
                              src={getMediaVariantUrl(previewVariant.id)}
                              alt={`${getPostCaptionPreview(post.caption)} thumbnail`}
                              className="table-thumb"
                            />
                          ) : (
                            <div className="table-thumb placeholder">No image</div>
                          )}
                        </td>
                        <td>
                          <Link href={`/dashboard/posts/${post.id}`}>{getPostCaptionPreview(post.caption)}</Link>
                        </td>
                        <td>
                          <span className={`badge is-${tone}`.trim()}>{post.status}</span>
                        </td>
                        <td>{calendarAt ? formatDateTimeForTimezone(calendarAt, timezone) : "No time"}</td>
                        <td>{post.platforms.map((platform) => platform.platform).join(", ") || "FACEBOOK"}</td>
                      </ClickableTableRow>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </section>
  );
}
