"use client";

/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type SVGProps } from "react";
import { SocialPlatform, SocialPostStatus } from "@prisma/client";
import { DashboardNotificationMenu } from "@/components/dashboard-notification-menu";
import { CalendarIcon, FacebookIcon } from "@/components/dashboard-icons";

type NotificationProvider = "FACEBOOK" | "INSTAGRAM" | "GOOGLE_BUSINESS" | null;
type NotificationSeverity = "INFO" | "WARNING" | "ERROR";

type CalendarCommandCenterProps = {
  monthLabel: string;
  timezone: string;
  todayDateKey: string;
  previousMonthHref: string;
  nextMonthHref: string;
  todayHref: string;
  newPostTodayHref: string;
  initialStatusFilter: CalendarStatusFilter;
  flashMessage: string | null;
  days: Array<{
    dateKey: string;
    dayOfMonth: number;
    isCurrentMonth: boolean;
  }>;
  posts: CalendarPostView[];
  unreadCount: number;
  notifications: Array<{
    id: string;
    title: string;
    message: string;
    actionUrl: string | null;
    provider: NotificationProvider;
    severity: NotificationSeverity;
    createdLabel: string;
  }>;
  openNotificationAction: (formData: FormData) => void | Promise<void>;
};

type CalendarStatusFilter = "ALL" | SocialPostStatus;

type CalendarPostView = {
  id: string;
  caption: string;
  captionPreview: string;
  status: SocialPostStatus;
  displayStatus: {
    label: string;
    tone: "draft" | "scheduled" | "publishing" | "published" | "failed" | "cancelled";
  };
  calendarAtIso: string;
  platforms: SocialPlatform[];
  platformStatuses: Array<{
    platform: SocialPlatform;
    status: SocialPostStatus;
  }>;
  mediaPreviewUrl: string | null;
};

const STATUS_FILTERS: Array<{
  value: CalendarStatusFilter;
  label: string;
  dotTone: string;
}> = [
  { value: "ALL", label: "All", dotTone: "all" },
  { value: "DRAFT", label: "Draft", dotTone: "draft" },
  { value: "SCHEDULED", label: "Scheduled", dotTone: "scheduled" },
  { value: "PUBLISHING", label: "Publishing", dotTone: "publishing" },
  { value: "PUBLISHED", label: "Published", dotTone: "published" },
  { value: "FAILED", label: "Failed", dotTone: "failed" },
  { value: "CANCELLED", label: "Cancelled", dotTone: "cancelled" },
];

const STATUS_LEGEND = STATUS_FILTERS.filter((filter) => filter.value !== "ALL");
const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MAX_VISIBLE_DAY_POSTS = 3;

function PlusIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

function FilterIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M4 6h16" />
      <path d="M7 12h10" />
      <path d="M10 18h4" />
      <circle cx="8.4" cy="6" r="1.15" fill="currentColor" stroke="none" />
      <circle cx="14.8" cy="12" r="1.15" fill="currentColor" stroke="none" />
      <circle cx="12" cy="18" r="1.15" fill="currentColor" stroke="none" />
    </svg>
  );
}

function ChevronLeftIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

function ChevronRightIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

function MoreMenuIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <circle cx="12" cy="5.5" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="12" cy="18.5" r="1.8" />
    </svg>
  );
}

function InstagramIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <rect x="4.2" y="4.2" width="15.6" height="15.6" rx="4.3" />
      <circle cx="12" cy="12" r="3.5" />
      <circle cx="17.05" cy="6.95" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

function GoogleBusinessIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path fill="#4285F4" d="M21 12.2c0-.7-.1-1.3-.2-1.9H12v3.6h5c-.2 1.2-.9 2.3-1.9 3v2.5h3.1c1.8-1.7 2.8-4.2 2.8-7.2Z" />
      <path fill="#34A853" d="M12 21c2.5 0 4.6-.8 6.2-2.2l-3.1-2.5c-.9.6-1.9 1-3.1 1-2.4 0-4.4-1.6-5.1-3.8H3.6V16c1.6 3 4.7 5 8.4 5Z" />
      <path fill="#FBBC04" d="M6.9 13.5c-.2-.6-.3-1.2-.3-1.9s.1-1.3.3-1.9V7.2H3.6A9 9 0 0 0 3 11.6c0 1.6.4 3.1 1.1 4.4l2.8-2.5Z" />
      <path fill="#EA4335" d="M12 5.9c1.4 0 2.7.5 3.7 1.4l2.8-2.8C16.6 2.8 14.5 2 12 2 8.3 2 5.2 4 3.6 7.2l3.3 2.5c.7-2.2 2.7-3.8 5.1-3.8Z" />
    </svg>
  );
}

