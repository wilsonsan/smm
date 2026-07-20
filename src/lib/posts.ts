import { SocialPlatform, SocialPostStatus } from "@prisma/client";
import { applyHashtagsToPlatformContent, normalizeHashtagList, type HashtagSettings } from "@/lib/hashtags";
import { getResolvedAppTimezone, parseScheduledAtInTimezone } from "@/lib/time";
import {
  extractTemplateVariableNames,
  renderTemplateVariables,
  type TemplateVariableValueMap,
} from "@/lib/template-variables";

export const POST_LIST_FILTERS = [
  "ALL",
  "DRAFT",
  "SCHEDULED",
  "PUBLISHED",
  "FAILED",
  "CANCELLED",
] as const;

export type PostListFilter = (typeof POST_LIST_FILTERS)[number];

export type PlatformPublishSummary = {
  platform: SocialPlatform;
  status: SocialPostStatus;
  label: "Pending" | "Success" | "Failed";
  tone: "publishing" | "published" | "failed";
};

export type AggregatePlatformOutcome = {
  label: string;
  tone: "draft" | "scheduled" | "publishing" | "published" | "failed" | "cancelled";
};

export type PostDescriptionValues = {
  caption?: string | null;
  descriptionMain?: string | null;
  descriptionFacebook?: string | null;
  descriptionInstagram?: string | null;
  instagramFirstComment?: string | null;
  descriptionGoogleBusiness?: string | null;
  hashtags?: unknown;
  includeHashtagsInGoogle?: boolean | null;
};

export type RenderedPostDescriptionResult = {
  text: string;
  usedOverride: boolean;
  variablesRendered: boolean;
  unresolvedVariableNames: string[];
};

export type RenderedPlatformContentResult = RenderedPostDescriptionResult & {
  descriptionText: string;
  firstCommentText: string;
  hashtagsUsed: string[];
  hashtagPlacement: "description" | "firstComment" | "none";
};

export function isEditablePostStatus(status: SocialPostStatus) {
  return (
    status === SocialPostStatus.DRAFT ||
    status === SocialPostStatus.SCHEDULED ||
    status === SocialPostStatus.FAILED ||
    status === SocialPostStatus.CANCELLED
  );
}

export function isReadOnlyPostStatus(status: SocialPostStatus) {
  return status === SocialPostStatus.PUBLISHING || status === SocialPostStatus.PUBLISHED;
}

export function canDeleteDraft(status: SocialPostStatus) {
  return status === SocialPostStatus.DRAFT;
}

export function canCancelScheduled(status: SocialPostStatus) {
  return status === SocialPostStatus.SCHEDULED;
}

export function canReturnToDraft(status: SocialPostStatus) {
  return (
    status === SocialPostStatus.SCHEDULED ||
    status === SocialPostStatus.FAILED ||
    status === SocialPostStatus.CANCELLED
  );
}

export function canScheduleFromStatus(status: SocialPostStatus) {
  return (
    status === SocialPostStatus.DRAFT ||
    status === SocialPostStatus.SCHEDULED ||
    status === SocialPostStatus.FAILED ||
    status === SocialPostStatus.CANCELLED
  );
}

export function canManuallyPublish(status: SocialPostStatus) {
  return (
    status === SocialPostStatus.DRAFT ||
    status === SocialPostStatus.SCHEDULED ||
    status === SocialPostStatus.FAILED
  );
}

export function normalizePostDescription(value: string | null | undefined) {
  return (value || "").replace(/\r\n/g, "\n").trim();
}

export function getMainPostDescription(input: PostDescriptionValues) {
  return normalizePostDescription(input.descriptionMain ?? input.caption ?? "");
}

export function getPlatformDescriptionOverride(
  input: PostDescriptionValues,
  platform: SocialPlatform,
) {
  switch (platform) {
    case SocialPlatform.FACEBOOK:
      return normalizePostDescription(input.descriptionFacebook);
    case SocialPlatform.INSTAGRAM:
      return normalizePostDescription(input.descriptionInstagram);
    case SocialPlatform.GOOGLE_BUSINESS:
      return normalizePostDescription(input.descriptionGoogleBusiness);
    default:
      return "";
  }
}

export function getEffectivePostDescription(
  input: PostDescriptionValues,
  platform: SocialPlatform,
) {
  const override = getPlatformDescriptionOverride(input, platform);
  const main = getMainPostDescription(input);

  return {
    text: override || main,
    usedOverride: Boolean(override),
  };
}

export function getNormalizedPostHashtags(input: PostDescriptionValues) {
  return normalizeHashtagList(Array.isArray(input.hashtags) ? input.hashtags.map((value) => String(value || "")) : []);
}

