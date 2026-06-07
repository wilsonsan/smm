import { DateTime } from "luxon";
import { SocialPlatform, SocialPostStatus } from "@prisma/client";
import { CalendarCommandCenter } from "@/components/calendar-command-center";
import { openNotificationAction } from "@/app/dashboard/actions";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { buildMonthGrid, formatMonthParam, shiftMonth } from "@/lib/calendar";
import { getPostCaptionPreview, resolvePostCalendarAt } from "@/lib/posts";
import { getMediaVariantUrl, getPreferredPreviewVariant } from "@/lib/media-presentation";
import { getNotificationCenterSnapshot } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import {
  formatDateTimeForTimezone,
  formatMonthLabel,
  getMonthRangeForTimezone,
  getResolvedAppTimezone,
} from "@/lib/time";

type CalendarPageProps = {
  searchParams?: Promise<{
    month?: string;
    statuses?: string;
    flash?: string;
  }>;
};

const CALENDAR_POST_STATUSES = [
  SocialPostStatus.DRAFT,
  SocialPostStatus.SCHEDULED,
  SocialPostStatus.PUBLISHING,
  SocialPostStatus.PUBLISHED,
  SocialPostStatus.FAILED,
  SocialPostStatus.CANCELLED,
];

function resolveInitialStatusFilter(rawStatuses: string | undefined) {
  if (!rawStatuses) {
    return "ALL" as const;
  }

  const selected = rawStatuses
    .split(",")
    .map((value) => value.trim().toUpperCase())
    .filter((value): value is SocialPostStatus => Object.values(SocialPostStatus).includes(value as SocialPostStatus));

  if (selected.length === 1) {
    return selected[0];
  }

  return "ALL" as const;
}

function buildCalendarHref(month: DateTime) {
  return `/dashboard/calendar?month=${formatMonthParam(month)}`;
}

function buildNewPostHref(dateKey: string) {
  const params = new URLSearchParams({
    date: dateKey,
    hour: "6",
    minute: "00",
    ampm: "PM",
    createdFrom: "calendar-date",
  });
  return `/dashboard/posts/new?${params.toString()}`;
}

export default async function CalendarPage({ searchParams }: CalendarPageProps) {
  await requireAuthenticatedUser();
  const resolvedSearchParams = await searchParams;
  const timezone = await getResolvedAppTimezone();
  const notificationCenter = await getNotificationCenterSnapshot();
  const { monthStart } = getMonthRangeForTimezone(resolvedSearchParams?.month, timezone);
  const previousMonth = shiftMonth(monthStart, -1);
  const nextMonth = shiftMonth(monthStart, 1);
  const currentMonth = DateTime.now().setZone(timezone).startOf("month");
  const todayDateKey = DateTime.now().setZone(timezone).toFormat("yyyy-MM-dd");
  const initialStatusFilter = resolveInitialStatusFilter(resolvedSearchParams?.statuses);
  const flashMessage =
    resolvedSearchParams?.flash === "published"
      ? "Post published successfully."
      : resolvedSearchParams?.flash === "scheduled"
        ? "Post scheduled successfully."
        : resolvedSearchParams?.flash === "draft"
          ? "Draft saved successfully."
          : null;

  const posts = await prisma.socialPost.findMany({
    where: {
      status: {
        in: CALENDAR_POST_STATUSES,
      },
      OR: [
        {
          scheduledAt: {
            gte: previousMonth.toUTC().toJSDate(),
            lt: nextMonth.plus({ months: 1 }).toUTC().toJSDate(),
          },
        },
        {
          publishedAt: {
            gte: previousMonth.toUTC().toJSDate(),
            lt: nextMonth.plus({ months: 1 }).toUTC().toJSDate(),
          },
        },
        {
          createdAt: {
            gte: previousMonth.toUTC().toJSDate(),
            lt: nextMonth.plus({ months: 1 }).toUTC().toJSDate(),
          },
        },
      ],
    },
    orderBy: [{ scheduledAt: "asc" }, { createdAt: "asc" }],
    include: {
      platforms: true,
      mediaAsset: {
        include: {
          variants: true,
        },
      },
    },
  });

  const calendarPosts = posts
    .map((post) => {
      const calendarAt = resolvePostCalendarAt(post);
      if (!calendarAt) {
        return null;
      }

      const previewVariant = getPreferredPreviewVariant(post.mediaAsset?.variants ?? []);

      return {
        id: post.id,
        caption: post.caption,
        captionPreview: getPostCaptionPreview(post.caption),
        status: post.status,
        calendarAtIso: calendarAt.toISOString(),
        platforms:
          post.platforms.length > 0
            ? post.platforms.map((platform) => platform.platform)
            : ([SocialPlatform.FACEBOOK] as SocialPlatform[]),
        mediaPreviewUrl: previewVariant ? getMediaVariantUrl(previewVariant.id) : null,
      };
    })
    .filter((post): post is NonNullable<typeof post> => post !== null);

  const days = buildMonthGrid(monthStart).map((day) => ({
    dateKey: day.dateKey,
    dayOfMonth: day.dayOfMonth,
    isCurrentMonth: day.isCurrentMonth,
  }));

  return (
    <CalendarCommandCenter
      monthLabel={formatMonthLabel(monthStart.toJSDate(), timezone)}
      timezone={timezone}
      todayDateKey={todayDateKey}
      previousMonthHref={buildCalendarHref(previousMonth)}
      nextMonthHref={buildCalendarHref(nextMonth)}
      todayHref={buildCalendarHref(currentMonth)}
      newPostTodayHref={buildNewPostHref(todayDateKey)}
      initialStatusFilter={initialStatusFilter}
      flashMessage={flashMessage}
      days={days}
      posts={calendarPosts}
      unreadCount={notificationCenter.unreadCount}
      notifications={notificationCenter.unreadNotifications.map((notification) => ({
        id: notification.id,
        title: notification.title,
        message: notification.message,
        actionUrl: notification.actionUrl,
        provider: notification.provider,
        severity: notification.severity,
        createdLabel: formatDateTimeForTimezone(notification.createdAt, timezone),
      }))}
      openNotificationAction={openNotificationAction}
    />
  );
}
