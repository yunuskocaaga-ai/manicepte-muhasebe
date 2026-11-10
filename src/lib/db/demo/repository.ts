import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { getDemoStore, DemoStore, type StoreData } from "./store";
import type { Repository, CreatePersonInput, UpdatePersonInput, CreateExpenseInput, UpdateExpenseInput, CreateRecurringExpenseInput, UpdateRecurringExpenseInput, CreatePaymentInput, CreateManualDebtInput, CreateRepaymentInput, ExpenseFilter, TrashEntry } from "@/lib/db/repository";
import type { Debt, Document, Expense, ExpenseShare, Payment, Person, RecurringExpense, SplitConfigEntry, Backup } from "@/lib/domain/types";
import { SCHEMA_VERSION } from "@/lib/domain/types";
import { computeShares } from "@/lib/domain/split";
import { clampDueDay, parseMonthKey } from "@/lib/domain/period";
import { validateNewPayment, validateRepayment } from "@/lib/domain/debt-engine";
import { createHash } from "node:crypto";

function nowIso(): string {
  return new Date().toISOString();
}

function composeSplitConfig(
  participantPersonIds: string[],
  shareValues?: SplitConfigEntry[],
): SplitConfigEntry[] {
  if (shareValues && shareValues.length > 0) return shareValues;
  return participantPersonIds.map((personId) => ({ personId }));
}

function buildShares(
  expenseId: string,
  amountKurus: number,
  splitMode: CreateExpenseInput["splitMode"],
  participantPersonIds: string[],
  shareValues: SplitConfigEntry[] | undefined,
): ExpenseShare[] {
  const computed = computeShares(splitMode, amountKurus, {
    personIds: participantPersonIds,
    shares: shareValues,
  });
  return computed.map((c) => ({
    id: randomUUID(),
    expenseId,
    personId: c.personId,
    amountKurus: c.amountKurus,
  }));
}

export class DemoRepository implements Repository {
  private store: DemoStore;

  constructor(store?: DemoStore) {
    this.store = store ?? getDemoStore();
  }

  private async audit(
    draft: StoreData,
    entityType: string,
    entityId: string,
    action: "create" | "update" | "delete" | "restore",
    before: unknown,
    after: unknown,
  ) {
    draft.auditLog.push({
      id: randomUUID(),
      entityType,
      entityId,
      action,
      beforeJson: before ?? null,
      afterJson: after ?? null,
      createdAt: nowIso(),
    });
  }

  persons: Repository["persons"] = {
    list: async (includeInactive = true) =>
      this.store.read((d) => d.persons.filter((p) => includeInactive || p.isActive)),
    get: async (id) => this.store.read((d) => d.persons.find((p) => p.id === id) ?? null),
    create: async (input: CreatePersonInput) =>
      this.store.transaction(async (d) => {
        const person: Person = {
          id: randomUUID(),
          name: input.name,
          isActive: true,
          createdAt: nowIso(),
          updatedAt: nowIso(),
          deletedAt: null,
        };
        d.persons.push(person);
        await this.audit(d, "person", person.id, "create", null, person);
        return person;
      }),
    update: async (id, input: UpdatePersonInput) =>
      this.store.transaction(async (d) => {
        const person = d.persons.find((p) => p.id === id);
        if (!person) throw new Error("Kişi bulunamadı");
        const before = structuredClone(person);
        if (input.name !== undefined) person.name = input.name;
        if (input.isActive !== undefined) person.isActive = input.isActive;
        person.updatedAt = nowIso();
        await this.audit(d, "person", person.id, "update", before, person);
        return person;
      }),
    softDelete: async (id) =>
      this.store.transaction(async (d) => {
        const person = d.persons.find((p) => p.id === id);
        if (!person) throw new Error("Kişi bulunamadı");
        const before = structuredClone(person);
        person.deletedAt = nowIso();
        await this.audit(d, "person", id, "delete", before, person);
      }),
    restore: async (id) =>
      this.store.transaction(async (d) => {
        const person = d.persons.find((p) => p.id === id);
        if (!person) throw new Error("Kişi bulunamadı");
        const before = structuredClone(person);
        person.deletedAt = null;
        await this.audit(d, "person", id, "restore", before, person);
      }),
  };

