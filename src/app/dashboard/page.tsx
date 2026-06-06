/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { DateTime } from "luxon";
import { SocialPostStatus } from "@prisma/client";
import { requireAdminUser } from "@/lib/auth/session";
import { ClickableTableRow } from "@/components/clickable-table-row";
import {
  ArrowRightIcon,
  CalendarIcon,
  ClockIcon,
  ComposeIcon,
  DraftIcon,
  FacebookIcon,
  FailureIcon,
  GalleryIcon,
  PostsIcon,
  QueueIcon,
  ScheduleIcon,
  SettingsIcon,
  SnapshotIcon,
  SuccessIcon,
} from "@/components/dashboard-icons";
import { getMediaVariantUrl, getPreferredPreviewVariant } from "@/lib/media-presentation";
import { getPostCaptionPreview, getPostStatusTone, resolvePostCalendarAt } from "@/lib/posts";
import { prisma } from "@/lib/prisma";
import { formatDateTimeForTimezone, getResolvedAppTimezone } from "@/lib/time";
import { getWorkerStatusOverview } from "@/lib/worker-status";

function formatRelativeWorkerMode(enabled: boolean) {
  return enabled ? "Ready for cron or manual runs" : "Disabled";
}

function formatDateRangeLabel(start: DateTime, endExclusive: DateTime) {
  const end = endExclusive.minus({ days: 1 });
  const startLabel = start.toFormat("MMM d");
  const endLabel = end.toFormat(start.month === end.month ? "d, yyyy" : "MMM d, yyyy");
  return `${startLabel} - ${endLabel}`;
}

function getSnapshotTitle(value: string | null | undefined) {
  return getPostCaptionPreview(value || "");
}

