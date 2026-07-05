/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { DateTime } from "luxon";
import { SocialPostStatus } from "@prisma/client";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { openNotificationAction } from "@/app/dashboard/actions";
import { ClickableTableRow } from "@/components/clickable-table-row";
import { DashboardMobileUploadAction } from "@/components/dashboard-mobile-upload-action";
import { DashboardNotificationMenu } from "@/components/dashboard-notification-menu";
import {
  ArrowRightIcon,
  CalendarIcon,
  ComposeIcon,
  GalleryIcon,
  PostsIcon,
  QueueIcon,
  ScheduleIcon,
  SuccessIcon,
} from "@/components/dashboard-icons";
import { getMediaVariantUrl, getPreferredPreviewVariant } from "@/lib/media-presentation";
import { getNotificationCenterSnapshot } from "@/lib/notifications";
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

type MobileMetricCard = {
  label: string;
  value: number;
  toneClass: string;
  Icon: typeof ScheduleIcon;
};

type DashboardPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function parsePageNumber(value: string | string[] | undefined) {
  const rawValue = Array.isArray(value) ? value[0] : value;
  const parsed = Number(rawValue);

  if (!Number.isFinite(parsed) || parsed < 1) {
    return 1;
  }

  return Math.floor(parsed);
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const adminUser = await requireAuthenticatedUser();
  const resolvedSearchParams = (await searchParams) ?? {};
  const timezone = await getResolvedAppTimezone();
  const now = DateTime.now().setZone(timezone);
  const weekStart = now.startOf("week");
  const weekEnd = weekStart.plus({ weeks: 1 });
  const postScope = {};
  const postsPerPage = 20;
  const currentPage = parsePageNumber(resolvedSearchParams.page);
  const displayName = adminUser.displayName || adminUser.username;

  const [
    recentPostsCount,
    notificationCenter,
    scheduledPostsCount,
    publishedPostsCount,
    mediaAssetsCount,
    pendingPostsCount,
  ] = await Promise.all([
    prisma.socialPost.count({
      where: postScope,
    }),
    getNotificationCenterSnapshot(),
    prisma.socialPost.count({
      where: {
        status: SocialPostStatus.SCHEDULED,
      },
    }),
    prisma.socialPost.count({
      where: {
        status: SocialPostStatus.PUBLISHED,
      },
    }),
    prisma.mediaAsset.count(),
    prisma.socialPost.count({
      where: {
        status: SocialPostStatus.DRAFT,
      },
    }),
  ]);
  const totalPages = Math.max(1, Math.ceil(recentPostsCount / postsPerPage));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const skip = (safeCurrentPage - 1) * postsPerPage;
  const recentPosts = await prisma.socialPost.findMany({
    where: postScope,
    orderBy: { updatedAt: "desc" },
    skip,
    take: postsPerPage,
    include: {
      platforms: true,
      mediaAsset: {
        include: {
          variants: true,
        },
      },
    },
  });
  const visibleStart = recentPostsCount === 0 ? 0 : (safeCurrentPage - 1) * postsPerPage + 1;
  const visibleEnd = recentPostsCount === 0 ? 0 : Math.min(safeCurrentPage * postsPerPage, recentPostsCount);
  const previousPageHref = safeCurrentPage > 1 ? `/dashboard?page=${safeCurrentPage - 1}#recent-posts` : null;
  const nextPageHref = safeCurrentPage < totalPages ? `/dashboard?page=${safeCurrentPage + 1}#recent-posts` : null;

  const quickActions: QuickActionCard[] = [
    {
      href: "/dashboard/posts/new",
      title: "New Post",
      description: "Create a draft or schedule a post.",
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
      description: "Manage your media assets.",
      accentClass: "is-green",
      Icon: GalleryIcon,
    },
  ] as const;

  const mobileMetrics: MobileMetricCard[] = [
    {
      label: "Scheduled Posts",
      value: scheduledPostsCount,
      toneClass: "is-purple",
      Icon: ScheduleIcon,
    },
    {
      label: "Published Posts",
      value: publishedPostsCount,
      toneClass: "is-blue",
      Icon: SuccessIcon,
    },
    {
      label: "Media Assets",
      value: mediaAssetsCount,
      toneClass: "is-green",
      Icon: GalleryIcon,
    },
    {
      label: "Pending Posts",
      value: pendingPostsCount,
      toneClass: "is-pink",
      Icon: QueueIcon,
    },
  ];

  const mobileRecentPosts = recentPosts.slice(0, 4);

  return (
    <section className="dashboard-home">
      <div className="dashboard-mobile-only">
        <section className="dashboard-mobile-shell">
          <header className="dashboard-mobile-hero">
            <div className="dashboard-mobile-hero-copy">
              <h2>
                Welcome back,
                <span>{displayName} 👋</span>
              </h2>
            </div>

            <div className="dashboard-mobile-hero-toolbar">
              <Link href="/dashboard/calendar" className="dashboard-toolbar-button dashboard-date-range-pill dashboard-mobile-date-pill">
                <CalendarIcon />
                <span>{formatDateRangeLabel(weekStart, weekEnd)}</span>
              </Link>
              <DashboardNotificationMenu
                unreadCount={notificationCenter.unreadCount}
                notifications={notificationCenter.unreadNotifications.map((notification) => ({
                  id: notification.id,
                  title: notification.title,
                  message: notification.message,
                  actionUrl: notification.actionUrl,
                  provider: notification.provider,
                  severity: notification.severity,
                  createdLabel: formatDateTimeForTimezone(notification.createdAt, timezone),
                }))}
                openNotificationAction={openNotificationAction}
              />
            </div>
          </header>

          <section className="dashboard-mobile-section">
            <div className="dashboard-mobile-section-head">
              <h3>Overview</h3>
            </div>
            <div className="dashboard-mobile-stats-grid">
              {mobileMetrics.map(({ label, value, toneClass, Icon }) => (
                <article key={label} className={`dashboard-mobile-stat-card ${toneClass}`.trim()}>
                  <span className="dashboard-mobile-stat-icon" aria-hidden="true">
                    <Icon />
                  </span>
                  <strong>{value.toLocaleString()}</strong>
                  <span>{label}</span>
                </article>
              ))}
            </div>
          </section>

          <section className="dashboard-mobile-section">
            <div className="dashboard-mobile-section-head">
              <h3>Quick Actions</h3>
            </div>

            <div className="dashboard-mobile-action-list">
              {quickActions.map(({ href, title, description, accentClass, Icon }) => (
                <Link key={`mobile-${href}`} href={href} className={`dashboard-mobile-action-row ${accentClass}`.trim()}>
                  <span className="dashboard-mobile-action-icon" aria-hidden="true">
                    <Icon />
                  </span>
                  <span className="dashboard-mobile-action-copy">
                    <strong>{title}</strong>
                    <span>{description}</span>
                  </span>
                  <span className="dashboard-mobile-action-arrow" aria-hidden="true">
                    <ArrowRightIcon />
                  </span>
                </Link>
              ))}
            </div>

            <DashboardMobileUploadAction />
          </section>

          <section className="panel dashboard-mobile-recent-shell">
            <div className="panel-body">
              <div className="dashboard-mobile-section-head">
                <h3>Recent Posts</h3>
                <Link href="/dashboard/posts" className="dashboard-mobile-view-all">
                  View all
                </Link>
              </div>

              <div className="dashboard-mobile-post-list is-dashboard-home">
                {mobileRecentPosts.length === 0 ? (
                  <p className="muted">No posts yet.</p>
                ) : (
                  mobileRecentPosts.map((post) => {
                    const previewVariant = getPreferredPreviewVariant(post.mediaAsset?.variants ?? []);
                    const calendarAt = resolvePostCalendarAt(post);
                    const tone = getPostStatusTone(post.status);

                    return (
                      <Link key={`mobile-home-${post.id}`} href={`/dashboard/posts/${post.id}`} className="dashboard-mobile-post-card">
                        {previewVariant ? (
                          <img
                            src={getMediaVariantUrl(previewVariant.id)}
                            alt={`${getPostCaptionPreview(post.caption)} thumbnail`}
                            className="dashboard-mobile-post-thumb"
                          />
                        ) : (
                          <div className="dashboard-mobile-post-thumb placeholder">No image</div>
                        )}
                        <div className="dashboard-mobile-post-copy">
                          <div className="dashboard-mobile-post-head">
                            <strong>{getPostCaptionPreview(post.caption)}</strong>
                            <span className={`badge is-${tone}`.trim()}>{post.status}</span>
                          </div>
                          <p>{calendarAt ? formatDateTimeForTimezone(calendarAt, timezone) : "No time"}</p>
                          <small>{post.platforms.map((platform) => platform.platform).join(", ") || "FACEBOOK"}</small>
                        </div>
                      </Link>
                    );
                  })
                )}
              </div>
            </div>
          </section>
        </section>
      </div>

      <div className="dashboard-desktop-only">
        <header className="dashboard-hero">
          <div className="dashboard-hero-copy">
            <h2>Welcome back, {displayName}</h2>
          </div>

          <div className="dashboard-hero-toolbar">
            <Link href="/dashboard/calendar" className="dashboard-toolbar-button dashboard-date-range-pill">
              <CalendarIcon />
              <span>{formatDateRangeLabel(weekStart, weekEnd)}</span>
            </Link>
            <DashboardNotificationMenu
              unreadCount={notificationCenter.unreadCount}
              notifications={notificationCenter.unreadNotifications.map((notification) => ({
                id: notification.id,
                title: notification.title,
                message: notification.message,
                actionUrl: notification.actionUrl,
                provider: notification.provider,
                severity: notification.severity,
                createdLabel: formatDateTimeForTimezone(notification.createdAt, timezone),
              }))}
              openNotificationAction={openNotificationAction}
            />
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

        <section id="recent-posts" className="panel dashboard-module-card dashboard-recent-card">
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

            <div className="dashboard-mobile-post-list">
              {recentPosts.length === 0 ? (
                <p className="muted">No posts yet.</p>
              ) : (
                recentPosts.map((post) => {
                  const previewVariant = getPreferredPreviewVariant(post.mediaAsset?.variants ?? []);
                  const calendarAt = resolvePostCalendarAt(post);
                  const tone = getPostStatusTone(post.status);

                  return (
                    <Link key={`mobile-${post.id}`} href={`/dashboard/posts/${post.id}`} className="dashboard-mobile-post-card">
                      {previewVariant ? (
                        <img
                          src={getMediaVariantUrl(previewVariant.id)}
                          alt={`${getPostCaptionPreview(post.caption)} thumbnail`}
                          className="dashboard-mobile-post-thumb"
                        />
                      ) : (
                        <div className="dashboard-mobile-post-thumb placeholder">No image</div>
                      )}
                      <div className="dashboard-mobile-post-copy">
                        <div className="dashboard-mobile-post-head">
                          <strong>{getPostCaptionPreview(post.caption)}</strong>
                          <span className={`badge is-${tone}`.trim()}>{post.status}</span>
                        </div>
                        <p>{calendarAt ? formatDateTimeForTimezone(calendarAt, timezone) : "No time"}</p>
                        <small>{post.platforms.map((platform) => platform.platform).join(", ") || "FACEBOOK"}</small>
                      </div>
                    </Link>
                  );
                })
              )}
            </div>

            <div className="dashboard-recent-pagination" aria-label="Recent posts pages">
              <div className="dashboard-recent-pagination-copy">
                <strong>Page {safeCurrentPage}</strong>
                <span>
                  {visibleStart}-{visibleEnd} of {recentPostsCount}
                </span>
              </div>
              <div className="dashboard-recent-pagination-controls">
                {previousPageHref ? (
                  <Link href={previousPageHref} className="secondary-button">
                    <span>Previous</span>
                  </Link>
                ) : (
                  <span className="secondary-button is-disabled" aria-disabled="true">
                    <span>Previous</span>
                  </span>
                )}
                {nextPageHref ? (
                  <Link href={nextPageHref} className="secondary-button">
                    <span>Next</span>
                  </Link>
                ) : (
                  <span className="secondary-button is-disabled" aria-disabled="true">
                    <span>Next</span>
                  </span>
                )}
              </div>
            </div>
          </div>
        </section>
      </div>
    </section>
  );
}
