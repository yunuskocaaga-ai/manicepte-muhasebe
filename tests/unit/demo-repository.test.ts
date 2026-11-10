import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DemoStore } from "@/lib/db/demo/store";
import { DemoRepository } from "@/lib/db/demo/repository";

let tmpDir: string;
let repo: DemoRepository;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "manicepte-test-"));
  repo = new DemoRepository(new DemoStore(tmpDir));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

async function seedPersons() {
  const yusuf = await repo.persons.create({ name: "Yusuf" });
  const yunus = await repo.persons.create({ name: "Yunus" });
  const burak = await repo.persons.create({ name: "Burak" });
  const ismail = await repo.persons.create({ name: "İsmail" });
  return { yusuf, yunus, burak, ismail };
}

describe("DemoRepository — giderler ve çoklu kişi adına ödeme", () => {
  it("800 TL ChatGPT gideri senaryosu uçtan uca çalışır", async () => {
    const { yusuf, yunus, burak, ismail } = await seedPersons();
    const expense = await repo.expenses.create({
      name: "ChatGPT",
      amountKurus: 80000,
      month: "2026-11",
      dueDay: 15,
      splitMode: "equal",
      participantPersonIds: [yusuf.id, yunus.id, burak.id, ismail.id],
    });

    await repo.payments.create({
      expenseId: expense.id,
      payerPersonId: yusuf.id,
      beneficiaryPersonIds: [yusuf.id, yunus.id, burak.id],
      paidAt: "2026-11-15",
    });
    await repo.payments.create({
      expenseId: expense.id,
      payerPersonId: ismail.id,
      beneficiaryPersonIds: [ismail.id],
      paidAt: "2026-11-15",
    });

    const debts = await repo.debts.list();
    expect(debts).toHaveLength(2);
    const yunusDebt = debts.find((d) => d.debtorPersonId === yunus.id)!;
    const burakDebt = debts.find((d) => d.debtorPersonId === burak.id)!;
    expect(yunusDebt.amountKurus).toBe(20000);
    expect(yunusDebt.creditorPersonId).toBe(yusuf.id);
    expect(burakDebt.amountKurus).toBe(20000);
  });

  it("aşan ödeme repository seviyesinde reddedilir", async () => {
    const { yusuf, yunus } = await seedPersons();
    const expense = await repo.expenses.create({
      name: "Test",
      amountKurus: 10000,
      month: "2026-11",
      dueDay: 1,
      splitMode: "equal",
      participantPersonIds: [yusuf.id, yunus.id],
    });
    await expect(
      repo.payments.create({
        expenseId: expense.id,
        payerPersonId: yusuf.id,
        beneficiaryPersonIds: [yunus.id],
        amountKurusPerBeneficiary: { [yunus.id]: 10000 },
        paidAt: "2026-11-01",
      }),
    ).rejects.toThrow();
  });
});

describe("DemoRepository — kısmi geri ödeme ve borç devri", () => {
  it("kısmi geri ödeme kalan bakiyeyi düşürür, borç ay bağımsız devam eder", async () => {
    const { yusuf, yunus } = await seedPersons();
    const expense = await repo.expenses.create({
      name: "Elektrik",
      amountKurus: 20000,
      month: "2026-10",
      dueDay: 5,
      splitMode: "equal",
      participantPersonIds: [yusuf.id, yunus.id],
    });
    await repo.payments.create({
      expenseId: expense.id,
      payerPersonId: yusuf.id,
      beneficiaryPersonIds: [yunus.id],
      paidAt: "2026-10-05",
    });
    const [debt] = await repo.debts.list(yunus.id);
    expect(debt.amountKurus).toBe(10000);
    expect(debt.sourceMonth).toBe("2026-10");

    await repo.debts.addRepayment({ debtId: debt.id, amountKurus: 4000, paidAt: "2026-11-01" });
    const repayments = await repo.debts.listRepayments(debt.id);
    expect(repayments.reduce((a, r) => a + r.amountKurus, 0)).toBe(4000);

    // Ay değişse de (kasım'da) borç kaydı ve kaynak ay bilgisi korunuyor.
    const stillThere = await repo.debts.get(debt.id);
    expect(stillThere?.sourceMonth).toBe("2026-10");

    await expect(
      repo.debts.addRepayment({ debtId: debt.id, amountKurus: 6001, paidAt: "2026-11-02" }),
    ).rejects.toThrow();
    await repo.debts.addRepayment({ debtId: debt.id, amountKurus: 6000, paidAt: "2026-11-02" });
    const final = await repo.debts.listRepayments(debt.id);
    expect(final.reduce((a, r) => a + r.amountKurus, 0)).toBe(10000);
  });
});