function renderPlatformIcon(platform: SocialPlatform) {
  switch (platform) {
    case "FACEBOOK":
      return <FacebookIcon />;
    case "INSTAGRAM":
      return <InstagramIcon />;
    case "GOOGLE_BUSINESS":
      return <GoogleBusinessIcon />;
    default:
      return null;
  }
}

function getPlatformLabel(platforms: SocialPlatform[]) {
  if (platforms.length === 0) {
    return "Post";
  }

  if (platforms.length > 1) {
    return "Multi-platform Post";
  }

  switch (platforms[0]) {
    case "FACEBOOK":
      return "Facebook Post";
    case "INSTAGRAM":
      return "Instagram Post";
    case "GOOGLE_BUSINESS":
      return "Google Post";
    default:
      return "Post";
  }
}

function formatTime(valueIso: string, timezone: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(valueIso));
}

function formatDayModalLabel(dateKey: string, timezone: string) {
  const [year, month, day] = dateKey.split("-").map((value) => Number.parseInt(value, 10));
  const date = new Date(Date.UTC(year, month - 1, day));

  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatUpcomingDateBlock(valueIso: string, timezone: string) {
  const date = new Date(valueIso);

  return {
    weekday: new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "short",
    })
      .format(date)
      .toUpperCase(),
    day: new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      day: "numeric",
    }).format(date),
    month: new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      month: "short",
    })
      .format(date)
      .toUpperCase(),
  };
}

function getDateKeyForTimezone(valueIso: string, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(valueIso));

  const year = parts.find((part) => part.type === "year")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  const day = parts.find((part) => part.type === "day")?.value ?? "";

  return `${year}-${month}-${day}`;
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

