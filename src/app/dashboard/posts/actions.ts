"use server";

import { Prisma, PublishAttemptStatus, SocialPlatform, SocialPostStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { createAuditLog, AUDIT_ACTIONS } from "@/lib/audit";
import {
  claimFacebookPostForPublishing,
  executeFacebookPublish,
  validateFacebookPublishPrerequisites,
} from "@/lib/facebook";
import {
  claimGooglePostForPublishing,
  executeGooglePublish,
  getGoogleFoundationState,
  validateGooglePublishPrerequisites,
} from "@/lib/google";
import {
  claimInstagramPostForPublishing,
  executeInstagramPublish,
  getInstagramFoundationState,
  validateInstagramPublishPrerequisites,
} from "@/lib/instagram";
import {
  areSelectedPlatformsPublishableNow,
  doSelectedPlatformsRequireMedia,
  getPlatformMediaLimitMessage,
  getRequiredMediaMessageForPlatforms,
  normalizeSelectedPlatforms,
  getMaxMediaCountForPlatforms,
} from "@/lib/platform-rules";
import {
  buildInternalPostTitle,
  canCancelScheduled,
  canDeleteDraft,
  canReturnToDraft,
  isReadOnlyPostStatus,
  validateAndResolveScheduledAt,
} from "@/lib/posts";
import { prisma } from "@/lib/prisma";
import { getRequestMetadata } from "@/lib/http";
import { initialFormState, postFormSchema, type FormState } from "@/lib/validation";

async function createPostAuditLog(input: {
  action: string;
  actorAdminUserId: string;
  targetId: string;
  metadata?: Prisma.InputJsonValue;
}) {
  const { ipAddress, userAgent } = await getRequestMetadata();
  await createAuditLog({
    actorAdminUserId: input.actorAdminUserId,
    action: input.action,
    targetType: "SocialPost",
    targetId: input.targetId,
    ipAddress,
    userAgent,
    metadata: input.metadata,
  });
}

function revalidatePostViews(postId?: string) {
  revalidatePath("/dashboard/calendar");
  revalidatePath("/dashboard");

  if (postId) {
    revalidatePath(`/dashboard/posts/${postId}`);
  }
}

function buildPostDetailHref(
  postId: string,
  input?: { status?: "success" | "error"; message?: string; confirmImmediate?: boolean },
) {
  const params = new URLSearchParams();

  if (input?.status) {
    params.set("status", input.status);
  }

  if (input?.message) {
    params.set("message", input.message);
  }

  if (input?.confirmImmediate) {
    params.set("confirmImmediate", "1");
  }

  const suffix = params.toString();
  return suffix ? `/dashboard/posts/${postId}?${suffix}` : `/dashboard/posts/${postId}`;
}

function buildCalendarHref(input?: { flash?: "draft" | "scheduled" | "published" }) {
  const params = new URLSearchParams();

  if (input?.flash) {
    params.set("flash", input.flash);
  }

  const suffix = params.toString();
  return suffix ? `/dashboard/calendar?${suffix}` : "/dashboard/calendar";
}

async function getExistingPost(postId: string) {
  return prisma.socialPost.findUnique({
    where: { id: postId },
    include: {
      platforms: true,
      mediaAsset: {
        include: {
          variants: true,
        },
      },
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
      createdByAdminUser: {
        select: {
          id: true,
        },
      },
    },
  });
}

function assertPostAccess(
  _adminUser: Awaited<ReturnType<typeof requireAuthenticatedUser>>,
  post: { createdByAdminUserId: string },
) {
  void post;
}

function buildSubmittedPostValues(input: {
  caption?: FormDataEntryValue | string | null;
  scheduledDate?: FormDataEntryValue | string | null;
  scheduledHour?: FormDataEntryValue | string | null;
  scheduledMinute?: FormDataEntryValue | string | null;
  scheduledMeridiem?: FormDataEntryValue | string | null;
  mediaAssetIds?: Array<FormDataEntryValue | string | null>;
  platforms?: Array<FormDataEntryValue | string | null>;
  mediaSelectionSource?: FormDataEntryValue | string | null;
}) {
  return {
    caption: String(input.caption || ""),
    scheduledDate: String(input.scheduledDate || ""),
    scheduledHour: String(input.scheduledHour || "5"),
    scheduledMinute: String(input.scheduledMinute || "00"),
    scheduledMeridiem: String(input.scheduledMeridiem || "PM"),
    mediaAssetIds: (input.mediaAssetIds ?? []).map((value) => String(value || "")).filter(Boolean),
    platforms: normalizeSelectedPlatforms((input.platforms ?? []).map((value) => String(value || ""))),
    mediaSelectionSource: String(input.mediaSelectionSource || ""),
  };
}

async function markImmediatePublishFailure(input: {
  postId: string;
  message: string;
  platform: SocialPlatform;
  requestSummary?: Prisma.InputJsonValue;
}) {
  await prisma.$transaction(async (tx) => {
    const platformRecord = await tx.socialPostPlatform.findUnique({
      where: {
        socialPostId_platform: {
          socialPostId: input.postId,
          platform: input.platform,
        },
      },
      select: {
        id: true,
      },
    });

    await tx.socialPost.update({
      where: {
        id: input.postId,
      },
      data: {
        status: SocialPostStatus.FAILED,
        failureReason: input.message,
      },
    });

    await tx.socialPostPlatform.updateMany({
      where: {
        socialPostId: input.postId,
        platform: input.platform,
      },
      data: {
        status: SocialPostStatus.FAILED,
        lastError: input.message,
      },
    });

    if (platformRecord) {
      await tx.publishAttempt.create({
        data: {
          socialPostId: input.postId,
          socialPostPlatformId: platformRecord.id,
          platform: input.platform,
          status: PublishAttemptStatus.FAILED,
          requestSummary: input.requestSummary,
          errorCode: "PRECHECK_FAILED",
          errorMessage: input.message,
          startedAt: new Date(),
          finishedAt: new Date(),
        },
      });
    }
  });
}

function resolveImmediatePublishPlatform(platforms: SocialPlatform[]) {
  if (platforms.length === 1 && platforms[0] === SocialPlatform.INSTAGRAM) {
    return SocialPlatform.INSTAGRAM;
  }

  if (platforms.length === 1 && platforms[0] === SocialPlatform.GOOGLE_BUSINESS) {
    return SocialPlatform.GOOGLE_BUSINESS;
  }

  return SocialPlatform.FACEBOOK;
}

async function validateImmediatePublishPrerequisites(input: {
  platform: SocialPlatform;
  caption: string;
  primaryMediaAsset: {
    id: string;
    mimeType: string;
    storagePath: string;
    variants?: unknown;
  } | null;
  mediaAssets: Array<{
    id: string;
    mimeType: string;
    storagePath: string;
    variants?: unknown;
  }>;
}) {
  if (input.platform === SocialPlatform.INSTAGRAM) {
    return validateInstagramPublishPrerequisites({
      caption: input.caption,
      mediaAssets: input.mediaAssets,
    });
  }

  if (input.platform === SocialPlatform.GOOGLE_BUSINESS) {
    return validateGooglePublishPrerequisites({
      caption: input.caption,
      mediaAsset: input.primaryMediaAsset,
    });
  }

  return validateFacebookPublishPrerequisites({
    caption: input.caption,
    mediaAsset: input.primaryMediaAsset,
  });
}

async function claimImmediatePublish(input: {
  platform: SocialPlatform;
  socialPostId: string;
  allowedStatuses: SocialPostStatus[];
}) {
  if (input.platform === SocialPlatform.INSTAGRAM) {
    return claimInstagramPostForPublishing(input);
  }

  if (input.platform === SocialPlatform.GOOGLE_BUSINESS) {
    return claimGooglePostForPublishing(input);
  }

  return claimFacebookPostForPublishing(input);
}

async function executeImmediatePublish(input: {
  platform: SocialPlatform;
  socialPostId: string;
  socialPostPlatformId: string;
}) {
  if (input.platform === SocialPlatform.INSTAGRAM) {
    return executeInstagramPublish(input);
  }

  if (input.platform === SocialPlatform.GOOGLE_BUSINESS) {
    return executeGooglePublish(input);
  }

  return executeFacebookPublish(input);
}

function getDraftRedirectTarget(postId: string, scheduledAt: Date | null) {
  if (scheduledAt) {
    return buildCalendarHref({ flash: "draft" });
  }

  return buildPostDetailHref(postId, {
    status: "success",
    message: "Draft saved successfully.",
  });
}

export async function savePostAction(_: FormState, formData: FormData): Promise<FormState> {
  const adminUser = await requireAuthenticatedUser();
  const submittedValues = buildSubmittedPostValues({
    caption: formData.get("caption"),
    scheduledDate: formData.get("scheduledDate"),
    scheduledHour: formData.get("scheduledHour"),
    scheduledMinute: formData.get("scheduledMinute"),
    scheduledMeridiem: formData.get("scheduledMeridiem"),
    mediaAssetIds: formData.getAll("mediaAssetIds"),
    platforms: formData.getAll("platforms"),
    mediaSelectionSource: formData.get("mediaSelectionSource"),
  });
  const parsed = postFormSchema.safeParse({
    postId: formData.get("postId"),
    mediaAssetIds: formData.getAll("mediaAssetIds"),
    caption: formData.get("caption"),
    scheduledDate: formData.get("scheduledDate"),
    scheduledHour: formData.get("scheduledHour"),
    scheduledMinute: formData.get("scheduledMinute"),
    scheduledMeridiem: formData.get("scheduledMeridiem"),
    platforms: formData.getAll("platforms"),
    intent: formData.get("intent"),
  });

  if (!parsed.success) {
    return {
      ...initialFormState,
      message: "Fix the highlighted fields and try again.",
      fieldErrors: parsed.error.flatten().fieldErrors,
      submittedValues,
    };
  }

  try {
    const isImmediatePublish = parsed.data.intent === "publish";
    const { scheduledAt, timezone } = await validateAndResolveScheduledAt({
      intent: parsed.data.intent,
      scheduledDate: parsed.data.scheduledDate,
      scheduledHour: parsed.data.scheduledHour,
      scheduledMinute: parsed.data.scheduledMinute,
      scheduledMeridiem: parsed.data.scheduledMeridiem,
    });
    const effectiveScheduledAt = isImmediatePublish ? new Date() : scheduledAt;

    const nextStatus =
      parsed.data.intent === "schedule" ? SocialPostStatus.SCHEDULED : SocialPostStatus.DRAFT;
    const selectedMediaAssets = parsed.data.mediaAssetIds.length
      ? await prisma.mediaAsset.findMany({
          where: {
            id: {
              in: parsed.data.mediaAssetIds,
            },
          },
          include: {
            variants: true,
          },
        })
      : [];
    const selectedMediaAssetMap = new Map(selectedMediaAssets.map((asset) => [asset.id, asset]));
    const orderedSelectedMediaAssets = parsed.data.mediaAssetIds
      .map((mediaAssetId) => selectedMediaAssetMap.get(mediaAssetId) ?? null)
      .filter((asset): asset is NonNullable<(typeof selectedMediaAssets)[number]> => asset !== null);
    // TODO: Publish every attached image when Facebook multi-photo publishing is implemented.
    const primaryMediaAsset = orderedSelectedMediaAssets[0] ?? null;

    if (parsed.data.mediaAssetIds.length !== orderedSelectedMediaAssets.length) {
      return {
        ...initialFormState,
        message: "Choose valid uploaded media assets before saving.",
        submittedValues,
      };
    }

    const maxMediaCount = getMaxMediaCountForPlatforms(parsed.data.platforms);
    if (orderedSelectedMediaAssets.length > maxMediaCount) {
      const message = getPlatformMediaLimitMessage(parsed.data.platforms);
      if (submittedValues.mediaSelectionSource === "gallery") {
        await createPostAuditLog({
          actorAdminUserId: adminUser.id,
          action: AUDIT_ACTIONS.POST_MEDIA_SELECTION_REJECTED,
          targetId: parsed.data.postId || "new",
          metadata: {
            rejected: true,
            reason: "PLATFORM_MEDIA_LIMIT",
            source: "gallery",
            selectedMediaAssetIds: submittedValues.mediaAssetIds,
            platforms: parsed.data.platforms,
          },
        }).catch(() => undefined);
      }

      return {
        ...initialFormState,
        message,
        fieldErrors: {
          mediaAssetIds: [message],
        },
        submittedValues,
      };
    }

    if (doSelectedPlatformsRequireMedia(parsed.data.platforms) && orderedSelectedMediaAssets.length === 0) {
      const message = getRequiredMediaMessageForPlatforms(parsed.data.platforms);
      return {
        ...initialFormState,
        message,
        fieldErrors: {
          mediaAssetIds: [message],
        },
        submittedValues,
      };
    }

    if (parsed.data.platforms.includes(SocialPlatform.INSTAGRAM)) {
      const instagramFoundation = await getInstagramFoundationState({ refreshHealth: true });
      if (instagramFoundation.status !== "READY") {
        return {
          ...initialFormState,
          message: instagramFoundation.message,
          fieldErrors: {
            platforms: [instagramFoundation.message],
          },
          submittedValues,
        };
      }
    }

    if (parsed.data.platforms.includes(SocialPlatform.GOOGLE_BUSINESS)) {
      const googleFoundation = await getGoogleFoundationState({ refreshHealth: true });
      if (googleFoundation.status !== "READY") {
        return {
          ...initialFormState,
          message: googleFoundation.message,
          fieldErrors: {
            platforms: [googleFoundation.message],
          },
          submittedValues,
        };
      }
    }

    if (parsed.data.intent === "schedule" && !areSelectedPlatformsPublishableNow(parsed.data.platforms, "schedule")) {
      return {
        ...initialFormState,
        message: "Scheduling currently supports Facebook-only or Google-only posts. Remove other platforms before scheduling.",
        fieldErrors: {
          platforms: ["Scheduling currently supports Facebook-only or Google-only posts. Remove other platforms before scheduling."],
        },
        submittedValues,
      };
    }

    if (parsed.data.intent === "publish" && !areSelectedPlatformsPublishableNow(parsed.data.platforms, "publish")) {
      return {
        ...initialFormState,
        message: "Post Now currently supports single-platform Facebook, Instagram, or Google posts. Remove extra platforms before publishing.",
        fieldErrors: {
          platforms: ["Post Now currently supports single-platform Facebook, Instagram, or Google posts. Remove extra platforms before publishing."],
        },
        submittedValues,
      };
    }

    const post = await prisma.$transaction(async (tx) => {
      const data = {
        internalTitle: buildInternalPostTitle(parsed.data.caption),
        caption: parsed.data.caption,
        status: nextStatus,
        scheduledAt: effectiveScheduledAt,
        failureReason: null,
        mediaAssetId: primaryMediaAsset?.id ?? null,
        updatedByAdminUserId: adminUser.id,
      };

      let savedPost;
      let previousMediaAssetIds: string[] = [];
      let previousStatus: SocialPostStatus | null = null;
      let previousScheduledAt: Date | null = null;
      let previousPlatforms: SocialPlatform[] = [];

      if (parsed.data.postId) {
        const existingPost = await tx.socialPost.findUnique({
          where: { id: parsed.data.postId },
          include: {
            attachedMedia: {
              orderBy: {
                position: "asc",
              },
              select: {
                mediaAssetId: true,
              },
            },
            platforms: {
              select: {
                platform: true,
              },
            },
          },
        });

        if (!existingPost) {
          throw new Error("Post not found.");
        }

        assertPostAccess(adminUser, existingPost);

        if (isReadOnlyPostStatus(existingPost.status)) {
          throw new Error("Publishing and published posts are read-only.");
        }

        previousMediaAssetIds = existingPost.attachedMedia.map((item) => item.mediaAssetId);
        previousStatus = existingPost.status;
        previousScheduledAt = existingPost.scheduledAt;
        previousPlatforms = existingPost.platforms.map((platform) => platform.platform);

        savedPost = await tx.socialPost.update({
          where: { id: parsed.data.postId },
          data,
        });
      } else {
        savedPost = await tx.socialPost.create({
          data: {
            ...data,
            createdByAdminUserId: adminUser.id,
          },
        });
      }

      await tx.socialPostMediaAsset.deleteMany({
        where: {
          socialPostId: savedPost.id,
        },
      });

      if (orderedSelectedMediaAssets.length > 0) {
        await tx.socialPostMediaAsset.createMany({
          data: orderedSelectedMediaAssets.map((asset, index) => ({
            socialPostId: savedPost.id,
            mediaAssetId: asset.id,
            position: index,
          })),
        });
      }

      await tx.socialPostPlatform.deleteMany({
        where: {
          socialPostId: savedPost.id,
          platform: {
            notIn: parsed.data.platforms,
          },
        },
      });

      for (const platform of parsed.data.platforms) {
        await tx.socialPostPlatform.upsert({
          where: {
            socialPostId_platform: {
              socialPostId: savedPost.id,
              platform,
            },
          },
          update: {
            status: nextStatus,
            scheduledAt: effectiveScheduledAt,
            ...((platform === SocialPlatform.FACEBOOK || platform === SocialPlatform.GOOGLE_BUSINESS)
              ? {
                  publishedAt: null,
                  platformPostId: null,
                  platformPostUrl: null,
                  lastError: null,
                }
              : platform === SocialPlatform.INSTAGRAM
                ? {
                    // TODO: reset Instagram publish placeholders when real publish support lands.
                    publishedAt: null,
                    platformPostId: null,
                    platformPostUrl: null,
                    lastError: null,
                  }
              : {}),
          },
          create: {
            socialPostId: savedPost.id,
            platform,
            status: nextStatus,
            scheduledAt: effectiveScheduledAt,
          },
        });
      }

      return {
        post: savedPost,
        previousMediaAssetIds,
        previousStatus,
        previousScheduledAt,
        previousPlatforms,
      };
    });

    await createPostAuditLog({
      actorAdminUserId: adminUser.id,
      action: parsed.data.postId ? AUDIT_ACTIONS.POST_UPDATED : AUDIT_ACTIONS.POST_CREATED,
      targetId: post.post.id,
      metadata: {
        status: nextStatus,
        platforms: parsed.data.platforms,
        createdFrom:
          String(formData.get("createdFrom") || "") === "calendar-date"
            ? "calendar-date"
            : "standard",
      },
    });

    if (!parsed.data.postId && String(formData.get("createdFrom") || "") === "calendar-date") {
      await createPostAuditLog({
        actorAdminUserId: adminUser.id,
        action: AUDIT_ACTIONS.POST_CREATED_FROM_CALENDAR_DATE,
        targetId: post.post.id,
        metadata: {
          scheduledAt: effectiveScheduledAt?.toISOString() ?? null,
          timezone,
          platforms: parsed.data.platforms,
        },
      });
    }

    if (parsed.data.intent === "schedule" || parsed.data.intent === "draft") {
      await createPostAuditLog({
        actorAdminUserId: adminUser.id,
        action: parsed.data.intent === "schedule" ? AUDIT_ACTIONS.POST_SCHEDULED : AUDIT_ACTIONS.DRAFT_SAVED,
        targetId: post.post.id,
        metadata: {
          status: nextStatus,
          scheduledAt: effectiveScheduledAt?.toISOString() ?? null,
          timezone,
        },
      });
    }

    if (
      JSON.stringify(post.previousMediaAssetIds) !== JSON.stringify(parsed.data.mediaAssetIds)
    ) {
      const removedMediaAssetIds = post.previousMediaAssetIds.filter(
        (mediaAssetId) => !parsed.data.mediaAssetIds.includes(mediaAssetId),
      );
      const addedMediaAssetIds = parsed.data.mediaAssetIds.filter(
        (mediaAssetId) => !post.previousMediaAssetIds.includes(mediaAssetId),
      );

      await createPostAuditLog({
        actorAdminUserId: adminUser.id,
        action:
          post.previousMediaAssetIds.length > 0 && parsed.data.mediaAssetIds.length === 0
            ? AUDIT_ACTIONS.POST_MEDIA_CLEARED
            : AUDIT_ACTIONS.POST_MEDIA_CHANGED,
        targetId: post.post.id,
        metadata: {
          previousMediaAssetIds: post.previousMediaAssetIds,
          nextMediaAssetIds: parsed.data.mediaAssetIds,
          source: submittedValues.mediaSelectionSource || null,
        },
      });

      if (removedMediaAssetIds.length > 0) {
        await createPostAuditLog({
          actorAdminUserId: adminUser.id,
          action: AUDIT_ACTIONS.POST_MEDIA_REMOVED,
          targetId: post.post.id,
          metadata: {
            removedMediaAssetIds,
            remainingMediaAssetIds: parsed.data.mediaAssetIds,
          },
        });
      }

      if (
        submittedValues.mediaSelectionSource === "gallery" &&
        addedMediaAssetIds.length > 0
      ) {
        await createPostAuditLog({
          actorAdminUserId: adminUser.id,
          action: AUDIT_ACTIONS.POST_MEDIA_ATTACHED_FROM_GALLERY,
          targetId: post.post.id,
          metadata: {
            addedMediaAssetIds,
            nextMediaAssetIds: parsed.data.mediaAssetIds,
          },
        });
      }
    }

    if (JSON.stringify(post.previousPlatforms) !== JSON.stringify(parsed.data.platforms)) {
      await createPostAuditLog({
        actorAdminUserId: adminUser.id,
        action: AUDIT_ACTIONS.POST_UPDATED,
        targetId: post.post.id,
        metadata: {
          previousPlatforms: post.previousPlatforms,
          nextPlatforms: parsed.data.platforms,
        },
      });
    }

    if ((post.previousStatus ?? null) !== nextStatus) {
      await createPostAuditLog({
        actorAdminUserId: adminUser.id,
        action: AUDIT_ACTIONS.POST_STATUS_CHANGED,
        targetId: post.post.id,
        metadata: {
          previousStatus: post.previousStatus,
          nextStatus,
        },
      });
    }

    if ((post.previousScheduledAt?.toISOString() ?? null) !== (effectiveScheduledAt?.toISOString() ?? null)) {
      await createPostAuditLog({
        actorAdminUserId: adminUser.id,
        action: AUDIT_ACTIONS.POST_CALENDAR_DATETIME_CHANGED,
        targetId: post.post.id,
        metadata: {
          previousScheduledAt: post.previousScheduledAt?.toISOString() ?? null,
          nextScheduledAt: effectiveScheduledAt?.toISOString() ?? null,
          status: nextStatus,
          timezone,
        },
      });
    }

    if (!isImmediatePublish) {
      revalidatePostViews(post.post.id);

      if (parsed.data.intent === "schedule") {
        redirect(buildCalendarHref({ flash: "scheduled" }));
      }

      redirect(getDraftRedirectTarget(post.post.id, effectiveScheduledAt));
    }

    const immediatePlatform = resolveImmediatePublishPlatform(parsed.data.platforms);

    await createPostAuditLog({
      actorAdminUserId: adminUser.id,
      action:
        post.previousStatus === SocialPostStatus.FAILED
          ? AUDIT_ACTIONS.POST_PUBLISH_RETRY_REQUESTED
          : AUDIT_ACTIONS.POST_PUBLISH_MANUAL_REQUESTED,
      targetId: post.post.id,
      metadata: {
        previousStatus: post.previousStatus ?? nextStatus,
        requestedStatus: SocialPostStatus.PUBLISHING,
        mode: "manual-form",
        platform: immediatePlatform,
      },
    });

    try {
      await validateImmediatePublishPrerequisites({
        platform: immediatePlatform,
        caption: parsed.data.caption,
        primaryMediaAsset,
        mediaAssets: orderedSelectedMediaAssets,
      });
    } catch (error) {
      unstable_rethrow(error);
      const message =
        error instanceof Error
          ? error.message
          : immediatePlatform === SocialPlatform.INSTAGRAM
            ? "Instagram publishing prerequisites are not met."
            : immediatePlatform === SocialPlatform.GOOGLE_BUSINESS
              ? "Google Business publishing prerequisites are not met."
              : "Facebook publishing prerequisites are not met.";

      await markImmediatePublishFailure({
        postId: post.post.id,
        message,
        platform: immediatePlatform,
      });

      await createPostAuditLog({
        actorAdminUserId: adminUser.id,
        action: AUDIT_ACTIONS.POST_PUBLISH_FAILED,
        targetId: post.post.id,
        metadata: {
          previousStatus: nextStatus,
          nextStatus: SocialPostStatus.FAILED,
          mode: "manual-form",
          platform: immediatePlatform,
          message,
        },
      });

      await createPostAuditLog({
        actorAdminUserId: adminUser.id,
        action: AUDIT_ACTIONS.POST_STATUS_CHANGED,
        targetId: post.post.id,
        metadata: {
          previousStatus: nextStatus,
          nextStatus: SocialPostStatus.FAILED,
          mode: "manual-form",
        },
      });

      revalidatePostViews(post.post.id);
      redirect(
        buildPostDetailHref(post.post.id, {
          status: "error",
          message,
        }),
      );
    }

    const claim = await claimImmediatePublish({
      platform: immediatePlatform,
      socialPostId: post.post.id,
      allowedStatuses: [SocialPostStatus.DRAFT, SocialPostStatus.SCHEDULED, SocialPostStatus.FAILED],
    });

    if (!claim.ok) {
      await markImmediatePublishFailure({
        postId: post.post.id,
        message: claim.message,
        platform: immediatePlatform,
      });

      await createPostAuditLog({
        actorAdminUserId: adminUser.id,
        action: AUDIT_ACTIONS.POST_PUBLISH_FAILED,
        targetId: post.post.id,
        metadata: {
          previousStatus: nextStatus,
          nextStatus: SocialPostStatus.FAILED,
          mode: "manual-form",
          platform: immediatePlatform,
          message: claim.message,
        },
      });

      await createPostAuditLog({
        actorAdminUserId: adminUser.id,
        action: AUDIT_ACTIONS.POST_STATUS_CHANGED,
        targetId: post.post.id,
        metadata: {
          previousStatus: nextStatus,
          nextStatus: SocialPostStatus.FAILED,
          mode: "manual-form",
        },
      });

      revalidatePostViews(post.post.id);
      redirect(
        buildPostDetailHref(post.post.id, {
          status: "error",
          message: claim.message,
        }),
      );
    }

    await createPostAuditLog({
      actorAdminUserId: adminUser.id,
      action: AUDIT_ACTIONS.POST_PUBLISH_STARTED,
      targetId: post.post.id,
      metadata: {
        previousStatus: nextStatus,
        nextStatus: SocialPostStatus.PUBLISHING,
        mode: "manual-form",
        platform: immediatePlatform,
      },
    });

    await createPostAuditLog({
      actorAdminUserId: adminUser.id,
      action: AUDIT_ACTIONS.POST_STATUS_CHANGED,
      targetId: post.post.id,
      metadata: {
        previousStatus: nextStatus,
        nextStatus: SocialPostStatus.PUBLISHING,
        mode: "manual-form",
      },
    });

    try {
      const result = await executeImmediatePublish({
        platform: immediatePlatform,
        socialPostId: claim.socialPostId,
        socialPostPlatformId: claim.socialPostPlatformId,
      });

      await createPostAuditLog({
        actorAdminUserId: adminUser.id,
        action: AUDIT_ACTIONS.POST_PUBLISH_SUCCEEDED,
        targetId: post.post.id,
        metadata: {
          previousStatus: SocialPostStatus.PUBLISHING,
          nextStatus: SocialPostStatus.PUBLISHED,
          mode: "manual-form",
          publishedAt: result.finishedAt.toISOString(),
          platform: immediatePlatform,
          platformPostId: result.result.platformPostId,
          platformPostUrl: result.result.platformPostUrl,
        },
      });

      await createPostAuditLog({
        actorAdminUserId: adminUser.id,
        action: AUDIT_ACTIONS.POST_STATUS_CHANGED,
        targetId: post.post.id,
        metadata: {
          previousStatus: SocialPostStatus.PUBLISHING,
          nextStatus: SocialPostStatus.PUBLISHED,
          mode: "manual-form",
        },
      });

      revalidatePostViews(post.post.id);
      redirect(buildCalendarHref({ flash: "published" }));
    } catch (error) {
      unstable_rethrow(error);
      const message =
        error instanceof Error
          ? error.message
          : immediatePlatform === SocialPlatform.INSTAGRAM
            ? "Instagram publishing failed."
            : immediatePlatform === SocialPlatform.GOOGLE_BUSINESS
              ? "Google Business publishing failed."
              : "Facebook publishing failed.";

      await createPostAuditLog({
        actorAdminUserId: adminUser.id,
        action: AUDIT_ACTIONS.POST_PUBLISH_FAILED,
        targetId: post.post.id,
        metadata: {
          previousStatus: SocialPostStatus.PUBLISHING,
          nextStatus: SocialPostStatus.FAILED,
          mode: "manual-form",
          platform: immediatePlatform,
          message,
        },
      });

      await createPostAuditLog({
        actorAdminUserId: adminUser.id,
        action: AUDIT_ACTIONS.POST_STATUS_CHANGED,
        targetId: post.post.id,
        metadata: {
          previousStatus: SocialPostStatus.PUBLISHING,
          nextStatus: SocialPostStatus.FAILED,
          mode: "manual-form",
        },
      });

      revalidatePostViews(post.post.id);
      redirect(
        buildPostDetailHref(post.post.id, {
          status: "error",
          message,
        }),
      );
    }
  } catch (error) {
    unstable_rethrow(error);
    const message = error instanceof Error ? error.message : "Could not save the post.";
    return {
      ...initialFormState,
      message,
      submittedValues,
    };
  }
}

export async function deleteDraftPostAction(formData: FormData) {
  const adminUser = await requireAuthenticatedUser();
  const postId = String(formData.get("postId") || "");
  const post = await getExistingPost(postId);

  if (!post) {
    throw new Error("Post not found.");
  }

  assertPostAccess(adminUser, post);

  if (!canDeleteDraft(post.status)) {
    throw new Error("Only draft posts can be deleted.");
  }

  await prisma.socialPost.delete({
    where: { id: post.id },
  });

  await createPostAuditLog({
    actorAdminUserId: adminUser.id,
    action: AUDIT_ACTIONS.POST_DELETED,
    targetId: post.id,
    metadata: {
      previousStatus: post.status,
    },
  });

  revalidatePostViews(post.id);
  redirect("/dashboard/calendar");
}

export async function cancelScheduledPostAction(formData: FormData) {
  const adminUser = await requireAuthenticatedUser();
  const postId = String(formData.get("postId") || "");
  const post = await getExistingPost(postId);

  if (!post) {
    throw new Error("Post not found.");
  }

  assertPostAccess(adminUser, post);

  if (!canCancelScheduled(post.status)) {
    throw new Error("Only scheduled posts can be cancelled.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.socialPost.update({
      where: { id: post.id },
      data: {
        status: SocialPostStatus.CANCELLED,
        updatedByAdminUserId: adminUser.id,
      },
    });

    await tx.socialPostPlatform.updateMany({
      where: { socialPostId: post.id },
      data: {
        status: SocialPostStatus.CANCELLED,
      },
    });
  });

  await createPostAuditLog({
    actorAdminUserId: adminUser.id,
    action: AUDIT_ACTIONS.POST_CANCELLED,
    targetId: post.id,
    metadata: {
      previousStatus: post.status,
      nextStatus: SocialPostStatus.CANCELLED,
    },
  });

  await createPostAuditLog({
    actorAdminUserId: adminUser.id,
    action: AUDIT_ACTIONS.POST_STATUS_CHANGED,
    targetId: post.id,
    metadata: {
      previousStatus: post.status,
      nextStatus: SocialPostStatus.CANCELLED,
    },
  });

  revalidatePostViews(post.id);
  redirect(`/dashboard/posts/${post.id}`);
}

