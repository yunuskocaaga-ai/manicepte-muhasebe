import type { Kurus } from "./money";

export interface ExpenseShareLike {
  expenseId: string;
  personId: string;
  amountKurus: Kurus;
}

export interface PaymentLike {
  id: string;
  expenseId: string;
  payerPersonId: string;
  beneficiaryPersonId: string;
  amountKurus: Kurus;
}

export interface ShareBalance {
  expenseId: string;
  personId: string;
  shareKurus: Kurus;
  paidKurus: Kurus;
  remainingKurus: Kurus;
  overpaidKurus: Kurus;
  status: "paid" | "unpaid";
}

/** Bir gider payına ait ödemeleri toplayarak kalan/aşım bakiyesini hesaplar. */
export function computeShareBalances(
  shares: ExpenseShareLike[],
  payments: PaymentLike[],
): ShareBalance[] {
  return shares.map((share) => {
    const paidKurus = payments
      .filter((p) => p.expenseId === share.expenseId && p.beneficiaryPersonId === share.personId)
      .reduce((acc, p) => acc + p.amountKurus, 0);
    const remainingKurus = Math.max(0, share.amountKurus - paidKurus);
    const overpaidKurus = Math.max(0, paidKurus - share.amountKurus);
    return {
      expenseId: share.expenseId,
      personId: share.personId,
      shareKurus: share.amountKurus,
      paidKurus,
      remainingKurus,
      overpaidKurus,
      status: remainingKurus === 0 ? "paid" : "unpaid",
    };
  });
}

/**
 * Bir kişi başka bir kişinin payını kapatmak için yeni bir ödeme yapmadan önce
 * çağrılır. Aşım / çakışma oluşturacak ödemeleri güvenle reddeder.
 */
export function validateNewPayment(
  share: ExpenseShareLike,
  existingPayments: PaymentLike[],
  newAmountKurus: Kurus,
): void {
  if (newAmountKurus <= 0) throw new Error("Ödeme tutarı sıfırdan büyük olmalıdır");
  const alreadyPaid = existingPayments
    .filter((p) => p.expenseId === share.expenseId && p.beneficiaryPersonId === share.personId)
    .reduce((acc, p) => acc + p.amountKurus, 0);
  const remaining = share.amountKurus - alreadyPaid;
  if (newAmountKurus > remaining) {
    throw new Error(
      `Bu ödeme payın kalan tutarını (${remaining} kuruş) aşıyor. Lütfen tutarı kontrol edin.`,
    );
  }
}

export interface DerivedDebtEntry {
  sourcePaymentId: string;
  sourceExpenseId: string;
  debtorPersonId: string;
  creditorPersonId: string;
  amountKurus: Kurus;
}

/**
 * Bir kişi başkasının payını öderse borç oluşur (ödeyen alacaklı, pay sahibi borçlu).
 * Kendi payını ödeyen kişi için borç oluşmaz.
 */
export function deriveDebtEntriesFromPayments(payments: PaymentLike[]): DerivedDebtEntry[] {
  return payments
    .filter((p) => p.payerPersonId !== p.beneficiaryPersonId)
    .map((p) => ({
      sourcePaymentId: p.id,
      sourceExpenseId: p.expenseId,
      debtorPersonId: p.beneficiaryPersonId,
      creditorPersonId: p.payerPersonId,
      amountKurus: p.amountKurus,
    }));
}

export interface DebtLedgerEntry {
  id: string;
  debtorPersonId: string;
  creditorPersonId: string;
  amountKurus: Kurus;
  remainingKurus: Kurus;
}

export interface NetBalance {
  personA: string;
  personB: string;
  /** personA, personB'ye bu kadar borçlu (negatifse personB, personA'ya borçlu demektir) */
  netAmountKurusAtoB: Kurus;
}

/**
 * Karşılıklı borçları kişi çiftleri bazında mahsuplaştırır. Kaynak borç
 * kayıtlarını değiştirmez, salt bir görünüm/özet üretir.
 */
export function netBalances(entries: DebtLedgerEntry[]): NetBalance[] {
  const pairTotals = new Map<string, { a: string; b: string; net: number }>();

  for (const entry of entries) {
    if (entry.remainingKurus === 0) continue;
    const [a, b] = [entry.debtorPersonId, entry.creditorPersonId].sort();
    const key = `${a}|${b}`;
    const sign = entry.debtorPersonId === a ? 1 : -1; // a -> b borcu pozitif
    const existing = pairTotals.get(key) ?? { a, b, net: 0 };
    existing.net += sign * entry.remainingKurus;
    pairTotals.set(key, existing);
  }

  return Array.from(pairTotals.values())
    .filter((p) => p.net !== 0)
    .map((p) => ({ personA: p.a, personB: p.b, netAmountKurusAtoB: p.net }));
}

export function debtRemaining(amountKurus: Kurus, repaymentsKurus: Kurus[]): Kurus {
  const repaid = repaymentsKurus.reduce((acc, v) => acc + v, 0);
  return Math.max(0, amountKurus - repaid);
}

export function validateRepayment(
  debtAmountKurus: Kurus,
  existingRepaymentsKurus: Kurus[],
  newRepaymentKurus: Kurus,
): void {
  if (newRepaymentKurus <= 0) throw new Error("Geri ödeme tutarı sıfırdan büyük olmalıdır");
  const remaining = debtRemaining(debtAmountKurus, existingRepaymentsKurus);
  if (newRepaymentKurus > remaining) {
    throw new Error(
      `Geri ödeme, kalan borç tutarını (${remaining} kuruş) aşamaz.`,
    );
  }
}
