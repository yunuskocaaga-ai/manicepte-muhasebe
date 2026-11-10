import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DemoStore } from "@/lib/db/demo/store";
import { DemoRepository } from "@/lib/db/demo/repository";
import { runReminderSweep } from "@/lib/services/notifications";

let tmpDir: string;
let repo: DemoRepository;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "manicepte-notif-"));
  repo = new DemoRepository(new DemoStore(tmpDir));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// "Şimdi": 2026-11-10 (yerel saat farkı testi etkilememesi için öğlen seçildi)
const NOW = new Date(2026, 10, 10, 12, 0, 0);

describe("runReminderSweep", () => {
  it("yarın ödeme günü olan ödenmemiş gider için before_due e-postası üretir", async () => {
    const yusuf = await repo.persons.create({ name: "Yusuf" });
    await repo.expenses.create({
      name: "Netflix",
      amountKurus: 10000,
      month: "2026-11",
      dueDay: 11,
      splitMode: "equal",
      participantPersonIds: [yusuf.id],
    });

    const result = await runReminderSweep(repo, NOW);
    expect(result.sent).toHaveLength(1);
    expect(result.sent[0].subject).toContain("Yarın ödeme günü");
  });

  it("ödeme günü geçmiş ve hâlâ ödenmemiş gider için overdue e-postası üretir", async () => {
    const yusuf = await repo.persons.create({ name: "Yusuf" });
    await repo.expenses.create({
      name: "Elektrik",
      amountKurus: 10000,
      month: "2026-11",
      dueDay: 1,
      splitMode: "equal",
      participantPersonIds: [yusuf.id],
    });

    const result = await runReminderSweep(repo, NOW);
    expect(result.sent.some((e) => e.subject.includes("Gecikmiş ödeme"))).toBe(true);
  });

  it("ödenmiş gider için hatırlatma göndermez", async () => {
    const yusuf = await repo.persons.create({ name: "Yusuf" });
    const expense = await repo.expenses.create({
      name: "Su",
      amountKurus: 10000,
      month: "2026-11",
      dueDay: 1,
      splitMode: "equal",
      participantPersonIds: [yusuf.id],
    });
    await repo.payments.create({
      expenseId: expense.id,
      payerPersonId: yusuf.id,
      beneficiaryPersonIds: [yusuf.id],
      paidAt: "2026-11-01",
    });

    const result = await runReminderSweep(repo, NOW);
    expect(result.sent).toHaveLength(0);
  });

  it("aynı gün için tekrar çalıştırıldığında tekrar e-posta göndermez (dedup)", async () => {
    const yusuf = await repo.persons.create({ name: "Yusuf" });
    await repo.expenses.create({
      name: "Netflix",
      amountKurus: 10000,
      month: "2026-11",
      dueDay: 11,
      splitMode: "equal",
      participantPersonIds: [yusuf.id],
    });

    const first = await runReminderSweep(repo, NOW);
    expect(first.sent).toHaveLength(1);

    const second = await runReminderSweep(repo, NOW);
    expect(second.sent).toHaveLength(0);
    expect(second.skippedAlreadySent).toBeGreaterThan(0);
  });

  it("resend modunda EMAIL_API_KEY tanımlı değilse gönderimi başarısız sayar, sahte başarı raporlamaz", async () => {
    const yusuf = await repo.persons.create({ name: "Yusuf" });
    await repo.expenses.create({
      name: "Netflix",
      amountKurus: 10000,
      month: "2026-11",
      dueDay: 11,
      splitMode: "equal",
      participantPersonIds: [yusuf.id],
    });

    const prevMode = process.env.NOTIFICATIONS_MODE;
    process.env.NOTIFICATIONS_MODE = "resend";
    try {
      const result = await runReminderSweep(repo, NOW);
      expect(result.sent).toHaveLength(0);
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].error).toContain("EMAIL_API_KEY");

      // Kayıt yazılmadığı için aynı gün tekrar denenebilmeli (dedup kaydı yok).
      const again = await runReminderSweep(repo, NOW);
      expect(again.failed).toHaveLength(1);
      expect(again.skippedAlreadySent).toBe(0);
    } finally {
      process.env.NOTIFICATIONS_MODE = prevMode;
    }
  });
});
