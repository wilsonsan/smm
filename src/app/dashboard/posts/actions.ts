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
  isMetaInstagramEnabled,
  META_INSTAGRAM_REMOVE_AND_RETRY_MESSAGE,
} from "@/lib/meta-instagram-capability";
import {
  areSelectedPlatformsPublishableNow,
  doSelectedPlatformsRequireMedia,
  getCaptionRuleForPlatform,
  getPlatformMediaLimitMessage,
  getRequiredMediaMessageForPlatforms,
  normalizeSelectedPlatforms,
  getMaxMediaCountForPlatforms,
} from "@/lib/platform-rules";
import {
  DEFAULT_FACEBOOK_HASHTAG_LIMIT,
  normalizeHashtagList,
  type HashtagSettings,
} from "@/lib/hashtags";
import {
  buildInternalPostTitle,
  canCancelScheduled,
  canDeleteDraft,
  canReturnToDraft,
  getEffectivePostDescription,
  getFallbackPostDescriptionPreview,
  getNormalizedPostHashtags,
  isReadOnlyPostStatus,
  resolveRenderedInstagramFirstComment,
  resolveRenderedPostDescription,
  resolveRenderedPlatformContent,
  type PostDescriptionValues,
  validateAndResolveScheduledAt,
} from "@/lib/posts";
import { createOrUpdatePlatformPublishFailedNotification } from "@/lib/notifications";
import { syncSocialPostAggregateState } from "@/lib/publish-state";
import { prisma } from "@/lib/prisma";
import { getRequestMetadata } from "@/lib/http";
import { RATE_LIMITS, type RateLimitDefinition } from "@/lib/rate-limit/config";
import { enforceRateLimit, isRateLimitExceededError } from "@/lib/rate-limit";
import { initialFormState, postFormSchema, type FormState } from "@/lib/validation";
import { formatTemplateVariableTokens, type TemplateVariableValueMap } from "@/lib/template-variables";
import { getBusinessVariableSettings, getHashtagSettings } from "@/lib/settings";

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

