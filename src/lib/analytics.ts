import {
  AdminUserRole,
  PublishAttemptStatus,
  Prisma,
  SocialPlatform,
  SocialPostStatus,
} from "@prisma/client";
import { DateTime } from "luxon";
import { prisma } from "@/lib/prisma";
import { getAggregatePlatformOutcome, getPostDescriptionPreview, resolvePostCalendarAt } from "@/lib/posts";
import { AUDIT_ACTIONS, createAuditLog } from "@/lib/audit";
import { getRequestMetadata } from "@/lib/http";
import { isDeletedArchiveUser } from "@/lib/managed-users";

export const ANALYTICS_PLATFORM_FILTERS = [
  "ALL",
  SocialPlatform.FACEBOOK,
  SocialPlatform.INSTAGRAM,
  SocialPlatform.GOOGLE_BUSINESS,
] as const;

export const ANALYTICS_STATUS_FILTERS = [
  "ALL",
  SocialPostStatus.DRAFT,
  SocialPostStatus.SCHEDULED,
  SocialPostStatus.PUBLISHING,
  SocialPostStatus.PUBLISHED,
  SocialPostStatus.FAILED,
  SocialPostStatus.CANCELLED,
  "PARTIAL_FAILED",
] as const;

export const ANALYTICS_ATTEMPT_STATUS_FILTERS = [
  "ALL",
  PublishAttemptStatus.PENDING,
  PublishAttemptStatus.SUCCEEDED,
  PublishAttemptStatus.FAILED,
  PublishAttemptStatus.SKIPPED_DEV_PLACEHOLDER,
] as const;

type FilterSource = URLSearchParams | Record<string, string | string[] | undefined>;

export type AnalyticsPlatformFilter = (typeof ANALYTICS_PLATFORM_FILTERS)[number];
export type AnalyticsStatusFilter = (typeof ANALYTICS_STATUS_FILTERS)[number];
export type AnalyticsAttemptStatusFilter = (typeof ANALYTICS_ATTEMPT_STATUS_FILTERS)[number];

export type AnalyticsFilters = {
  platform: AnalyticsPlatformFilter;
  userId: string;
  status: AnalyticsStatusFilter;
  from: string;
  to: string;
  attemptPlatform: AnalyticsPlatformFilter;
  attemptStatus: AnalyticsAttemptStatusFilter;
};

export type AnalyticsSummaryStats = {
  publishedToday: number;
  publishedThisWeek: number;
  publishedThisMonth: number;
  scheduledPosts: number;
  draftPosts: number;
  failedPosts: number;
};

export type PlatformBreakdownCard = {
  platform: SocialPlatform;
  label: string;
  publishedCount: number;
  scheduledCount: number;
  failedCount: number;
  successRate: number | null;
};

export type PublishHistoryRow = {
  id: string;
  date: Date | null;
  creatorName: string;
  creatorRole: AdminUserRole;
  statusLabel: string;
  statusTone: "draft" | "scheduled" | "publishing" | "published" | "failed" | "cancelled";
  descriptionPreview: string;
  platforms: Array<{
    platform: SocialPlatform;
    status: SocialPostStatus;
  }>;
  publishedLinks: Array<{
    platform: SocialPlatform;
    url: string;
  }>;
};

export type UserAnalyticsRow = {
  id: string;
  displayName: string;
  username: string;
  role: AdminUserRole;
  publishedPosts: number;
  scheduledPosts: number;
  failedPosts: number;
  draftPosts: number;
};

export type FailureReasonRow = {
  platform: SocialPlatform;
  platformLabel: string;
  reason: string;
  count: number;
};

export type PublishAttemptInsightRow = {
  id: string;
  socialPostId: string;
  postDetailHref: string;
  startedAt: Date;
  finishedAt: Date | null;
  durationMs: number | null;
  platform: SocialPlatform;
  status: PublishAttemptStatus;
  creatorName: string;
  creatorRole: AdminUserRole;
  descriptionPreview: string;
  errorSummary: string;
  retryCount: number;
  platformPostUrl: string | null;
};

export type ScheduleHealthDay = {
  dateKey: string;
  label: string;
  count: number;
  state: "empty" | "low" | "healthy";
};

export type QueueOverviewItem = {
  id: string;
  scheduledAt: Date;
  creatorName: string;
  descriptionPreview: string;
  platforms: Array<{
    platform: SocialPlatform;
    status: SocialPostStatus;
  }>;
};

export type RecentActivityItem = {
  id: string;
  createdAt: Date;
  actorName: string;
  message: string;
  tone: "info" | "success" | "error";
};

export type AnalyticsTrendDirection = "up" | "down" | "flat";

export type AnalyticsDashboardMetricCard = {
  key: "published" | "scheduled" | "reach" | "engagement";
  label: string;
  value: number;
  displayValue: string;
  trendPercent: number | null;
  trendDirection: AnalyticsTrendDirection;
  trendLabel: string;
  iconTone: "green" | "blue" | "purple" | "orange";
  series: number[];
};

export type PublishingOverviewSlice = {
  key: "published" | "scheduled" | "draft" | "failed";
  label: string;
  count: number;
  percent: number;
  tone: "green" | "blue" | "purple" | "red";
};

export type PublishingOverviewData = {
  totalPosts: number;
  slices: PublishingOverviewSlice[];
};

export type PostsOverTimePoint = {
  dateKey: string;
  label: string;
  shortLabel: string;
  published: number;
  scheduled: number;
  failed: number;
};

export type PlatformPerformanceRow = {
  platform: SocialPlatform;
  label: string;
  publishedCount: number;
  scheduledCount: number;
  failedCount: number;
  successRate: number | null;
  successBarPercent: number;
  publishedTrendPercent: number | null;
  publishedTrendDirection: AnalyticsTrendDirection;
  reachValue: number;
  reachDisplay: string;
  reachTrendLabel: string;
  engagementValue: number;
  engagementDisplay: string;
  engagementTrendLabel: string;
};

export type SchedulingHealthSummary = {
  score: number;
  coveragePercent: number;
  emptyDays: number;
  lowDays: number;
  healthyDays: number;
  summaryText: string;
  noContentGapsText: string;
  bestDaysLabel: string;
  optimalTimesLabel: string;
};

export type AnalyticsDashboardRange = {
  currentLabel: string;
  previousLabel: string;
  comparisonPercent: number | null;
  comparisonDirection: AnalyticsTrendDirection;
};

