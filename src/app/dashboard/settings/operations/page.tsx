import Link from "next/link";
import { SocialPostStatus } from "@prisma/client";
import {
  ClockIcon,
  FacebookIcon,
  FailureIcon,
  QueueIcon,
  SnapshotIcon,
  SuccessIcon,
} from "@/components/dashboard-icons";
import { getPostCaptionPreview } from "@/lib/posts";
import { prisma } from "@/lib/prisma";
import { formatDateTimeForTimezone, getResolvedAppTimezone } from "@/lib/time";
import { getWorkerStatusOverview } from "@/lib/worker-status";

function formatRelativeWorkerMode(enabled: boolean) {
  return enabled ? "Ready for cron or manual runs" : "Disabled";
}

function getSnapshotTitle(value: string | null | undefined) {
  return getPostCaptionPreview(value || "");
}

export default async function OperationsPage() {
  const timezone = await getResolvedAppTimezone();
  const [workerStatus, nextScheduledPost] = await Promise.all([
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
  ]);

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
    <section className="section-stack">
      <header className="page-header">
        <div>
          <h2>System Status</h2>
          <p>Operational publishing health, worker state, and Facebook connection status.</p>
        </div>
        <Link href="/dashboard/settings" className="secondary-button">
          Back To Settings
        </Link>
      </header>

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
    </section>
  );
}
