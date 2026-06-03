type CalendarDay = {
  date: Date;
  inCurrentMonth: boolean;
};

export function parseMonthParam(monthParam?: string) {
  if (!monthParam) {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  }

  const match = /^(\d{4})-(\d{2})$/.exec(monthParam);
  if (!match) {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  }

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  return new Date(Date.UTC(year, monthIndex, 1));
}

export function buildMonthGrid(monthStart: Date): CalendarDay[] {
  const start = new Date(monthStart);
  const end = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 0));
  const gridStart = new Date(start);
  gridStart.setUTCDate(gridStart.getUTCDate() - gridStart.getUTCDay());

  const gridEnd = new Date(end);
  gridEnd.setUTCDate(gridEnd.getUTCDate() + (6 - gridEnd.getUTCDay()));

  const days: CalendarDay[] = [];
  const cursor = new Date(gridStart);

  while (cursor <= gridEnd) {
    days.push({
      date: new Date(cursor),
      inCurrentMonth: cursor.getUTCMonth() === monthStart.getUTCMonth(),
    });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return days;
}

export function formatMonthParam(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function shiftMonth(date: Date, delta: number) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + delta, 1));
}