function readFilterValue(source: FilterSource, key: string) {
  if (source instanceof URLSearchParams) {
    return source.get(key) || "";
  }

  const raw = source[key];
  if (Array.isArray(raw)) {
    return raw[0] || "";
  }

  return raw || "";
}

function normalizePlatformFilter(value: string): AnalyticsPlatformFilter {
  const normalized = value.trim().toUpperCase();
  if (ANALYTICS_PLATFORM_FILTERS.includes(normalized as AnalyticsPlatformFilter)) {
    return normalized as AnalyticsPlatformFilter;
  }

  return "ALL";
}

function normalizeStatusFilter(value: string): AnalyticsStatusFilter {
  const normalized = value.trim().toUpperCase();
  if (ANALYTICS_STATUS_FILTERS.includes(normalized as AnalyticsStatusFilter)) {
    return normalized as AnalyticsStatusFilter;
  }

  return "ALL";
}

function normalizeAttemptStatusFilter(value: string): AnalyticsAttemptStatusFilter {
  const normalized = value.trim().toUpperCase();
  if (ANALYTICS_ATTEMPT_STATUS_FILTERS.includes(normalized as AnalyticsAttemptStatusFilter)) {
    return normalized as AnalyticsAttemptStatusFilter;
  }

  return "ALL";
}

export function parseAnalyticsFilters(source: FilterSource): AnalyticsFilters {
  return {
    platform: normalizePlatformFilter(readFilterValue(source, "platform")),
    userId: readFilterValue(source, "userId").trim(),
    status: normalizeStatusFilter(readFilterValue(source, "status")),
    from: readFilterValue(source, "from").trim(),
    to: readFilterValue(source, "to").trim(),
    attemptPlatform: normalizePlatformFilter(readFilterValue(source, "attemptPlatform")),
    attemptStatus: normalizeAttemptStatusFilter(readFilterValue(source, "attemptStatus")),
  };
}

function createRangeBounds(input: { from: string; to: string; timezone: string }) {
  const fromDate = input.from
    ? DateTime.fromFormat(input.from, "yyyy-MM-dd", { zone: input.timezone }).startOf("day")
    : null;
  const toDate = input.to
    ? DateTime.fromFormat(input.to, "yyyy-MM-dd", { zone: input.timezone }).plus({ days: 1 }).startOf("day")
    : null;

  return {
    from: fromDate?.isValid ? fromDate.toUTC().toJSDate() : null,
    to: toDate?.isValid ? toDate.toUTC().toJSDate() : null,
  };
}

function buildDateRangeCondition(input: { from: Date | null; to: Date | null }) {
  if (!input.from && !input.to) {
    return undefined;
  }

  return {
    gte: input.from ?? undefined,
    lt: input.to ?? undefined,
  };
}

function addAndCondition(
  where: Prisma.SocialPostWhereInput,
  condition: Prisma.SocialPostWhereInput,
) {
  if (!where.AND) {
    where.AND = [];
  }

  if (Array.isArray(where.AND)) {
    where.AND.push(condition);
    return;
  }

  where.AND = [where.AND, condition];
}

function buildPublishHistoryWhere(filters: AnalyticsFilters, timezone: string): Prisma.SocialPostWhereInput {
  const where: Prisma.SocialPostWhereInput = {};

  if (filters.platform !== "ALL") {
    where.platforms = {
      some: {
        platform: filters.platform,
      },
    };
  }

  if (filters.userId) {
    where.createdByAdminUserId = filters.userId;
  }

  if (filters.status === "PARTIAL_FAILED") {
    addAndCondition(where, {
      platforms: {
        some: {
          status: SocialPostStatus.FAILED,
        },
      },
    });
    addAndCondition(where, {
      platforms: {
        some: {
          status: {
            in: [
              SocialPostStatus.DRAFT,
              SocialPostStatus.SCHEDULED,
              SocialPostStatus.PUBLISHING,
              SocialPostStatus.PUBLISHED,
            ],
          },
        },
      },
    });
  } else if (filters.status !== "ALL") {
    where.status = filters.status;
  }

  const rangeBounds = createRangeBounds({
    from: filters.from,
    to: filters.to,
    timezone,
  });
  const rangeCondition = buildDateRangeCondition(rangeBounds);
  if (rangeCondition) {
    addAndCondition(where, {
      OR: [
        { publishedAt: rangeCondition },
        { scheduledAt: rangeCondition },
        { createdAt: rangeCondition },
      ],
    });
  }

  return where;
}

function buildPublishAttemptWhere(filters: AnalyticsFilters, timezone: string): Prisma.PublishAttemptWhereInput {
  const where: Prisma.PublishAttemptWhereInput = {};

  if (filters.attemptPlatform !== "ALL") {
    where.platform = filters.attemptPlatform;
  }

  if (filters.attemptStatus !== "ALL") {
    where.status = filters.attemptStatus;
  }

  if (filters.userId) {
    where.socialPost = {
      is: {
        createdByAdminUserId: filters.userId,
      },
    };
  }

  if (filters.platform !== "ALL") {
    where.socialPostPlatform = {
      is: {
        platform: filters.platform,
      },
    };
  }

  const rangeBounds = createRangeBounds({
    from: filters.from,
    to: filters.to,
    timezone,
  });
  const rangeCondition = buildDateRangeCondition(rangeBounds);
  if (rangeCondition) {
    where.startedAt = rangeCondition;
  }

  return where;
}

export function getSocialPlatformLabel(platform: SocialPlatform) {
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

function extractResponseSummaryMessage(value: Prisma.JsonValue | null | undefined): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const summary = value as Record<string, unknown>;
  const directCandidates = [
    summary.errorMessage,
    summary.message,
    summary.error,
    summary.statusText,
  ];

  for (const candidate of directCandidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }

    if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
      const nested = candidate as Record<string, unknown>;
      if (typeof nested.message === "string" && nested.message.trim()) {
        return nested.message.trim();
      }
      if (typeof nested.error_user_msg === "string" && nested.error_user_msg.trim()) {
        return nested.error_user_msg.trim();
      }
      if (typeof nested.error_user_title === "string" && nested.error_user_title.trim()) {
        return nested.error_user_title.trim();
      }
    }
  }

  return null;
}

