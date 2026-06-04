import { DateTime, IANAZone } from "luxon";
import { getAppTimezone } from "@/lib/settings";

export const DEFAULT_APP_TIMEZONE = "America/New_York";
export const SCHEDULER_MINUTE_OPTIONS = ["00", "15", "30", "45"] as const;
export const SCHEDULER_MERIDIEM_OPTIONS = ["AM", "PM"] as const;

export function isValidTimezone(value: string) {
  return IANAZone.isValidZone(value);
}

export async function getResolvedAppTimezone() {
  const configuredTimezone = await getAppTimezone();
  return isValidTimezone(configuredTimezone) ? configuredTimezone : DEFAULT_APP_TIMEZONE;
}

export function parseScheduledAtInTimezone(input: {
  date: string;
  hour: string;
  minute: string;
  meridiem: string;
  timezone: string;
}) {
  const normalizedHour = Number.parseInt(input.hour, 10);
  const normalizedMinute = Number.parseInt(input.minute, 10);
  const normalizedMeridiem = input.meridiem.toUpperCase();

  if (
    !Number.isInteger(normalizedHour) ||
    normalizedHour < 1 ||
    normalizedHour > 12 ||
    !Number.isInteger(normalizedMinute) ||
    normalizedMinute < 0 ||
    normalizedMinute > 59 ||
    !SCHEDULER_MERIDIEM_OPTIONS.includes(normalizedMeridiem as (typeof SCHEDULER_MERIDIEM_OPTIONS)[number])
  ) {
    return null;
  }

  const hour24 =
    normalizedMeridiem === "AM"
      ? normalizedHour === 12
        ? 0
        : normalizedHour
      : normalizedHour === 12
        ? 12
        : normalizedHour + 12;

  const localDateTime = DateTime.fromObject(
    {
      ...DateTime.fromFormat(input.date, "yyyy-MM-dd", { zone: input.timezone }).toObject(),
      hour: hour24,
      minute: normalizedMinute,
      second: 0,
      millisecond: 0,
    },
    { zone: input.timezone },
  );

  if (!localDateTime.isValid) {
    return null;
  }

  return localDateTime.toUTC().toJSDate();
}

export function formatDateTimeForTimezone(
  value: Date | string | null | undefined,
  timezone: string,
  options?: Intl.DateTimeFormatOptions,
) {
  if (!value) {
    return "";
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    ...options,
  }).format(date);
}

export function formatTimeForTimezone(value: Date | string | null | undefined, timezone: string) {
  if (!value) {
    return "";
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function formatMonthLabel(date: Date, timezone: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    month: "long",
    year: "numeric",
  }).format(date);
}

export function getMonthRangeForTimezone(monthParam: string | undefined, timezone: string) {
  let monthStart = DateTime.now().setZone(timezone).startOf("month");
  if (monthParam) {
    const parsed = DateTime.fromFormat(monthParam, "yyyy-MM", { zone: timezone });
    if (parsed.isValid) {
      monthStart = parsed.startOf("month");
    }
  }

  return {
    monthStart,
    monthEnd: monthStart.plus({ months: 1 }),
  };
}

export function toDateTimeLocalFields(value: Date | null, timezone: string) {
  if (!value) {
    return {
      date: "",
      hour: "",
      minute: "00",
      meridiem: "PM",
    };
  }

  const dateTime = DateTime.fromJSDate(value, { zone: "utc" }).setZone(timezone);
  const hour24 = dateTime.hour;
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return {
    date: dateTime.toFormat("yyyy-MM-dd"),
    hour: String(hour12),
    minute: dateTime.toFormat("mm"),
    meridiem: hour24 >= 12 ? "PM" : "AM",
  };
}

export function getDateKeyForTimezone(value: Date, timezone: string) {
  return DateTime.fromJSDate(value, { zone: "utc" }).setZone(timezone).toFormat("yyyy-MM-dd");
}

export function getSchedulerTimezoneLabel(timezone: string) {
  return timezone === DEFAULT_APP_TIMEZONE ? "Eastern Time" : timezone;
}

export function getDefaultScheduleFields(timezone: string, input?: { date?: string; time?: string }) {
  const now = DateTime.now().setZone(timezone);
  const requestedDate = input?.date?.trim() ?? "";
  const requestedTime = input?.time?.trim() ?? "";
  const parsedRequestedDate = DateTime.fromFormat(requestedDate, "yyyy-MM-dd", { zone: timezone });
  const parsedRequestedTime = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(requestedTime);

  const fallbackDate = now.toFormat("yyyy-MM-dd");
  const resolvedDate = parsedRequestedDate.isValid ? requestedDate : fallbackDate;

  if (parsedRequestedTime) {
    const hour24 = Number.parseInt(parsedRequestedTime[1], 10);
    const minute = parsedRequestedTime[2];
    const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;

    return {
      date: resolvedDate,
      hour: String(hour12),
      minute,
      meridiem: hour24 >= 12 ? "PM" : "AM",
    };
  }

  return {
    date: resolvedDate,
    hour: "5",
    minute: "00",
    meridiem: "PM",
  };
}
