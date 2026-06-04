/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { notFound } from "next/navigation";
import { PublishAttemptStatus, SocialPlatform } from "@prisma/client";
import { PostEditorForm } from "@/components/post-editor-form";
import {
  formatBytes,
  formatDimensions,
  getMediaVariantLabel,
  getMediaVariantUrl,
  getVariantByType,
  toMediaAssetSummary,
} from "@/lib/media-presentation";
import {
  getPostCaptionPreview,
  canCancelScheduled,
  canDeleteDraft,
  canManuallyPublish,
  canReturnToDraft,
  getPostStatusTone,
  isReadOnlyPostStatus,
} from "@/lib/posts";
import { prisma } from "@/lib/prisma";
import {
  formatDateTimeForTimezone,
  getResolvedAppTimezone,
  getSchedulerTimezoneLabel,
  toDateTimeLocalFields,
} from "@/lib/time";
import {
  cancelScheduledPostAction,
  deleteDraftPostAction,
  publishPostNowAction,
  returnPostToDraftAction,
} from "@/app/dashboard/posts/actions";

type PostDetailPageProps = {
  params: Promise<{
    postId: string;
  }>;
  searchParams?: Promise<{
    status?: string;
    message?: string;
    confirmImmediate?: string;
  }>;
};

function formatJsonSummary(value: unknown) {
  if (!value) {
    return null;
  }

  return JSON.stringify(value, null, 2);
}

function getPublishAttemptTone(status: PublishAttemptStatus) {
  switch (status) {
    case PublishAttemptStatus.FAILED:
      return "failed";
    case PublishAttemptStatus.SUCCEEDED:
      return "published";
    case PublishAttemptStatus.PENDING:
      return "publishing";
    default:
      return "scheduled";
  }
}