  expenses: Repository["expenses"] = {
    list: async (filter?: ExpenseFilter) =>
      this.store.read((d) => {
        let items = d.expenses.filter((e) => filter?.includeDeleted || !e.deletedAt);
        if (filter?.month) items = items.filter((e) => e.month === filter.month);
        if (filter?.query) {
          const q = filter.query.toLowerCase();
          items = items.filter((e) => e.name.toLowerCase().includes(q));
        }
        if (filter?.payerPersonId) {
          const expenseIdsPaidBy = new Set(
            d.payments
              .filter((p) => !p.deletedAt && p.payerPersonId === filter.payerPersonId)
              .map((p) => p.expenseId),
          );
          items = items.filter((e) => expenseIdsPaidBy.has(e.id));
        }
        if (filter?.paymentStatus) {
          items = items.filter((e) => {
            const shares = d.expenseShares.filter((s) => s.expenseId === e.id);
            const payments = d.payments.filter((p) => p.expenseId === e.id && !p.deletedAt);
            const fullyPaid = shares.every((s) => {
              const paid = payments
                .filter((p) => p.beneficiaryPersonId === s.personId)
                .reduce((acc, p) => acc + p.amountKurus, 0);
              return paid >= s.amountKurus;
            });
            return filter.paymentStatus === "paid" ? fullyPaid : !fullyPaid;
          });
        }
        return items.sort((a, b) => b.month.localeCompare(a.month) || b.createdAt.localeCompare(a.createdAt));
      }),
    get: async (id) => this.store.read((d) => d.expenses.find((e) => e.id === id) ?? null),
    getShares: async (expenseId) =>
      this.store.read((d) => d.expenseShares.filter((s) => s.expenseId === expenseId)),
    create: async (input: CreateExpenseInput) =>
      this.store.transaction(async (d) => {
        const expense: Expense = {
          id: randomUUID(),
          name: input.name,
          amountKurus: input.amountKurus,
          month: input.month,
          dueDay: input.dueDay,
          description: input.description ?? null,
          recurringExpenseId: input.recurringExpenseId ?? null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
          deletedAt: null,
        };
        d.expenses.push(expense);
        const shares = buildShares(
          expense.id,
          expense.amountKurus,
          input.splitMode,
          input.participantPersonIds,
          input.shareValues,
        );
        d.expenseShares.push(...shares);
        await this.audit(d, "expense", expense.id, "create", null, { expense, shares });
        return expense;
      }),
    update: async (id, input: UpdateExpenseInput) =>
      this.store.transaction(async (d) => {
        const expense = d.expenses.find((e) => e.id === id);
        if (!expense) throw new Error("Gider bulunamadı");
        const before = structuredClone(expense);
        const beforeShares = d.expenseShares.filter((s) => s.expenseId === id);

        if (input.name !== undefined) expense.name = input.name;
        if (input.amountKurus !== undefined) expense.amountKurus = input.amountKurus;
        if (input.dueDay !== undefined) expense.dueDay = input.dueDay;
        if (input.description !== undefined) expense.description = input.description;
        expense.updatedAt = nowIso();

        if (input.splitMode || input.participantPersonIds || input.shareValues) {
          const splitMode = input.splitMode ?? "equal";
          const participantPersonIds =
            input.participantPersonIds ?? beforeShares.map((s) => s.personId);
          const newShares = buildShares(
            id,
            expense.amountKurus,
            splitMode,
            participantPersonIds,
            input.shareValues,
          );
          d.expenseShares = d.expenseShares.filter((s) => s.expenseId !== id);
          d.expenseShares.push(...newShares);
        } else if (input.amountKurus !== undefined) {
          // Tutar değişti ama bölüştürme modeli aynı: mevcut kişi listesiyle yeniden hesapla.
          const participantPersonIds = beforeShares.map((s) => s.personId);
          const newShares = buildShares(id, expense.amountKurus, "equal", participantPersonIds, undefined);
          d.expenseShares = d.expenseShares.filter((s) => s.expenseId !== id);
          d.expenseShares.push(...newShares);
        }

        await this.audit(d, "expense", id, "update", { expense: before, shares: beforeShares }, {
          expense,
          shares: d.expenseShares.filter((s) => s.expenseId === id),
        });
        return expense;
      }),
    softDelete: async (id) =>
      this.store.transaction(async (d) => {
        const expense = d.expenses.find((e) => e.id === id);
        if (!expense) throw new Error("Gider bulunamadı");
        const before = structuredClone(expense);
        expense.deletedAt = nowIso();
        await this.audit(d, "expense", id, "delete", before, expense);
      }),
    restore: async (id) =>
      this.store.transaction(async (d) => {
        const expense = d.expenses.find((e) => e.id === id);
        if (!expense) throw new Error("Gider bulunamadı");
        const before = structuredClone(expense);
        expense.deletedAt = null;
        await this.audit(d, "expense", id, "restore", before, expense);
      }),
  };

