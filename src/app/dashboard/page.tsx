/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { DateTime } from "luxon";
import { SocialPostStatus } from "@prisma/client";
import { ClickableTableRow } from "@/components/clickable-table-row";
import { getVariantByType, getMediaVariantUrl } from "@/lib/media-presentation";
import { getPostCaptionPreview, getPostStatusTone, resolvePostCalendarAt } from "@/lib/posts";
import { prisma } from "@/lib/prisma";
import { formatDateTimeForTimezone, getResolvedAppTimezone } from "@/lib/time";
import { getWorkerStatusOverview } from "@/lib/worker-status";

function formatRelativeWorkerMode(enabled: boolean) {
  return enabled ? "Ready for cron or manual runs" : "Disabled";
}

export default async function DashboardPage() {
  const timezone = await getResolvedAppTimezone();
  const weekStart = DateTime.now().setZone(timezone).startOf("week");
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

  return (
    <section className="section-stack">
      <header className="page-header">
        <div>
          <h2>Dashboard</h2>
          <p>Daily command center for Facebook scheduling, worker health, and posts that need attention.</p>
        </div>
      </header>

      <section className="panel">
        <div className="panel-body">
          <div className="page-header">
            <div>
              <h2 style={{ fontSize: "1.35rem" }}>Quick Actions</h2>
              <p>Jump straight into the core workflows you’ll use throughout the day.</p>
            </div>
          </div>

          <div className="action-grid">
            <Link href="/dashboard/posts/new" className="summary-link-card">
              <strong>New Post</strong>
              <span>Create a draft or schedule a Facebook post.</span>
            </Link>
            <Link href="/dashboard/calendar" className="summary-link-card">
              <strong>Calendar</strong>
              <span>Manage the month view, filters, and upcoming publishes.</span>
            </Link>
            <Link href="/dashboard/media" className="summary-link-card">
              <strong>Gallery</strong>
              <span>Review uploaded media assets and generated variants.</span>
            </Link>
            <Link href="/dashboard/settings/channels/facebook" className="summary-link-card">
              <strong>Facebook Settings</strong>
              <span>Check token health, scopes, and the connected Page.</span>
            </Link>
          </div>
        </div>
      </section>

      <div className="stats-grid">
        <article className="stat-card">
          <span>Total posts</span>
          <strong>{totalPosts}</strong>
        </article>
        <article className="stat-card">
          <span>Drafts</span>
          <strong>{draftPosts}</strong>
        </article>
        <article className="stat-card">
          <span>Scheduled this week</span>
          <strong>{scheduledThisWeekCount}</strong>
        </article>
        <article className="stat-card">
          <span>Failed posts</span>
          <strong>{failedPostsNeedingAttention}</strong>
        </article>
      </div>

      <div className="dashboard-summary-grid">
        <section className="panel">
          <div className="panel-body">
            <div className="page-header">
              <div>
                <h2 style={{ fontSize: "1.35rem" }}>Publishing Snapshot</h2>
                <p>At-a-glance view of what’s next, what succeeded last, and what needs a retry.</p>
              </div>
            </div>

            <div className="status-list">
              <article className="status-list-item">
                <span className="muted">Next scheduled post</span>
                {nextScheduledPost?.scheduledAt ? (
                  <>
                    <strong>{getPostCaptionPreview(nextScheduledPost.caption)}</strong>
                    <span>{formatDateTimeForTimezone(nextScheduledPost.scheduledAt, timezone)}</span>
                    <Link href={`/dashboard/posts/${nextScheduledPost.id}`}>Open post</Link>
                  </>
                ) : (
                  <>
                    <strong>Nothing queued</strong>
                    <span>No Facebook posts are currently scheduled.</span>
                  </>
                )}
              </article>

              <article className="status-list-item">
                <span className="muted">Last successful Facebook post</span>
                {workerStatus.lastSuccessfulPublish?.finishedAt ? (
                  <>
                    <strong>{getPostCaptionPreview(workerStatus.lastSuccessfulPublish.socialPost.internalTitle)}</strong>
                    <span>{formatDateTimeForTimezone(workerStatus.lastSuccessfulPublish.finishedAt, timezone)}</span>
                    <Link href={`/dashboard/posts/${workerStatus.lastSuccessfulPublish.socialPost.id}`}>View publish details</Link>
                  </>
                ) : (
                  <>
                    <strong>None yet</strong>
                    <span>No successful Facebook publishes have been recorded.</span>
                  </>
                )}
              </article>

              <article className="status-list-item">
                <span className="muted">Last failed publish</span>
                {workerStatus.lastFailedPublish ? (
                  <>
                    <strong>{getPostCaptionPreview(workerStatus.lastFailedPublish.socialPost.internalTitle)}</strong>
                    <span>{workerStatus.lastFailedPublish.errorMessage || "Facebook publish failed."}</span>
                    <Link href={`/dashboard/posts/${workerStatus.lastFailedPublish.socialPost.id}`}>Review failure</Link>
                  </>
                ) : (
                  <>
                    <strong>No failures pending</strong>
                    <span>The publish history does not have a recorded Facebook failure yet.</span>
                  </>
                )}
              </article>
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="panel-body">
            <div className="page-header">
              <div>
                <h2 style={{ fontSize: "1.35rem" }}>Worker Status</h2>
                <p>Operational health for the scheduled Facebook publishing worker.</p>
              </div>
            </div>

            <div className="grid-2">
              <article className="stat-card compact">
                <span>Worker mode</span>
                <strong>{workerStatus.mode}</strong>
                <p>{formatRelativeWorkerMode(workerStatus.enabled)}</p>
              </article>
              <article className="stat-card compact">
                <span>Connected Facebook Page</span>
                <strong>{workerStatus.connectedPage?.pageName || "Not connected"}</strong>
                <p>
                  {workerStatus.connectedPage?.pageId
                    ? `Page ID ${workerStatus.connectedPage.pageId}`
                    : "Connect and test a Facebook Page before scheduled publishing."}
                </p>
              </article>
              <article className="stat-card compact">
                <span>Due now</span>
                <strong>{workerStatus.dueScheduledPostsCount}</strong>
                <p>Posts currently ready for the worker to claim.</p>
              </article>
              <article className="stat-card compact">
                <span>Publishing</span>
                <strong>{workerStatus.publishingPostsCount}</strong>
                <p>
                  {workerStatus.stuckPublishingCount > 0
                    ? `${workerStatus.stuckPublishingCount} may be stuck and will be recovered on the next worker run.`
                    : "No stale publishing records detected."}
                </p>
              </article>
              <article className="stat-card compact">
                <span>Last worker run</span>
                <strong>{workerStatus.lastRunAt ? formatDateTimeForTimezone(workerStatus.lastRunAt, timezone) : "Never"}</strong>
                <p>
                  {workerStatus.lastRunResult
                    ? `Claimed ${workerStatus.lastRunResult.claimedCount}, published ${workerStatus.lastRunResult.publishedCount}, failed ${workerStatus.lastRunResult.failedCount}, recovered ${workerStatus.lastRunResult.recoveredCount ?? 0}.`
                    : "No worker runs have been recorded yet."}
                </p>
              </article>
              <article className="stat-card compact">
                <span>Last worker error</span>
                <strong>{workerStatus.lastWorkerError ? "Needs review" : "Clear"}</strong>
                <p>{workerStatus.lastWorkerError || "The latest worker run completed without a stored error."}</p>
              </article>
            </div>
          </div>
        </section>
      </div>

      <section className="panel">
        <div className="panel-body">
          <div className="page-header">
            <div>
              <h2 style={{ fontSize: "1.35rem" }}>Recent Posts</h2>
              <p>Latest drafts, scheduled posts, and publish outcomes.</p>
            </div>
            <Link href="/dashboard/calendar" className="secondary-button" style={{ display: "inline-flex", alignItems: "center" }}>
              Open Calendar
            </Link>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Preview</th>
                  <th>Caption preview</th>
                  <th>Status</th>
                  <th>Calendar time</th>
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
                    const facebookVariant = getVariantByType(post.mediaAsset?.variants ?? [], "FACEBOOK_FEED");
                    const calendarAt = resolvePostCalendarAt(post);
                    const tone = getPostStatusTone(post.status);

                    return (
                      <ClickableTableRow key={post.id} href={`/dashboard/posts/${post.id}`}>
                        <td>
                          {facebookVariant ? (
                            <img
                              src={getMediaVariantUrl(facebookVariant.id)}
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