function normalizeFailureReason(input: {
  errorMessage?: string | null;
  errorCode?: string | null;
  responseSummary?: Prisma.JsonValue | null;
}) {
  const base =
    input.errorMessage?.trim() ||
    extractResponseSummaryMessage(input.responseSummary) ||
    input.errorCode?.trim() ||
    "Unknown failure";
  const compact = base.replace(/\s+/g, " ").trim();
  if (compact.length <= 120) {
    return compact;
  }

  return `${compact.slice(0, 117).trimEnd()}...`;
}

function getCreatorDisplayName(user: {
  displayName: string | null;
  username: string;
}) {
  return user.displayName?.trim() || user.username;
}

function formatCompactNumber(value: number) {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M`;
  }

  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1)}K`;
  }

  return `${value}`;
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, value));
}

function resolveTrendDirection(current: number, previous: number): AnalyticsTrendDirection {
  if (current === previous) {
    return "flat";
  }

  return current > previous ? "up" : "down";
}

function calculateTrendPercent(current: number, previous: number) {
  if (previous === 0) {
    if (current === 0) {
      return 0;
    }

    return 100;
  }

  return ((current - previous) / previous) * 100;
}

function formatTrendLabel(input: {
  current: number;
  previous: number;
  suffix?: string;
}) {
  const percent = calculateTrendPercent(input.current, input.previous);
  if (input.previous === 0 && input.current > 0) {
    return {
      percent,
      direction: "up" as const,
      label: "New activity vs previous period",
    };
  }

  const direction = resolveTrendDirection(input.current, input.previous);
  const sign = direction === "down" ? "-" : "+";
  const rounded = Math.abs(percent) >= 10 ? Math.round(Math.abs(percent)) : Number(Math.abs(percent).toFixed(1));

  return {
    percent,
    direction,
    label: `${sign}${rounded}% ${input.suffix ?? "vs previous period"}`,
  };
}

function buildDaySeries(input: {
  start: DateTime;
  days: number;
  counts: Map<string, number>;
}) {
  return Array.from({ length: input.days }, (_, index) => {
    const day = input.start.plus({ days: index });
    const key = day.toFormat("yyyy-MM-dd");
    return input.counts.get(key) ?? 0;
  });
}

function buildDateKey(date: Date, timezone: string) {
  return DateTime.fromJSDate(date, { zone: "utc" }).setZone(timezone).toFormat("yyyy-MM-dd");
}

function buildDateLabel(date: DateTime) {
  return date.toFormat("MMM d");
}

async function countDistinctPublishedPostsForRange(input: { from: Date; to: Date }) {
  const rows = await prisma.socialPostPlatform.findMany({
    where: {
      publishedAt: {
        gte: input.from,
        lt: input.to,
      },
      status: SocialPostStatus.PUBLISHED,
    },
    distinct: ["socialPostId"],
    select: {
      socialPostId: true,
    },
  });

  return rows.length;
}

export async function getAnalyticsSummaryStats(timezone: string): Promise<AnalyticsSummaryStats> {
  const now = DateTime.now().setZone(timezone);
  const todayStart = now.startOf("day").toUTC().toJSDate();
  const tomorrowStart = now.plus({ days: 1 }).startOf("day").toUTC().toJSDate();
  const weekStart = now.startOf("week").toUTC().toJSDate();
  const nextWeekStart = now.startOf("week").plus({ weeks: 1 }).toUTC().toJSDate();
  const monthStart = now.startOf("month").toUTC().toJSDate();
  const nextMonthStart = now.startOf("month").plus({ months: 1 }).toUTC().toJSDate();

  const [
    publishedToday,
    publishedThisWeek,
    publishedThisMonth,
    scheduledPosts,
    draftPosts,
    failedPosts,
  ] = await Promise.all([
    countDistinctPublishedPostsForRange({
      from: todayStart,
      to: tomorrowStart,
    }),
    countDistinctPublishedPostsForRange({
      from: weekStart,
      to: nextWeekStart,
    }),
    countDistinctPublishedPostsForRange({
      from: monthStart,
      to: nextMonthStart,
    }),
    prisma.socialPost.count({
      where: {
        status: SocialPostStatus.SCHEDULED,
      },
    }),
    prisma.socialPost.count({
      where: {
        status: SocialPostStatus.DRAFT,
      },
    }),
    prisma.socialPost.count({
      where: {
        status: SocialPostStatus.FAILED,
      },
    }),
  ]);

  return {
    publishedToday,
    publishedThisWeek,
    publishedThisMonth,
    scheduledPosts,
    draftPosts,
    failedPosts,
  };
}

export async function getPlatformBreakdownCards(): Promise<PlatformBreakdownCard[]> {
  const platforms = [
    SocialPlatform.FACEBOOK,
    SocialPlatform.INSTAGRAM,
    SocialPlatform.GOOGLE_BUSINESS,
  ];

  const cardValues = await Promise.all(
    platforms.map(async (platform) => {
      const [publishedCount, scheduledCount, failedCount] = await Promise.all([
        prisma.socialPostPlatform.count({
          where: {
            platform,
            status: SocialPostStatus.PUBLISHED,
          },
        }),
        prisma.socialPostPlatform.count({
          where: {
            platform,
            status: SocialPostStatus.SCHEDULED,
          },
        }),
        prisma.socialPostPlatform.count({
          where: {
            platform,
            status: SocialPostStatus.FAILED,
          },
        }),
      ]);

      const successRateBase = publishedCount + failedCount;

      return {
        platform,
        label: getSocialPlatformLabel(platform),
        publishedCount,
        scheduledCount,
        failedCount,
        successRate: successRateBase > 0 ? (publishedCount / successRateBase) * 100 : null,
      };
    }),
  );

  return cardValues;
}

export async function getPublishHistory(filters: AnalyticsFilters, timezone: string, limit = 150) {
  const rows = await prisma.socialPost.findMany({
    where: buildPublishHistoryWhere(filters, timezone),
    orderBy: [{ publishedAt: "desc" }, { scheduledAt: "desc" }, { updatedAt: "desc" }],
    include: {
      createdByAdminUser: {
        select: {
          displayName: true,
          username: true,
          role: true,
        },
      },
      platforms: {
        orderBy: {
          platform: "asc",
        },
      },
    },
    take: limit,
  });

  return rows.map((row) => {
    const aggregateOutcome = getAggregatePlatformOutcome(row.platforms, row.status);
    const date = resolvePostCalendarAt(row);

    return {
      id: row.id,
      date,
      creatorName: getCreatorDisplayName(row.createdByAdminUser),
      creatorRole: row.createdByAdminUser.role,
      statusLabel: aggregateOutcome.label,
      statusTone: aggregateOutcome.tone,
      descriptionPreview: getPostDescriptionPreview(row, row.platforms.map((platform) => platform.platform)),
      platforms: row.platforms.map((platform) => ({
        platform: platform.platform,
        status: platform.status,
      })),
      publishedLinks: row.platforms
        .filter((platform) => Boolean(platform.platformPostUrl))
        .map((platform) => ({
          platform: platform.platform,
          url: platform.platformPostUrl as string,
        })),
    } satisfies PublishHistoryRow;
  });
}

