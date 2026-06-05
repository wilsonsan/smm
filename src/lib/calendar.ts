import { DateTime } from "luxon";

export type CalendarDay = {
  kind: "day";
  dateKey: string;
  dayOfMonth: number;
  dateTime: DateTime;
  isCurrentMonth: boolean;
};
export type CalendarGridCell = CalendarDay;

export function buildMonthGrid(monthStart: DateTime): CalendarGridCell[] {
  const start = monthStart.startOf("month");
  const end = monthStart.endOf("month");
  const leadingEmptyCells = start.weekday % 7;
  const trailingEmptyCells = 6 - (end.weekday % 7);
  const cells: CalendarGridCell[] = [];

  for (let index = 0; index < leadingEmptyCells; index += 1) {
    const dateTime = start.minus({ days: leadingEmptyCells - index });
    cells.push({
      kind: "day",
      dateKey: dateTime.toFormat("yyyy-MM-dd"),
      dayOfMonth: dateTime.day,
      dateTime,
      isCurrentMonth: false,
    });
  }

  let cursor = start.startOf("day");
  while (cursor <= end) {
    cells.push({
      kind: "day",
      dateKey: cursor.toFormat("yyyy-MM-dd"),
      dayOfMonth: cursor.day,
      dateTime: cursor,
      isCurrentMonth: true,
    });
    cursor = cursor.plus({ days: 1 });
  }

  for (let index = 0; index < trailingEmptyCells; index += 1) {
    const dateTime = end.plus({ days: index + 1 }).startOf("day");
    cells.push({
      kind: "day",
      dateKey: dateTime.toFormat("yyyy-MM-dd"),
      dayOfMonth: dateTime.day,
      dateTime,
      isCurrentMonth: false,
    });
  }

  return cells;
}

export function formatMonthParam(monthStart: DateTime) {
  return monthStart.toFormat("yyyy-MM");
}

export function shiftMonth(monthStart: DateTime, delta: number) {
  return monthStart.plus({ months: delta }).startOf("month");
}