async function enforcePostActionRateLimit(
  definition: RateLimitDefinition,
  adminUserId: string,
  attemptedAction: string,
) {
  const { ipAddress, userAgent } = await getRequestMetadata();
  await enforceRateLimit(definition, {
    actorAdminUserId: adminUserId,
    userId: adminUserId,
    ipAddress,
    userAgent,
    endpoint: "/dashboard/posts",
    method: "SERVER_ACTION",
    attemptedAction,
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
  descriptionMain?: FormDataEntryValue | string | null;
  descriptionFacebook?: FormDataEntryValue | string | null;
  descriptionInstagram?: FormDataEntryValue | string | null;
  instagramFirstComment?: FormDataEntryValue | string | null;
  descriptionGoogleBusiness?: FormDataEntryValue | string | null;
  hashtags?: Array<FormDataEntryValue | string | null>;
  includeHashtagsInGoogle?: FormDataEntryValue | string | null;
  appliedHashtagGroups?: Array<FormDataEntryValue | string | null>;
  scheduledDate?: FormDataEntryValue | string | null;
  scheduledHour?: FormDataEntryValue | string | null;
  scheduledMinute?: FormDataEntryValue | string | null;
  scheduledMeridiem?: FormDataEntryValue | string | null;
  mediaAssetIds?: Array<FormDataEntryValue | string | null>;
  platforms?: Array<FormDataEntryValue | string | null>;
  mediaSelectionSource?: FormDataEntryValue | string | null;
}) {
  return {
    descriptionMain: String(input.descriptionMain || ""),
    descriptionFacebook: String(input.descriptionFacebook || ""),
    descriptionInstagram: String(input.descriptionInstagram || ""),
    instagramFirstComment: String(input.instagramFirstComment || ""),
    descriptionGoogleBusiness: String(input.descriptionGoogleBusiness || ""),
    hashtags: normalizeHashtagList((input.hashtags ?? []).map((value) => String(value || ""))),
    includeHashtagsInGoogle: String(input.includeHashtagsInGoogle || "") === "on",
    appliedHashtagGroups: [...new Set((input.appliedHashtagGroups ?? []).map((value) => String(value || "")).filter(Boolean))],
    scheduledDate: String(input.scheduledDate || ""),
    scheduledHour: String(input.scheduledHour || "5"),
    scheduledMinute: String(input.scheduledMinute || "00"),
    scheduledMeridiem: String(input.scheduledMeridiem || "PM"),
    mediaAssetIds: (input.mediaAssetIds ?? []).map((value) => String(value || "")).filter(Boolean),
    platforms: normalizeSelectedPlatforms((input.platforms ?? []).map((value) => String(value || ""))),
    mediaSelectionSource: String(input.mediaSelectionSource || ""),
  };
}

function buildPostDescriptionValues(input: {
  descriptionMain?: string | null;
  descriptionFacebook?: string | null;
  descriptionInstagram?: string | null;
  descriptionGoogleBusiness?: string | null;
  hashtags?: unknown;
  includeHashtagsInGoogle?: boolean | null;
  instagramFirstComment?: string | null;
}): PostDescriptionValues {
  return {
    descriptionMain: input.descriptionMain ?? "",
    descriptionFacebook: input.descriptionFacebook ?? "",
    descriptionInstagram: input.descriptionInstagram ?? "",
    descriptionGoogleBusiness: input.descriptionGoogleBusiness ?? "",
    hashtags: Array.isArray(input.hashtags) ? input.hashtags.map((value) => String(value || "")) : [],
    includeHashtagsInGoogle: input.includeHashtagsInGoogle ?? false,
    instagramFirstComment: input.instagramFirstComment ?? "",
  };
}

function buildLegacyCaptionValue(
  input: PostDescriptionValues,
  platforms: SocialPlatform[],
  templateVariableValues: TemplateVariableValueMap,
) {
  const preview = getFallbackPostDescriptionPreview(input, platforms);
  return renderTemplateVariablesForPreview(preview, templateVariableValues);
}

function renderTemplateVariablesForPreview(
  preview: string,
  templateVariableValues: TemplateVariableValueMap,
) {
  return resolveRenderedPostDescription({ descriptionMain: preview }, SocialPlatform.FACEBOOK, templateVariableValues).text;
}

function getDescriptionFieldNameForPlatform(platform: SocialPlatform, usedOverride: boolean) {
  if (!usedOverride) {
    return "descriptionMain";
  }

  if (platform === SocialPlatform.FACEBOOK) {
    return "descriptionFacebook";
  }

  if (platform === SocialPlatform.INSTAGRAM) {
    return "descriptionInstagram";
  }

  return "descriptionGoogleBusiness";
}

function collectUnresolvedTemplateFieldErrors(input: {
  descriptions: PostDescriptionValues;
  businessVariables: TemplateVariableValueMap;
  platforms: SocialPlatform[];
  instagramSelected: boolean;
}) {
  const fieldErrors: Record<string, string[]> = {};
  const missingTokens = new Set<string>();

  for (const platform of input.platforms) {
    const rendered = resolveRenderedPostDescription(input.descriptions, platform, input.businessVariables);
    if (rendered.unresolvedVariableNames.length === 0) {
      continue;
    }

    const fieldName = getDescriptionFieldNameForPlatform(platform, rendered.usedOverride);
    fieldErrors[fieldName] = [
      `These variables are missing values: ${formatTemplateVariableTokens(rendered.unresolvedVariableNames).join(", ")}`,
    ];
    for (const token of formatTemplateVariableTokens(rendered.unresolvedVariableNames)) {
      missingTokens.add(token);
    }
  }

  if (input.instagramSelected && input.descriptions.instagramFirstComment?.trim()) {
    const firstComment = resolveRenderedInstagramFirstComment(input.descriptions, input.businessVariables);
    if (firstComment.unresolvedVariableNames.length > 0) {
      fieldErrors.instagramFirstComment = [
        `These variables are missing values: ${formatTemplateVariableTokens(firstComment.unresolvedVariableNames).join(", ")}`,
      ];
      for (const token of formatTemplateVariableTokens(firstComment.unresolvedVariableNames)) {
        missingTokens.add(token);
      }
    }
  }

  return {
    fieldErrors,
    missingTokens: [...missingTokens],
  };
}

function collectFormattedPlatformFieldErrors(input: {
  descriptions: PostDescriptionValues;
  businessVariables: TemplateVariableValueMap;
  hashtagSettings: Pick<HashtagSettings, "facebookDefaultLimit">;
  platforms: SocialPlatform[];
}) {
  const fieldErrors: Record<string, string[]> = {};

  for (const platform of input.platforms) {
    const rule = getCaptionRuleForPlatform(platform);
    if (!rule) {
      continue;
    }

    const formatted = resolveRenderedPlatformContent(
      input.descriptions,
      platform,
      input.businessVariables,
      input.hashtagSettings,
    );

    if (formatted.descriptionText.length > rule.maxChars) {
      const fieldName = getDescriptionFieldNameForPlatform(platform, formatted.usedOverride);
      fieldErrors[fieldName] = [
        `The final ${rule.label} post is ${formatted.descriptionText.length.toLocaleString()} characters. Keep it under ${rule.maxChars.toLocaleString()} after hashtags are added.`,
      ];
    }

    if (platform === SocialPlatform.INSTAGRAM && formatted.firstCommentText.length > 2200) {
      fieldErrors.instagramFirstComment = [
        `Instagram First Comment is ${formatted.firstCommentText.length.toLocaleString()} characters after hashtags are added. Keep it under 2,200 characters.`,
      ];
    }
  }

  return fieldErrors;
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

    await syncSocialPostAggregateState(tx, input.postId, {
      failureReason: input.message,
    });
  });
}