export function CalendarCommandCenter({
  monthLabel,
  timezone,
  todayDateKey,
  previousMonthHref,
  nextMonthHref,
  todayHref,
  newPostTodayHref,
  initialStatusFilter,
  flashMessage,
  days,
  posts,
  unreadCount,
  notifications,
  openNotificationAction,
}: CalendarCommandCenterProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [statusFilter, setStatusFilter] = useState<CalendarStatusFilter>(initialStatusFilter);
  const [openDayKey, setOpenDayKey] = useState<string | null>(null);
  const [visibleFlashMessage, setVisibleFlashMessage] = useState(flashMessage);
  const [showMobileFilters, setShowMobileFilters] = useState(true);

  const filteredPosts = useMemo(
    () => posts.filter((post) => statusFilter === "ALL" || post.status === statusFilter),
    [posts, statusFilter],
  );

  const orderedFilteredPosts = useMemo(
    () =>
      [...filteredPosts].sort(
        (left, right) => new Date(left.calendarAtIso).getTime() - new Date(right.calendarAtIso).getTime(),
      ),
    [filteredPosts],
  );

  const postsByDay = useMemo(() => {
    const map = new Map<string, CalendarPostView[]>();

    for (const post of orderedFilteredPosts) {
      const key = getDateKeyForTimezone(post.calendarAtIso, timezone);
      const bucket = map.get(key) ?? [];
      bucket.push(post);
      map.set(key, bucket);
    }

    return map;
  }, [orderedFilteredPosts, timezone]);

  const upcomingPosts = useMemo(
    () => orderedFilteredPosts.filter((post) => getDateKeyForTimezone(post.calendarAtIso, timezone) >= todayDateKey),
    [orderedFilteredPosts, timezone, todayDateKey],
  );

  const featuredMobilePost = useMemo(
    () =>
      upcomingPosts.find((post) => {
        const day = days.find((entry) => entry.dateKey === getDateKeyForTimezone(post.calendarAtIso, timezone));
        return day?.isCurrentMonth;
      }) ??
      orderedFilteredPosts.find((post) => {
        const day = days.find((entry) => entry.dateKey === getDateKeyForTimezone(post.calendarAtIso, timezone));
        return day?.isCurrentMonth;
      }) ??
      null,
    [days, orderedFilteredPosts, timezone, upcomingPosts],
  );

  const featuredMobileDayKey = featuredMobilePost
    ? getDateKeyForTimezone(featuredMobilePost.calendarAtIso, timezone)
    : null;

  const nextUpcomingPost = upcomingPosts[0] ?? orderedFilteredPosts[0] ?? null;
  const openDayPosts = openDayKey ? postsByDay.get(openDayKey) ?? [] : [];

  useEffect(() => {
    if (!openDayKey) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpenDayKey(null);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [openDayKey]);

  useEffect(() => {
    setVisibleFlashMessage(flashMessage);
  }, [flashMessage]);

  useEffect(() => {
    if (!flashMessage) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setVisibleFlashMessage(null);
      const params = new URLSearchParams(searchParams.toString());
      params.delete("flash");
      const nextQuery = params.toString();
      router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
    }, 3500);

    return () => window.clearTimeout(timeout);
  }, [flashMessage, pathname, router, searchParams]);

  function handleEmptyDateScheduleClick(dateKey: string) {
    void fetch("/api/admin/audit/calendar-date-click", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ dateKey }),
      keepalive: true,
    }).catch(() => undefined);

    router.push(buildNewPostHref(dateKey));
  }

  function handleMobileDayPress(dateKey: string, dayPosts: CalendarPostView[]) {
    if (dayPosts.length === 1) {
      router.push(`/dashboard/posts/${dayPosts[0].id}`);
      return;
    }

    if (dayPosts.length > 1) {
      setOpenDayKey(dateKey);
    }
  }

  return (
    <>
      <section className="calendar-shell">
        {visibleFlashMessage ? (
          <div className="composer-feedback-card is-success">
            {visibleFlashMessage}
          </div>
        ) : null}

        <section className="calendar-mobile-shell">
          <div className="calendar-mobile-header">
            <div className="calendar-mobile-header-copy">
              <div className="calendar-mobile-header-mark" aria-hidden="true">
                <CalendarIcon />
              </div>
              <div>
                <strong>Calendar</strong>
                <p>Plan, schedule, and manage your posts.</p>
              </div>
            </div>

            <div className="calendar-mobile-header-actions">
              <DashboardNotificationMenu
                unreadCount={unreadCount}
                notifications={notifications}
                openNotificationAction={openNotificationAction}
              />
            </div>
          </div>

          <div className="calendar-mobile-action-row">
            <button
              type="button"
              className="calendar-mobile-filter-button"
              onClick={() => setShowMobileFilters((current) => !current)}
              aria-expanded={showMobileFilters}
            >
              <FilterIcon />
              <span>Filter</span>
            </button>

            <Link href={newPostTodayHref} className="calendar-mobile-new-post-button">
              <PlusIcon />
              <span>New Post</span>
            </Link>
          </div>

          {showMobileFilters ? (
            <div className="calendar-mobile-status-pills">
              {STATUS_FILTERS.map((filter) => {
                const isActive = statusFilter === filter.value;
                return (
                  <button
                    key={`mobile-filter-${filter.value}`}
                    type="button"
                    className={`calendar-status-pill${isActive ? " is-active" : ""}`.trim()}
                    onClick={() => setStatusFilter(filter.value)}
                  >
                    {filter.value === "ALL" ? null : <span className={`calendar-status-dot is-${filter.dotTone}`.trim()} />}
                    <span>{filter.label}</span>
                  </button>
                );
              })}
            </div>
          ) : null}

          <section className="calendar-mobile-card">
            <div className="calendar-mobile-month-bar">
              <Link href={previousMonthHref} className="calendar-mobile-square-button" aria-label="Previous month">
                <ChevronLeftIcon />
              </Link>
              <strong>{monthLabel}</strong>
              <Link href={nextMonthHref} className="calendar-mobile-square-button" aria-label="Next month">
                <ChevronRightIcon />
              </Link>
            </div>

            <div className="calendar-mobile-controls">
              <div className="calendar-mobile-view-toggle" role="tablist" aria-label="Calendar view">
                <button type="button" className="calendar-mobile-view-pill is-active" aria-pressed="true">
                  Month
                </button>
                <button type="button" className="calendar-mobile-view-pill" disabled aria-disabled="true">
                  Week
                </button>
                <button type="button" className="calendar-mobile-view-pill" disabled aria-disabled="true">
                  List
                </button>
              </div>

              <Link href={todayHref} className="calendar-mobile-today-button">
                Today
              </Link>
            </div>

            <div className="calendar-mobile-grid-shell">
              <div className="calendar-mobile-grid">
                {WEEKDAY_LABELS.map((label) => (
                  <div key={`mobile-day-${label}`} className="calendar-mobile-day-name">
                    {label}
                  </div>
                ))}

                {days.map((day) => {
                  const dayPosts = postsByDay.get(day.dateKey) ?? [];
                  const isToday = day.dateKey === todayDateKey;
                  const isFeaturedDay = featuredMobileDayKey === day.dateKey && dayPosts.length > 0;
                  const primaryPost = dayPosts[0] ?? null;
                  const dotPosts = isFeaturedDay ? dayPosts.slice(1, 4) : dayPosts.slice(0, 3);

                  return (
                    <div
                      key={`mobile-cell-${day.dateKey}`}
                      className={`calendar-mobile-cell${day.isCurrentMonth ? "" : " is-outside-month"}`.trim()}
                    >
                      <div className="calendar-mobile-date-wrap">
                        <span className={`calendar-mobile-date${isToday ? " is-today" : ""}`.trim()}>
                          {day.dayOfMonth}
                        </span>
                      </div>

                      {isFeaturedDay && primaryPost ? (
                        <Link
                          href={`/dashboard/posts/${primaryPost.id}`}
                          className={`calendar-mobile-featured-event is-${primaryPost.displayStatus.tone}`.trim()}
                        >
                          <span className="calendar-mobile-featured-icon">
                            {renderPlatformIcon(primaryPost.platforms[0] ?? "FACEBOOK")}
                          </span>
                          <span className="calendar-mobile-featured-copy">
                            <strong>{getPlatformLabel(primaryPost.platforms)}</strong>
                            <span>{formatTime(primaryPost.calendarAtIso, timezone)}</span>
                          </span>
                        </Link>
                      ) : dayPosts.length > 0 ? (
                        <button
                          type="button"
                          className="calendar-mobile-day-trigger"
                          onClick={() => handleMobileDayPress(day.dateKey, dayPosts)}
                          aria-label={`Open posts for ${formatDayModalLabel(day.dateKey, timezone)}`}
                        >
                          <span className="calendar-mobile-event-dots">
                            {dotPosts.map((post) => (
                              <span
                                key={`mobile-dot-${post.id}`}
                                className={`calendar-status-dot is-${post.displayStatus.tone}`.trim()}
                              />
                            ))}
                          </span>
                        </button>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="calendar-mobile-legend">
              {["SCHEDULED", "PUBLISHING", "PUBLISHED", "FAILED", "DRAFT"].map((status) => {
                const item = STATUS_LEGEND.find((entry) => entry.value === status);
                if (!item) {
                  return null;
                }

                return (
                  <span key={`legend-mobile-${status}`} className="calendar-mobile-legend-item">
                    <span className={`calendar-status-dot is-${item.dotTone}`.trim()} />
                    <span>{item.label}</span>
                  </span>
                );
              })}
            </div>
          </section>

          <section className="calendar-mobile-upcoming">
            <div className="calendar-mobile-upcoming-head">
              <strong>Upcoming</strong>
              {nextUpcomingPost ? (
                <button
                  type="button"
                  className="calendar-mobile-view-all"
                  onClick={() => setOpenDayKey(getDateKeyForTimezone(nextUpcomingPost.calendarAtIso, timezone))}
                >
                  View All
                </button>
              ) : null}
            </div>

            {nextUpcomingPost ? (
              <article className="calendar-mobile-upcoming-card">
                <div className="calendar-mobile-upcoming-date">
                  <span>{formatUpcomingDateBlock(nextUpcomingPost.calendarAtIso, timezone).weekday}</span>
                  <strong>{formatUpcomingDateBlock(nextUpcomingPost.calendarAtIso, timezone).day}</strong>
                  <span>{formatUpcomingDateBlock(nextUpcomingPost.calendarAtIso, timezone).month}</span>
                </div>

                <div className="calendar-mobile-upcoming-divider" aria-hidden="true" />

                <Link href={`/dashboard/posts/${nextUpcomingPost.id}`} className="calendar-mobile-upcoming-main">
                  <span className={`calendar-command-platform-icon is-${(nextUpcomingPost.platforms[0] ?? "FACEBOOK").toLowerCase()}`.trim()}>
                    {renderPlatformIcon(nextUpcomingPost.platforms[0] ?? "FACEBOOK")}
                  </span>

                  <div className="calendar-mobile-upcoming-copy">
                    <div className="calendar-mobile-upcoming-title-row">
                      <strong>{getPlatformLabel(nextUpcomingPost.platforms)}</strong>
                      <span className={`calendar-mobile-upcoming-badge is-${nextUpcomingPost.displayStatus.tone}`.trim()}>
                        {nextUpcomingPost.displayStatus.label}
                      </span>
                    </div>
                    <span>
                      {formatTime(nextUpcomingPost.calendarAtIso, timezone)} • {timezone}
                    </span>
                  </div>
                </Link>

                <button
                  type="button"
                  className="calendar-mobile-upcoming-more"
                  onClick={() => setOpenDayKey(getDateKeyForTimezone(nextUpcomingPost.calendarAtIso, timezone))}
                  aria-label="Open day details"
                >
                  <MoreMenuIcon />
                </button>
              </article>
            ) : (
              <div className="calendar-mobile-empty-upcoming">
                No upcoming posts for this filter.
              </div>
            )}
          </section>
        </section>

        <section className="calendar-desktop-shell">
          <div className="calendar-status-pills">
            {STATUS_FILTERS.map((filter) => {
              const isActive = statusFilter === filter.value;
              return (
                <button
                  key={filter.value}
                  type="button"
                  className={`calendar-status-pill${isActive ? " is-active" : ""}`.trim()}
                  onClick={() => setStatusFilter(filter.value)}
                >
                  {filter.value === "ALL" ? null : <span className={`calendar-status-dot is-${filter.dotTone}`.trim()} />}
                  <span>{filter.label}</span>
                </button>
              );
            })}

            <span className="calendar-status-pills-spacer" />

            <Link href={newPostTodayHref} className="calendar-status-pill calendar-status-pill--primary">
              <PlusIcon />
              <span>New Post</span>
            </Link>
          </div>

          <section className="panel calendar-command-panel">
            <div className="panel-body calendar-command-panel-body">
              <div className="calendar-command-head">
                <div className="calendar-month-title-wrap">
                  <Link href={previousMonthHref} className="calendar-icon-button" aria-label="Previous month">
                    <ChevronLeftIcon />
                  </Link>
                  <strong className="calendar-month-title">{monthLabel}</strong>
                  <Link href={nextMonthHref} className="calendar-icon-button" aria-label="Next month">
                    <ChevronRightIcon />
                  </Link>
                </div>

                <div className="calendar-command-head-actions">
                  <Link href={todayHref} className="calendar-view-pill calendar-view-pill--link">
                    Today
                  </Link>
                  <div className="calendar-view-toggle" role="tablist" aria-label="Calendar view">
                    <button type="button" className="calendar-view-pill is-active" aria-pressed="true">
                      Month
                    </button>
                    <button type="button" className="calendar-view-pill" disabled aria-disabled="true">
                      Week
                    </button>
                    <button type="button" className="calendar-view-pill" disabled aria-disabled="true">
                      List
                    </button>
                  </div>
                </div>
              </div>

              <div className="calendar-grid-shell">
                <div className="calendar-grid calendar-grid--command">
                  {WEEKDAY_LABELS.map((label) => (
                    <div key={label} className="calendar-day-name">
                      {label}
                    </div>
                  ))}

                  {days.map((day) => {
                    const dayPosts = postsByDay.get(day.dateKey) ?? [];
                    const visiblePosts = dayPosts.slice(0, MAX_VISIBLE_DAY_POSTS);
                    const overflowCount = Math.max(0, dayPosts.length - MAX_VISIBLE_DAY_POSTS);
                    const isToday = day.dateKey === todayDateKey;
                    const isPastDay = day.dateKey < todayDateKey;
                    const isEmptyFutureCell =
                      day.isCurrentMonth &&
                      dayPosts.length === 0 &&
                      day.dateKey >= todayDateKey;

                    return (
                      <div
                        key={day.dateKey}
                        className={`calendar-command-cell${day.isCurrentMonth ? "" : " is-outside-month"}${isPastDay ? " is-past-day" : ""}`.trim()}
                      >
                        {isEmptyFutureCell ? (
                          <button
                            type="button"
                            className="calendar-command-empty-trigger"
                            onClick={() => handleEmptyDateScheduleClick(day.dateKey)}
                            aria-label={`Schedule a post for ${formatDayModalLabel(day.dateKey, timezone)}`}
                          >
                            <span className="calendar-command-empty-badge">Schedule</span>
                          </button>
                        ) : null}

                        <div className="calendar-command-cell-head">
                          <span className={`calendar-command-date${isToday ? " is-today" : ""}`.trim()}>
                            {day.dayOfMonth}
                          </span>
                        </div>

                        <div className="calendar-command-events">
                          {visiblePosts.map((post) => (
                            <Link
                              key={post.id}
                              href={`/dashboard/posts/${post.id}`}
                              className={`calendar-command-event is-${post.displayStatus.tone}`.trim()}
                              title={`${getPlatformLabel(post.platforms)} at ${formatTime(post.calendarAtIso, timezone)}`}
                            >
                              <div className="calendar-command-event-copy">
                                <strong>{getPlatformLabel(post.platforms)}</strong>
                                <span>{formatTime(post.calendarAtIso, timezone)}</span>
                              </div>
                              <div className="calendar-command-event-platforms">
                                {post.platforms.length > 0 ? (
                                  post.platforms.map((platform) => (
                                    <span key={`${post.id}-${platform}`} className={`calendar-command-platform-icon is-${platform.toLowerCase()}`.trim()}>
                                      {renderPlatformIcon(platform)}
                                    </span>
                                  ))
                                ) : (
                                  <span className="calendar-command-platform-icon is-facebook">
                                    <FacebookIcon />
                                  </span>
                                )}
                              </div>
                            </Link>
                          ))}

                          {overflowCount > 0 ? (
                            <button
                              type="button"
                              className="calendar-more-link"
                              onClick={() => setOpenDayKey(day.dateKey)}
                            >
                              +{overflowCount} more
                            </button>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="calendar-status-legend">
                {STATUS_LEGEND.map((item) => (
                  <span key={item.value} className="calendar-status-legend-item">
                    <span className={`calendar-status-dot is-${item.dotTone}`.trim()} />
                    <span>{item.label}</span>
                  </span>
                ))}
              </div>
            </div>
          </section>
        </section>
      </section>

      {openDayKey ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={`Posts for ${formatDayModalLabel(openDayKey, timezone)}`}>
          <button type="button" className="modal-dismiss-surface" aria-label="Close day details" onClick={() => setOpenDayKey(null)} />
          <div className="modal-card calendar-day-modal">
            <div className="preview-header">
              <div>
                <strong>{formatDayModalLabel(openDayKey, timezone)}</strong>
                <p className="muted">All posts scheduled or published for this day.</p>
              </div>
              <button type="button" className="ghost-link-button" onClick={() => setOpenDayKey(null)}>
                Close
              </button>
            </div>

            <div className="calendar-day-modal-list">
              {openDayPosts.map((post) => (
                <article key={post.id} className="calendar-day-modal-item">
                  {post.mediaPreviewUrl ? (
                    <img src={post.mediaPreviewUrl} alt={`${post.captionPreview} preview`} className="calendar-day-modal-thumb" />
                  ) : (
                    <div className="calendar-day-modal-thumb calendar-day-modal-thumb--empty">No image</div>
                  )}

                  <div className="calendar-day-modal-copy">
                    <div className="calendar-day-modal-head">
                      <div className="calendar-day-modal-platforms">
                        {post.platforms.map((platform) => (
                          <span key={`${post.id}-modal-${platform}`} className={`calendar-command-platform-icon is-${platform.toLowerCase()}`.trim()}>
                            {renderPlatformIcon(platform)}
                          </span>
                        ))}
                        <strong>{getPlatformLabel(post.platforms)}</strong>
                      </div>
                      <span className={`badge is-${post.displayStatus.tone}`.trim()}>{post.displayStatus.label}</span>
                    </div>

                    <p>{post.captionPreview}</p>
                    <div className="calendar-day-modal-meta">
                      <span>{formatTime(post.calendarAtIso, timezone)}</span>
                      <span>{post.displayStatus.label}</span>
                    </div>
                    <div className="calendar-day-modal-actions">
                      <Link href={`/dashboard/posts/${post.id}`} className="secondary-button">
                        Open
                      </Link>
                      <Link href={`/dashboard/posts/${post.id}#post-editor`} className="ghost-link-button">
                        Edit
                      </Link>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