  recurringExpenses: Repository["recurringExpenses"] = {
    list: async (includeEnded = true) =>
      this.store.read((d) =>
        d.recurringExpenses.filter((r) => !r.deletedAt && (includeEnded || r.status !== "ended")),
      ),
    get: async (id) => this.store.read((d) => d.recurringExpenses.find((r) => r.id === id) ?? null),
    create: async (input: CreateRecurringExpenseInput) =>
      this.store.transaction(async (d) => {
        const recurring: RecurringExpense = {
          id: randomUUID(),
          name: input.name,
          amountKurus: input.amountKurus,
          dueDay: input.dueDay,
          splitMode: input.splitMode,
          splitConfig: composeSplitConfig(input.participantPersonIds, input.shareValues),
          status: "active",
          startMonth: input.startMonth,
          createdAt: nowIso(),
          updatedAt: nowIso(),
          deletedAt: null,
        };
        d.recurringExpenses.push(recurring);
        await this.audit(d, "recurring_expense", recurring.id, "create", null, recurring);
        return recurring;
      }),
    update: async (id, input: UpdateRecurringExpenseInput) =>
      this.store.transaction(async (d) => {
        const recurring = d.recurringExpenses.find((r) => r.id === id);
        if (!recurring) throw new Error("Düzenli gider bulunamadı");
        const before = structuredClone(recurring);
        if (input.name !== undefined) recurring.name = input.name;
        if (input.amountKurus !== undefined) recurring.amountKurus = input.amountKurus;
        if (input.dueDay !== undefined) recurring.dueDay = input.dueDay;
        if (input.status !== undefined) recurring.status = input.status;
        if (input.splitMode !== undefined) recurring.splitMode = input.splitMode;
        if (input.participantPersonIds || input.shareValues) {
          recurring.splitConfig = composeSplitConfig(
            input.participantPersonIds ?? recurring.splitConfig.map((s) => s.personId),
            input.shareValues,
          );
        }
        recurring.updatedAt = nowIso();
        // ÖNEMLİ: Burada yalnızca şablon güncellenir. Geçmişte üretilmiş
        // Expense kayıtları (geçmiş dönemler) kendi share snapshot'larını
        // korur; değişiklik sadece bundan sonra generatePeriod ile
        // üretilecek gelecek dönemleri etkiler.
        await this.audit(d, "recurring_expense", id, "update", before, recurring);
        return recurring;
      }),
    softDelete: async (id) =>
      this.store.transaction(async (d) => {
        const recurring = d.recurringExpenses.find((r) => r.id === id);
        if (!recurring) throw new Error("Düzenli gider bulunamadı");
        const before = structuredClone(recurring);
        recurring.deletedAt = nowIso();
        await this.audit(d, "recurring_expense", id, "delete", before, recurring);
      }),
    restore: async (id) =>
      this.store.transaction(async (d) => {
        const recurring = d.recurringExpenses.find((r) => r.id === id);
        if (!recurring) throw new Error("Düzenli gider bulunamadı");
        const before = structuredClone(recurring);
        recurring.deletedAt = null;
        await this.audit(d, "recurring_expense", id, "restore", before, recurring);
      }),
    generatePeriod: async (recurringExpenseId, month) =>
      this.store.transaction(async (d) => {
        const recurring = d.recurringExpenses.find((r) => r.id === recurringExpenseId);
        if (!recurring || recurring.deletedAt) throw new Error("Düzenli gider bulunamadı");
        if (recurring.status !== "active") return null;

        // İdempotentlik: aynı (recurringExpenseId, month) için ikinci kez kayıt açılmaz.
        const existing = d.expenses.find(
          (e) => e.recurringExpenseId === recurringExpenseId && e.month === month && !e.deletedAt,
        );
        if (existing) return existing;

        const { year, month: m } = parseMonthKey(month);
        const dueDay = clampDueDay(year, m, recurring.dueDay);
        const participantPersonIds = recurring.splitConfig.map((s) => s.personId);

        const expense: Expense = {
          id: randomUUID(),
          name: recurring.name,
          amountKurus: recurring.amountKurus,
          month,
          dueDay,
          description: null,
          recurringExpenseId: recurring.id,
          createdAt: nowIso(),
          updatedAt: nowIso(),
          deletedAt: null,
        };
        d.expenses.push(expense);
        const shares = buildShares(
          expense.id,
          expense.amountKurus,
          recurring.splitMode,
          participantPersonIds,
          recurring.splitConfig,
        );
        // Kişi payları şablondan korunur, ödeme kayıtları sıfırdan başlar (yeni expense = yeni payments listesi).
        d.expenseShares.push(...shares);
        await this.audit(d, "expense", expense.id, "create", null, { expense, shares, generatedFrom: recurringExpenseId });
        return expense;
      }),
  };