type ImmediatePublishResult = {
  platform: SocialPlatform;
  outcome: "succeeded" | "failed" | "skipped";
  message: string;
  warning?: string;
  platformPostId?: string | null;
  platformPostUrl?: string | null;
  finishedAt?: Date;
};

function getPlatformDisplayName(platform: SocialPlatform) {
  switch (platform) {
    case SocialPlatform.FACEBOOK:
      return "Facebook";
    case SocialPlatform.INSTAGRAM:
      return "Instagram";
    case SocialPlatform.GOOGLE_BUSINESS:
      return "Google Business";
    default:
      return platform;
  }
}

function formatPlatformList(platforms: SocialPlatform[]) {
  const labels = platforms.map(getPlatformDisplayName);
  if (labels.length === 0) {
    return "";
  }

  if (labels.length === 1) {
    return labels[0];
  }

  if (labels.length === 2) {
    return `${labels[0]} and ${labels[1]}`;
  }

  return `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]}`;
}

function isPlatformAlreadyPublished(record: {
  status: SocialPostStatus;
  publishedAt: Date | null;
  platformPostId: string | null;
}) {
  return record.status === SocialPostStatus.PUBLISHED || Boolean(record.publishedAt) || Boolean(record.platformPostId);
}

function buildImmediatePublishSummary(results: ImmediatePublishResult[]) {
  const succeeded = results.filter((result) => result.outcome === "succeeded").map((result) => result.platform);
  const failed = results.filter((result) => result.outcome === "failed").map((result) => result.platform);
  const skipped = results.filter((result) => result.outcome === "skipped").map((result) => result.platform);
  const warnings = results.filter((result) => result.warning).map((result) => result.warning as string);

  if (succeeded.length > 0 && failed.length === 0) {
    return {
      status: "success" as const,
      hasWarnings: warnings.length > 0,
      message:
        skipped.length > 0
          ? `Published to ${formatPlatformList(succeeded)}. ${formatPlatformList(skipped)} was already published and was skipped.${warnings.length > 0 ? ` ${warnings.join(" ")}` : ""}`
          : `Published to ${formatPlatformList(succeeded)}.${warnings.length > 0 ? ` ${warnings.join(" ")}` : ""}`,
    };
  }

  if (succeeded.length > 0 && failed.length > 0) {
    return {
      status: "error" as const,
      hasWarnings: warnings.length > 0,
      message: `Published to ${formatPlatformList(succeeded)}. Failed on ${formatPlatformList(failed)}.`,
    };
  }

  if (failed.length > 0) {
    return {
      status: "error" as const,
      hasWarnings: warnings.length > 0,
      message: `Publishing failed on ${formatPlatformList(failed)}.`,
    };
  }

  return {
    status: "error" as const,
    hasWarnings: warnings.length > 0,
    message:
      skipped.length > 0
        ? `${formatPlatformList(skipped)} was already published and was skipped.`
        : "No pending platform publishes were available.",
  };
}

async function notifyImmediatePlatformPublishFailure(input: {
  postId: string;
  platform: SocialPlatform;
  message: string;
}) {
  await createOrUpdatePlatformPublishFailedNotification({
    provider: input.platform,
    postId: input.postId,
    message: `${getPlatformDisplayName(input.platform)} posting failed.`,
    detail: input.message,
  }).catch(() => undefined);
}

