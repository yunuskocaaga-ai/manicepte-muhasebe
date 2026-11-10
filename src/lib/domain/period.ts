/**
 * Ay anahtarı her zaman "YYYY-MM" formatındadır (örn. "2026-11").
 */
export type MonthKey = string;

export function isValidMonthKey(key: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(key);
}

export function monthKeyOf(year: number, month1to12: number): MonthKey {
  return `${year}-${String(month1to12).padStart(2, "0")}`;
}

export function parseMonthKey(key: MonthKey): { year: number; month: number } {
  if (!isValidMonthKey(key)) throw new Error(`Geçersiz ay anahtarı: ${key}`);
  const [year, month] = key.split("-").map(Number);
  return { year, month };
}

export function daysInMonth(year: number, month1to12: number): number {
  return new Date(year, month1to12, 0).getDate();
}

/** 29-31 gibi günleri kısa aylarda güvenli şekilde ayın son gününe sabitler. */
export function clampDueDay(year: number, month1to12: number, dueDay: number): number {
  const max = daysInMonth(year, month1to12);
  return Math.min(Math.max(1, dueDay), max);
}

export function nextMonthKey(key: MonthKey): MonthKey {
  const { year, month } = parseMonthKey(key);
  if (month === 12) return monthKeyOf(year + 1, 1);
  return monthKeyOf(year, month + 1);
}

export function previousMonthKey(key: MonthKey): MonthKey {
  const { year, month } = parseMonthKey(key);
  if (month === 1) return monthKeyOf(year - 1, 12);
  return monthKeyOf(year, month - 1);
}

export function currentMonthKey(now: Date = new Date()): MonthKey {
  return monthKeyOf(now.getFullYear(), now.getMonth() + 1);
}

/** Bir ay anahtarı içindeki ödeme günü için gerçek tarihi (ISO, yerel) üretir. */
export function dueDateForMonth(key: MonthKey, dueDay: number): Date {
  const { year, month } = parseMonthKey(key);
  const day = clampDueDay(year, month, dueDay);
  return new Date(year, month - 1, day);
}

export function compareMonthKeys(a: MonthKey, b: MonthKey): number {
  return a.localeCompare(b);
}
