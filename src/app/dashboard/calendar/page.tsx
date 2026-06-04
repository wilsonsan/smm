import Link from "next/link";
import { DateTime } from "luxon";
import { SocialPlatform, SocialPostStatus } from "@prisma/client";
import { buildMonthGrid, formatMonthParam, shiftMonth } from "@/lib/calendar";
import { getPostCaptionPreview, getPostStatusTone, resolvePostCalendarAt } from "@/lib/posts";
import { prisma } from "@/lib/prisma";
import {
  formatMonthLabel,
  formatTimeForTimezone,
  getDateKeyForTimezone,
  getMonthRangeForTimezone,
  getResolvedAppTimezone,
} from "@/lib/time";

type CalendarPageProps = {
  searchParams?: Promise<{
    month?: string;
    statuses?: string;
  }>;
};

type CalendarPost = Awaited<ReturnType<typeof loadCalendarPosts>>[number];

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const CALENDAR_STATUS_FILTERS = [
  SocialPostStatus.DRAFT,
  SocialPostStatus.SCHEDULED,
  SocialPostStatus.PUBLISHING,
  SocialPostStatus.PUBLISHED,
  SocialPostStatus.FAILED,
  SocialPostStatus.CANCELLED,
] as const;
const DEFAULT_VISIBLE_STATUSES = [
  SocialPostStatus.DRAFT,
  SocialPostStatus.SCHEDULED,
  SocialPostStatus.PUBLISHING,
  SocialPostStatus.PUBLISHED,
  SocialPostStatus.FAILED,
];
const MAX_VISIBLE_DAY_POSTS = 3;

const PLATFORM_ICON_LABELS: Record<SocialPlatform, { title: string }> = {
  FACEBOOK: { title: "Facebook" },
  INSTAGRAM: { title: "Instagram" },
  GOOGLE_BUSINESS: { title: "Google Business" },
};

function renderPlatformIcon(platform: SocialPlatform) {
  switch (platform) {
    case SocialPlatform.FACEBOOK:
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path
            fill="currentColor"
            d="M13.33 21v-8.2h2.77l.42-3.2h-3.19V7.56c0-.92.26-1.54 1.58-1.54h1.69V3.16c-.29-.04-1.3-.12-2.47-.12-2.44 0-4.11 1.49-4.11 4.23V9.6H7.25v3.2h2.77V21h3.31Z"
          />
        </svg>
      );
    case SocialPlatform.INSTAGRAM:
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path
            fill="currentColor"
            d="M7.75 3h8.5A4.75 4.75 0 0 1 21 7.75v8.5A4.75 4.75 0 0 1 16.25 21h-8.5A4.75 4.75 0 0 1 3 16.25v-8.5A4.75 4.75 0 0 1 7.75 3Zm0 1.75A3 3 0 0 0 4.75 7.75v8.5a3 3 0 0 0 3 3h8.5a3 3 0 0 0 3-3v-8.5a3 3 0 0 0-3-3h-8.5Zm8.88 1.31a1.06 1.06 0 1 1 0 2.13 1.06 1.06 0 0 1 0-2.13ZM12 7.5A4.5 4.5 0 1 1 7.5 12 4.5 4.5 0 0 1 12 7.5Zm0 1.75A2.75 2.75 0 1 0 14.75 12 2.75 2.75 0 0 0 12 9.25Z"
          />
        </svg>
      );
    case SocialPlatform.GOOGLE_BUSINESS:
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path
            fill="currentColor"
            d="M12 4.5a7.5 7.5 0 1 1-5.3 12.8l1.24-1.24A5.75 5.75 0 1 0 6.25 12h5.38v1.75h-3.3V12h-2.1a5.76 5.76 0 0 1 10.89-2.57l-1.53.86A4 4 0 0 0 12 8.25a3.75 3.75 0 1 0 3.7 4.38H12V10.9h5.66c.06.35.09.72.09 1.1A5.75 5.75 0 0 1 12 17.75a5.83 5.83 0 0 1-1.57-.22l.45-1.69c.35.1.72.16 1.12.16A4 4 0 0 0 16 12c0-.2-.02-.39-.04-.58H12V9.67h5.5c.16.58.25 1.2.25 1.83A5.75 5.75 0 0 1 12 17.25 5.25 5.25 0 1 1 12 6.75c1.32 0 2.52.48 3.44 1.27l-1.21 1.21A3.49 3.49 0 0 0 12 8.25c-1.93 0-3.5 1.57-3.5 3.5s1.57 3.5 3.5 3.5a3.5 3.5 0 0 0 3.42-2.8H12V10.7h5.56L19.5 9.5A7.48 7.48 0 0 1 12 19.5a7.5 7.5 0 0 1 0-15Z"
          />
        </svg>
      );
    default:
      return <span className="calendar-platform-fallback">?</span>;
  }
}

