import { describe, expect, it } from "vitest";
import {
  clampDueDay,
  daysInMonth,
  monthKeyOf,
  nextMonthKey,
  previousMonthKey,
  dueDateForMonth,
  isValidMonthKey,
} from "@/lib/domain/period";

describe("period", () => {
  it("ay anahtarı formatını doğrular", () => {
    expect(isValidMonthKey("2026-11")).toBe(true);
    expect(isValidMonthKey("2026-13")).toBe(false);
    expect(isValidMonthKey("2026-1")).toBe(false);
  });

  it("şubat gibi kısa aylarda 29-31 günleri güvenle sabitler", () => {
    expect(clampDueDay(2026, 2, 31)).toBe(daysInMonth(2026, 2));
    expect(clampDueDay(2024, 2, 30)).toBe(29); // 2024 artık yıl
    expect(clampDueDay(2026, 4, 31)).toBe(30); // nisan 30 gün
  });

  it("normal aylarda günü değiştirmez", () => {
    expect(clampDueDay(2026, 11, 15)).toBe(15);
  });

  it("ay geçişlerini doğru hesaplar", () => {
    expect(nextMonthKey("2026-12")).toBe("2027-01");
    expect(nextMonthKey("2026-11")).toBe("2026-12");
    expect(previousMonthKey("2027-01")).toBe("2026-12");
  });

  it("monthKeyOf ayları iki hane ile formatlar", () => {
    expect(monthKeyOf(2026, 3)).toBe("2026-03");
  });

  it("dueDateForMonth kısa ayda güvenli tarih üretir", () => {
    const date = dueDateForMonth("2026-02", 31);
    expect(date.getDate()).toBe(28);
    expect(date.getMonth()).toBe(1);
  });
});