async function validateImmediatePublishPrerequisites(input: {
  platform: SocialPlatform;
  description: string;
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
      caption: input.description,
      mediaAssets: input.mediaAssets,
    });
  }

  if (input.platform === SocialPlatform.GOOGLE_BUSINESS) {
    return validateGooglePublishPrerequisites({
      caption: input.description,
      mediaAsset: input.primaryMediaAsset,
    });
  }

  return validateFacebookPublishPrerequisites({
    caption: input.description,
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

async function runImmediatePlatformPublishes(input: {
  actorAdminUserId: string;
  postId: string;
  descriptions: PostDescriptionValues;
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
  targetPlatforms: SocialPlatform[];
  initialStatus: SocialPostStatus;
  mode: "manual" | "manual-form";
  allowedStatuses: SocialPostStatus[];
}) {
  const results: ImmediatePublishResult[] = [];

  for (const platform of input.targetPlatforms) {
    const effectiveDescription = getEffectivePostDescription(input.descriptions, platform);

    try {
      await validateImmediatePublishPrerequisites({
        platform,
        description: effectiveDescription.text,
        primaryMediaAsset: input.primaryMediaAsset,
        mediaAssets: input.mediaAssets,
      });
    } catch (error) {
      unstable_rethrow(error);
      const message =
        error instanceof Error ? error.message : `${getPlatformDisplayName(platform)} publishing prerequisites are not met.`;

      await markImmediatePublishFailure({
        postId: input.postId,
        message,
        platform,
        requestSummary: {
          usedOverride: effectiveDescription.usedOverride,
          effectiveDescriptionLength: effectiveDescription.text.length,
        },
      });
      await notifyImmediatePlatformPublishFailure({
        postId: input.postId,
        platform,
        message,
      });
      await createPostAuditLog({
        actorAdminUserId: input.actorAdminUserId,
        action: AUDIT_ACTIONS.POST_PUBLISH_FAILED,
        targetId: input.postId,
        metadata: {
          previousStatus: input.initialStatus,
          nextStatus: SocialPostStatus.FAILED,
          mode: input.mode,
          platform,
          message,
        },
      });
      results.push({
        platform,
        outcome: "failed",
        message,
      });
      continue;
    }

    const claim = await claimImmediatePublish({
      platform,
      socialPostId: input.postId,
      allowedStatuses: input.allowedStatuses,
    });

    if (!claim.ok) {
      if (claim.reason === "ALREADY_PUBLISHED") {
        results.push({
          platform,
          outcome: "skipped",
          message: claim.message,
        });
        continue;
      }

      await markImmediatePublishFailure({
        postId: input.postId,
        message: claim.message,
        platform,
        requestSummary: {
          usedOverride: effectiveDescription.usedOverride,
          effectiveDescriptionLength: effectiveDescription.text.length,
        },
      });
      await notifyImmediatePlatformPublishFailure({
        postId: input.postId,
        platform,
        message: claim.message,
      });
      await createPostAuditLog({
        actorAdminUserId: input.actorAdminUserId,
        action: AUDIT_ACTIONS.POST_PUBLISH_FAILED,
        targetId: input.postId,
        metadata: {
          previousStatus: input.initialStatus,
          nextStatus: SocialPostStatus.FAILED,
          mode: input.mode,
          platform,
          message: claim.message,
          reason: claim.reason,
        },
      });
      results.push({
        platform,
        outcome: "failed",
        message: claim.message,
      });
      continue;
    }

    await createPostAuditLog({
      actorAdminUserId: input.actorAdminUserId,
      action: AUDIT_ACTIONS.POST_PUBLISH_STARTED,
      targetId: input.postId,
      metadata: {
        previousStatus: input.initialStatus,
        nextStatus: SocialPostStatus.PUBLISHING,
        mode: input.mode,
        platform,
      },
    });

    try {
      const result = await executeImmediatePublish({
        platform,
        socialPostId: claim.socialPostId,
        socialPostPlatformId: claim.socialPostPlatformId,
      });

      await createPostAuditLog({
        actorAdminUserId: input.actorAdminUserId,
        action: AUDIT_ACTIONS.POST_PUBLISH_SUCCEEDED,
        targetId: input.postId,
        metadata: {
          previousStatus: SocialPostStatus.PUBLISHING,
          nextStatus: SocialPostStatus.PUBLISHED,
          mode: input.mode,
          publishedAt: result.finishedAt.toISOString(),
          platform,
          platformPostId: result.result.platformPostId,
          platformPostUrl: result.result.platformPostUrl,
        },
      });

      results.push({
        platform,
        outcome: "succeeded",
        message: `${getPlatformDisplayName(platform)} published successfully.`,
        warning:
          platform === SocialPlatform.INSTAGRAM &&
          "firstComment" in result.result &&
          result.result.firstComment.status === "failed"
            ? "Instagram published, but the first comment failed."
            : undefined,
        platformPostId: result.result.platformPostId,
        platformPostUrl: result.result.platformPostUrl,
        finishedAt: result.finishedAt,
      });
    } catch (error) {
      unstable_rethrow(error);
      const message = error instanceof Error ? error.message : `${getPlatformDisplayName(platform)} publishing failed.`;

      await createPostAuditLog({
        actorAdminUserId: input.actorAdminUserId,
        action: AUDIT_ACTIONS.POST_PUBLISH_FAILED,
        targetId: input.postId,
        metadata: {
          previousStatus: SocialPostStatus.PUBLISHING,
          nextStatus: SocialPostStatus.FAILED,
          mode: input.mode,
          platform,
          message,
        },
      });

      results.push({
        platform,
        outcome: "failed",
        message,
      });
    }
  }

  const refreshedPost = await prisma.socialPost.findUnique({
    where: {
      id: input.postId,
    },
    select: {
      status: true,
    },
  });

  if (refreshedPost && refreshedPost.status !== input.initialStatus) {
    await createPostAuditLog({
      actorAdminUserId: input.actorAdminUserId,
      action: AUDIT_ACTIONS.POST_STATUS_CHANGED,
      targetId: input.postId,
      metadata: {
        previousStatus: input.initialStatus,
        nextStatus: refreshedPost.status,
        mode: input.mode,
      },
    });
  }

  return {
    results,
    finalStatus: refreshedPost?.status ?? input.initialStatus,
  };
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
    descriptionMain: formData.get("descriptionMain"),
    descriptionFacebook: formData.get("descriptionFacebook"),
    descriptionInstagram: formData.get("descriptionInstagram"),
    instagramFirstComment: formData.get("instagramFirstComment"),
    descriptionGoogleBusiness: formData.get("descriptionGoogleBusiness"),
    hashtags: formData.getAll("hashtags"),
    includeHashtagsInGoogle: formData.get("includeHashtagsInGoogle"),
    appliedHashtagGroups: formData.getAll("appliedHashtagGroups"),
    scheduledDate: formData.get("scheduledDate"),
    scheduledHour: formData.get("scheduledHour"),
    scheduledMinute: formData.get("scheduledMinute"),
    scheduledMeridiem: formData.get("scheduledMeridiem"),
    mediaAssetIds: formData.getAll("mediaAssetIds"),
    platforms: formData.getAll("platforms"),
    mediaSelectionSource: formData.get("mediaSelectionSource"),
  });
  const parsed = postFormSchema.safeParse({
    postId: String(formData.get("postId") || ""),
    mediaAssetIds: formData.getAll("mediaAssetIds"),
    descriptionMain: String(formData.get("descriptionMain") || ""),
    descriptionFacebook: String(formData.get("descriptionFacebook") || ""),
    descriptionInstagram: String(formData.get("descriptionInstagram") || ""),
    instagramFirstComment: String(formData.get("instagramFirstComment") || ""),
    descriptionGoogleBusiness: String(formData.get("descriptionGoogleBusiness") || ""),
    hashtags: formData.getAll("hashtags"),
    includeHashtagsInGoogle: formData.get("includeHashtagsInGoogle") ? String(formData.get("includeHashtagsInGoogle")) : undefined,
    appliedHashtagGroups: formData.getAll("appliedHashtagGroups"),
    scheduledDate: String(formData.get("scheduledDate") || ""),
    scheduledHour: String(formData.get("scheduledHour") || ""),
    scheduledMinute: String(formData.get("scheduledMinute") || ""),
    scheduledMeridiem: String(formData.get("scheduledMeridiem") || ""),
    platforms: formData.getAll("platforms"),
    intent: formData.get("intent") ? String(formData.get("intent")) : undefined,
  });

  if (!parsed.success) {
    const flattened = parsed.error.flatten();
    const firstVisibleError =
      flattened.formErrors[0] ||
      Object.values(flattened.fieldErrors)
        .flat()
        .find((error): error is string => Boolean(error));

    return {
      ...initialFormState,
      message: firstVisibleError || "Fix the highlighted fields and try again.",
      fieldErrors: flattened.fieldErrors,
      submittedValues,
    };
  }

  try {
    const isImmediatePublish = parsed.data.intent === "publish";
    if (parsed.data.intent === "schedule") {
      await enforcePostActionRateLimit(RATE_LIMITS.scheduling.perUserDaily, adminUser.id, "schedule_post");
    }

    if (isImmediatePublish) {
      const { ipAddress, userAgent } = await getRequestMetadata();
      await enforcePostActionRateLimit(RATE_LIMITS.publishing.perUserHourly, adminUser.id, "publish_post");
      await enforceRateLimit(RATE_LIMITS.publishing.perOrganizationDaily, {
        actorAdminUserId: adminUser.id,
        userId: adminUser.id,
        ipAddress,
        userAgent,
        endpoint: "/dashboard/posts",
        method: "SERVER_ACTION",
        attemptedAction: "publish_post",
      });
    }

    const [businessVariables, hashtagSettings] = await Promise.all([
      getBusinessVariableSettings(),
      getHashtagSettings(),
    ]);
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
      if (!isMetaInstagramEnabled()) {
        return {
          ...initialFormState,
          message: META_INSTAGRAM_REMOVE_AND_RETRY_MESSAGE,
          fieldErrors: {
            platforms: [META_INSTAGRAM_REMOVE_AND_RETRY_MESSAGE],
          },
          submittedValues,
        };
      }

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

    const nextDescriptions = buildPostDescriptionValues({
      descriptionMain: parsed.data.descriptionMain,
      descriptionFacebook: parsed.data.descriptionFacebook,
      descriptionInstagram: parsed.data.descriptionInstagram,
      instagramFirstComment: parsed.data.instagramFirstComment,
      descriptionGoogleBusiness: parsed.data.descriptionGoogleBusiness,
      hashtags: parsed.data.hashtags,
      includeHashtagsInGoogle: parsed.data.includeHashtagsInGoogle,
    });

    if (parsed.data.intent !== "draft") {
      const unresolved = collectUnresolvedTemplateFieldErrors({
        descriptions: nextDescriptions,
        businessVariables,
        platforms: parsed.data.platforms,
        instagramSelected: parsed.data.platforms.includes(SocialPlatform.INSTAGRAM),
      });

      if (unresolved.missingTokens.length > 0) {
        await createPostAuditLog({
          actorAdminUserId: adminUser.id,
          action: AUDIT_ACTIONS.POST_PUBLISH_BLOCKED_UNRESOLVED_VARIABLES,
          targetId: parsed.data.postId || "new",
          metadata: {
            intent: parsed.data.intent,
            platforms: parsed.data.platforms,
            missingVariables: unresolved.missingTokens,
          },
        }).catch(() => undefined);

        return {
          ...initialFormState,
          message: `These variables are missing values: ${unresolved.missingTokens.join(", ")}`,
          fieldErrors: unresolved.fieldErrors,
          submittedValues,
        };
      }

      const formattedFieldErrors = collectFormattedPlatformFieldErrors({
        descriptions: nextDescriptions,
        businessVariables,
        hashtagSettings,
        platforms: parsed.data.platforms,
      });

      if (Object.keys(formattedFieldErrors).length > 0) {
        return {
          ...initialFormState,
          message: "Shorten the final platform copy so it fits after hashtags are added.",
          fieldErrors: formattedFieldErrors,
          submittedValues,
        };
      }
    }

    if (parsed.data.intent === "schedule" && !areSelectedPlatformsPublishableNow(parsed.data.platforms, "schedule")) {
      return {
        ...initialFormState,
        message: "Choose at least one platform before scheduling.",
        fieldErrors: {
          platforms: ["Choose at least one platform before scheduling."],
        },
        submittedValues,
      };
    }

    if (parsed.data.intent === "publish" && !areSelectedPlatformsPublishableNow(parsed.data.platforms, "publish")) {
      return {
        ...initialFormState,
        message: "Choose at least one platform before publishing.",
        fieldErrors: {
          platforms: ["Choose at least one platform before publishing."],
        },
        submittedValues,
      };
    }

    const post = await prisma.$transaction(async (tx) => {
      const legacyCaption = buildLegacyCaptionValue(nextDescriptions, parsed.data.platforms, businessVariables);
      const data = {
        internalTitle: buildInternalPostTitle(legacyCaption),
        caption: legacyCaption,
        descriptionMain: parsed.data.descriptionMain,
        descriptionFacebook: parsed.data.descriptionFacebook || null,
        descriptionInstagram: parsed.data.descriptionInstagram || null,
        instagramFirstComment: parsed.data.instagramFirstComment || null,
        descriptionGoogleBusiness: parsed.data.descriptionGoogleBusiness || null,
        hashtags: parsed.data.hashtags,
        includeHashtagsInGoogle: parsed.data.includeHashtagsInGoogle,
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
      let previousDescriptions: PostDescriptionValues = {};
      let previousInstagramFirstComment: string | null = null;
      let currentPlatforms: Array<{
        platform: SocialPlatform;
        status: SocialPostStatus;
        publishedAt: Date | null;
        platformPostId: string | null;
      }> = [];
      let existingPlatformMap = new Map<
        SocialPlatform,
        {
          platform: SocialPlatform;
          status: SocialPostStatus;
          publishedAt: Date | null;
          platformPostId: string | null;
        }
      >();

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
                status: true,
                publishedAt: true,
                platformPostId: true,
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
        previousDescriptions = buildPostDescriptionValues(existingPost);
        previousInstagramFirstComment = existingPost.instagramFirstComment ?? null;
        existingPlatformMap = new Map(
          existingPost.platforms.map((platform) => [platform.platform, platform]),
        );

        const removedPublishedPlatforms = existingPost.platforms
          .filter(
            (platform) =>
              !parsed.data.platforms.includes(platform.platform) && isPlatformAlreadyPublished(platform),
          )
          .map((platform) => platform.platform);

        if (removedPublishedPlatforms.length > 0) {
          throw new Error(
            `Published platforms cannot be removed from this post. Duplicate the post if you need a different platform mix than ${formatPlatformList(removedPublishedPlatforms)}.`,
          );
        }

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
        const existingPlatformRecord = existingPlatformMap.get(platform);
        const keepPublishedRecord = existingPlatformRecord
          ? isPlatformAlreadyPublished(existingPlatformRecord)
          : false;

        await tx.socialPostPlatform.upsert({
          where: {
            socialPostId_platform: {
              socialPostId: savedPost.id,
              platform,
            },
          },
          update: keepPublishedRecord
            ? {}
            : {
                status: nextStatus,
                scheduledAt: effectiveScheduledAt,
                publishedAt: null,
                platformPostId: null,
                platformPostUrl: null,
                lastError: null,
              },
          create: {
            socialPostId: savedPost.id,
            platform,
            status: nextStatus,
            scheduledAt: effectiveScheduledAt,
          },
        });
      }

      await syncSocialPostAggregateState(tx, savedPost.id);
      currentPlatforms = await tx.socialPostPlatform.findMany({
        where: {
          socialPostId: savedPost.id,
        },
        select: {
          platform: true,
          status: true,
          publishedAt: true,
          platformPostId: true,
        },
      });

      return {
        post: savedPost,
        previousMediaAssetIds,
        previousStatus,
        previousScheduledAt,
        previousPlatforms,
        previousDescriptions,
        previousInstagramFirstComment,
        currentPlatforms,
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

    const previousInstagramFirstComment = post.previousInstagramFirstComment ?? null;
    const nextInstagramFirstComment = parsed.data.instagramFirstComment || null;
    const previousHashtags = getNormalizedPostHashtags(post.previousDescriptions);
    const nextHashtags = parsed.data.hashtags;

    if (post.previousDescriptions.descriptionMain !== nextDescriptions.descriptionMain) {
      await createPostAuditLog({
        actorAdminUserId: adminUser.id,
        action: AUDIT_ACTIONS.POST_MAIN_DESCRIPTION_CHANGED,
        targetId: post.post.id,
        metadata: {
          previousLength: (post.previousDescriptions.descriptionMain || "").length,
          nextLength: nextDescriptions.descriptionMain?.length || 0,
        },
      });
    }

    if ((post.previousDescriptions.descriptionFacebook || "") !== (nextDescriptions.descriptionFacebook || "")) {
      await createPostAuditLog({
        actorAdminUserId: adminUser.id,
        action: AUDIT_ACTIONS.POST_FACEBOOK_OVERRIDE_CHANGED,
        targetId: post.post.id,
        metadata: {
          previousLength: (post.previousDescriptions.descriptionFacebook || "").length,
          nextLength: (nextDescriptions.descriptionFacebook || "").length,
        },
      });
    }

    if ((post.previousDescriptions.descriptionInstagram || "") !== (nextDescriptions.descriptionInstagram || "")) {
      await createPostAuditLog({
        actorAdminUserId: adminUser.id,
        action: AUDIT_ACTIONS.POST_INSTAGRAM_OVERRIDE_CHANGED,
        targetId: post.post.id,
        metadata: {
          previousLength: (post.previousDescriptions.descriptionInstagram || "").length,
          nextLength: (nextDescriptions.descriptionInstagram || "").length,
        },
      });
    }

    if (!previousInstagramFirstComment && nextInstagramFirstComment) {
      await createPostAuditLog({
        actorAdminUserId: adminUser.id,
        action: AUDIT_ACTIONS.INSTAGRAM_FIRST_COMMENT_ADDED,
        targetId: post.post.id,
        metadata: {
          nextLength: nextInstagramFirstComment.length,
        },
      });
    } else if ((previousInstagramFirstComment || "") !== (nextInstagramFirstComment || "")) {
      await createPostAuditLog({
        actorAdminUserId: adminUser.id,
        action: AUDIT_ACTIONS.INSTAGRAM_FIRST_COMMENT_CHANGED,
        targetId: post.post.id,
        metadata: {
          previousLength: (previousInstagramFirstComment || "").length,
          nextLength: (nextInstagramFirstComment || "").length,
        },
      });
    }

    const addedHashtags = nextHashtags.filter((tag) => !previousHashtags.includes(tag));
    const removedHashtags = previousHashtags.filter((tag) => !nextHashtags.includes(tag));

    if (addedHashtags.length > 0) {
      await createPostAuditLog({
        actorAdminUserId: adminUser.id,
        action: AUDIT_ACTIONS.POST_HASHTAG_ADDED,
        targetId: post.post.id,
        metadata: {
          addedHashtags,
        },
      });
    }

    if (removedHashtags.length > 0) {
      await createPostAuditLog({
        actorAdminUserId: adminUser.id,
        action: AUDIT_ACTIONS.POST_HASHTAG_REMOVED,
        targetId: post.post.id,
        metadata: {
          removedHashtags,
        },
      });
    }

    for (const groupName of parsed.data.appliedHashtagGroups) {
      await createPostAuditLog({
        actorAdminUserId: adminUser.id,
        action: AUDIT_ACTIONS.POST_HASHTAG_GROUP_APPLIED,
        targetId: post.post.id,
        metadata: {
          groupName,
          hashtags: nextHashtags,
        },
      });
    }

    if (
      (post.previousDescriptions.descriptionGoogleBusiness || "") !==
      (nextDescriptions.descriptionGoogleBusiness || "")
    ) {
      await createPostAuditLog({
        actorAdminUserId: adminUser.id,
        action: AUDIT_ACTIONS.POST_GOOGLE_OVERRIDE_CHANGED,
        targetId: post.post.id,
        metadata: {
          previousLength: (post.previousDescriptions.descriptionGoogleBusiness || "").length,
          nextLength: (nextDescriptions.descriptionGoogleBusiness || "").length,
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

    const targetPlatforms = post.currentPlatforms
      .filter((platformRecord) => !isPlatformAlreadyPublished(platformRecord))
      .map((platformRecord) => platformRecord.platform);

    if (targetPlatforms.length === 0) {
      revalidatePostViews(post.post.id);
      redirect(
        buildPostDetailHref(post.post.id, {
          status: "error",
          message: "All selected platforms are already published. Duplicate the post if you need to post it again.",
        }),
      );
    }

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
        platforms: targetPlatforms,
      },
    });

    const publishRun = await runImmediatePlatformPublishes({
      actorAdminUserId: adminUser.id,
      postId: post.post.id,
      descriptions: nextDescriptions,
      primaryMediaAsset,
      mediaAssets: orderedSelectedMediaAssets,
      targetPlatforms,
      initialStatus: post.previousStatus ?? nextStatus,
      mode: "manual-form",
      allowedStatuses: [SocialPostStatus.DRAFT, SocialPostStatus.SCHEDULED, SocialPostStatus.FAILED],
    });
    const summary = buildImmediatePublishSummary(publishRun.results);

    revalidatePostViews(post.post.id);
    if (summary.status === "success" && !summary.hasWarnings) {
      redirect(buildCalendarHref({ flash: "published" }));
    }

    redirect(
      buildPostDetailHref(post.post.id, {
        status: summary.status,
        message: summary.message,
      }),
    );
  } catch (error) {
    unstable_rethrow(error);
    if (isRateLimitExceededError(error)) {
      return {
        ...initialFormState,
        message: error.message,
        submittedValues,
      };
    }

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
        message: "Choose at least one connected platform before publishing.",
      }),
    );
  }

  const targetPlatforms = existingPost.platforms
    .filter((platformRecord) => !isPlatformAlreadyPublished(platformRecord))
    .map((platformRecord) => platformRecord.platform);

  if (targetPlatforms.length === 0) {
    redirect(
      buildPostDetailHref(postId, {
        status: "error",
        message: "All selected platforms are already published. Duplicate the post if you need to post it again.",
      }),
    );
  }

  try {
    const { ipAddress, userAgent } = await getRequestMetadata();
    await enforcePostActionRateLimit(RATE_LIMITS.publishing.perUserHourly, adminUser.id, "publish_post");
    await enforceRateLimit(RATE_LIMITS.publishing.perOrganizationDaily, {
      actorAdminUserId: adminUser.id,
      userId: adminUser.id,
      ipAddress,
      userAgent,
      endpoint: `/dashboard/posts/${postId}`,
      method: "SERVER_ACTION",
      attemptedAction: "publish_post",
    });
  } catch (error) {
    if (isRateLimitExceededError(error)) {
      redirect(
        buildPostDetailHref(postId, {
          status: "error",
          message: error.message,
        }),
      );
    }

    throw error;
  }

  const [businessVariables, hashtagSettings] = await Promise.all([
    getBusinessVariableSettings(),
    getHashtagSettings(),
  ]);
  const postDescriptionValues = buildPostDescriptionValues(existingPost);
  const unresolved = collectUnresolvedTemplateFieldErrors({
    descriptions: postDescriptionValues,
    businessVariables,
    platforms,
    instagramSelected: platforms.includes(SocialPlatform.INSTAGRAM),
  });
  if (unresolved.missingTokens.length > 0) {
    await createPostAuditLog({
      actorAdminUserId: adminUser.id,
      action: AUDIT_ACTIONS.POST_PUBLISH_BLOCKED_UNRESOLVED_VARIABLES,
      targetId: existingPost.id,
      metadata: {
        intent: "publish",
        platforms,
        missingVariables: unresolved.missingTokens,
      },
    }).catch(() => undefined);

    redirect(
      buildPostDetailHref(postId, {
        status: "error",
        message: `These variables are missing values: ${unresolved.missingTokens.join(", ")}`,
      }),
    );
  }

  const formattedFieldErrors = collectFormattedPlatformFieldErrors({
    descriptions: postDescriptionValues,
    businessVariables,
    hashtagSettings,
    platforms,
  });

  if (Object.keys(formattedFieldErrors).length > 0) {
    redirect(
      buildPostDetailHref(postId, {
        status: "error",
        message: "Shorten the final platform copy so it fits after hashtags are added.",
      }),
    );
  }

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
          platform: {
            in: targetPlatforms,
          },
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

  const publishRun = await runImmediatePlatformPublishes({
    actorAdminUserId: adminUser.id,
    postId,
    descriptions: buildPostDescriptionValues(existingPost),
    primaryMediaAsset: existingPost.mediaAsset,
    mediaAssets: existingPost.attachedMedia.map((item) => item.mediaAsset),
    targetPlatforms,
    initialStatus: existingPost.status,
    mode: "manual",
    allowedStatuses,
  });
  const summary = buildImmediatePublishSummary(publishRun.results);

  revalidatePostViews(postId);
  if (summary.status === "success" && !summary.hasWarnings) {
    redirect(buildCalendarHref({ flash: "published" }));
  }

  redirect(
    buildPostDetailHref(postId, {
      status: summary.status,
      message: summary.message,
    }),
  );
}