  payments: Repository["payments"] = {
    listByExpense: async (expenseId) =>
      this.store.read((d) => d.payments.filter((p) => p.expenseId === expenseId && !p.deletedAt)),
    listAll: async () => this.store.read((d) => d.payments.filter((p) => !p.deletedAt)),
    create: async (input: CreatePaymentInput) =>
      this.store.transaction(async (d) => {
        const expense = d.expenses.find((e) => e.id === input.expenseId);
        if (!expense) throw new Error("Gider bulunamadı");
        const shares = d.expenseShares.filter((s) => s.expenseId === input.expenseId);
        const existingPayments = d.payments.filter((p) => p.expenseId === input.expenseId && !p.deletedAt);

        const created: Payment[] = [];
        for (const beneficiaryPersonId of input.beneficiaryPersonIds) {
          const share = shares.find((s) => s.personId === beneficiaryPersonId);
          if (!share) throw new Error("Bu kişi için gider payı bulunamadı");
          const alreadyPaid = existingPayments
            .filter((p) => p.beneficiaryPersonId === beneficiaryPersonId)
            .reduce((acc, p) => acc + p.amountKurus, 0);
          const remaining = share.amountKurus - alreadyPaid;
          const amount = input.amountKurusPerBeneficiary?.[beneficiaryPersonId] ?? remaining;

          validateNewPayment(
            { expenseId: share.expenseId, personId: share.personId, amountKurus: share.amountKurus },
            existingPayments.map((p) => ({
              id: p.id,
              expenseId: p.expenseId,
              payerPersonId: p.payerPersonId,
              beneficiaryPersonId: p.beneficiaryPersonId,
              amountKurus: p.amountKurus,
            })),
            amount,
          );

          const payment: Payment = {
            id: randomUUID(),
            expenseId: input.expenseId,
            payerPersonId: input.payerPersonId,
            beneficiaryPersonId,
            amountKurus: amount,
            paidAt: input.paidAt,
            note: input.note ?? null,
            createdAt: nowIso(),
            deletedAt: null,
          };
          d.payments.push(payment);
          existingPayments.push(payment);
          created.push(payment);

          if (input.payerPersonId !== beneficiaryPersonId) {
            const debt: Debt = {
              id: randomUUID(),
              debtorPersonId: beneficiaryPersonId,
              creditorPersonId: input.payerPersonId,
              amountKurus: amount,
              source: "expense_payment",
              sourceExpenseId: input.expenseId,
              sourcePaymentId: payment.id,
              sourceMonth: expense.month,
              description: `${expense.name} (${expense.month}) gideri için ödeme`,
              createdAt: nowIso(),
              deletedAt: null,
            };
            d.debts.push(debt);
          }
          await this.audit(d, "payment", payment.id, "create", null, payment);
        }
        return created;
      }),
    cancel: async (paymentId) =>
      this.store.transaction(async (d) => {
        const payment = d.payments.find((p) => p.id === paymentId && !p.deletedAt);
        if (!payment) throw new Error("Ödeme bulunamadı");
        const linkedDebt = d.debts.find((deb) => deb.sourcePaymentId === paymentId && !deb.deletedAt);
        if (linkedDebt) {
          const repayments = d.debtRepayments.filter((r) => r.debtId === linkedDebt.id && !r.deletedAt);
          if (repayments.length > 0) {
            throw new Error(
              "Bu ödemeye bağlı borç için geri ödeme kaydedilmiş, önce geri ödemeleri iptal edin.",
            );
          }
          const beforeDebt = structuredClone(linkedDebt);
          linkedDebt.deletedAt = nowIso();
          await this.audit(d, "debt", linkedDebt.id, "delete", beforeDebt, linkedDebt);
        }
        const before = structuredClone(payment);
        payment.deletedAt = nowIso();
        await this.audit(d, "payment", paymentId, "delete", before, payment);
      }),
  };

