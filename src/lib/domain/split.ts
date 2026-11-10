import type { Kurus } from "./money";

export type SplitMode = "equal" | "custom_amount" | "percentage";

export interface ShareInput {
  personId: string;
  /** percentage modunda 0-100 arası yüzde, custom_amount modunda hedef kuruş tutarı */
  value?: number;
}

export interface ComputedShare {
  personId: string;
  amountKurus: Kurus;
}

/**
 * Kuruş kalanlarını deterministik biçimde dağıtır: taban paylar floor ile
 * hesaplanır, kalan kuruşlar personId'ye göre alfabetik sırayla tek tek
 * eklenir. Böylece aynı girdi her zaman aynı çıktıyı üretir.
 */
function distributeRemainder(
  base: Map<string, number>,
  remainder: number,
  orderedPersonIds: string[],
): Map<string, number> {
  if (remainder < 0) throw new Error("Negatif kalan dağıtılamaz");
  const sortedIds = [...orderedPersonIds].sort((a, b) => a.localeCompare(b));
  const result = new Map(base);
  for (let i = 0; i < remainder; i++) {
    const id = sortedIds[i % sortedIds.length];
    result.set(id, (result.get(id) ?? 0) + 1);
  }
  return result;
}

export function splitEqual(totalKurus: Kurus, personIds: string[]): ComputedShare[] {
  if (personIds.length === 0) throw new Error("Bölüştürme için en az bir kişi gerekli");
  const n = personIds.length;
  const base = Math.floor(totalKurus / n);
  const remainder = totalKurus - base * n;
  const baseMap = new Map(personIds.map((id) => [id, base]));
  const final = distributeRemainder(baseMap, remainder, personIds);
  return personIds.map((personId) => ({ personId, amountKurus: final.get(personId) ?? 0 }));
}

export function splitByPercentage(totalKurus: Kurus, shares: ShareInput[]): ComputedShare[] {
  const totalPct = shares.reduce((acc, s) => acc + (s.value ?? 0), 0);
  if (Math.abs(totalPct - 100) > 0.001) {
    throw new Error(`Yüzdeler toplamı 100 olmalı, girilen: ${totalPct}`);
  }
  const baseMap = new Map<string, number>();
  let allocated = 0;
  for (const s of shares) {
    const amount = Math.floor((totalKurus * (s.value ?? 0)) / 100);
    baseMap.set(s.personId, amount);
    allocated += amount;
  }
  const remainder = totalKurus - allocated;
  const final = distributeRemainder(
    baseMap,
    remainder,
    shares.map((s) => s.personId),
  );
  return shares.map((s) => ({ personId: s.personId, amountKurus: final.get(s.personId) ?? 0 }));
}

export function validateCustomShares(totalKurus: Kurus, shares: ShareInput[]): ComputedShare[] {
  const sum = shares.reduce((acc, s) => acc + (s.value ?? 0), 0);
  if (sum !== totalKurus) {
    throw new Error(
      `Özel pay toplamı (${sum} kuruş) gider tutarına (${totalKurus} kuruş) eşit olmalıdır`,
    );
  }
  return shares.map((s) => ({ personId: s.personId, amountKurus: s.value ?? 0 }));
}

export function computeShares(
  mode: SplitMode,
  totalKurus: Kurus,
  input: { personIds: string[]; shares?: ShareInput[] },
): ComputedShare[] {
  if (mode === "equal") return splitEqual(totalKurus, input.personIds);
  if (mode === "percentage") return splitByPercentage(totalKurus, input.shares ?? []);
  if (mode === "custom_amount") return validateCustomShares(totalKurus, input.shares ?? []);
  throw new Error(`Bilinmeyen bölüştürme modu: ${mode}`);
}
