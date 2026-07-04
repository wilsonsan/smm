import { SocialPlatform, SocialPostStatus } from "@prisma/client";
import { DateTime } from "luxon";
import { PostEditorForm } from "@/components/post-editor-form";
import { createAuditLog, AUDIT_ACTIONS } from "@/lib/audit";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { getFacebookConnectionRecord, getFacebookPreviewIdentity } from "@/lib/facebook";
import { getGoogleFoundationState } from "@/lib/google";
import { getInstagramFoundationState } from "@/lib/instagram";
import { toMediaAssetGallerySummary, toMediaAssetSummary } from "@/lib/media-presentation";
import { prisma } from "@/lib/prisma";
import { getHashtagSettings, getInsertContentTemplateSettings, getTemplateVariableSettings } from "@/lib/settings";
import { getDateKeyForTimezone, getDefaultScheduleFields, getResolvedAppTimezone } from "@/lib/time";

type NewPostPageProps = {
  searchParams?: Promise<{
    date?: string;
    time?: string;
    hour?: string;
    minute?: string;
    ampm?: string;
    createdFrom?: string;
    mediaId?: string;
  }>;
};

export default async function NewPostPage({ searchParams }: NewPostPageProps) {
  const adminUser = await requireAuthenticatedUser();
  const resolvedSearchParams = await searchParams;
  const [recentMediaAssets, timezone, templateVariables, insertContentTemplates, hashtagSettings, instagramFoundation, googleFoundation] = await Promise.all([
    prisma.mediaAsset.findMany({
      orderBy: {
        createdAt: "desc",
      },
      include: {
        variants: true,
        categoryAssignments: {
          include: {
            mediaCategory: true,
          },
        },
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
  const markerRangeStart = DateTime.now().setZone(timezone).startOf("month").minus({ months: 12 }).toUTC().toJSDate();
  const markerRangeEnd = DateTime.now().setZone(timezone).startOf("month").plus({ months: 13 }).endOf("month").toUTC().toJSDate();
  const scheduledPlatformRows = await prisma.socialPostPlatform.findMany({
    where: {
      scheduledAt: {
        gte: markerRangeStart,
        lte: markerRangeEnd,
      },
      status: {
        in: [SocialPostStatus.SCHEDULED, SocialPostStatus.PUBLISHING, SocialPostStatus.PUBLISHED],
      },
    },
    select: {
      platform: true,
      scheduledAt: true,
    },
    orderBy: {
      scheduledAt: "asc",
    },
  });
  const facebookConnection = await getFacebookConnectionRecord();
  const facebookPreview = getFacebookPreviewIdentity(facebookConnection);
  const requestedDate = resolvedSearchParams?.date?.trim() ?? "";
  const requestedTime = resolvedSearchParams?.time?.trim() ?? "";
  const requestedHour = resolvedSearchParams?.hour?.trim() ?? "";
  const requestedMinute = resolvedSearchParams?.minute?.trim() ?? "";
  const requestedMeridiem = resolvedSearchParams?.ampm?.trim().toUpperCase() ?? "";
  const requestedMediaId = resolvedSearchParams?.mediaId?.trim() ?? "";
  const defaults = getDefaultScheduleFields(timezone, {
    date: DateTime.fromFormat(requestedDate, "yyyy-MM-dd", { zone: timezone }).isValid ? requestedDate : "",
    time: /^([01]\d|2[0-3]):([0-5]\d)$/.test(requestedTime) ? requestedTime : "",
  });
  const resolvedHour = requestedHour && Number.parseInt(requestedHour, 10) >= 1 && Number.parseInt(requestedHour, 10) <= 12 ? requestedHour : defaults.hour;
  const resolvedMinute = /^(00|15|30|45)$/.test(requestedMinute) ? requestedMinute : defaults.minute;
  const resolvedMeridiem = requestedMeridiem === "AM" || requestedMeridiem === "PM" ? requestedMeridiem : defaults.meridiem;
  const preselectedMediaAsset = requestedMediaId
    ? recentMediaAssets.find((asset) => asset.id === requestedMediaId) ?? null
    : null;
  const preselectedMediaMessage = requestedMediaId && !preselectedMediaAsset
    ? "That gallery image could not be found. You can choose another image below."
    : null;
  const scheduledPlatformMarkers = (() => {
    const markerMap = new Map<string, Set<SocialPlatform>>();

    for (const row of scheduledPlatformRows) {
      if (!row.scheduledAt) {
        continue;
      }

      const dateKey = getDateKeyForTimezone(row.scheduledAt, timezone);
      const platforms = markerMap.get(dateKey) ?? new Set<SocialPlatform>();
      platforms.add(row.platform);
      markerMap.set(dateKey, platforms);
    }

    return Array.from(markerMap.entries()).map(([dateKey, platforms]) => ({
      dateKey,
      platforms: Array.from(platforms),
    }));
  })();

  if (requestedMediaId) {
    await createAuditLog({
      actorAdminUserId: adminUser.id,
      action: AUDIT_ACTIONS.NEW_POST_OPENED_WITH_PRESELECTED_MEDIA,
      targetType: "MediaAsset",
      targetId: requestedMediaId,
      metadata: {
        mediaAssetId: requestedMediaId,
        resolved: Boolean(preselectedMediaAsset),
      },
    });
  }

  return (
    <section>
      {preselectedMediaMessage ? (
        <section className="composer-feedback-card is-error">
          {preselectedMediaMessage}
        </section>
      ) : null}

      <PostEditorForm
        post={{
          id: "",
          descriptionMain: "",
          descriptionFacebook: "",
          descriptionInstagram: "",
          instagramFirstComment: "",
          descriptionGoogleBusiness: "",
          hashtags: [],
          includeHashtagsInGoogle: false,
          scheduledDate: defaults.date,
          scheduledHour: resolvedHour,
          scheduledMinute: resolvedMinute,
          scheduledMeridiem: resolvedMeridiem,
          status: "DRAFT",
          mediaAssets: preselectedMediaAsset ? [toMediaAssetSummary(preselectedMediaAsset)] : [],
          platforms: [],
          createdFrom: resolvedSearchParams?.createdFrom === "calendar-date" ? "calendar-date" : "",
        }}
        recentMediaAssets={recentMediaAssets.map((asset) => toMediaAssetGallerySummary(asset))}
        timezone={timezone}
        scheduledPlatformMarkers={scheduledPlatformMarkers}
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
      />
    </section>
  );
}
