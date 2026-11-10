import { describe, expect, it } from "vitest";
import {
  computeShareBalances,
  deriveDebtEntriesFromPayments,
  validateNewPayment,
  netBalances,
  debtRemaining,
  validateRepayment,
  type DebtLedgerEntry,
} from "@/lib/domain/debt-engine";
import { splitEqual } from "@/lib/domain/split";

const PERSONS = ["yusuf", "yunus", "burak", "ismail"];

describe("ChatGPT senaryosu — 800 TL, 4 kişi", () => {
  const shares = splitEqual(80000, PERSONS).map((s) => ({ expenseId: "exp-1", ...s }));

  it("Yusuf kendi payı + Yunus + Burak'ın payını öderse ikisi de Yusuf'a 200 TL borçlanır", () => {
    const payments = [
      { id: "p1", expenseId: "exp-1", payerPersonId: "yusuf", beneficiaryPersonId: "yusuf", amountKurus: 20000 },
      { id: "p2", expenseId: "exp-1", payerPersonId: "yusuf", beneficiaryPersonId: "yunus", amountKurus: 20000 },
      { id: "p3", expenseId: "exp-1", payerPersonId: "yusuf", beneficiaryPersonId: "burak", amountKurus: 20000 },
      { id: "p4", expenseId: "exp-1", payerPersonId: "ismail", beneficiaryPersonId: "ismail", amountKurus: 20000 },
    ];

    const debts = deriveDebtEntriesFromPayments(payments);
    expect(debts).toHaveLength(2);
    expect(debts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ debtorPersonId: "yunus", creditorPersonId: "yusuf", amountKurus: 20000 }),
        expect.objectContaining({ debtorPersonId: "burak", creditorPersonId: "yusuf", amountKurus: 20000 }),
      ]),
    );

    const balances = computeShareBalances(shares, payments);
    expect(balances.every((b) => b.status === "paid")).toBe(true);
  });

  it("İsmail kendi payını öderse borç oluşmaz", () => {
    const payments = [
      { id: "p4", expenseId: "exp-1", payerPersonId: "ismail", beneficiaryPersonId: "ismail", amountKurus: 20000 },
    ];
    expect(deriveDebtEntriesFromPayments(payments)).toHaveLength(0);
  });

  it("bir kişi birden fazla kişinin payını aynı giderde karşılayabilir", () => {
    const payments = [
      { id: "p1", expenseId: "exp-1", payerPersonId: "yusuf", beneficiaryPersonId: "yunus", amountKurus: 20000 },
      { id: "p2", expenseId: "exp-1", payerPersonId: "yusuf", beneficiaryPersonId: "burak", amountKurus: 20000 },
      { id: "p3", expenseId: "exp-1", payerPersonId: "yusuf", beneficiaryPersonId: "ismail", amountKurus: 20000 },
    ];
    const debts = deriveDebtEntriesFromPayments(payments);
    expect(debts.filter((d) => d.creditorPersonId === "yusuf")).toHaveLength(3);
  });

  it("payın kalanını aşan ödeme güvenle reddedilir", () => {
    const share = shares.find((s) => s.personId === "yunus")!;
    expect(() => validateNewPayment(share, [], 25000)).toThrow();
  });

  it("kısmi ödeme sonrası kalan tutar doğru hesaplanır, aşım engellenir", () => {
    const share = shares.find((s) => s.personId === "yunus")!;
    const existing = [
      { id: "p1", expenseId: "exp-1", payerPersonId: "yunus", beneficiaryPersonId: "yunus", amountKurus: 15000 },
    ];
    validateNewPayment(share, existing, 5000); // kalan tam 5000, geçmeli
    expect(() => validateNewPayment(share, existing, 5001)).toThrow();
  });
});

describe("borç geri ödeme", () => {
  it("kısmi geri ödemelerde kalan bakiye doğru hesaplanır", () => {
    expect(debtRemaining(20000, [5000, 5000])).toBe(10000);
  });

  it("kalanı aşan geri ödeme reddedilir", () => {
    expect(() => validateRepayment(20000, [15000], 6000)).toThrow();
    expect(() => validateRepayment(20000, [15000], 5000)).not.toThrow();
  });
});

describe("karşılıklı borç mahsuplaşması", () => {
  it("A->B 20000 ve B->A 15000 ise net A->B 5000 olur", () => {
    const entries: DebtLedgerEntry[] = [
      { id: "d1", debtorPersonId: "a", creditorPersonId: "b", amountKurus: 20000, remainingKurus: 20000 },
      { id: "d2", debtorPersonId: "b", creditorPersonId: "a", amountKurus: 15000, remainingKurus: 15000 },
    ];
    const net = netBalances(entries);
    expect(net).toHaveLength(1);
    expect(net[0].netAmountKurusAtoB).toBe(5000);
  });

  it("eşit karşılıklı borçlar birbirini tamamen götürür", () => {
    const entries: DebtLedgerEntry[] = [
      { id: "d1", debtorPersonId: "a", creditorPersonId: "b", amountKurus: 10000, remainingKurus: 10000 },
      { id: "d2", debtorPersonId: "b", creditorPersonId: "a", amountKurus: 10000, remainingKurus: 10000 },
    ];
    expect(netBalances(entries)).toHaveLength(0);
  });

  it("ödenmiş (remainingKurus=0) borçlar netlemeye dahil edilmez", () => {
    const entries: DebtLedgerEntry[] = [
      { id: "d1", debtorPersonId: "a", creditorPersonId: "b", amountKurus: 10000, remainingKurus: 0 },
    ];
    expect(netBalances(entries)).toHaveLength(0);
  });
});
