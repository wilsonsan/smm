import { DateTime } from "luxon";

export type CalendarDay = {
  kind: "day";
  dateKey: string;
  dayOfMonth: number;
  dateTime: DateTime;
};

export type CalendarEmptyCell = {
  kind: "empty";
  id: string;
};

export type CalendarGridCell = CalendarDay | CalendarEmptyCell;

export function buildMonthGrid(monthStart: DateTime): CalendarGridCell[] {
  const start = monthStart.startOf("month");
  const end = monthStart.endOf("month");
  const leadingEmptyCells = start.weekday % 7;
  const trailingEmptyCells = 6 - (end.weekday % 7);
  const cells: CalendarGridCell[] = [];

  for (let index = 0; index < leadingEmptyCells; index += 1) {
    cells.push({
      kind: "empty",
      id: `leading-${start.toFormat("yyyy-MM")}-${index}`,
    });
  }

  let cursor = start.startOf("day");
  while (cursor <= end) {
    cells.push({
      kind: "day",
      dateKey: cursor.toFormat("yyyy-MM-dd"),
      dayOfMonth: cursor.day,
      dateTime: cursor,
    });
    cursor = cursor.plus({ days: 1 });
  }

  for (let index = 0; index < trailingEmptyCells; index += 1) {
    cells.push({
      kind: "empty",
      id: `trailing-${start.toFormat("yyyy-MM")}-${index}`,
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
