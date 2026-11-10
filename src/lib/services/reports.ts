import type { Repository } from "@/lib/db/repository";
import type { Expense } from "@/lib/domain/types";
import { computeShareBalances, netBalances, type DebtLedgerEntry } from "@/lib/domain/debt-engine";
import { dueDateForMonth } from "@/lib/domain/period";
import { istanbulMidnightUtc, nowInIstanbul } from "@/lib/domain/timezone";

export interface ExpensePaymentStatus {
  expense: Expense;
  totalKurus: number;
  paidKurus: number;
  remainingKurus: number;
  fullyPaid: boolean;
  dueDate: Date;
  isOverdue: boolean;
}

export async function computeExpenseStatus(repo: Repository, expense: Expense): Promise<ExpensePaymentStatus> {
  const [shares, payments] = await Promise.all([
    repo.expenses.getShares(expense.id),
    repo.payments.listByExpense(expense.id),
  ]);
  const balances = computeShareBalances(shares, payments);
  const paidKurus = balances.reduce((acc, b) => acc + Math.min(b.paidKurus, b.shareKurus), 0);
  const remainingKurus = balances.reduce((acc, b) => acc + b.remainingKurus, 0);
  const dueDate = dueDateForMonth(expense.month, expense.dueDay);
  const todayUtc = istanbulMidnightUtc(nowInIstanbul());
  // dueDate, sunucunun yerel saat dilimiyle (Vercel'de UTC) oluşturulur; bu
  // yüzden karşılaştırmadan önce Europe/Istanbul gece yarısına denk gelen
  // gerçek UTC anına çevrilir. Aksi halde sunucu UTC'de çalışırken (Istanbul
  // +3 saat ileride) "bugün"/"yarın" karşılaştırmaları yanlış çıkar — bu,
  // before_due hatırlatmasının hiç tetiklenmemesine sebep olan gerçek bir
  // hatadır (bkz. notifications.ts).
  const dueUtc = istanbulMidnightUtc(dueDate);
  return {
    expense,
    totalKurus: expense.amountKurus,
    paidKurus,
    remainingKurus,
    fullyPaid: remainingKurus === 0,
    dueDate,
    isOverdue: remainingKurus > 0 && dueUtc.getTime() < todayUtc.getTime(),
  };
}

export interface MonthSummary {
  month: string;
  totalKurus: number;
  paidKurus: number;
  pendingKurus: number;
  expenseCount: number;
  statuses: ExpensePaymentStatus[];
  upcoming: ExpensePaymentStatus[];
  overdue: ExpensePaymentStatus[];
}

export async function computeMonthSummary(repo: Repository, month: string): Promise<MonthSummary> {
  const expenses = await repo.expenses.list({ month });
  const statuses = await Promise.all(expenses.map((e) => computeExpenseStatus(repo, e)));

  const totalKurus = statuses.reduce((acc, s) => acc + s.totalKurus, 0);
  const paidKurus = statuses.reduce((acc, s) => acc + s.paidKurus, 0);
  const pendingKurus = totalKurus - paidKurus;

  const unpaid = statuses.filter((s) => !s.fullyPaid);
  const overdue = unpaid.filter((s) => s.isOverdue).sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
  const upcoming = unpaid
    .filter((s) => !s.isOverdue)
    .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());

  return {
    month,
    totalKurus,
    paidKurus,
    pendingKurus,
    expenseCount: expenses.length,
    statuses,
    upcoming,
    overdue,
  };
}

export interface DebtSummary {
  totalOwedToOthersKurus: number;
  totalOwedByOthersKurus: number;
  net: ReturnType<typeof netBalances>;
}

export async function computeDebtSummary(repo: Repository, personId?: string): Promise<DebtSummary> {
  const debts = await repo.debts.list(personId);
  const entries: DebtLedgerEntry[] = await Promise.all(
    debts.map(async (d) => {
      const repayments = await repo.debts.listRepayments(d.id);
      const repaid = repayments.reduce((acc, r) => acc + r.amountKurus, 0);
      return {
        id: d.id,
        debtorPersonId: d.debtorPersonId,
        creditorPersonId: d.creditorPersonId,
        amountKurus: d.amountKurus,
        remainingKurus: Math.max(0, d.amountKurus - repaid),
      };
    }),
  );

  const totalOwedByOthersKurus = personId
    ? entries.filter((e) => e.creditorPersonId === personId).reduce((a, e) => a + e.remainingKurus, 0)
    : 0;
  const totalOwedToOthersKurus = personId
    ? entries.filter((e) => e.debtorPersonId === personId).reduce((a, e) => a + e.remainingKurus, 0)
    : 0;

  return {
    totalOwedToOthersKurus,
    totalOwedByOthersKurus,
    net: netBalances(entries),
  };
}

export interface MonthComparisonRow {
  month: string;
  totalKurus: number;
  paidKurus: number;
  pendingKurus: number;
}

export async function compareMonths(repo: Repository, months: string[]): Promise<MonthComparisonRow[]> {
  const summaries = await Promise.all(months.map((m) => computeMonthSummary(repo, m)));
  return summaries.map((s) => ({
    month: s.month,
    totalKurus: s.totalKurus,
    paidKurus: s.paidKurus,
    pendingKurus: s.pendingKurus,
  }));
}

export interface CollectionsSummary {
  paymentsTotalKurus: number;
  repaymentsTotalKurus: number;
}

/** Belirli bir ay içinde gerçekleşen ödeme ve borç geri ödemelerinin toplamı (tahsilat raporu). */
export async function computeCollectionsForMonth(repo: Repository, month: string): Promise<CollectionsSummary> {
  const [payments, debts] = await Promise.all([repo.payments.listAll(), repo.debts.list()]);
  const paymentsTotalKurus = payments
    .filter((p) => p.paidAt.startsWith(month))
    .reduce((acc, p) => acc + p.amountKurus, 0);

  const repaymentLists = await Promise.all(debts.map((d) => repo.debts.listRepayments(d.id)));
  const repaymentsTotalKurus = repaymentLists
    .flat()
    .filter((r) => r.paidAt.startsWith(month))
    .reduce((acc, r) => acc + r.amountKurus, 0);

  return { paymentsTotalKurus, repaymentsTotalKurus };
}
