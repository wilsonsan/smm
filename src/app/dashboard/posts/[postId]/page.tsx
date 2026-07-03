import { SocialPlatform, SocialPostStatus } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PostEditorForm } from "@/components/post-editor-form";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { getFacebookConnectionRecord, getFacebookPreviewIdentity } from "@/lib/facebook";
import { getGoogleFoundationState } from "@/lib/google";
import { getInstagramFirstCommentSummary, getInstagramFoundationState } from "@/lib/instagram";
import {
  canCancelScheduled,
  canDeleteDraft,
  getPlatformPublishSummary,
  isReadOnlyPostStatus,
} from "@/lib/posts";
import { prisma } from "@/lib/prisma";
import {
  formatDateTimeForTimezone,
  getResolvedAppTimezone,
  toDateTimeLocalFields,
} from "@/lib/time";
import { getHashtagSettings, getInsertContentTemplateSettings, getTemplateVariableSettings } from "@/lib/settings";
import {
  cancelScheduledPostAction,
  deleteDraftPostAction,
} from "@/app/dashboard/posts/actions";
import { toMediaAssetGallerySummary, toMediaAssetSummary } from "@/lib/media-presentation";

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
  const [post, recentMediaAssets, timezone, templateVariables, insertContentTemplates, hashtagSettings, instagramFoundation, googleFoundation] = await Promise.all([
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
        platforms: {
          include: {
            publishAttempts: {
              where: {
                platform: SocialPlatform.INSTAGRAM,
              },
              orderBy: {
                startedAt: "desc",
              },
              take: 1,
            },
          },
        },
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
        posts: {
          select: {
            id: true,
            status: true,
            scheduledAt: true,
            publishedAt: true,
            updatedAt: true,
            platforms: {
              where: {
                status: {
                  in: [
                    SocialPostStatus.DRAFT,
                    SocialPostStatus.SCHEDULED,
                    SocialPostStatus.PUBLISHING,
                    SocialPostStatus.PUBLISHED,
                    SocialPostStatus.FAILED,
                  ],
                },
              },
              select: {
                platform: true,
                status: true,
              },
            },
          },
        },
        attachedToPosts: {
          select: {
            socialPost: {
              select: {
                id: true,
                status: true,
                scheduledAt: true,
                publishedAt: true,
                updatedAt: true,
                platforms: {
                  where: {
                    status: {
                      in: [
                        SocialPostStatus.DRAFT,
                        SocialPostStatus.SCHEDULED,
                        SocialPostStatus.PUBLISHING,
                        SocialPostStatus.PUBLISHED,
                        SocialPostStatus.FAILED,
                      ],
                    },
                  },
                  select: {
                    platform: true,
                    status: true,
                  },
                },
              },
            },
          },
        },
      },
    }),
    getResolvedAppTimezone(),
    getTemplateVariableSettings(),
    getInsertContentTemplateSettings(),
    getHashtagSettings(),
    getInstagramFoundationState({ refreshHealth: true }),
    getGoogleFoundationState({ refreshHealth: true }),
  ]);

  if (!post) {
    notFound();
  }

  const localSchedule = toDateTimeLocalFields(post.scheduledAt, timezone);
  const isReadOnly = isReadOnlyPostStatus(post.status);
  const hasBeenEdited = post.updatedAt.getTime() !== post.createdAt.getTime();
  const createdByLabel = post.createdByAdminUser.displayName || post.createdByAdminUser.username;
  const updatedByLabel = post.updatedByAdminUser.displayName || post.updatedByAdminUser.username;
  const facebookConnection = await getFacebookConnectionRecord();
  const facebookPreview = getFacebookPreviewIdentity(facebookConnection);
  const latestInstagramAttempt =
    post.platforms.find((platform) => platform.platform === SocialPlatform.INSTAGRAM)?.publishAttempts[0] ?? null;
  const instagramFirstCommentSummary = getInstagramFirstCommentSummary(latestInstagramAttempt?.responseSummary);
  const instagramFirstCommentStatusLabel = post.instagramFirstComment
    ? instagramFirstCommentSummary.fallbackToCaption
      ? "Included in caption"
      : instagramFirstCommentSummary.attempted
        ? instagramFirstCommentSummary.status === "succeeded"
          ? "Published"
          : instagramFirstCommentSummary.status === "failed"
            ? "Failed"
            : "Saved"
        : "Saved"
    : undefined;

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
          descriptionMain: post.descriptionMain,
          descriptionFacebook: post.descriptionFacebook ?? "",
          descriptionInstagram: post.descriptionInstagram ?? "",
          instagramFirstComment: post.instagramFirstComment ?? "",
          descriptionGoogleBusiness: post.descriptionGoogleBusiness ?? "",
          hashtags: Array.isArray(post.hashtags) ? post.hashtags.map((tag) => String(tag)) : [],
          includeHashtagsInGoogle: post.includeHashtagsInGoogle,
          scheduledDate: localSchedule.date,
          scheduledHour: localSchedule.hour,
          scheduledMinute: localSchedule.minute,
          scheduledMeridiem: localSchedule.meridiem,
          status: post.status,
          mediaAssets: post.attachedMedia.map((item) => toMediaAssetSummary(item.mediaAsset)),
          platforms: post.platforms.map((platform) => platform.platform),
          platformResults: post.platforms.map((platform) =>
            getPlatformPublishSummary({
              platform: platform.platform,
              status: platform.status,
            }),
          ),
          instagramFirstCommentStatusLabel,
          createdByLabel,
          createdAtLabel: formatDateTimeForTimezone(post.createdAt, timezone),
          updatedByLabel: hasBeenEdited ? updatedByLabel : undefined,
          updatedAtLabel: hasBeenEdited ? formatDateTimeForTimezone(post.updatedAt, timezone) : undefined,
        }}
        recentMediaAssets={recentMediaAssets.map((asset) => toMediaAssetGallerySummary(asset))}
        timezone={timezone}
        templateVariables={templateVariables}
        insertContentTemplates={insertContentTemplates}
        hashtagSettings={hashtagSettings}
        instagramFoundation={instagramFoundation}
        googleFoundation={googleFoundation}
        previewProfiles={{
          facebook: {
            name: facebookPreview.pageName,
            subtitle: "Just now - Public",
            profilePictureUrl: facebookPreview.profilePictureUrl,
          },
          instagram: {
            username: instagramFoundation.username,
            subtitle: instagramFoundation.pageName || "Raleigh, North Carolina",
            profilePictureUrl: instagramFoundation.profilePictureUrl,
          },
          google: {
            name: googleFoundation.previewName || googleFoundation.locationName || googleFoundation.accountName,
            subtitle: googleFoundation.locationName ? "Google Business Profile" : null,
            profilePictureUrl:
              googleFoundation.previewProfilePictureUrl ||
              googleFoundation.locationProfilePictureUrl ||
              googleFoundation.accountProfilePictureUrl,
          },
        }}
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