export async function returnPostToDraftAction(formData: FormData) {
  const adminUser = await requireAuthenticatedUser();
  const postId = String(formData.get("postId") || "");
  const post = await getExistingPost(postId);

  if (!post) {
    throw new Error("Post not found.");
  }

  assertPostAccess(adminUser, post);

  if (!canReturnToDraft(post.status)) {
    throw new Error("This post cannot be returned to draft.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.socialPost.update({
      where: { id: post.id },
      data: {
        status: SocialPostStatus.DRAFT,
        updatedByAdminUserId: adminUser.id,
      },
    });

    await tx.socialPostPlatform.updateMany({
      where: { socialPostId: post.id },
      data: {
        status: SocialPostStatus.DRAFT,
        scheduledAt: post.scheduledAt,
      },
    });
  });

  await createPostAuditLog({
    actorAdminUserId: adminUser.id,
    action: AUDIT_ACTIONS.POST_RETURNED_TO_DRAFT,
    targetId: post.id,
    metadata: {
      previousStatus: post.status,
      nextStatus: SocialPostStatus.DRAFT,
    },
  });

  await createPostAuditLog({
    actorAdminUserId: adminUser.id,
    action: AUDIT_ACTIONS.POST_STATUS_CHANGED,
    targetId: post.id,
    metadata: {
      previousStatus: post.status,
      nextStatus: SocialPostStatus.DRAFT,
    },
  });

  revalidatePostViews(post.id);
  redirect(post.scheduledAt ? "/dashboard/calendar" : `/dashboard/posts/${post.id}`);
}