describe("DemoRepository — gider tutarı değişikliği", () => {
  it("tutar değişince ödemeler silinmeden paylar yeniden hesaplanır", async () => {
    const { yusuf, yunus } = await seedPersons();
    const expense = await repo.expenses.create({
      name: "İnternet",
      amountKurus: 10000,
      month: "2026-11",
      dueDay: 10,
      splitMode: "equal",
      participantPersonIds: [yusuf.id, yunus.id],
    });
    await repo.payments.create({
      expenseId: expense.id,
      payerPersonId: yunus.id,
      beneficiaryPersonIds: [yunus.id],
      paidAt: "2026-11-10",
    });

    await repo.expenses.update(expense.id, { amountKurus: 20000 });
    const shares = await repo.expenses.getShares(expense.id);
    expect(shares.every((s) => s.amountKurus === 10000)).toBe(true);

    const payments = await repo.payments.listByExpense(expense.id);
    expect(payments).toHaveLength(1);
    expect(payments[0].amountKurus).toBe(5000); // eski ödeme değişmedi
  });
});

describe("DemoRepository — çöp kutusu", () => {
  it("silinen gider çöp kutusunda görünür ve geri yüklenebilir", async () => {
    const { yusuf } = await seedPersons();
    const expense = await repo.expenses.create({
      name: "Test Gider",
      amountKurus: 5000,
      month: "2026-11",
      dueDay: 1,
      splitMode: "equal",
      participantPersonIds: [yusuf.id],
    });
    await repo.expenses.softDelete(expense.id);
    const trash = await repo.trash.list();
    expect(trash.some((t) => t.entityId === expense.id)).toBe(true);

    await repo.trash.restore("expense", expense.id);
    const restored = await repo.expenses.get(expense.id);
    expect(restored?.deletedAt).toBeNull();
  });
});

describe("DemoRepository — yedek alma ve geri yükleme", () => {
  it("export edilen yedek başka bir store'a geri yüklenebilir", async () => {
    const { yusuf, yunus } = await seedPersons();
    await repo.expenses.create({
      name: "Yedek testi",
      amountKurus: 1000,
      month: "2026-11",
      dueDay: 1,
      splitMode: "equal",
      participantPersonIds: [yusuf.id, yunus.id],
    });
    const backup = await repo.backup.export();
    expect(backup.schemaVersion).toBe(1);

    const otherDir = await fs.mkdtemp(path.join(os.tmpdir(), "manicepte-test2-"));
    const otherRepo = new DemoRepository(new DemoStore(otherDir));
    await otherRepo.backup.restore(backup);
    const persons = await otherRepo.persons.list();
    expect(persons).toHaveLength(4);
    await fs.rm(otherDir, { recursive: true, force: true });
  });

  it("bozuk checksum ile geri yükleme reddedilir", async () => {
    const backup = await repo.backup.export();
    backup.checksum = "bozuk";
    await expect(repo.backup.restore(backup)).rejects.toThrow();
  });
});

describe("DemoRepository — düzenli giderler", () => {
  it("dönem üretimi idempotenttir ve kısa ayda günü sabitler", async () => {
    const { yusuf, yunus } = await seedPersons();
    const recurring = await repo.recurringExpenses.create({
      name: "Kira",
      amountKurus: 100000,
      dueDay: 31,
      splitMode: "equal",
      participantPersonIds: [yusuf.id, yunus.id],
      startMonth: "2026-01",
    });

    const first = await repo.recurringExpenses.generatePeriod(recurring.id, "2026-02");
    expect(first?.dueDay).toBe(28); // 2026 artık yıl değil
    const second = await repo.recurringExpenses.generatePeriod(recurring.id, "2026-02");
    expect(second?.id).toBe(first?.id); // idempotent, ikinci kayıt açılmadı

    const all = await repo.expenses.list({ month: "2026-02" });
    expect(all).toHaveLength(1);
  });

  it("şablon tutarı değişince sadece gelecek dönemler etkilenir", async () => {
    const { yusuf, yunus } = await seedPersons();
    const recurring = await repo.recurringExpenses.create({
      name: "Kira",
      amountKurus: 100000,
      dueDay: 5,
      splitMode: "equal",
      participantPersonIds: [yusuf.id, yunus.id],
      startMonth: "2026-01",
    });
    const january = await repo.recurringExpenses.generatePeriod(recurring.id, "2026-01");
    await repo.recurringExpenses.update(recurring.id, { amountKurus: 150000 });
    const february = await repo.recurringExpenses.generatePeriod(recurring.id, "2026-02");

    expect(january?.amountKurus).toBe(100000); // geçmiş dönem korunur
    expect(february?.amountKurus).toBe(150000); // yeni dönem güncel tutarı kullanır
  });
});