  debts: Repository["debts"] = {
    list: async (personId) =>
      this.store.read((d) =>
        d.debts.filter(
          (deb) => !deb.deletedAt && (!personId || deb.debtorPersonId === personId || deb.creditorPersonId === personId),
        ),
      ),
    get: async (id) => this.store.read((d) => d.debts.find((deb) => deb.id === id) ?? null),
    listRepayments: async (debtId) =>
      this.store.read((d) => d.debtRepayments.filter((r) => r.debtId === debtId && !r.deletedAt)),
    createManual: async (input: CreateManualDebtInput) =>
      this.store.transaction(async (d) => {
        const debt: Debt = {
          id: randomUUID(),
          debtorPersonId: input.debtorPersonId,
          creditorPersonId: input.creditorPersonId,
          amountKurus: input.amountKurus,
          source: input.source,
          sourceExpenseId: null,
          sourcePaymentId: null,
          sourceMonth: null,
          description: input.description ?? null,
          createdAt: nowIso(),
          deletedAt: null,
        };
        d.debts.push(debt);
        await this.audit(d, "debt", debt.id, "create", null, debt);
        return debt;
      }),
    addRepayment: async (input: CreateRepaymentInput) =>
      this.store.transaction(async (d) => {
        const debt = d.debts.find((deb) => deb.id === input.debtId && !deb.deletedAt);
        if (!debt) throw new Error("Borç bulunamadı");
        const existing = d.debtRepayments.filter((r) => r.debtId === input.debtId && !r.deletedAt);
        validateRepayment(debt.amountKurus, existing.map((r) => r.amountKurus), input.amountKurus);

        const repayment = {
          id: randomUUID(),
          debtId: input.debtId,
          amountKurus: input.amountKurus,
          paidAt: input.paidAt,
          description: input.description ?? null,
          createdAt: nowIso(),
          deletedAt: null,
        };
        d.debtRepayments.push(repayment);
        await this.audit(d, "debt_repayment", repayment.id, "create", null, repayment);
        return repayment;
      }),
    cancelRepayment: async (repaymentId) =>
      this.store.transaction(async (d) => {
        const repayment = d.debtRepayments.find((r) => r.id === repaymentId && !r.deletedAt);
        if (!repayment) throw new Error("Geri ödeme bulunamadı");
        const before = structuredClone(repayment);
        repayment.deletedAt = nowIso();
        await this.audit(d, "debt_repayment", repaymentId, "delete", before, repayment);
      }),
  };