export async function getUserAnalyticsRows(): Promise<UserAnalyticsRow[]> {
  const [users, postStatusCounts, publishedPosts] = await Promise.all([
    prisma.adminUser.findMany({
      orderBy: {
        username: "asc",
      },
      select: {
        id: true,
        displayName: true,
        username: true,
        email: true,
        role: true,
      },
    }),
    prisma.socialPost.groupBy({
      by: ["createdByAdminUserId", "status"],
      _count: {
        _all: true,
      },
    }),
    prisma.socialPost.findMany({
      where: {
        platforms: {
          some: {
            status: SocialPostStatus.PUBLISHED,
          },
        },
      },
      select: {
        id: true,
        createdByAdminUserId: true,
      },
    }),
  ]);

  const publishedCounts = new Map<string, number>();
  for (const post of publishedPosts) {
    publishedCounts.set(post.createdByAdminUserId, (publishedCounts.get(post.createdByAdminUserId) ?? 0) + 1);
  }

  const groupedStatusCounts = new Map<string, Partial<Record<SocialPostStatus, number>>>();
  for (const row of postStatusCounts) {
    const current = groupedStatusCounts.get(row.createdByAdminUserId) ?? {};
    current[row.status] = row._count._all;
    groupedStatusCounts.set(row.createdByAdminUserId, current);
  }

  return users
    .filter((user) => !isDeletedArchiveUser(user))
    .map((user) => {
      const statusCounts = groupedStatusCounts.get(user.id) ?? {};

      return {
        id: user.id,
        displayName: user.displayName?.trim() || user.username,
        username: user.username,
        role: user.role,
        publishedPosts: publishedCounts.get(user.id) ?? 0,
        scheduledPosts: statusCounts[SocialPostStatus.SCHEDULED] ?? 0,
        failedPosts: statusCounts[SocialPostStatus.FAILED] ?? 0,
        draftPosts: statusCounts[SocialPostStatus.DRAFT] ?? 0,
      };
    })
    .sort((left, right) => {
      if (right.publishedPosts !== left.publishedPosts) {
        return right.publishedPosts - left.publishedPosts;
      }
      if (right.scheduledPosts !== left.scheduledPosts) {
        return right.scheduledPosts - left.scheduledPosts;
      }
      return left.displayName.localeCompare(right.displayName, undefined, { sensitivity: "base" });
    });
}