export function resolveRenderedPostDescription(
  input: PostDescriptionValues,
  platform: SocialPlatform,
  templateVariableValues: TemplateVariableValueMap,
): RenderedPostDescriptionResult {
  const effective = getEffectivePostDescription(input, platform);
  const rendered = renderTemplateVariables(effective.text, templateVariableValues);

  return {
    text: rendered.text,
    usedOverride: effective.usedOverride,
    variablesRendered: extractTemplateVariableNames(effective.text).length > 0,
    unresolvedVariableNames: rendered.unresolvedVariableNames,
  };
}

export function resolveRenderedInstagramFirstComment(
  input: PostDescriptionValues,
  templateVariableValues: TemplateVariableValueMap,
) {
  const source = normalizePostDescription(input.instagramFirstComment);
  const rendered = renderTemplateVariables(source, templateVariableValues);

  return {
    text: rendered.text,
    variablesRendered: extractTemplateVariableNames(source).length > 0,
    unresolvedVariableNames: rendered.unresolvedVariableNames,
  };
}

export function resolveRenderedPlatformContent(
  input: PostDescriptionValues,
  platform: SocialPlatform,
  templateVariableValues: TemplateVariableValueMap,
  hashtagSettings: Pick<HashtagSettings, "facebookDefaultLimit">,
): RenderedPlatformContentResult {
  const renderedDescription = resolveRenderedPostDescription(input, platform, templateVariableValues);
  const renderedFirstComment = {
    text: "",
    variablesRendered: false,
    unresolvedVariableNames: [] as string[],
  };

  const hashtagContent = applyHashtagsToPlatformContent({
    platform,
    descriptionText: renderedDescription.text,
    firstCommentText: renderedFirstComment.text,
    hashtags: getNormalizedPostHashtags(input),
    includeHashtagsInGoogle: Boolean(input.includeHashtagsInGoogle),
    facebookDefaultLimit: hashtagSettings.facebookDefaultLimit,
  });

  return {
    ...renderedDescription,
    descriptionText: hashtagContent.descriptionText,
    firstCommentText: hashtagContent.firstCommentText,
    hashtagsUsed: hashtagContent.hashtagsUsed,
    hashtagPlacement: hashtagContent.placement,
    variablesRendered: renderedDescription.variablesRendered || renderedFirstComment.variablesRendered,
    unresolvedVariableNames: [
      ...new Set([
        ...renderedDescription.unresolvedVariableNames,
        ...renderedFirstComment.unresolvedVariableNames,
      ]),
    ],
  };
}

export function getFallbackPostDescriptionPreview(
  input: PostDescriptionValues,
  platforms: Array<SocialPlatform | string> = [],
) {
  const main = getMainPostDescription(input);
  if (main) {
    return main;
  }

  const orderedPlatforms =
    platforms.length > 0
      ? platforms.map((platform) => String(platform))
      : [SocialPlatform.FACEBOOK, SocialPlatform.INSTAGRAM, SocialPlatform.GOOGLE_BUSINESS];

  for (const platform of orderedPlatforms) {
    if (
      platform !== SocialPlatform.FACEBOOK &&
      platform !== SocialPlatform.INSTAGRAM &&
      platform !== SocialPlatform.GOOGLE_BUSINESS
    ) {
      continue;
    }

    const override = getPlatformDescriptionOverride(input, platform);
    if (override) {
      return override;
    }
  }

  return normalizePostDescription(input.caption);
}

export async function validateAndResolveScheduledAt(input: {
  intent: "draft" | "schedule" | "publish";
  scheduledDate: string;
  scheduledHour: string;
  scheduledMinute: string;
  scheduledMeridiem: string;
}) {
  const timezone = await getResolvedAppTimezone();

  if (input.intent === "publish") {
    return {
      scheduledAt: null,
      timezone,
    };
  }

  const hasDate = Boolean(input.scheduledDate);
  const hasTime = Boolean(input.scheduledHour || input.scheduledMinute || input.scheduledMeridiem);

  if (!hasDate && !hasTime) {
    return {
      scheduledAt: null,
      timezone,
    };
  }

  if (!hasDate || !hasTime) {
    throw new Error("Choose both a date and time to place this post on the calendar.");
  }

  const scheduledAt = parseScheduledAtInTimezone({
    date: input.scheduledDate,
    hour: input.scheduledHour,
    minute: input.scheduledMinute,
    meridiem: input.scheduledMeridiem,
    timezone,
  });

  if (!scheduledAt) {
    throw new Error("Enter a valid scheduled date and time.");
  }

  if (input.intent === "schedule" && scheduledAt.getTime() <= Date.now()) {
    throw new Error("Choose a future time for scheduled posts.");
  }

  return {
    scheduledAt,
    timezone,
  };
}

