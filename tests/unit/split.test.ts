import { describe, expect, it } from "vitest";
import { splitEqual, splitByPercentage, validateCustomShares, computeShares } from "@/lib/domain/split";

describe("splitEqual", () => {
  it("tam bölünen tutarı eşit dağıtır", () => {
    const result = splitEqual(80000, ["yusuf", "yunus", "burak", "ismail"]);
    expect(result).toHaveLength(4);
    expect(result.every((r) => r.amountKurus === 20000)).toBe(true);
    expect(result.reduce((acc, r) => acc + r.amountKurus, 0)).toBe(80000);
  });

  it("kuruş kalanını deterministik dağıtır (100/3)", () => {
    const result = splitEqual(100, ["c", "a", "b"]);
    const total = result.reduce((acc, r) => acc + r.amountKurus, 0);
    expect(total).toBe(100);
    // 100/3 = 33 kalan 1 -> alfabetik ilk kişiye (a) ekstra 1 kuruş gider
    const byId = Object.fromEntries(result.map((r) => [r.personId, r.amountKurus]));
    expect(byId.a).toBe(34);
    expect(byId.b).toBe(33);
    expect(byId.c).toBe(33);
  });

  it("aynı girdi için her zaman aynı sonucu üretir (deterministik)", () => {
    const r1 = splitEqual(1001, ["x", "y", "z"]);
    const r2 = splitEqual(1001, ["x", "y", "z"]);
    expect(r1).toEqual(r2);
  });

  it("boş kişi listesinde hata fırlatır", () => {
    expect(() => splitEqual(1000, [])).toThrow();
  });
});

describe("splitByPercentage", () => {
  it("33.33/33.33/33.34 gibi yüzdeleri toplamı bozmadan dağıtır", () => {
    const result = splitByPercentage(10000, [
      { personId: "a", value: 33.33 },
      { personId: "b", value: 33.33 },
      { personId: "c", value: 33.34 },
    ]);
    expect(result.reduce((acc, r) => acc + r.amountKurus, 0)).toBe(10000);
  });

  it("yüzde toplamı 100 değilse hata fırlatır", () => {
    expect(() =>
      splitByPercentage(10000, [
        { personId: "a", value: 50 },
        { personId: "b", value: 40 },
      ]),
    ).toThrow();
  });
});

describe("validateCustomShares", () => {
  it("özel tutarlar toplamı gider tutarına eşitse kabul eder", () => {
    const result = validateCustomShares(80000, [
      { personId: "a", value: 50000 },
      { personId: "b", value: 30000 },
    ]);
    expect(result).toEqual([
      { personId: "a", amountKurus: 50000 },
      { personId: "b", amountKurus: 30000 },
    ]);
  });

  it("toplam tutmazsa hata fırlatır", () => {
    expect(() =>
      validateCustomShares(80000, [
        { personId: "a", value: 50000 },
        { personId: "b", value: 20000 },
      ]),
    ).toThrow();
  });
});

describe("computeShares", () => {
  it("800 TL ChatGPT gideri 4 kişiye eşit bölünür", () => {
    const result = computeShares("equal", 80000, {
      personIds: ["yusuf", "yunus", "burak", "ismail"],
    });
    expect(result.find((r) => r.personId === "yusuf")?.amountKurus).toBe(20000);
  });
});