export async function getFailureAnalytics(recentLimit = 20) {
  const failedAttempts = await prisma.publishAttempt.findMany({
    where: {
      status: PublishAttemptStatus.FAILED,
    },
    orderBy: {
      startedAt: "desc",
    },
    include: {
      socialPost: {
        select: {
          id: true,
          caption: true,
          descriptionMain: true,
          descriptionFacebook: true,
          descriptionInstagram: true,
          descriptionGoogleBusiness: true,
          createdByAdminUser: {
            select: {
              displayName: true,
              username: true,
              role: true,
            },
          },
        },
      },
    },
    take: 250,
  });

  const retryCountRows =
    failedAttempts.length > 0
      ? await prisma.publishAttempt.groupBy({
          by: ["socialPostPlatformId"],
          where: {
            socialPostPlatformId: {
              in: failedAttempts.map((attempt) => attempt.socialPostPlatformId),
            },
          },
          _count: {
            _all: true,
          },
        })
      : [];
  const retryCounts = new Map(
    retryCountRows.map((row) => [row.socialPostPlatformId, Math.max(0, row._count._all - 1)]),
  );

  const grouped = new Map<string, FailureReasonRow>();
  for (const attempt of failedAttempts) {
    const reason = normalizeFailureReason({
      errorMessage: attempt.errorMessage,
      errorCode: attempt.errorCode,
      responseSummary: attempt.responseSummary,
    });
    const key = `${attempt.platform}:${reason}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      grouped.set(key, {
        platform: attempt.platform,
        platformLabel: getSocialPlatformLabel(attempt.platform),
        reason,
        count: 1,
      });
    }
  }

  const commonReasons = [...grouped.values()].sort((left, right) => {
    if (right.count !== left.count) {
      return right.count - left.count;
    }
    return left.reason.localeCompare(right.reason, undefined, { sensitivity: "base" });
  });

  const recentFailures = failedAttempts.slice(0, recentLimit).map((attempt) => ({
    id: attempt.id,
    socialPostId: attempt.socialPostId,
    postDetailHref: `/dashboard/posts/${attempt.socialPostId}/advanced`,
    startedAt: attempt.startedAt,
    finishedAt: attempt.finishedAt,
    durationMs: attempt.finishedAt ? attempt.finishedAt.getTime() - attempt.startedAt.getTime() : null,
    platform: attempt.platform,
    status: attempt.status,
    creatorName: getCreatorDisplayName(attempt.socialPost.createdByAdminUser),
    creatorRole: attempt.socialPost.createdByAdminUser.role,
    descriptionPreview: getPostDescriptionPreview(attempt.socialPost, [attempt.platform]),
    errorSummary: normalizeFailureReason({
      errorMessage: attempt.errorMessage,
      errorCode: attempt.errorCode,
      responseSummary: attempt.responseSummary,
    }),
    retryCount: retryCounts.get(attempt.socialPostPlatformId) ?? 0,
    platformPostUrl: attempt.platformPostUrl,
  })) satisfies PublishAttemptInsightRow[];

  return {
    commonReasons,
    recentFailures,
  };
}

export async function getPublishAttemptInsights(filters: AnalyticsFilters, timezone: string) {
  const attempts = await prisma.publishAttempt.findMany({
    where: buildPublishAttemptWhere(filters, timezone),
    orderBy: {
      startedAt: "desc",
    },
    include: {
      socialPost: {
        select: {
          id: true,
          caption: true,
          descriptionMain: true,
          descriptionFacebook: true,
          descriptionInstagram: true,
          descriptionGoogleBusiness: true,
          createdByAdminUser: {
            select: {
              displayName: true,
              username: true,
              role: true,
            },
          },
        },
      },
    },
    take: 30,
  });

  const retryCountRows =
    attempts.length > 0
      ? await prisma.publishAttempt.groupBy({
          by: ["socialPostPlatformId"],
          where: {
            socialPostPlatformId: {
              in: attempts.map((attempt) => attempt.socialPostPlatformId),
            },
          },
          _count: {
            _all: true,
          },
        })
      : [];
  const retryCounts = new Map(
    retryCountRows.map((row) => [row.socialPostPlatformId, Math.max(0, row._count._all - 1)]),
  );

  return attempts.map((attempt) => ({
    id: attempt.id,
    socialPostId: attempt.socialPostId,
    postDetailHref: `/dashboard/posts/${attempt.socialPostId}/advanced`,
    startedAt: attempt.startedAt,
    finishedAt: attempt.finishedAt,
    durationMs: attempt.finishedAt ? attempt.finishedAt.getTime() - attempt.startedAt.getTime() : null,
    platform: attempt.platform,
    status: attempt.status,
    creatorName: getCreatorDisplayName(attempt.socialPost.createdByAdminUser),
    creatorRole: attempt.socialPost.createdByAdminUser.role,
    descriptionPreview: getPostDescriptionPreview(attempt.socialPost, [attempt.platform]),
    errorSummary: normalizeFailureReason({
      errorMessage: attempt.errorMessage,
      errorCode: attempt.errorCode,
      responseSummary: attempt.responseSummary,
    }),
    retryCount: retryCounts.get(attempt.socialPostPlatformId) ?? 0,
    platformPostUrl: attempt.platformPostUrl,
  })) satisfies PublishAttemptInsightRow[];
}

function resolveScheduleHealthState(count: number): ScheduleHealthDay["state"] {
  if (count <= 0) {
    return "empty";
  }

  if (count === 1) {
    return "low";
  }

  return "healthy";
}

async function buildScheduleHealthWindow(input: {
  timezone: string;
  days: number;
}) {
  const zoneNow = DateTime.now().setZone(input.timezone);
  const start = zoneNow.startOf("day");
  const end = start.plus({ days: input.days });
  const scheduledPosts = await prisma.socialPost.findMany({
    where: {
      status: SocialPostStatus.SCHEDULED,
      scheduledAt: {
        gte: start.toUTC().toJSDate(),
        lt: end.toUTC().toJSDate(),
      },
    },
    select: {
      scheduledAt: true,
    },
  });

  const countByDate = new Map<string, number>();
  for (const post of scheduledPosts) {
    if (!post.scheduledAt) {
      continue;
    }

    const key = DateTime.fromJSDate(post.scheduledAt, { zone: "utc" }).setZone(input.timezone).toFormat("yyyy-MM-dd");
    countByDate.set(key, (countByDate.get(key) ?? 0) + 1);
  }

  return Array.from({ length: input.days }, (_, index) => {
    const day = start.plus({ days: index });
    const dateKey = day.toFormat("yyyy-MM-dd");
    const count = countByDate.get(dateKey) ?? 0;

    return {
      dateKey,
      label: day.toFormat("ccc d"),
      count,
      state: resolveScheduleHealthState(count),
    } satisfies ScheduleHealthDay;
  });
}

export async function getScheduleHealth(timezone: string) {
  const [next7Days, next30Days] = await Promise.all([
    buildScheduleHealthWindow({
      timezone,
      days: 7,
    }),
    buildScheduleHealthWindow({
      timezone,
      days: 30,
    }),
  ]);

  return {
    next7Days,
    next30Days,
  };
}

export async function getQueueOverview(timezone: string) {
  const now = DateTime.now().setZone(timezone);
  const todayStart = now.startOf("day");
  const tomorrowStart = todayStart.plus({ days: 1 });
  const dayAfterTomorrowStart = todayStart.plus({ days: 2 });
  const weekEnd = todayStart.plus({ days: 7 });

  const rows = await prisma.socialPost.findMany({
    where: {
      status: SocialPostStatus.SCHEDULED,
      scheduledAt: {
        gte: todayStart.toUTC().toJSDate(),
        lt: weekEnd.toUTC().toJSDate(),
      },
    },
    orderBy: {
      scheduledAt: "asc",
    },
    include: {
      createdByAdminUser: {
        select: {
          displayName: true,
          username: true,
        },
      },
      platforms: {
        orderBy: {
          platform: "asc",
        },
      },
    },
    take: 24,
  });

  const makeItem = (row: (typeof rows)[number]) => ({
    id: row.id,
    scheduledAt: row.scheduledAt as Date,
    creatorName: getCreatorDisplayName(row.createdByAdminUser),
    descriptionPreview: getPostDescriptionPreview(row, row.platforms.map((platform) => platform.platform)),
    platforms: row.platforms.map((platform) => ({
      platform: platform.platform,
      status: platform.status,
    })),
  });

  return {
    today: rows
      .filter((row) => row.scheduledAt && row.scheduledAt >= todayStart.toUTC().toJSDate() && row.scheduledAt < tomorrowStart.toUTC().toJSDate())
      .map(makeItem),
    tomorrow: rows
      .filter((row) => row.scheduledAt && row.scheduledAt >= tomorrowStart.toUTC().toJSDate() && row.scheduledAt < dayAfterTomorrowStart.toUTC().toJSDate())
      .map(makeItem),
    thisWeek: rows
      .filter((row) => row.scheduledAt && row.scheduledAt >= dayAfterTomorrowStart.toUTC().toJSDate() && row.scheduledAt < weekEnd.toUTC().toJSDate())
      .map(makeItem),
  };
}

type ActivityTone = "info" | "success" | "error";

function buildActivityMessage(action: string, actorName: string, metadata: Prisma.JsonValue | null): {
  message: string;
  tone: ActivityTone;
} {
  const details =
    metadata && typeof metadata === "object" && !Array.isArray(metadata) ? (metadata as Record<string, unknown>) : {};
  const platform =
    typeof details.platform === "string" && Object.values(SocialPlatform).includes(details.platform as SocialPlatform)
      ? (details.platform as SocialPlatform)
      : null;
  const platformLabel = platform ? getSocialPlatformLabel(platform) : "platform";

  switch (action) {
    case AUDIT_ACTIONS.POST_PUBLISH_SUCCEEDED:
      return {
        message: `${actorName} published a ${platformLabel} post.`,
        tone: "success",
      };
    case AUDIT_ACTIONS.POST_PUBLISH_FAILED:
      return {
        message: `${actorName} hit a ${platformLabel} publish failure.`,
        tone: "error",
      };
    case AUDIT_ACTIONS.POST_SCHEDULED:
      return {
        message: `${actorName} scheduled a post.`,
        tone: "info",
      };
    case AUDIT_ACTIONS.DRAFT_SAVED:
      return {
        message: `${actorName} saved a draft.`,
        tone: "info",
      };
    case AUDIT_ACTIONS.FACEBOOK_RECONNECT_SUCCEEDED:
      return {
        message: `${actorName} reconnected Facebook.`,
        tone: "success",
      };
    case AUDIT_ACTIONS.GOOGLE_CONNECTED:
    case AUDIT_ACTIONS.GOOGLE_RECONNECT_SUCCEEDED:
      return {
        message: `${actorName} connected Google Business.`,
        tone: "success",
      };
    case AUDIT_ACTIONS.USER_CREATED:
      return {
        message: `${actorName} created a user account.`,
        tone: "info",
      };
    default:
      return {
        message: `${actorName} updated the scheduler.`,
        tone: "info",
      };
  }
}

export async function getRecentActivityFeed() {
  const rows = await prisma.auditLog.findMany({
    where: {
      action: {
        in: [
          AUDIT_ACTIONS.POST_PUBLISH_SUCCEEDED,
          AUDIT_ACTIONS.POST_PUBLISH_FAILED,
          AUDIT_ACTIONS.POST_SCHEDULED,
          AUDIT_ACTIONS.DRAFT_SAVED,
          AUDIT_ACTIONS.FACEBOOK_RECONNECT_SUCCEEDED,
          AUDIT_ACTIONS.GOOGLE_CONNECTED,
          AUDIT_ACTIONS.GOOGLE_RECONNECT_SUCCEEDED,
          AUDIT_ACTIONS.USER_CREATED,
        ],
      },
    },
    orderBy: {
      createdAt: "desc",
    },
    include: {
      actorAdminUser: {
        select: {
          displayName: true,
          username: true,
        },
      },
    },
    take: 12,
  });

  return rows.map((row) => {
    const actorName = row.actorAdminUser ? getCreatorDisplayName(row.actorAdminUser) : "System";
    const { message, tone } = buildActivityMessage(row.action, actorName, row.metadata);

    return {
      id: row.id,
      createdAt: row.createdAt,
      actorName,
      message,
      tone,
    } satisfies RecentActivityItem;
  });
}

async function getDistinctPublishedPostCountsByDay(input: {
  from: Date;
  to: Date;
  timezone: string;
}) {
  const rows = await prisma.socialPostPlatform.findMany({
    where: {
      status: SocialPostStatus.PUBLISHED,
      publishedAt: {
        gte: input.from,
        lt: input.to,
      },
    },
    select: {
      socialPostId: true,
      publishedAt: true,
    },
  });

  const seen = new Set<string>();
  const counts = new Map<string, number>();

  for (const row of rows) {
    if (!row.publishedAt) {
      continue;
    }

    const dateKey = buildDateKey(row.publishedAt, input.timezone);
    const distinctKey = `${row.socialPostId}:${dateKey}`;
    if (seen.has(distinctKey)) {
      continue;
    }

    seen.add(distinctKey);
    counts.set(dateKey, (counts.get(dateKey) ?? 0) + 1);
  }

  return counts;
}

function buildDashboardRange(timezone: string) {
  const now = DateTime.now().setZone(timezone);
  const currentEnd = now.plus({ days: 1 }).startOf("day");
  const currentStart = currentEnd.minus({ days: 30 });
  const previousEnd = currentStart;
  const previousStart = previousEnd.minus({ days: 30 });

  return {
    currentStart,
    currentEnd,
    previousStart,
    previousEnd,
    currentLabel: `${buildDateLabel(currentStart)} - ${buildDateLabel(currentEnd.minus({ days: 1 }))}, ${currentEnd.minus({ days: 1 }).toFormat("yyyy")}`,
    previousLabel: `${buildDateLabel(previousStart)} - ${buildDateLabel(previousEnd.minus({ days: 1 }))}, ${previousEnd.minus({ days: 1 }).toFormat("yyyy")}`,
  };
}

async function getAnalyticsDashboardMetricCards(timezone: string): Promise<{
  dateRange: AnalyticsDashboardRange;
  metricCards: AnalyticsDashboardMetricCard[];
}> {
  const range = buildDashboardRange(timezone);
  const upcomingWindowEnd = DateTime.now().setZone(timezone).plus({ days: 30 }).endOf("day");

  const [
    publishedCurrent,
    publishedPrevious,
    publishedSeriesCounts,
    scheduledCurrent,
    scheduledPrevious,
    scheduledSeriesRows,
  ] = await Promise.all([
    countDistinctPublishedPostsForRange({
      from: range.currentStart.toUTC().toJSDate(),
      to: range.currentEnd.toUTC().toJSDate(),
    }),
    countDistinctPublishedPostsForRange({
      from: range.previousStart.toUTC().toJSDate(),
      to: range.previousEnd.toUTC().toJSDate(),
    }),
    getDistinctPublishedPostCountsByDay({
      from: range.currentStart.toUTC().toJSDate(),
      to: range.currentEnd.toUTC().toJSDate(),
      timezone,
    }),
    prisma.socialPost.count({
      where: {
        status: SocialPostStatus.SCHEDULED,
      },
    }),
    prisma.socialPost.count({
      where: {
        scheduledAt: {
          gte: range.previousStart.toUTC().toJSDate(),
          lt: range.previousEnd.toUTC().toJSDate(),
        },
      },
    }),
    prisma.socialPost.findMany({
      where: {
        status: SocialPostStatus.SCHEDULED,
        scheduledAt: {
          gte: DateTime.now().setZone(timezone).startOf("day").toUTC().toJSDate(),
          lt: upcomingWindowEnd.toUTC().toJSDate(),
        },
      },
      select: {
        scheduledAt: true,
      },
    }),
  ]);

  const publishedTrend = formatTrendLabel({
    current: publishedCurrent,
    previous: publishedPrevious,
    suffix: "vs previous 30 days",
  });
  const scheduledTrend = formatTrendLabel({
    current: scheduledCurrent,
    previous: scheduledPrevious,
    suffix: "vs previous window",
  });

  const scheduledSeriesCounts = new Map<string, number>();
  for (const row of scheduledSeriesRows) {
    if (!row.scheduledAt) {
      continue;
    }

    const key = buildDateKey(row.scheduledAt, timezone);
    scheduledSeriesCounts.set(key, (scheduledSeriesCounts.get(key) ?? 0) + 1);
  }

  const publishedSeries = buildDaySeries({
    start: range.currentStart,
    days: 30,
    counts: publishedSeriesCounts,
  });
  const scheduledSeries = buildDaySeries({
    start: DateTime.now().setZone(timezone).startOf("day"),
    days: 30,
    counts: scheduledSeriesCounts,
  });

  return {
    dateRange: {
      currentLabel: range.currentLabel,
      previousLabel: range.previousLabel,
      comparisonPercent: publishedTrend.percent,
      comparisonDirection: publishedTrend.direction,
    },
    metricCards: [
      {
        key: "published",
        label: "Published Posts",
        value: publishedCurrent,
        displayValue: formatCompactNumber(publishedCurrent),
        trendPercent: publishedTrend.percent,
        trendDirection: publishedTrend.direction,
        trendLabel: publishedTrend.label,
        iconTone: "green",
        series: publishedSeries,
      },
      {
        key: "scheduled",
        label: "Scheduled Posts",
        value: scheduledCurrent,
        displayValue: formatCompactNumber(scheduledCurrent),
        trendPercent: scheduledTrend.percent,
        trendDirection: scheduledTrend.direction,
        trendLabel: scheduledTrend.label,
        iconTone: "blue",
        series: scheduledSeries,
      },
      {
        key: "reach",
        label: "Total Reach",
        value: 0,
        displayValue: "0",
        trendPercent: null,
        trendDirection: "flat",
        trendLabel: "Awaiting platform metrics",
        iconTone: "purple",
        series: Array.from({ length: 30 }, () => 0),
      },
      {
        key: "engagement",
        label: "Engagements",
        value: 0,
        displayValue: "0",
        trendPercent: null,
        trendDirection: "flat",
        trendLabel: "Awaiting platform metrics",
        iconTone: "orange",
        series: Array.from({ length: 30 }, () => 0),
      },
    ],
  };
}

async function getPublishingOverviewData(): Promise<PublishingOverviewData> {
  const rows = await prisma.socialPost.findMany({
    select: {
      id: true,
      status: true,
      platforms: {
        select: {
          status: true,
        },
      },
    },
  });

  let publishedCount = 0;
  let scheduledCount = 0;
  let draftCount = 0;
  let failedCount = 0;

  for (const row of rows) {
    const aggregateOutcome = getAggregatePlatformOutcome(row.platforms, row.status);
    if (aggregateOutcome.tone === "published") {
      publishedCount += 1;
      continue;
    }

    if (aggregateOutcome.tone === "scheduled" || aggregateOutcome.tone === "publishing") {
      scheduledCount += 1;
      continue;
    }

    if (aggregateOutcome.tone === "failed" || aggregateOutcome.tone === "cancelled") {
      failedCount += 1;
      continue;
    }

    draftCount += 1;
  }

  const totalPosts = publishedCount + scheduledCount + draftCount + failedCount;
  const toPercent = (count: number) => (totalPosts > 0 ? (count / totalPosts) * 100 : 0);

  return {
    totalPosts,
    slices: [
      {
        key: "published",
        label: "Published",
        count: publishedCount,
        percent: toPercent(publishedCount),
        tone: "green",
      },
      {
        key: "scheduled",
        label: "Scheduled",
        count: scheduledCount,
        percent: toPercent(scheduledCount),
        tone: "blue",
      },
      {
        key: "draft",
        label: "Drafts",
        count: draftCount,
        percent: toPercent(draftCount),
        tone: "purple",
      },
      {
        key: "failed",
        label: "Failed",
        count: failedCount,
        percent: toPercent(failedCount),
        tone: "red",
      },
    ],
  };
}

async function getPostsOverTimeData(timezone: string) {
  const range = buildDashboardRange(timezone);
  const rows = await prisma.auditLog.findMany({
    where: {
      action: {
        in: [
          AUDIT_ACTIONS.POST_PUBLISH_SUCCEEDED,
          AUDIT_ACTIONS.POST_SCHEDULED,
          AUDIT_ACTIONS.POST_PUBLISH_FAILED,
        ],
      },
      createdAt: {
        gte: range.currentStart.toUTC().toJSDate(),
        lt: range.currentEnd.toUTC().toJSDate(),
      },
    },
    select: {
      action: true,
      createdAt: true,
    },
  });

  const points = new Map<
    string,
    {
      published: number;
      scheduled: number;
      failed: number;
    }
  >();

  for (const row of rows) {
    const key = buildDateKey(row.createdAt, timezone);
    const existing = points.get(key) ?? {
      published: 0,
      scheduled: 0,
      failed: 0,
    };

    if (row.action === AUDIT_ACTIONS.POST_PUBLISH_SUCCEEDED) {
      existing.published += 1;
    } else if (row.action === AUDIT_ACTIONS.POST_SCHEDULED) {
      existing.scheduled += 1;
    } else if (row.action === AUDIT_ACTIONS.POST_PUBLISH_FAILED) {
      existing.failed += 1;
    }

    points.set(key, existing);
  }

  return Array.from({ length: 30 }, (_, index) => {
    const day = range.currentStart.plus({ days: index });
    const dateKey = day.toFormat("yyyy-MM-dd");
    const point = points.get(dateKey) ?? {
      published: 0,
      scheduled: 0,
      failed: 0,
    };

    return {
      dateKey,
      label: day.toFormat("MMM d"),
      shortLabel: day.toFormat("MMM d"),
      published: point.published,
      scheduled: point.scheduled,
      failed: point.failed,
    } satisfies PostsOverTimePoint;
  });
}

async function getPlatformPerformanceRows(
  platformBreakdown: PlatformBreakdownCard[],
  timezone: string,
): Promise<PlatformPerformanceRow[]> {
  const range = buildDashboardRange(timezone);
  const rows = await Promise.all(
    platformBreakdown.map(async (card) => {
      const [currentPublished, previousPublished] = await Promise.all([
        prisma.socialPostPlatform.count({
          where: {
            platform: card.platform,
            status: SocialPostStatus.PUBLISHED,
            publishedAt: {
              gte: range.currentStart.toUTC().toJSDate(),
              lt: range.currentEnd.toUTC().toJSDate(),
            },
          },
        }),
        prisma.socialPostPlatform.count({
          where: {
            platform: card.platform,
            status: SocialPostStatus.PUBLISHED,
            publishedAt: {
              gte: range.previousStart.toUTC().toJSDate(),
              lt: range.previousEnd.toUTC().toJSDate(),
            },
          },
        }),
      ]);

      return {
        platform: card.platform,
        label: card.label,
        publishedCount: card.publishedCount,
        scheduledCount: card.scheduledCount,
        failedCount: card.failedCount,
        successRate: card.successRate,
        successBarPercent: clampPercent(card.successRate ?? 0),
        publishedTrendPercent: calculateTrendPercent(currentPublished, previousPublished),
        publishedTrendDirection: resolveTrendDirection(currentPublished, previousPublished),
        reachValue: 0,
        reachDisplay: "0",
        reachTrendLabel: "No API data yet",
        engagementValue: 0,
        engagementDisplay: "0",
        engagementTrendLabel: "No API data yet",
      } satisfies PlatformPerformanceRow;
    }),
  );

  return rows;
}

async function getSchedulingHealthSummary(timezone: string, scheduleHealth: Awaited<ReturnType<typeof getScheduleHealth>>) {
  const next30Days = scheduleHealth.next30Days;
  const emptyDays = next30Days.filter((day) => day.state === "empty").length;
  const lowDays = next30Days.filter((day) => day.state === "low").length;
  const healthyDays = next30Days.filter((day) => day.state === "healthy").length;
  const coveredDays = lowDays + healthyDays;
  const coveragePercent = next30Days.length > 0 ? Math.round((coveredDays / next30Days.length) * 100) : 0;
  const weightedScore = next30Days.length > 0 ? Math.round((((healthyDays * 1) + (lowDays * 0.55)) / next30Days.length) * 100) : 0;

  const publishedRows = await prisma.socialPostPlatform.findMany({
    where: {
      status: SocialPostStatus.PUBLISHED,
      publishedAt: {
        gte: DateTime.now().setZone(timezone).minus({ days: 90 }).startOf("day").toUTC().toJSDate(),
      },
    },
    select: {
      publishedAt: true,
    },
  });

  const weekdayCounts = new Map<string, number>();
  const hourCounts = new Map<number, number>();
  for (const row of publishedRows) {
    if (!row.publishedAt) {
      continue;
    }

    const publishedAt = DateTime.fromJSDate(row.publishedAt, { zone: "utc" }).setZone(timezone);
    const weekdayKey = publishedAt.toFormat("ccc");
    weekdayCounts.set(weekdayKey, (weekdayCounts.get(weekdayKey) ?? 0) + 1);
    hourCounts.set(publishedAt.hour, (hourCounts.get(publishedAt.hour) ?? 0) + 1);
  }

  const bestDays = [...weekdayCounts.entries()]
    .sort((left, right) => {
      if (right[1] !== left[1]) {
        return right[1] - left[1];
      }

      return left[0].localeCompare(right[0], undefined, { sensitivity: "base" });
    })
    .slice(0, 3)
    .map(([label]) => label);

  const topHour = [...hourCounts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? null;
  const bestDaysLabel = bestDays.length > 0 ? bestDays.join(", ") : "Not enough publish data yet";
  const optimalTimesLabel =
    topHour === null
      ? "Not enough timing data yet"
      : `${DateTime.fromObject({ hour: topHour }).toFormat("h a")} - ${DateTime.fromObject({ hour: (topHour + 2) % 24 }).toFormat("h a")}`;

  let summaryText = "Your schedule has a few gaps to tighten up.";
  if (emptyDays === 0 && lowDays <= 2) {
    summaryText = "Excellent! Keep maintaining your posting cadence.";
  } else if (emptyDays <= 2) {
    summaryText = "Looking strong. A little more coverage would smooth things out.";
  }

  return {
    score: weightedScore,
    coveragePercent,
    emptyDays,
    lowDays,
    healthyDays,
    summaryText,
    noContentGapsText:
      emptyDays === 0 ? "No content gaps" : `${emptyDays} day${emptyDays === 1 ? "" : "s"} still need coverage`,
    bestDaysLabel,
    optimalTimesLabel,
  } satisfies SchedulingHealthSummary;
}

export async function getAnalyticsPageData(filters: AnalyticsFilters, timezone: string) {
  const [
    summary,
    platformBreakdown,
    publishAttemptInsights,
    userAnalytics,
    failureAnalytics,
    scheduleHealth,
    queueOverview,
    recentActivity,
    dashboardMetrics,
    publishingOverview,
    postsOverTime,
  ] = await Promise.all([
    getAnalyticsSummaryStats(timezone),
    getPlatformBreakdownCards(),
    getPublishAttemptInsights(filters, timezone),
    getUserAnalyticsRows(),
    getFailureAnalytics(),
    getScheduleHealth(timezone),
    getQueueOverview(timezone),
    getRecentActivityFeed(),
    getAnalyticsDashboardMetricCards(timezone),
    getPublishingOverviewData(),
    getPostsOverTimeData(timezone),
  ]);

  const [platformPerformance, scheduleHealthSummary] = await Promise.all([
    getPlatformPerformanceRows(platformBreakdown, timezone),
    getSchedulingHealthSummary(timezone, scheduleHealth),
  ]);

  return {
    summary,
    platformBreakdown,
    publishAttemptInsights,
    userAnalytics,
    failureAnalytics,
    scheduleHealth,
    queueOverview,
    recentActivity,
    dashboard: {
      dateRange: dashboardMetrics.dateRange,
      metricCards: dashboardMetrics.metricCards,
      publishingOverview,
      postsOverTime,
      platformPerformance,
      scheduleHealthSummary,
    },
  };
}

export async function recordAnalyticsAuditEvent(input: {
  actorAdminUserId: string;
  action: string;
  targetType: string;
  targetId?: string | null;
  metadata?: Prisma.InputJsonValue;
}) {
  const { ipAddress, userAgent } = await getRequestMetadata();
  await createAuditLog({
    actorAdminUserId: input.actorAdminUserId,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId ?? null,
    ipAddress,
    userAgent,
    metadata: input.metadata,
  });
}
