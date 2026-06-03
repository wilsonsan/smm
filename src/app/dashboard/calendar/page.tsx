import Link from "next/link";
import { SocialPostStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { buildMonthGrid, formatMonthParam, parseMonthParam, shiftMonth } from "@/lib/calendar";

type CalendarPageProps = {
  searchParams?: Promise<{
    month?: string;
  }>;
};

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default async function CalendarPage({ searchParams }: CalendarPageProps) {
  const resolvedSearchParams = await searchParams;
  const monthStart = parseMonthParam(resolvedSearchParams?.month);
  const nextMonth = shiftMonth(monthStart, 1);
  const previousMonth = shiftMonth(monthStart, -1);
  const monthEnd = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 1));
  const days = buildMonthGrid(monthStart);

  const scheduledPosts = await prisma.socialPost.findMany({
    where: {
      status: SocialPostStatus.SCHEDULED,
      scheduledAt: {
        gte: monthStart,
        lt: monthEnd,
      },
    },
    orderBy: {
      scheduledAt: "asc",
    },
  });

  const postsByDay = new Map<string, typeof scheduledPosts>();
  for (const post of scheduledPosts) {
    if (!post.scheduledAt) {
      continue;
    }

    const key = post.scheduledAt.toISOString().slice(0, 10);
    const bucket = postsByDay.get(key) ?? [];
    bucket.push(post);
    postsByDay.set(key, bucket);
  }

  return (
    <section className="section-stack">
      <header className="page-header">
        <div>
          <h2>Calendar</h2>
          <p>Monthly schedule view for queued posts. Drag/drop can come later once the basics are stable.</p>
        </div>
      </header>

      <section className="panel">
        <div className="panel-body">
          <div className="calendar-toolbar">
            <Link className="secondary-button" href={`/dashboard/calendar?month=${formatMonthParam(previousMonth)}`}>
              Previous
            </Link>
            <strong style={{ fontSize: "1.15rem" }}>
              {monthStart.toLocaleString("en-US", {
                month: "long",
                year: "numeric",
                timeZone: "UTC",
              })}
            </strong>
            <Link className="secondary-button" href={`/dashboard/calendar?month=${formatMonthParam(nextMonth)}`}>
              Next
            </Link>
          </div>

          <div className="calendar-grid">
            {WEEKDAY_LABELS.map((label) => (
              <div key={label} className="calendar-day-name">
                {label}
              </div>
            ))}

            {days.map((day) => {
              const key = day.date.toISOString().slice(0, 10);
              const posts = postsByDay.get(key) ?? [];

              return (
                <div key={key} className={`calendar-cell ${day.inCurrentMonth ? "" : "is-muted"}`.trim()}>
                  <div className="calendar-date">{day.date.getUTCDate()}</div>
                  <div className="calendar-posts">
                    {posts.map((post) => (
                      <Link key={post.id} href={`/dashboard/posts/${post.id}`} className="calendar-post">
                        <strong>{post.internalTitle}</strong>
                        <div>{post.scheduledAt?.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</div>
                      </Link>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </section>
  );
}