function parseVisibleStatuses(rawValue: string | undefined) {
  if (!rawValue) {
    return DEFAULT_VISIBLE_STATUSES;
  }

  const selected = rawValue
    .split(",")
    .map((value) => value.trim().toUpperCase())
    .filter((value): value is (typeof CALENDAR_STATUS_FILTERS)[number] =>
      CALENDAR_STATUS_FILTERS.includes(value as (typeof CALENDAR_STATUS_FILTERS)[number]),
    );

  return selected.length > 0 ? selected : DEFAULT_VISIBLE_STATUSES;
}

function buildCalendarHref(input: { month: string; statuses: SocialPostStatus[] }) {
  const params = new URLSearchParams({ month: input.month });

  if (input.statuses.length > 0) {
    params.set("statuses", input.statuses.join(","));
  }

  return `/dashboard/calendar?${params.toString()}`;
}

function buildNewPostHref(input: { dateKey: string }) {
  const params = new URLSearchParams({
    date: input.dateKey,
  });

  return `/dashboard/posts/new?${params.toString()}`;
}

function buildToggledStatuses(current: SocialPostStatus[], target: SocialPostStatus) {
  if (current.includes(target)) {
    const next = current.filter((status) => status !== target);
    return next.length > 0 ? next : [...DEFAULT_VISIBLE_STATUSES];
  }

  return [...current, target];
}

function getFilterLabel(status: SocialPostStatus) {
  switch (status) {
    case SocialPostStatus.DRAFT:
      return "Draft";
    case SocialPostStatus.SCHEDULED:
      return "Scheduled";
    case SocialPostStatus.PUBLISHING:
      return "Publishing";
    case SocialPostStatus.PUBLISHED:
      return "Published";
    case SocialPostStatus.FAILED:
      return "Failed";
    case SocialPostStatus.CANCELLED:
      return "Cancelled";
    default:
      return status;
  }
}

function getPrimaryPlatform(post: CalendarPost) {
  return post.platforms[0]?.platform ?? SocialPlatform.FACEBOOK;
}

function renderCalendarPost(post: CalendarPost & { calendarAt: Date }, timezone: string) {
  const tone = getPostStatusTone(post.status);
  const primaryPlatform = getPrimaryPlatform(post);
  const platformIcon = PLATFORM_ICON_LABELS[primaryPlatform];
  const titleText = `${platformIcon.title} - ${formatTimeForTimezone(post.calendarAt, timezone)} - ${post.status} - ${getPostCaptionPreview(post.caption)}`;

  return (
    <Link
      key={post.id}
      href={`/dashboard/posts/${post.id}`}
      className={`calendar-post is-${tone}`.trim()}
      title={titleText}
      aria-label={titleText}
    >
      <span
        className={`calendar-platform-icon is-${primaryPlatform.toLowerCase()}`.trim()}
        title={platformIcon.title}
        role="img"
        aria-label={platformIcon.title}
      >
        {renderPlatformIcon(primaryPlatform)}
      </span>
      <div className="calendar-post-time">{formatTimeForTimezone(post.calendarAt, timezone)}</div>
    </Link>
  );
}

