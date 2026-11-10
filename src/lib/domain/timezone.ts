import { toZonedTime, fromZonedTime } from "date-fns-tz";
import { format } from "date-fns";

export const APP_TIMEZONE = "Europe/Istanbul";

export function nowInIstanbul(now: Date = new Date()): Date {
  return toZonedTime(now, APP_TIMEZONE);
}

export function istanbulDateKey(now: Date = new Date()): string {
  return format(nowInIstanbul(now), "yyyy-MM-dd");
}

/** Yerel (Istanbul) tarih+saat 00:00 anını UTC Date'e çevirir, karşılaştırmalar için kullanılır. */
export function istanbulMidnightUtc(localDate: Date): Date {
  return fromZonedTime(
    new Date(localDate.getFullYear(), localDate.getMonth(), localDate.getDate(), 0, 0, 0),
    APP_TIMEZONE,
  );
}