  documents: Repository["documents"] = {
    get: async (id) => this.store.read((d) => d.documents.find((x) => x.id === id) ?? null),
    listByOwner: async (ownerType, ownerId) =>
      this.store.read((d) =>
        d.documents.filter((doc) => doc.ownerType === ownerType && doc.ownerId === ownerId && !doc.deletedAt),
      ),
    upload: async (input) =>
      this.store.transaction(async (d) => {
        const id = randomUUID();
        const safeName = `${id}-${input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
        const filePath = path.join(this.store.documentsDir(), safeName);
        await fs.writeFile(filePath, input.data);
        const doc: Document = {
          id,
          ownerType: input.ownerType,
          ownerId: input.ownerId,
          fileName: input.fileName,
          storagePath: safeName,
          mimeType: input.mimeType,
          sizeBytes: input.data.byteLength,
          uploadedAt: nowIso(),
          deletedAt: null,
        };
        d.documents.push(doc);
        await this.audit(d, "document", doc.id, "create", null, doc);
        return doc;
      }),
    getDownloadUrl: async (documentId) =>
      this.store.read((d) => {
        const doc = d.documents.find((x) => x.id === documentId);
        if (!doc) throw new Error("Belge bulunamadı");
        return `/api/belgeler/${doc.id}`;
      }),
    softDelete: async (id) =>
      this.store.transaction(async (d) => {
        const doc = d.documents.find((x) => x.id === id);
        if (!doc) throw new Error("Belge bulunamadı");
        const before = structuredClone(doc);
        doc.deletedAt = nowIso();
        await this.audit(d, "document", id, "delete", before, doc);
      }),
  };

  auditLog: Repository["auditLog"] = {
    record: async (entry) =>
      this.store.transaction(async (d) => {
        d.auditLog.push({
          id: randomUUID(),
          entityType: entry.entityType,
          entityId: entry.entityId,
          action: entry.action,
          beforeJson: entry.before ?? null,
          afterJson: entry.after ?? null,
          createdAt: nowIso(),
        });
      }),
    listByEntity: async (entityType, entityId) =>
      this.store.read((d) =>
        d.auditLog.filter((a) => a.entityType === entityType && a.entityId === entityId),
      ),
    listRecent: async (limit = 50) =>
      this.store.read((d) => [...d.auditLog].reverse().slice(0, limit)),
  };

  trash: Repository["trash"] = {
    list: async () =>
      this.store.read((d) => {
        const entries: TrashEntry[] = [];
        for (const e of d.expenses) {
          if (e.deletedAt) entries.push({ entityType: "expense", entityId: e.id, label: `${e.name} (${e.month})`, deletedAt: e.deletedAt });
        }
        for (const r of d.recurringExpenses) {
          if (r.deletedAt) entries.push({ entityType: "recurring_expense", entityId: r.id, label: r.name, deletedAt: r.deletedAt });
        }
        for (const deb of d.debts) {
          if (deb.deletedAt) entries.push({ entityType: "debt", entityId: deb.id, label: `Borç: ${deb.amountKurus / 100} TL`, deletedAt: deb.deletedAt });
        }
        for (const doc of d.documents) {
          if (doc.deletedAt) entries.push({ entityType: "document", entityId: doc.id, label: doc.fileName, deletedAt: doc.deletedAt });
        }
        for (const p of d.persons) {
          if (p.deletedAt) entries.push({ entityType: "person", entityId: p.id, label: p.name, deletedAt: p.deletedAt });
        }
        return entries.sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
      }),
    restore: async (entityType, entityId) =>
      this.store.transaction(async (d) => {
        const map: Record<TrashEntry["entityType"], unknown[]> = {
          expense: d.expenses,
          recurring_expense: d.recurringExpenses,
          debt: d.debts,
          document: d.documents,
          person: d.persons,
        };
        const list = map[entityType] as Array<{ id: string; deletedAt: string | null }>;
        const item = list.find((x) => x.id === entityId);
        if (!item) throw new Error("Kayıt bulunamadı");
        item.deletedAt = null;
        await this.audit(d, entityType, entityId, "restore", null, item);
      }),
  };

  notifications: Repository["notifications"] = {
    hasBeenSent: async (expenseId, type, dateKey) =>
      this.store.read((d) =>
        d.notificationLog.some(
          (n) => n.expenseId === expenseId && n.type === type && n.dateKey === dateKey,
        ),
      ),
    record: async (entry) =>
      this.store.transaction(async (d) => {
        const record = { ...entry, id: randomUUID(), sentAt: nowIso() };
        d.notificationLog.push(record);
        return record;
      }),
    listRecent: async (limit = 100) =>
      this.store.read((d) => [...d.notificationLog].reverse().slice(0, limit)),
  };

  backup: Repository["backup"] = {
    export: async () =>
      this.store.read((d) => {
        const data = {
          persons: d.persons,
          recurringExpenses: d.recurringExpenses,
          expenses: d.expenses,
          expenseShares: d.expenseShares,
          payments: d.payments,
          debts: d.debts,
          debtRepayments: d.debtRepayments,
          documents: d.documents,
          auditLog: d.auditLog,
          notificationLog: d.notificationLog,
        };
        const checksum = createHash("sha256").update(JSON.stringify(data)).digest("hex");
        return {
          schemaVersion: SCHEMA_VERSION,
          exportedAt: nowIso(),
          checksum,
          data,
        };
      }),
    restore: async (backup: Backup) =>
      this.store.transaction(async (draft) => {
        if (backup.schemaVersion !== SCHEMA_VERSION) {
          throw new Error(
            `Uyumsuz yedek şema sürümü: yedek v${backup.schemaVersion}, uygulama v${SCHEMA_VERSION}`,
          );
        }
        const checksum = createHash("sha256").update(JSON.stringify(backup.data)).digest("hex");
        if (checksum !== backup.checksum) {
          throw new Error("Yedek bütünlük kontrolü başarısız: dosya bozuk veya değiştirilmiş olabilir.");
        }
        Object.assign(draft, structuredClone(backup.data));
      }),
  };
}

let singleton: DemoRepository | null = null;

export function getDemoRepository(): DemoRepository {
  if (!singleton) singleton = new DemoRepository();
  return singleton;
}