export function resolvePostCalendarAt(post: {
  status: SocialPostStatus;
  scheduledAt: Date | null;
  publishedAt: Date | null;
  createdAt: Date;
}) {
  if (post.status === SocialPostStatus.DRAFT) {
    return post.scheduledAt;
  }

  if (post.status === SocialPostStatus.PUBLISHED) {
    return post.publishedAt ?? post.scheduledAt ?? post.createdAt;
  }

  if (post.status === SocialPostStatus.PUBLISHING) {
    return post.scheduledAt ?? post.createdAt;
  }

  return post.scheduledAt ?? post.createdAt;
}

export function getPostStatusTone(status: SocialPostStatus) {
  switch (status) {
    case SocialPostStatus.DRAFT:
      return "draft";
    case SocialPostStatus.SCHEDULED:
      return "scheduled";
    case SocialPostStatus.FAILED:
      return "failed";
    case SocialPostStatus.PUBLISHED:
      return "published";
    case SocialPostStatus.CANCELLED:
      return "cancelled";
    case SocialPostStatus.PUBLISHING:
      return "publishing";
    default:
      return "scheduled";
  }
}

export function getPlatformPublishSummary(input: {
  platform: SocialPlatform;
  status: SocialPostStatus;
}): PlatformPublishSummary {
  if (input.status === SocialPostStatus.PUBLISHED) {
    return {
      platform: input.platform,
      status: input.status,
      label: "Success",
      tone: "published",
    };
  }

  if (input.status === SocialPostStatus.FAILED || input.status === SocialPostStatus.CANCELLED) {
    return {
      platform: input.platform,
      status: input.status,
      label: "Failed",
      tone: "failed",
    };
  }

  return {
    platform: input.platform,
    status: input.status,
    label: "Pending",
    tone: "publishing",
  };
}

export function getAggregatePlatformOutcome(
  platformStatuses: Array<{
    status: SocialPostStatus;
  }>,
  fallbackStatus: SocialPostStatus,
): AggregatePlatformOutcome {
  if (platformStatuses.length === 0) {
    return {
      label:
        fallbackStatus === SocialPostStatus.PUBLISHED
          ? "Published"
          : fallbackStatus === SocialPostStatus.PUBLISHING
            ? "Publishing"
            : fallbackStatus === SocialPostStatus.FAILED
              ? "Failed"
              : fallbackStatus === SocialPostStatus.CANCELLED
                ? "Cancelled"
                : fallbackStatus === SocialPostStatus.SCHEDULED
                  ? "Scheduled"
                  : "Draft",
      tone: getPostStatusTone(fallbackStatus),
    };
  }

  const statuses = platformStatuses.map((platform) => platform.status);
  const allPublished = statuses.every((status) => status === SocialPostStatus.PUBLISHED);
  const allFailed = statuses.every(
    (status) => status === SocialPostStatus.FAILED || status === SocialPostStatus.CANCELLED,
  );
  const someFailed = statuses.some(
    (status) => status === SocialPostStatus.FAILED || status === SocialPostStatus.CANCELLED,
  );

  if (allPublished) {
    return {
      label: "Published",
      tone: "published",
    };
  }

  if (allFailed) {
    return {
      label: "Failed",
      tone: "failed",
    };
  }

  if (someFailed) {
    return {
      label: "Partial Failed",
      tone: "failed",
    };
  }

  if (statuses.some((status) => status === SocialPostStatus.PUBLISHING)) {
    return {
      label: "Publishing",
      tone: "publishing",
    };
  }

  if (statuses.some((status) => status === SocialPostStatus.SCHEDULED)) {
    return {
      label: "Scheduled",
      tone: "scheduled",
    };
  }

  if (statuses.some((status) => status === SocialPostStatus.CANCELLED)) {
    return {
      label: "Cancelled",
      tone: "cancelled",
    };
  }

  return {
    label: "Draft",
    tone: "draft",
  };
}

export function getPostCaptionPreview(caption: string | null | undefined, maxLength = 84) {
  const normalized = (caption || "").replace(/\s+/g, " ").trim();

  if (!normalized) {
    return "Untitled post";
  }

  const sentenceMatch = normalized.match(/^(.{1,90}?[.!?])(?:\s|$)/);
  if (sentenceMatch?.[1]) {
    return sentenceMatch[1].trim();
  }

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

export function buildInternalPostTitle(caption: string | null | undefined) {
  return getPostCaptionPreview(caption, 72);
}

export function getPostDescriptionPreview(
  input: PostDescriptionValues,
  platforms: Array<SocialPlatform | string> = [],
  maxLength = 84,
) {
  return getPostCaptionPreview(getFallbackPostDescriptionPreview(input, platforms), maxLength);
}