export async function publishPostNowAction(formData: FormData) {
  const adminUser = await requireAuthenticatedUser();
  const postId = String(formData.get("postId") || "");
  const confirmImmediate = String(formData.get("confirmImmediate") || "") === "1";
  const existingPost = await getExistingPost(postId);

  if (!existingPost) {
    throw new Error("Post not found.");
  }

  assertPostAccess(adminUser, existingPost);

  const allowedStatuses: SocialPostStatus[] = [
    SocialPostStatus.DRAFT,
    SocialPostStatus.SCHEDULED,
    SocialPostStatus.FAILED,
  ];
  if (!allowedStatuses.includes(existingPost.status)) {
    redirect(
      buildPostDetailHref(postId, {
        status: "error",
        message: "Only draft, scheduled, or failed posts can be published manually.",
      }),
    );
  }

  if (existingPost.status === SocialPostStatus.SCHEDULED && existingPost.scheduledAt && existingPost.scheduledAt > new Date() && !confirmImmediate) {
    redirect(
      buildPostDetailHref(postId, {
        status: "error",
        message: "This post is scheduled for the future. Confirm Post Now to publish immediately instead.",
        confirmImmediate: true,
      }),
    );
  }

  const platforms = existingPost.platforms.map((platformRecord) => platformRecord.platform);
  if (!areSelectedPlatformsPublishableNow(platforms, "publish")) {
    redirect(
      buildPostDetailHref(postId, {
        status: "error",
        message: "Post Now currently supports Facebook or Instagram only. Remove other platforms before publishing.",
      }),
    );
  }

  const immediatePlatform = resolveImmediatePublishPlatform(platforms);
  const publishNowAt = new Date();
  if ((existingPost.scheduledAt?.toISOString() ?? null) !== publishNowAt.toISOString()) {
    await prisma.$transaction(async (tx) => {
      await tx.socialPost.update({
        where: { id: existingPost.id },
        data: {
          scheduledAt: publishNowAt,
          updatedByAdminUserId: adminUser.id,
        },
      });

      await tx.socialPostPlatform.updateMany({
        where: {
          socialPostId: existingPost.id,
          platform: immediatePlatform,
        },
        data: {
          scheduledAt: publishNowAt,
        },
      });
    });

    await createPostAuditLog({
      actorAdminUserId: adminUser.id,
      action: AUDIT_ACTIONS.POST_CALENDAR_DATETIME_CHANGED,
      targetId: existingPost.id,
      metadata: {
        previousScheduledAt: existingPost.scheduledAt?.toISOString() ?? null,
        nextScheduledAt: publishNowAt.toISOString(),
        mode: "manual",
      },
    });
  }

  try {
    await validateImmediatePublishPrerequisites({
      platform: immediatePlatform,
      caption: existingPost.caption,
      primaryMediaAsset: existingPost.mediaAsset,
      mediaAssets: existingPost.attachedMedia.map((item) => item.mediaAsset),
    });
  } catch (error) {
    unstable_rethrow(error);
    const message =
      error instanceof Error
        ? error.message
        : immediatePlatform === SocialPlatform.INSTAGRAM
          ? "Instagram publishing prerequisites are not met."
          : "Facebook publishing prerequisites are not met.";

    await markImmediatePublishFailure({
      postId,
      message,
      platform: immediatePlatform,
    });

    await createPostAuditLog({
      actorAdminUserId: adminUser.id,
      action: AUDIT_ACTIONS.POST_PUBLISH_FAILED,
      targetId: postId,
      metadata: {
        previousStatus: existingPost.status,
        nextStatus: SocialPostStatus.FAILED,
        mode: "manual",
        platform: immediatePlatform,
        message,
      },
    });

    await createPostAuditLog({
      actorAdminUserId: adminUser.id,
      action: AUDIT_ACTIONS.POST_STATUS_CHANGED,
      targetId: postId,
      metadata: {
        previousStatus: existingPost.status,
        nextStatus: SocialPostStatus.FAILED,
        mode: "manual",
      },
    });

    revalidatePostViews(postId);
    redirect(
      buildPostDetailHref(postId, {
        status: "error",
        message,
      }),
    );
  }

  const claim = await claimImmediatePublish({
    platform: immediatePlatform,
    socialPostId: postId,
    allowedStatuses,
  });

  if (!claim.ok) {
    revalidatePostViews(postId);
    redirect(
      buildPostDetailHref(postId, {
        status: "error",
        message: claim.message,
      }),
    );
  }

  await createPostAuditLog({
    actorAdminUserId: adminUser.id,
    action:
      existingPost.status === SocialPostStatus.FAILED
        ? AUDIT_ACTIONS.POST_PUBLISH_RETRY_REQUESTED
        : AUDIT_ACTIONS.POST_PUBLISH_MANUAL_REQUESTED,
    targetId: postId,
    metadata: {
      previousStatus: existingPost.status,
      requestedStatus: SocialPostStatus.PUBLISHING,
      mode: "manual",
      platform: immediatePlatform,
      confirmImmediate,
    },
  });

  await createPostAuditLog({
    actorAdminUserId: adminUser.id,
    action: AUDIT_ACTIONS.POST_PUBLISH_STARTED,
    targetId: postId,
    metadata: {
      previousStatus: existingPost.status,
      nextStatus: SocialPostStatus.PUBLISHING,
      mode: "manual",
      platform: immediatePlatform,
    },
  });

  await createPostAuditLog({
    actorAdminUserId: adminUser.id,
    action: AUDIT_ACTIONS.POST_STATUS_CHANGED,
    targetId: postId,
    metadata: {
      previousStatus: existingPost.status,
      nextStatus: SocialPostStatus.PUBLISHING,
      mode: "manual",
    },
  });

  try {
    const result = await executeImmediatePublish({
      platform: immediatePlatform,
      socialPostId: claim.socialPostId,
      socialPostPlatformId: claim.socialPostPlatformId,
    });

    await createPostAuditLog({
      actorAdminUserId: adminUser.id,
      action: AUDIT_ACTIONS.POST_PUBLISH_SUCCEEDED,
      targetId: postId,
      metadata: {
        previousStatus: SocialPostStatus.PUBLISHING,
        nextStatus: SocialPostStatus.PUBLISHED,
        mode: "manual",
        publishedAt: result.finishedAt.toISOString(),
        platform: immediatePlatform,
        platformPostId: result.result.platformPostId,
        platformPostUrl: result.result.platformPostUrl,
      },
    });

    await createPostAuditLog({
      actorAdminUserId: adminUser.id,
      action: AUDIT_ACTIONS.POST_STATUS_CHANGED,
      targetId: postId,
      metadata: {
        previousStatus: SocialPostStatus.PUBLISHING,
        nextStatus: SocialPostStatus.PUBLISHED,
        mode: "manual",
      },
    });

    revalidatePostViews(postId);
    redirect(buildCalendarHref({ flash: "published" }));
  } catch (error) {
    unstable_rethrow(error);
    const message =
      error instanceof Error
        ? error.message
        : immediatePlatform === SocialPlatform.INSTAGRAM
          ? "Instagram publishing failed."
          : "Facebook publishing failed.";

    await createPostAuditLog({
      actorAdminUserId: adminUser.id,
      action: AUDIT_ACTIONS.POST_PUBLISH_FAILED,
      targetId: postId,
      metadata: {
        previousStatus: SocialPostStatus.PUBLISHING,
        nextStatus: SocialPostStatus.FAILED,
        mode: "manual",
        platform: immediatePlatform,
        message,
      },
    });

    await createPostAuditLog({
      actorAdminUserId: adminUser.id,
      action: AUDIT_ACTIONS.POST_STATUS_CHANGED,
      targetId: postId,
      metadata: {
        previousStatus: SocialPostStatus.PUBLISHING,
        nextStatus: SocialPostStatus.FAILED,
        mode: "manual",
      },
    });

    revalidatePostViews(postId);
    redirect(
      buildPostDetailHref(postId, {
        status: "error",
        message,
      }),
    );
  }
}
