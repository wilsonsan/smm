import { SocialPlatform, SocialPostStatus } from "@prisma/client";
import { getResolvedAppTimezone, parseScheduledAtInTimezone } from "@/lib/time";

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
