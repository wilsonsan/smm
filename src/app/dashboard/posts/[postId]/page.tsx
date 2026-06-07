import Link from "next/link";
import { notFound } from "next/navigation";
import { PostEditorForm } from "@/components/post-editor-form";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { getInstagramFoundationState } from "@/lib/instagram";
import {
  canCancelScheduled,
  canDeleteDraft,
  isReadOnlyPostStatus,
} from "@/lib/posts";
import { prisma } from "@/lib/prisma";
import {
  formatDateTimeForTimezone,
  getResolvedAppTimezone,
  toDateTimeLocalFields,
} from "@/lib/time";
import {
  cancelScheduledPostAction,
  deleteDraftPostAction,
} from "@/app/dashboard/posts/actions";
import { toMediaAssetSummary } from "@/lib/media-presentation";

type PostDetailPageProps = {
  params: Promise<{
    postId: string;
  }>;
  searchParams?: Promise<{
    status?: string;
    message?: string;
  }>;
};

export default async function PostDetailPage({ params, searchParams }: PostDetailPageProps) {
  const adminUser = await requireAuthenticatedUser();
  const { postId } = await params;
  const resolvedSearchParams = await searchParams;
  const [post, recentMediaAssets, timezone, instagramFoundation] = await Promise.all([
    prisma.socialPost.findUnique({
      where: { id: postId },
      include: {
        attachedMedia: {
          orderBy: {
            position: "asc",
          },
          include: {
            mediaAsset: {
              include: {
                variants: true,
              },
            },
          },
        },
        platforms: true,
        mediaAsset: {
          include: {
            variants: true,
          },
        },
        createdByAdminUser: {
          select: {
            id: true,
            username: true,
            displayName: true,
          },
        },
        updatedByAdminUser: {
          select: {
            id: true,
            username: true,
            displayName: true,
          },
        },
      },
    }),
    prisma.mediaAsset.findMany({
      orderBy: {
        createdAt: "desc",
      },
      include: {
        variants: true,
      },
    }),
    getResolvedAppTimezone(),
    getInstagramFoundationState({ refreshHealth: true }),
  ]);

  if (!post) {
    notFound();
  }

  const localSchedule = toDateTimeLocalFields(post.scheduledAt, timezone);
  const isReadOnly = isReadOnlyPostStatus(post.status);
  const hasBeenEdited = post.updatedAt.getTime() !== post.createdAt.getTime();
  const createdByLabel = post.createdByAdminUser.displayName || post.createdByAdminUser.username;
  const updatedByLabel = post.updatedByAdminUser.displayName || post.updatedByAdminUser.username;

  return (
    <section className="section-stack">
      {resolvedSearchParams?.message ? (
        <section className="panel">
          <div className="panel-body">
            <p className={resolvedSearchParams.status === "error" ? "error-text" : "success-text"}>
              {resolvedSearchParams.message}
            </p>
          </div>
        </section>
      ) : null}

      <PostEditorForm
        post={{
          id: post.id,
          caption: post.caption,
          scheduledDate: localSchedule.date,
          scheduledHour: localSchedule.hour,
          scheduledMinute: localSchedule.minute,
          scheduledMeridiem: localSchedule.meridiem,
          status: post.status,
          mediaAssets: post.attachedMedia.map((item) => toMediaAssetSummary(item.mediaAsset)),
          platforms: post.platforms.map((platform) => platform.platform),
          createdByLabel,
          createdAtLabel: formatDateTimeForTimezone(post.createdAt, timezone),
          updatedByLabel: hasBeenEdited ? updatedByLabel : undefined,
          updatedAtLabel: hasBeenEdited ? formatDateTimeForTimezone(post.updatedAt, timezone) : undefined,
        }}
        recentMediaAssets={recentMediaAssets.map((asset) => toMediaAssetSummary(asset))}
        timezone={timezone}
        instagramFoundation={instagramFoundation}
        isReadOnly={isReadOnly}
        hideHeroCopy
      />

      <div className="button-row post-detail-standalone-actions">
        {adminUser.role === "ADMIN" ? (
          <Link href={`/dashboard/posts/${post.id}/advanced`} className="secondary-button">
            Advanced
          </Link>
        ) : null}

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
      </div>
    </section>
  );
}