async function loadCalendarPosts(input: {
  monthStartUtc: Date;
  monthEndUtc: Date;
  statuses: SocialPostStatus[];
}) {
  return prisma.socialPost.findMany({
    where: {
      status: {
        in: input.statuses,
      },
      OR: [
        {
          scheduledAt: {
            gte: input.monthStartUtc,
            lt: input.monthEndUtc,
          },
        },
        {
          publishedAt: {
            gte: input.monthStartUtc,
            lt: input.monthEndUtc,
          },
        },
        {
          createdAt: {
            gte: input.monthStartUtc,
            lt: input.monthEndUtc,
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
}

export default async function CalendarPage({ searchParams }: CalendarPageProps) {
  const resolvedSearchParams = await searchParams;
  const timezone = await getResolvedAppTimezone();
  const visibleStatuses = parseVisibleStatuses(resolvedSearchParams?.statuses);
  const { monthStart, monthEnd } = getMonthRangeForTimezone(resolvedSearchParams?.month, timezone);
  const nextMonth = shiftMonth(monthStart, 1);
  const previousMonth = shiftMonth(monthStart, -1);
  const currentMonth = DateTime.now().setZone(timezone).startOf("month");
  const todayDateKey = DateTime.now().setZone(timezone).toFormat("yyyy-MM-dd");
  const days = buildMonthGrid(monthStart);

  const posts = await loadCalendarPosts({
    monthStartUtc: monthStart.toUTC().toJSDate(),
    monthEndUtc: monthEnd.toUTC().toJSDate(),
    statuses: visibleStatuses,
  });

  const postsByDay = new Map<string, Array<CalendarPost & { calendarAt: Date }>>();
  for (const post of posts) {
    const calendarAt = resolvePostCalendarAt(post);
    if (!calendarAt) {
      continue;
    }

    const localDateTime = DateTime.fromJSDate(calendarAt, { zone: "utc" }).setZone(timezone);
    if (localDateTime < monthStart || localDateTime >= monthEnd) {
      continue;
    }

    const key = getDateKeyForTimezone(calendarAt, timezone);
    const bucket = postsByDay.get(key) ?? [];
    bucket.push({
      ...post,
      calendarAt,
    });
    postsByDay.set(key, bucket);
  }

  for (const bucket of postsByDay.values()) {
    bucket.sort((left, right) => left.calendarAt.getTime() - right.calendarAt.getTime());
  }

  return (
    <section className="section-stack">
      <header className="page-header">
        <div>
          <h2>Calendar</h2>
          <p>
            Monthly planning view in {timezone}. Drafts stay muted, scheduled posts stay active, and publish results are
            easy to reopen from the day they landed.
          </p>
        </div>
      </header>

      <section className="panel">
        <div className="panel-body">
          <div className="calendar-toolbar">
            <div className="calendar-toolbar-group">
              <Link
                className="secondary-button"
                href={buildCalendarHref({
                  month: formatMonthParam(previousMonth),
                  statuses: visibleStatuses,
                })}
              >
                &lt; Previous
              </Link>
              <Link
                className="ghost-link-button"
                href={buildCalendarHref({
                  month: formatMonthParam(currentMonth),
                  statuses: visibleStatuses,
                })}
              >
                Today
              </Link>
              <Link
                className="secondary-button"
                href={buildCalendarHref({
                  month: formatMonthParam(nextMonth),
                  statuses: visibleStatuses,
                })}
              >
                Next &gt;
              </Link>
            </div>

            <strong className="calendar-month-heading">{formatMonthLabel(monthStart.toJSDate(), timezone)}</strong>

            <div className="calendar-toolbar-group calendar-toolbar-group--end">
              <Link className="primary-button" href={buildNewPostHref({ dateKey: todayDateKey })}>
                New Post
              </Link>
            </div>
          </div>

          <div className="filter-row" style={{ marginBottom: 16 }}>
            {CALENDAR_STATUS_FILTERS.map((status) => {
              const active = visibleStatuses.includes(status);

              return (
                <Link
                  key={status}
                  className={`filter-pill ${active ? "is-active" : ""}`.trim()}
                  href={buildCalendarHref({
                    month: formatMonthParam(monthStart),
                    statuses: buildToggledStatuses(visibleStatuses, status),
                  })}
                >
                  {getFilterLabel(status)}
                </Link>
              );
            })}
          </div>

          <div className="calendar-grid-wrap">
            <div className="calendar-grid">
              {WEEKDAY_LABELS.map((label) => (
                <div key={label} className="calendar-day-name">
                  {label}
                </div>
              ))}

              {days.map((day) => {
                if (day.kind === "empty") {
                  return <div key={day.id} className="calendar-cell is-empty" aria-hidden="true" />;
                }

                const dayPosts = postsByDay.get(day.dateKey) ?? [];
                const visiblePosts = dayPosts.slice(0, MAX_VISIBLE_DAY_POSTS);
                const overflowPosts = dayPosts.slice(MAX_VISIBLE_DAY_POSTS);
                const isToday = day.dateKey === todayDateKey;

                return (
                  <div key={day.dateKey} className="calendar-cell">
                    <div className="calendar-cell-header">
                      <Link className="calendar-date-link" href={buildNewPostHref({ dateKey: day.dateKey })}>
                        <span className={`calendar-date ${isToday ? "is-today" : ""}`.trim()}>{day.dayOfMonth}</span>
                        <span className="calendar-date-link-label">New post</span>
                      </Link>
                    </div>
                    <div className="calendar-posts">
                      {visiblePosts.map((post) => renderCalendarPost(post, timezone))}
                      {overflowPosts.length > 0 ? (
                        <details className="calendar-post-overflow">
                          <summary className="calendar-post-overflow-toggle" aria-label={`Show ${overflowPosts.length} more posts`}>
                            ...
                          </summary>
                          <div className="calendar-post-overflow-list">
                            {overflowPosts.map((post) => renderCalendarPost(post, timezone))}
                          </div>
                        </details>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>
    </section>
  );
}