export default async function DashboardPage() {
  const adminUser = await requireAdminUser();
  const timezone = await getResolvedAppTimezone();
  const now = DateTime.now().setZone(timezone);
  const weekStart = now.startOf("week");
  const weekEnd = weekStart.plus({ weeks: 1 });

  const [
    totalPosts,
    draftPosts,
    recentPosts,
    workerStatus,
    nextScheduledPost,
    scheduledThisWeekCount,
    failedPostsNeedingAttention,
  ] = await Promise.all([
    prisma.socialPost.count(),
    prisma.socialPost.count({
      where: { status: SocialPostStatus.DRAFT },
    }),
    prisma.socialPost.findMany({
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
    getWorkerStatusOverview(),
    prisma.socialPost.findFirst({
      where: {
        status: SocialPostStatus.SCHEDULED,
      },
      orderBy: {
        scheduledAt: "asc",
      },
      include: {
        platforms: true,
      },
    }),
    prisma.socialPost.count({
      where: {
        status: SocialPostStatus.SCHEDULED,
        scheduledAt: {
          gte: weekStart.toUTC().toJSDate(),
          lt: weekEnd.toUTC().toJSDate(),
        },
      },
    }),
    prisma.socialPost.count({
      where: {
        status: SocialPostStatus.FAILED,
      },
    }),
  ]);

  const quickActions = [
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
    {
      href: "/dashboard/settings/channels/facebook",
      title: "Facebook Settings",
      description: "Check token health, scopes, and the connected Page.",
      accentClass: "is-orange",
      Icon: SettingsIcon,
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

  const workerDetailCards = [
    {
      label: "Worker Mode",
      value: workerStatus.mode,
      supporting: formatRelativeWorkerMode(workerStatus.enabled),
      accentClass: "is-purple",
      Icon: QueueIcon,
    },
    {
      label: "Connected Facebook Page",
      value: workerStatus.connectedPage?.pageName || "Not connected",
      supporting:
        workerStatus.connectedPage?.pageId
          ? `Page ID ${workerStatus.connectedPage.pageId}${workerStatus.connectedPage.lastTestedAt ? ` · Last checked ${formatDateTimeForTimezone(workerStatus.connectedPage.lastTestedAt, timezone)}` : ""}`
          : "Connect and test a Facebook Page before scheduling.",
      accentClass: "is-blue",
      Icon: FacebookIcon,
    },
    {
      label: "Due Now",
      value: String(workerStatus.dueScheduledPostsCount),
      supporting: "Posts currently ready for the worker to claim.",
      accentClass: "is-orange",
      Icon: ClockIcon,
    },
    {
      label: "Publishing Queue",
      value: String(workerStatus.publishingPostsCount),
      supporting:
        workerStatus.stuckPublishingCount > 0
          ? `${workerStatus.stuckPublishingCount} may be stuck and will recover on the next worker run.`
          : "No active publishing records detected.",
      accentClass: "is-green",
      Icon: SnapshotIcon,
    },
  ] as const;

  return (
    <section className="dashboard-home">
      <header className="dashboard-hero">
        <div className="dashboard-hero-copy">
          <span className="dashboard-hero-kicker">Social Media Manager</span>
          <h2>Welcome back, {adminUser.displayName || adminUser.username}</h2>
          <p>Here&apos;s what&apos;s happening with your content and scheduled posts.</p>
        </div>

        <div className="dashboard-hero-toolbar">
          <Link href="/dashboard/calendar" className="dashboard-toolbar-button dashboard-date-range-pill">
            <CalendarIcon />
            <span>{formatDateRangeLabel(weekStart, weekEnd)}</span>
          </Link>

          <Link href="/dashboard/posts/new" className="primary-button dashboard-create-button">
            <ComposeIcon />
            <span>Quick Create Post</span>
          </Link>
        </div>
      </header>

      <section className="panel dashboard-action-shell">
        <div className="panel-body">
          <div className="dashboard-section-heading">
            <div>
              <h3>Quick Actions</h3>
              <p>Everything you need to create, schedule, and manage your content.</p>
            </div>
          </div>

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

      <div className="dashboard-main-grid">
        <section className="panel dashboard-module-card">
          <div className="panel-body">
            <div className="dashboard-module-heading">
              <div className="dashboard-module-title">
                <span className="dashboard-module-icon is-blue">
                  <SnapshotIcon />
                </span>
                <div>
                  <h3>Publishing Snapshot</h3>
                  <p>A quick look at what&apos;s next and what&apos;s been published.</p>
                </div>
              </div>
            </div>

            <div className="dashboard-snapshot-list">
              <article className="dashboard-snapshot-item">
                <div className="dashboard-snapshot-marker is-blue">
                  <ClockIcon />
                </div>
                <div className="dashboard-snapshot-copy">
                  <span>Next Scheduled Post</span>
                  {nextScheduledPost?.scheduledAt ? (
                    <>
                      <strong>{getSnapshotTitle(nextScheduledPost.caption)}</strong>
                      <p>{formatDateTimeForTimezone(nextScheduledPost.scheduledAt, timezone)}</p>
                    </>
                  ) : (
                    <>
                      <strong>Nothing queued</strong>
                      <p>No Facebook posts are currently scheduled.</p>
                    </>
                  )}
                </div>
                {nextScheduledPost ? (
                  <Link href={`/dashboard/posts/${nextScheduledPost.id}`} className="dashboard-inline-link">
                    Open
                  </Link>
                ) : null}
              </article>

              <article className="dashboard-snapshot-item">
                <div className="dashboard-snapshot-marker is-green">
                  <SuccessIcon />
                </div>
                <div className="dashboard-snapshot-copy">
                  <span>Last Successful Post</span>
                  {workerStatus.lastSuccessfulPublish?.finishedAt ? (
                    <>
                      <strong>{getSnapshotTitle(workerStatus.lastSuccessfulPublish.socialPost.internalTitle)}</strong>
                      <p>{formatDateTimeForTimezone(workerStatus.lastSuccessfulPublish.finishedAt, timezone)}</p>
                    </>
                  ) : (
                    <>
                      <strong>None yet</strong>
                      <p>No successful Facebook publishes have been recorded.</p>
                    </>
                  )}
                </div>
                {workerStatus.lastSuccessfulPublish ? (
                  <Link href={`/dashboard/posts/${workerStatus.lastSuccessfulPublish.socialPost.id}`} className="dashboard-inline-link">
                    View
                  </Link>
                ) : null}
              </article>

              <article className="dashboard-snapshot-item">
                <div className="dashboard-snapshot-marker is-red">
                  <FailureIcon />
                </div>
                <div className="dashboard-snapshot-copy">
                  <span>Last Failed Post</span>
                  {workerStatus.lastFailedPublish ? (
                    <>
                      <strong>{getSnapshotTitle(workerStatus.lastFailedPublish.socialPost.internalTitle)}</strong>
                      <p>{workerStatus.lastFailedPublish.errorMessage || "Facebook publish failed."}</p>
                    </>
                  ) : (
                    <>
                      <strong>None</strong>
                      <p>No failed Facebook publishes to show.</p>
                    </>
                  )}
                </div>
                {workerStatus.lastFailedPublish ? (
                  <Link href={`/dashboard/posts/${workerStatus.lastFailedPublish.socialPost.id}`} className="dashboard-inline-link">
                    Review
                  </Link>
                ) : null}
              </article>
            </div>
          </div>
        </section>

        <section className="panel dashboard-module-card">
          <div className="panel-body">
            <div className="dashboard-module-heading">
              <div className="dashboard-module-title">
                <span className="dashboard-module-icon is-red">
                  <QueueIcon />
                </span>
                <div>
                  <h3>Worker Status</h3>
                  <p>Operational health for the scheduled publishing worker.</p>
                </div>
              </div>
            </div>

            <div className="dashboard-status-grid">
              {workerDetailCards.map(({ label, value, supporting, accentClass, Icon }) => (
                <article key={label} className={`dashboard-status-card ${accentClass}`.trim()}>
                  <span className="dashboard-status-icon">
                    <Icon />
                  </span>
                  <div className="dashboard-status-copy">
                    <span>{label}</span>
                    <strong>{value}</strong>
                    <p>{supporting}</p>
                  </div>
                </article>
              ))}
            </div>

            <div className="dashboard-worker-footer">
              <div>
                <span className="dashboard-worker-footer-label">Last Worker Run</span>
                <strong>{workerStatus.lastRunAt ? formatDateTimeForTimezone(workerStatus.lastRunAt, timezone) : "Never"}</strong>
                <p>
                  {workerStatus.lastRunResult
                    ? `Claimed ${workerStatus.lastRunResult.claimedCount}, published ${workerStatus.lastRunResult.publishedCount}, failed ${workerStatus.lastRunResult.failedCount}, recovered ${workerStatus.lastRunResult.recoveredCount ?? 0}.`
                    : "No worker runs have been recorded yet."}
                </p>
              </div>
              <div>
                <span className="dashboard-worker-footer-label">Last Worker Error</span>
                <strong>{workerStatus.lastWorkerError ? "Needs review" : "Clear"}</strong>
                <p>{workerStatus.lastWorkerError || "The latest worker run completed without a stored error."}</p>
              </div>
            </div>
          </div>
        </section>
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
                  <th>Calendar Time</th>
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
                        <td>{calendarAt ? formatDateTimeForTimezone(calendarAt, timezone) : "No calendar time"}</td>
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
