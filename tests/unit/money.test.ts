import { describe, expect, it } from "vitest";
import { formatKurusAsTl, parseTlInput, tlToKurus, kurusToTl, sumKurus } from "@/lib/domain/money";

describe("money", () => {
  it("TL tutarını kuruşa çevirir", () => {
    expect(tlToKurus(800)).toBe(80000);
    expect(tlToKurus(12.5)).toBe(1250);
  });

  it("kuruşu TL'ye çevirir", () => {
    expect(kurusToTl(80000)).toBe(800);
  });

  it("kullanıcı girdisini (virgül/nokta) doğru ayrıştırır", () => {
    expect(parseTlInput("800")).toBe(80000);
    expect(parseTlInput("800,50")).toBe(80050);
    expect(parseTlInput("1.234,56")).toBe(123456);
  });

  it("kuruş toplamı doğru hesaplar", () => {
    expect(sumKurus([100, 200, 300])).toBe(600);
  });

  it("TL formatlama ₺ sembolü içerir", () => {
    expect(formatKurusAsTl(80000)).toContain("800");
  });
});
