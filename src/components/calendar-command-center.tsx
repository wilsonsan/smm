"use client";

/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useEffect, useMemo, useState, type SVGProps } from "react";
import { SocialPlatform, SocialPostStatus } from "@prisma/client";
import { CalendarIcon, FacebookIcon, SuccessIcon } from "@/components/dashboard-icons";

type CalendarCommandCenterProps = {
  monthLabel: string;
  timezone: string;
  todayDateKey: string;
  previousMonthHref: string;
  nextMonthHref: string;
  todayHref: string;
  newPostTodayHref: string;
  initialStatusFilter: CalendarStatusFilter;
  days: Array<{
    dateKey: string;
    dayOfMonth: number;
    isCurrentMonth: boolean;
  }>;
  posts: CalendarPostView[];
};

type CalendarStatusFilter =
  | "ALL"
  | SocialPostStatus;

type CalendarPostView = {
  id: string;
  caption: string;
  captionPreview: string;
  status: SocialPostStatus;
  calendarAtIso: string;
  platforms: SocialPlatform[];
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

function FilterIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M4 6h16" />
      <path d="M7.5 12h9" />
      <path d="M10 18h4" />
    </svg>
  );
}

function PlusIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
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
  const params = new URLSearchParams({ date: dateKey });
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
  days,
  posts,
}: CalendarCommandCenterProps) {
  const [statusFilter, setStatusFilter] = useState<CalendarStatusFilter>(initialStatusFilter);
  const [showFilters, setShowFilters] = useState(true);
  const [openDayKey, setOpenDayKey] = useState<string | null>(null);

  const filteredPosts = useMemo(
    () => posts.filter((post) => statusFilter === "ALL" || post.status === statusFilter),
    [posts, statusFilter],
  );

  const postsByDay = useMemo(() => {
    const map = new Map<string, CalendarPostView[]>();

    for (const post of filteredPosts) {
      const key = getDateKeyForTimezone(post.calendarAtIso, timezone);

      const bucket = map.get(key) ?? [];
      bucket.push(post);
      map.set(key, bucket);
    }

    for (const bucket of map.values()) {
      bucket.sort((left, right) => new Date(left.calendarAtIso).getTime() - new Date(right.calendarAtIso).getTime());
    }

    return map;
  }, [filteredPosts, timezone]);

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

  return (
    <>
      <section className="calendar-shell">
        <header className="calendar-page-header">
          <div className="calendar-page-title-row">
            <span className="calendar-page-title-icon">
              <CalendarIcon />
            </span>
            <div>
              <h2>Calendar</h2>
              <p>
                Monthly planning view in {timezone}. Drafts stay muted, scheduled posts stay active, and publish
                results are easy to reopen from the day they landed.
              </p>
            </div>
          </div>

          <div className="calendar-page-actions">
            <button type="button" className="calendar-glass-button" onClick={() => setShowFilters((value) => !value)}>
              <FilterIcon />
              <span>Filter</span>
            </button>
            <Link href={newPostTodayHref} className="calendar-primary-button">
              <PlusIcon />
              <span>New Post</span>
            </Link>
          </div>
        </header>

        {showFilters ? (
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
          </div>
        ) : null}

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

                  return (
                    <div
                      key={day.dateKey}
                      className={`calendar-command-cell${day.isCurrentMonth ? "" : " is-outside-month"}`.trim()}
                    >
                      <div className="calendar-command-cell-head">
                        <Link href={buildNewPostHref(day.dateKey)} className="calendar-command-date-link">
                          <span className={`calendar-command-date${isToday ? " is-today" : ""}`.trim()}>
                            {day.dayOfMonth}
                          </span>
                        </Link>
                      </div>

                      <div className="calendar-command-events">
                        {visiblePosts.map((post) => (
                          <Link
                            key={post.id}
                            href={`/dashboard/posts/${post.id}`}
                            className={`calendar-command-event is-${post.status.toLowerCase()}`.trim()}
                            title={`${getPlatformLabel(post.platforms)} at ${formatTime(post.calendarAtIso, timezone)}`}
                          >
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
                            <div className="calendar-command-event-copy">
                              <strong>{getPlatformLabel(post.platforms)}</strong>
                              <span>{formatTime(post.calendarAtIso, timezone)}</span>
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
                      <span className={`badge is-${post.status.toLowerCase()}`.trim()}>{post.status}</span>
                    </div>

                    <p>{post.captionPreview}</p>
                    <div className="calendar-day-modal-meta">
                      <span>{formatTime(post.calendarAtIso, timezone)}</span>
                      <span>{post.status}</span>
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