export default async function PostDetailPage({ params, searchParams }: PostDetailPageProps) {
  const { postId } = await params;
  const resolvedSearchParams = await searchParams;
  const [post, recentMediaAssets, timezone] = await Promise.all([
    prisma.socialPost.findUnique({
      where: { id: postId },
      include: {
        mediaAsset: {
          include: {
            variants: true,
          },
        },
        platforms: {
          include: {
            publishAttempts: {
              orderBy: {
                startedAt: "desc",
              },
            },
          },
        },
      },
    }),
    prisma.mediaAsset.findMany({
      orderBy: {
        createdAt: "desc",
      },
      take: 12,
      include: {
        variants: true,
      },
    }),
    getResolvedAppTimezone(),
  ]);

  if (!post) {
    notFound();
  }

  const localSchedule = toDateTimeLocalFields(post.scheduledAt, timezone);
  const isReadOnly = isReadOnlyPostStatus(post.status);
  const timezoneLabel = getSchedulerTimezoneLabel(timezone);
  const facebookPlatform = post.platforms.find((platform) => platform.platform === SocialPlatform.FACEBOOK) ?? null;
  const publishAttempts = facebookPlatform?.publishAttempts ?? [];
  const lastPublishAttempt = publishAttempts[0] ?? null;
  const publishedPostUrl = facebookPlatform?.platformPostUrl ?? null;
  const retryCount = publishAttempts.length > 0 ? Math.max(0, publishAttempts.length - 1) : 0;
  const needsImmediatePublishConfirmation =
    resolvedSearchParams?.confirmImmediate === "1" &&
    post.status === "SCHEDULED" &&
    post.scheduledAt &&
    post.scheduledAt > new Date();
  const originalVariant = getVariantByType(post.mediaAsset?.variants ?? [], "ORIGINAL");
  const facebookVariant = getVariantByType(post.mediaAsset?.variants ?? [], "FACEBOOK_FEED");
  const googleVariant = getVariantByType(post.mediaAsset?.variants ?? [], "GOOGLE_BUSINESS_SAFE");

  return (
    <section className="section-stack">
      <header className="page-header">
        <div>
          <h2>{getPostCaptionPreview(post.caption)}</h2>
          <p>Post detail, publish health, and recovery actions for the Facebook workflow.</p>
        </div>
      </header>

      {resolvedSearchParams?.message ? (
        <section className="panel">
          <div className="panel-body">
            <p className={resolvedSearchParams.status === "error" ? "error-text" : "success-text"}>
              {resolvedSearchParams.message}
            </p>
          </div>
        </section>
      ) : null}

      <section className="panel">
        <div className="panel-body">
          <div className="page-header">
            <div>
              <h2 style={{ fontSize: "1.35rem" }}>Post Status</h2>
              <p>Current publish state, schedule, and the Facebook Page result when available.</p>
            </div>
            <span className={`badge is-${getPostStatusTone(post.status)}`.trim()}>{post.status}</span>
          </div>

          <div className="grid-2">
            <article className="stat-card compact">
              <span>Scheduled time</span>
              <strong>{post.scheduledAt ? formatDateTimeForTimezone(post.scheduledAt, timezone) : "Not scheduled"}</strong>
              <p>{post.scheduledAt ? timezoneLabel : "Drafts can stay unscheduled until ready."}</p>
            </article>
            <article className="stat-card compact">
              <span>Published time</span>
              <strong>{post.publishedAt ? formatDateTimeForTimezone(post.publishedAt, timezone) : "Not published"}</strong>
              <p>{publishedPostUrl ? "Facebook returned a post URL for this publish." : "No platform URL recorded yet."}</p>
            </article>
            <article className="stat-card compact">
              <span>Facebook platform status</span>
              <strong>{facebookPlatform?.status ?? post.status}</strong>
              <p>{facebookPlatform?.lastError || "No current Facebook platform error is stored."}</p>
            </article>
            <article className="stat-card compact">
              <span>Facebook post link</span>
              <strong>{publishedPostUrl ? "Available" : "Not available"}</strong>
              <p>
                {publishedPostUrl ? (
                  <a href={publishedPostUrl} target="_blank" rel="noreferrer">
                    Open Facebook post
                  </a>
                ) : (
                  "A Facebook permalink will appear here after a successful publish."
                )}
              </p>
            </article>
          </div>
        </div>
      </section>

      <div className="dashboard-summary-grid">
        <section className="panel">
          <div className="panel-body form-grid">
            <div className="page-header">
              <div>
                <h2 style={{ fontSize: "1.35rem" }}>Attached Media</h2>
                <p>Facebook publishes use the `FACEBOOK_FEED` derivative automatically when one is attached.</p>
              </div>
            </div>

            {post.mediaAsset ? (
              <>
                {originalVariant ? (
                  <img
                    src={getMediaVariantUrl(originalVariant.id)}
                    alt={`${getPostCaptionPreview(post.caption)} original preview`}
                    className="media-preview-image"
                  />
                ) : null}

                <div className="grid-2">
                  <div className="settings-subcard">
                    <div className="settings-subcard-head">
                      <div>
                        <strong>Original Upload</strong>
                        <p>{post.mediaAsset.originalFilename}</p>
                      </div>
                      <span className="settings-chip">{post.mediaAsset.mimeType}</span>
                    </div>
                    <p className="muted">
                      {formatDimensions(post.mediaAsset.width, post.mediaAsset.height)} · {formatBytes(post.mediaAsset.sizeBytes)}
                    </p>
                  </div>

                  <div className="settings-subcard">
                    <div className="settings-subcard-head">
                      <div>
                        <strong>Selected Facebook Variant</strong>
                        <p>{facebookVariant ? getMediaVariantLabel(facebookVariant.variantType) : "Missing"}</p>
                      </div>
                      <span className={`badge is-${facebookVariant ? "published" : "failed"}`.trim()}>
                        {facebookVariant ? "Ready" : "Missing"}
                      </span>
                    </div>
                    <p className="muted">
                      {facebookVariant
                        ? `${formatDimensions(facebookVariant.width, facebookVariant.height)} · ${formatBytes(facebookVariant.sizeBytes)} · ${facebookVariant.mimeType}`
                        : "This asset cannot be published to Facebook until a FACEBOOK_FEED JPEG variant exists."}
                    </p>
                  </div>
                </div>

                {googleVariant ? (
                  <p className="hint">
                    Additional variant available for later channels:{" "}
                    {formatDimensions(googleVariant.width, googleVariant.height)} · {formatBytes(googleVariant.sizeBytes)}
                  </p>
                ) : null}
              </>
            ) : (
              <p className="muted">No media asset is attached to this post. Text-only Facebook posts are still allowed.</p>
            )}
          </div>
        </section>

        <section className="panel">
          <div className="panel-body form-grid">
            <div className="page-header">
              <div>
                <h2 style={{ fontSize: "1.35rem" }}>Publishing</h2>
                <p>Latest publish result, manual publish safeguards, and the full attempt history.</p>
              </div>
            </div>

            {lastPublishAttempt ? (
              <div className="settings-subcard">
                <div className="settings-subcard-head">
                  <div>
                    <strong>Latest Publish Attempt</strong>
                    <p>
                      Started {formatDateTimeForTimezone(lastPublishAttempt.startedAt, timezone)}
                      {lastPublishAttempt.finishedAt
                        ? ` and finished ${formatDateTimeForTimezone(lastPublishAttempt.finishedAt, timezone)}`
                        : ""}
                    </p>
                  </div>
                  <span className={`badge is-${getPublishAttemptTone(lastPublishAttempt.status)}`.trim()}>
                    {lastPublishAttempt.status}
                  </span>
                </div>

                <div className="grid-2">
                  <div className="field">
                    <label>Platform</label>
                    <input value={lastPublishAttempt.platform} readOnly />
                  </div>
                  <div className="field">
                    <label>Retry count</label>
                    <input value={String(retryCount)} readOnly />
                  </div>
                  <div className="field">
                    <label>Error code</label>
                    <input value={lastPublishAttempt.errorCode || "None"} readOnly />
                  </div>
                  <div className="field">
                    <label>Platform post ID</label>
                    <input value={lastPublishAttempt.platformPostId || "Not available"} readOnly />
                  </div>
                </div>

                {lastPublishAttempt.platformPostUrl ? (
                  <p className="hint">
                    Published URL:{" "}
                    <a href={lastPublishAttempt.platformPostUrl} target="_blank" rel="noreferrer">
                      {lastPublishAttempt.platformPostUrl}
                    </a>
                  </p>
                ) : null}

                {lastPublishAttempt.errorMessage ? <p className="error-text">{lastPublishAttempt.errorMessage}</p> : null}

                {lastPublishAttempt.requestSummary ? (
                  <div className="field">
                    <label>Request summary</label>
                    <pre className="json-block">{formatJsonSummary(lastPublishAttempt.requestSummary)}</pre>
                  </div>
                ) : null}

                {lastPublishAttempt.responseSummary ? (
                  <div className="field">
                    <label>Response summary</label>
                    <pre className="json-block">{formatJsonSummary(lastPublishAttempt.responseSummary)}</pre>
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="muted">No Facebook publish attempts have been recorded yet.</p>
            )}

            {canManuallyPublish(post.status) ? (
              <div className="button-row">
                {needsImmediatePublishConfirmation ? (
                  <form action={publishPostNowAction}>
                    <input type="hidden" name="postId" value={post.id} />
                    <input type="hidden" name="confirmImmediate" value="1" />
                    <button type="submit" className="danger-button">
                      Confirm Post Now
                    </button>
                  </form>
                ) : (
                  <form action={publishPostNowAction}>
                    <input type="hidden" name="postId" value={post.id} />
                    <button type="submit" className="primary-button">
                      {post.status === "FAILED" ? "Retry Publish" : "Post Now"}
                    </button>
                  </form>
                )}

                <Link href="#post-editor" className="secondary-button">
                  Reschedule
                </Link>

                {post.status === "SCHEDULED" && post.scheduledAt && post.scheduledAt > new Date() ? (
                  <p className="warning-text">
                    Posting now will publish immediately and mark this future-scheduled post as published.
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="muted">Manual publishing is available only for draft, scheduled, or failed posts.</p>
            )}

            {publishAttempts.length > 0 ? (
              <details className="attempt-history">
                <summary>All Publish Attempts ({publishAttempts.length})</summary>
                <div className="table-wrap" style={{ marginTop: 14 }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Status</th>
                        <th>Started</th>
                        <th>Finished</th>
                        <th>Error</th>
                        <th>Platform Post ID</th>
                      </tr>
                    </thead>
                    <tbody>
                      {publishAttempts.map((attempt) => (
                        <tr key={attempt.id}>
                          <td>
                            <span className={`badge is-${getPublishAttemptTone(attempt.status)}`.trim()}>
                              {attempt.status}
                            </span>
                          </td>
                          <td>{formatDateTimeForTimezone(attempt.startedAt, timezone)}</td>
                          <td>
                            {attempt.finishedAt ? formatDateTimeForTimezone(attempt.finishedAt, timezone) : "Still running"}
                          </td>
                          <td>{attempt.errorMessage || attempt.errorCode || "None"}</td>
                          <td>{attempt.platformPostId || "Not available"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            ) : null}
          </div>
        </section>
      </div>

      <section id="post-editor" className="section-stack">
        <PostEditorForm
          post={{
            id: post.id,
            caption: post.caption,
            scheduledDate: localSchedule.date,
            scheduledHour: localSchedule.hour,
            scheduledMinute: localSchedule.minute,
            scheduledMeridiem: localSchedule.meridiem,
            status: post.status,
            mediaAsset: post.mediaAsset ? toMediaAssetSummary(post.mediaAsset) : null,
          }}
          recentMediaAssets={recentMediaAssets.map((asset) => toMediaAssetSummary(asset))}
          timezone={timezone}
          isReadOnly={isReadOnly}
          backHref="/dashboard/calendar"
        />
      </section>

      <section className="panel">
        <div className="panel-body">
          <div className="button-row">
            {canDeleteDraft(post.status) ? (
              <form action={deleteDraftPostAction}>
                <input type="hidden" name="postId" value={post.id} />
                <button type="submit" className="danger-button">
                  Delete Draft
                </button>
              </form>
            ) : null}

            {canCancelScheduled(post.status) ? (
              <form action={cancelScheduledPostAction}>
                <input type="hidden" name="postId" value={post.id} />
                <button type="submit" className="danger-button">
                  Cancel Scheduled Post
                </button>
              </form>
            ) : null}

            {canReturnToDraft(post.status) ? (
              <form action={returnPostToDraftAction}>
                <input type="hidden" name="postId" value={post.id} />
                <button type="submit" className="secondary-button">
                  Return To Draft
                </button>
              </form>
            ) : null}
          </div>
        </div>
      </section>
    </section>
  );
}
