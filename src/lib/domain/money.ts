/**
 * Tüm para tutarları integer kuruş (1 TL = 100 kuruş) olarak saklanır.
 * Kayan nokta hatalarından kaçınmak için hiçbir yerde float TL tutarı taşınmaz.
 */

export type Kurus = number;

export function tlToKurus(tl: number): Kurus {
  if (!Number.isFinite(tl)) throw new Error("Geçersiz tutar");
  return Math.round(tl * 100);
}

export function kurusToTl(kurus: Kurus): number {
  return kurus / 100;
}

/** Kullanıcı girişindeki "1.234,56" veya "1234.56" gibi TL string'ini kuruşa çevirir. */
export function parseTlInput(input: string): Kurus {
  const normalized = input
    .trim()
    .replace(/\./g, "")
    .replace(",", ".");
  const value = Number(normalized);
  if (!Number.isFinite(value)) throw new Error("Geçersiz tutar girişi");
  return tlToKurus(value);
}

export function formatKurusAsTl(kurus: Kurus): string {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    minimumFractionDigits: 2,
  }).format(kurusToTl(kurus));
}

export function sumKurus(amounts: Kurus[]): Kurus {
  return amounts.reduce((acc, v) => acc + v, 0);
}

export function assertPositiveInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} pozitif bir tam sayı (kuruş) olmalıdır`);
  }
}
