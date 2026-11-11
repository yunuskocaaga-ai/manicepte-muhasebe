import { getSupabaseAdminClient } from "./client";
import type {
  Repository,
  CreatePersonInput,
  UpdatePersonInput,
  CreateExpenseInput,
  UpdateExpenseInput,
  CreateRecurringExpenseInput,
  UpdateRecurringExpenseInput,
  CreatePaymentInput,
  CreateManualDebtInput,
  CreateRepaymentInput,
  ExpenseFilter,
  TrashEntry,
} from "@/lib/db/repository";
import type {
  AuditLogEntry,
  Backup,
  Debt,
  DebtRepayment,
  Document,
  Expense,
  ExpenseShare,
  NotificationLogEntry,
  Payment,
  Person,
  RecurringExpense,
} from "@/lib/domain/types";
import { SCHEMA_VERSION } from "@/lib/domain/types";
import { computeShares } from "@/lib/domain/split";
import { createHash } from "node:crypto";

/* eslint-disable @typescript-eslint/no-explicit-any */

function mapPerson(row: any): Person {
  return {
    id: row.id,
    name: row.name,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

function mapRecurring(row: any): RecurringExpense {
  return {
    id: row.id,
    name: row.name,
    amountKurus: Number(row.amount_kurus),
    dueDay: row.due_day,
    splitMode: row.split_mode,
    splitConfig: row.split_config ?? [],
    status: row.status,
    startMonth: row.start_month,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

function mapExpense(row: any): Expense {
  return {
    id: row.id,
    name: row.name,
    amountKurus: Number(row.amount_kurus),
    month: row.month,
    dueDay: row.due_day,
    description: row.description,
    recurringExpenseId: row.recurring_expense_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

function mapShare(row: any): ExpenseShare {
  return {
    id: row.id,
    expenseId: row.expense_id,
    personId: row.person_id,
    amountKurus: Number(row.amount_kurus),
  };
}

function mapPayment(row: any): Payment {
  return {
    id: row.id,
    expenseId: row.expense_id,
    payerPersonId: row.payer_person_id,
    beneficiaryPersonId: row.beneficiary_person_id,
    amountKurus: Number(row.amount_kurus),
    paidAt: row.paid_at,
    note: row.note,
    createdAt: row.created_at,
    deletedAt: row.deleted_at,
  };
}

function mapDebt(row: any): Debt {
  return {
    id: row.id,
    debtorPersonId: row.debtor_person_id,
    creditorPersonId: row.creditor_person_id,
    amountKurus: Number(row.amount_kurus),
    source: row.source,
    sourceExpenseId: row.source_expense_id,
    sourcePaymentId: row.source_payment_id,
    sourceMonth: row.source_month,
    description: row.description,
    createdAt: row.created_at,
    deletedAt: row.deleted_at,
  };
}

function mapRepayment(row: any): DebtRepayment {
  return {
    id: row.id,
    debtId: row.debt_id,
    amountKurus: Number(row.amount_kurus),
    paidAt: row.paid_at,
    description: row.description,
    createdAt: row.created_at,
    deletedAt: row.deleted_at,
  };
}

function mapDocument(row: any): Document {
  return {
    id: row.id,
    ownerType: row.owner_type,
    ownerId: row.owner_id,
    fileName: row.file_name,
    storagePath: row.storage_path,
    mimeType: row.mime_type,
    sizeBytes: Number(row.size_bytes),
    uploadedAt: row.uploaded_at,
    deletedAt: row.deleted_at,
  };
}

function mapAudit(row: any): AuditLogEntry {
  return {
    id: row.id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    action: row.action,
    beforeJson: row.before_json,
    afterJson: row.after_json,
    createdAt: row.created_at,
  };
}

function mapNotification(row: any): NotificationLogEntry {
  return {
    id: row.id,
    expenseId: row.expense_id,
    type: row.type,
    dateKey: row.date_key,
    sentAt: row.sent_at,
    simulated: row.simulated,
  };
}

/**
 * Supabase (Postgres) üzerinde çalışan gerçek repository implementasyonu.
 * Para hareketi içeren işlemler (ödeme, geri ödeme, dönem üretimi) Postgres
 * fonksiyonlarına (supabase/migrations/0002_functions.sql) RPC ile delege
 * edilir, böylece atomicity veritabanı seviyesinde garanti edilir.
 *
 * Gerçek bir Supabase projesine karşı canlı olarak doğrulanmıştır; SQL
 * fonksiyonları demo repository ile aynı iş kurallarını izler.
 */
export class SupabaseRepository implements Repository {
  private client() {
    return getSupabaseAdminClient();
  }

  persons: Repository["persons"] = {
    list: async (includeInactive = true) => {
      const sb = this.client();
      let q = sb.from("persons").select("*").is("deleted_at", null);
      if (!includeInactive) q = q.eq("is_active", true);
      const { data, error } = await q.order("name");
      if (error) throw new Error(error.message);
      return (data ?? []).map(mapPerson);
    },
    get: async (id) => {
      const { data } = await this.client().from("persons").select("*").eq("id", id).maybeSingle();
      return data ? mapPerson(data) : null;
    },
    create: async (input: CreatePersonInput) => {
      const { data, error } = await this.client().from("persons").insert({ name: input.name }).select().single();
      if (error) throw new Error(error.message);
      return mapPerson(data);
    },
    update: async (id, input: UpdatePersonInput) => {
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (input.name !== undefined) patch.name = input.name;
      if (input.isActive !== undefined) patch.is_active = input.isActive;
      const { data, error } = await this.client().from("persons").update(patch).eq("id", id).select().single();
      if (error) throw new Error(error.message);
      return mapPerson(data);
    },
    softDelete: async (id) => {
      const { error } = await this.client().from("persons").update({ deleted_at: new Date().toISOString() }).eq("id", id);
      if (error) throw new Error(error.message);
    },
    restore: async (id) => {
      const { error } = await this.client().from("persons").update({ deleted_at: null }).eq("id", id);
      if (error) throw new Error(error.message);
    },
  };

  expenses: Repository["expenses"] = {
    list: async (filter?: ExpenseFilter) => {
      const sb = this.client();
      let q = sb.from("expenses").select("*");
      q = filter?.includeDeleted ? q : q.is("deleted_at", null);
      if (filter?.month) q = q.eq("month", filter.month);
      if (filter?.query) q = q.ilike("name", `%${filter.query}%`);
      const { data, error } = await q.order("month", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []).map(mapExpense);
    },
    get: async (id) => {
      const { data } = await this.client().from("expenses").select("*").eq("id", id).maybeSingle();
      return data ? mapExpense(data) : null;
    },
    getShares: async (expenseId) => {
      const { data, error } = await this.client().from("expense_shares").select("*").eq("expense_id", expenseId);
      if (error) throw new Error(error.message);
      return (data ?? []).map(mapShare);
    },
    create: async (input: CreateExpenseInput) => {
      const sb = this.client();
      const { data: expenseRow, error } = await sb
        .from("expenses")
        .insert({
          name: input.name,
          amount_kurus: input.amountKurus,
          month: input.month,
          due_day: input.dueDay,
          description: input.description ?? null,
          recurring_expense_id: input.recurringExpenseId ?? null,
        })
        .select()
        .single();
      if (error) throw new Error(error.message);
      const expense = mapExpense(expenseRow);
      const computed = computeShares(input.splitMode, input.amountKurus, {
        personIds: input.participantPersonIds,
        shares: input.shareValues,
      });
      const { error: shareError } = await sb.from("expense_shares").insert(
        computed.map((c) => ({ expense_id: expense.id, person_id: c.personId, amount_kurus: c.amountKurus })),
      );
      if (shareError) throw new Error(shareError.message);
      return expense;
    },
    update: async (id, input: UpdateExpenseInput) => {
      const sb = this.client();
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (input.name !== undefined) patch.name = input.name;
      if (input.amountKurus !== undefined) patch.amount_kurus = input.amountKurus;
      if (input.dueDay !== undefined) patch.due_day = input.dueDay;
      if (input.description !== undefined) patch.description = input.description;
      const { data, error } = await sb.from("expenses").update(patch).eq("id", id).select().single();
      if (error) throw new Error(error.message);
      const expense = mapExpense(data);

      if (input.splitMode || input.participantPersonIds || input.shareValues || input.amountKurus !== undefined) {
        const { data: existingShares } = await sb.from("expense_shares").select("*").eq("expense_id", id);
        const participantPersonIds =
          input.participantPersonIds ?? (existingShares ?? []).map((s: any) => s.person_id);
        const splitMode = input.splitMode ?? "equal";
        const computed = computeShares(splitMode, expense.amountKurus, {
          personIds: participantPersonIds,
          shares: input.shareValues,
        });
        await sb.from("expense_shares").delete().eq("expense_id", id);
        await sb.from("expense_shares").insert(
          computed.map((c) => ({ expense_id: id, person_id: c.personId, amount_kurus: c.amountKurus })),
        );
      }
      return expense;
    },
    softDelete: async (id) => {
      const { error } = await this.client().from("expenses").update({ deleted_at: new Date().toISOString() }).eq("id", id);
      if (error) throw new Error(error.message);
    },
    restore: async (id) => {
      const { error } = await this.client().from("expenses").update({ deleted_at: null }).eq("id", id);
      if (error) throw new Error(error.message);
    },
  };

  recurringExpenses: Repository["recurringExpenses"] = {
    list: async (includeEnded = true) => {
      const sb = this.client();
      let q = sb.from("recurring_expenses").select("*").is("deleted_at", null);
      if (!includeEnded) q = q.neq("status", "ended");
      const { data, error } = await q.order("name");
      if (error) throw new Error(error.message);
      return (data ?? []).map(mapRecurring);
    },
    get: async (id) => {
      const { data } = await this.client().from("recurring_expenses").select("*").eq("id", id).maybeSingle();
      return data ? mapRecurring(data) : null;
    },
    create: async (input: CreateRecurringExpenseInput) => {
      const splitConfig =
        input.shareValues && input.shareValues.length > 0
          ? input.shareValues
          : input.participantPersonIds.map((personId) => ({ personId }));
      const { data, error } = await this.client()
        .from("recurring_expenses")
        .insert({
          name: input.name,
          amount_kurus: input.amountKurus,
          due_day: input.dueDay,
          split_mode: input.splitMode,
          split_config: splitConfig,
          start_month: input.startMonth,
        })
        .select()
        .single();
      if (error) throw new Error(error.message);
      return mapRecurring(data);
    },
    update: async (id, input: UpdateRecurringExpenseInput) => {
      const sb = this.client();
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (input.name !== undefined) patch.name = input.name;
      if (input.amountKurus !== undefined) patch.amount_kurus = input.amountKurus;
      if (input.dueDay !== undefined) patch.due_day = input.dueDay;
      if (input.status !== undefined) patch.status = input.status;
      if (input.splitMode !== undefined) patch.split_mode = input.splitMode;
      if (input.participantPersonIds || input.shareValues) {
        patch.split_config =
          input.shareValues && input.shareValues.length > 0
            ? input.shareValues
            : (input.participantPersonIds ?? []).map((personId) => ({ personId }));
      }
      const { data, error } = await sb.from("recurring_expenses").update(patch).eq("id", id).select().single();
      if (error) throw new Error(error.message);
      return mapRecurring(data);
    },
    softDelete: async (id) => {
      const { error } = await this.client().from("recurring_expenses").update({ deleted_at: new Date().toISOString() }).eq("id", id);
      if (error) throw new Error(error.message);
    },
    restore: async (id) => {
      const { error } = await this.client().from("recurring_expenses").update({ deleted_at: null }).eq("id", id);
      if (error) throw new Error(error.message);
    },
    generatePeriod: async (recurringExpenseId, month) => {
      const { data, error } = await this.client().rpc("fn_generate_recurring_period", {
        p_recurring_expense_id: recurringExpenseId,
        p_month: month,
      });
      if (error) throw new Error(error.message);
      return data ? mapExpense(data) : null;
    },
  };

  payments: Repository["payments"] = {
    listByExpense: async (expenseId) => {
      const { data, error } = await this.client().from("payments").select("*").eq("expense_id", expenseId).is("deleted_at", null);
      if (error) throw new Error(error.message);
      return (data ?? []).map(mapPayment);
    },
    listAll: async () => {
      const { data, error } = await this.client().from("payments").select("*").is("deleted_at", null);
      if (error) throw new Error(error.message);
      return (data ?? []).map(mapPayment);
    },
    create: async (input: CreatePaymentInput) => {
      const { data, error } = await this.client().rpc("fn_create_payment", {
        p_expense_id: input.expenseId,
        p_payer_person_id: input.payerPersonId,
        p_beneficiary_person_ids: input.beneficiaryPersonIds,
        p_amounts: input.amountKurusPerBeneficiary ?? {},
        p_paid_at: input.paidAt,
        p_note: input.note ?? null,
      });
      if (error) throw new Error(error.message);
      return (data ?? []).map(mapPayment);
    },
    cancel: async (paymentId) => {
      const { error } = await this.client().rpc("fn_cancel_payment", { p_payment_id: paymentId });
      if (error) throw new Error(error.message);
    },
  };

  debts: Repository["debts"] = {
    list: async (personId) => {
      const sb = this.client();
      let q = sb.from("debts").select("*").is("deleted_at", null);
      if (personId) q = q.or(`debtor_person_id.eq.${personId},creditor_person_id.eq.${personId}`);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return (data ?? []).map(mapDebt);
    },
    get: async (id) => {
      const { data } = await this.client().from("debts").select("*").eq("id", id).maybeSingle();
      return data ? mapDebt(data) : null;
    },
    listRepayments: async (debtId) => {
      const { data, error } = await this.client().from("debt_repayments").select("*").eq("debt_id", debtId).is("deleted_at", null);
      if (error) throw new Error(error.message);
      return (data ?? []).map(mapRepayment);
    },
    createManual: async (input: CreateManualDebtInput) => {
      const { data, error } = await this.client()
        .from("debts")
        .insert({
          debtor_person_id: input.debtorPersonId,
          creditor_person_id: input.creditorPersonId,
          amount_kurus: input.amountKurus,
          source: input.source,
          description: input.description ?? null,
        })
        .select()
        .single();
      if (error) throw new Error(error.message);
      return mapDebt(data);
    },
    addRepayment: async (input: CreateRepaymentInput) => {
      const { data, error } = await this.client().rpc("fn_add_debt_repayment", {
        p_debt_id: input.debtId,
        p_amount_kurus: input.amountKurus,
        p_paid_at: input.paidAt,
        p_description: input.description ?? null,
      });
      if (error) throw new Error(error.message);
      return mapRepayment(data);
    },
    cancelRepayment: async (repaymentId) => {
      const { error } = await this.client().rpc("fn_cancel_debt_repayment", { p_repayment_id: repaymentId });
      if (error) throw new Error(error.message);
    },
  };

  documents: Repository["documents"] = {
    get: async (id) => {
      const { data } = await this.client().from("documents").select("*").eq("id", id).maybeSingle();
      return data ? mapDocument(data) : null;
    },
    listByOwner: async (ownerType, ownerId) => {
      const { data, error } = await this.client()
        .from("documents")
        .select("*")
        .eq("owner_type", ownerType)
        .eq("owner_id", ownerId)
        .is("deleted_at", null);
      if (error) throw new Error(error.message);
      return (data ?? []).map(mapDocument);
    },
    upload: async (input) => {
      const sb = this.client();
      const id = crypto.randomUUID();
      const safeName = `${id}-${input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const storagePath = `${input.ownerType}/${input.ownerId}/${safeName}`;
      const { error: uploadError } = await sb.storage.from("receipts").upload(storagePath, input.data, {
        contentType: input.mimeType,
      });
      if (uploadError) throw new Error(uploadError.message);
      const { data, error } = await sb
        .from("documents")
        .insert({
          owner_type: input.ownerType,
          owner_id: input.ownerId,
          file_name: input.fileName,
          storage_path: storagePath,
          mime_type: input.mimeType,
          size_bytes: input.data.byteLength,
        })
        .select()
        .single();
      if (error) throw new Error(error.message);
      return mapDocument(data);
    },
    getDownloadUrl: async (documentId) => {
      const sb = this.client();
      const { data: doc, error } = await sb.from("documents").select("*").eq("id", documentId).single();
      if (error) throw new Error(error.message);
      const { data, error: signError } = await sb.storage
        .from("receipts")
        .createSignedUrl(doc.storage_path, 60 * 5);
      if (signError) throw new Error(signError.message);
      return data.signedUrl;
    },
    softDelete: async (id) => {
      const { error } = await this.client().from("documents").update({ deleted_at: new Date().toISOString() }).eq("id", id);
      if (error) throw new Error(error.message);
    },
  };

  auditLog: Repository["auditLog"] = {
    record: async (entry) => {
      const { error } = await this.client().from("audit_log").insert({
        entity_type: entry.entityType,
        entity_id: entry.entityId,
        action: entry.action,
        before_json: entry.before ?? null,
        after_json: entry.after ?? null,
      });
      if (error) throw new Error(error.message);
    },
    listByEntity: async (entityType, entityId) => {
      const { data, error } = await this.client()
        .from("audit_log")
        .select("*")
        .eq("entity_type", entityType)
        .eq("entity_id", entityId)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []).map(mapAudit);
    },
    listRecent: async (limit = 50) => {
      const { data, error } = await this.client()
        .from("audit_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw new Error(error.message);
      return (data ?? []).map(mapAudit);
    },
  };

  trash: Repository["trash"] = {
    list: async () => {
      const sb = this.client();
      const entries: TrashEntry[] = [];
      const [expenses, recurring, debts, documents, persons] = await Promise.all([
        sb.from("expenses").select("id,name,month,deleted_at").not("deleted_at", "is", null),
        sb.from("recurring_expenses").select("id,name,deleted_at").not("deleted_at", "is", null),
        sb.from("debts").select("id,amount_kurus,deleted_at").not("deleted_at", "is", null),
        sb.from("documents").select("id,file_name,deleted_at").not("deleted_at", "is", null),
        sb.from("persons").select("id,name,deleted_at").not("deleted_at", "is", null),
      ]);
      for (const e of expenses.data ?? []) entries.push({ entityType: "expense", entityId: e.id, label: `${e.name} (${e.month})`, deletedAt: e.deleted_at });
      for (const r of recurring.data ?? []) entries.push({ entityType: "recurring_expense", entityId: r.id, label: r.name, deletedAt: r.deleted_at });
      for (const d of debts.data ?? []) entries.push({ entityType: "debt", entityId: d.id, label: `Borç: ${Number(d.amount_kurus) / 100} TL`, deletedAt: d.deleted_at });
      for (const doc of documents.data ?? []) entries.push({ entityType: "document", entityId: doc.id, label: doc.file_name, deletedAt: doc.deleted_at });
      for (const p of persons.data ?? []) entries.push({ entityType: "person", entityId: p.id, label: p.name, deletedAt: p.deleted_at });
      return entries.sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
    },
    restore: async (entityType, entityId) => {
      const table = {
        expense: "expenses",
        recurring_expense: "recurring_expenses",
        debt: "debts",
        document: "documents",
        person: "persons",
      }[entityType];
      const { error } = await this.client().from(table).update({ deleted_at: null }).eq("id", entityId);
      if (error) throw new Error(error.message);
    },
  };

  notifications: Repository["notifications"] = {
    hasBeenSent: async (expenseId, type, dateKey) => {
      const { data } = await this.client()
        .from("notification_log")
        .select("id")
        .eq("expense_id", expenseId)
        .eq("type", type)
        .eq("date_key", dateKey)
        .maybeSingle();
      return Boolean(data);
    },
    record: async (entry) => {
      const { data, error } = await this.client()
        .from("notification_log")
        .insert({
          expense_id: entry.expenseId,
          type: entry.type,
          date_key: entry.dateKey,
          simulated: entry.simulated,
        })
        .select()
        .single();
      if (error) throw new Error(error.message);
      return mapNotification(data);
    },
    listRecent: async (limit = 100) => {
      const { data, error } = await this.client()
        .from("notification_log")
        .select("*")
        .order("sent_at", { ascending: false })
        .limit(limit);
      if (error) throw new Error(error.message);
      return (data ?? []).map(mapNotification);
    },
  };

  backup: Repository["backup"] = {
    export: async () => {
      const sb = this.client();
      const [persons, recurring, expenses, shares, payments, debts, repayments, documents, audit, notifications] =
        await Promise.all([
          sb.from("persons").select("*"),
          sb.from("recurring_expenses").select("*"),
          sb.from("expenses").select("*"),
          sb.from("expense_shares").select("*"),
          sb.from("payments").select("*"),
          sb.from("debts").select("*"),
          sb.from("debt_repayments").select("*"),
          sb.from("documents").select("*"),
          sb.from("audit_log").select("*"),
          sb.from("notification_log").select("*"),
        ]);
      const data = {
        persons: (persons.data ?? []).map(mapPerson),
        recurringExpenses: (recurring.data ?? []).map(mapRecurring),
        expenses: (expenses.data ?? []).map(mapExpense),
        expenseShares: (shares.data ?? []).map(mapShare),
        payments: (payments.data ?? []).map(mapPayment),
        debts: (debts.data ?? []).map(mapDebt),
        debtRepayments: (repayments.data ?? []).map(mapRepayment),
        documents: (documents.data ?? []).map(mapDocument),
        auditLog: (audit.data ?? []).map(mapAudit),
        notificationLog: (notifications.data ?? []).map(mapNotification),
      };
      const checksum = createHash("sha256").update(JSON.stringify(data)).digest("hex");
      return { schemaVersion: SCHEMA_VERSION, exportedAt: new Date().toISOString(), checksum, data };
    },
    restore: async (backup: Backup) => {
      if (backup.schemaVersion !== SCHEMA_VERSION) {
        throw new Error(`Uyumsuz yedek şema sürümü: yedek v${backup.schemaVersion}, uygulama v${SCHEMA_VERSION}`);
      }
      const checksum = createHash("sha256").update(JSON.stringify(backup.data)).digest("hex");
      if (checksum !== backup.checksum) {
        throw new Error("Yedek bütünlük kontrolü başarısız: dosya bozuk veya değiştirilmiş olabilir.");
      }
      const { error } = await this.client().rpc("fn_restore_backup", { p_payload: backup.data });
      if (error) throw new Error(error.message);
    },
  };
}

let singleton: SupabaseRepository | null = null;

export function getSupabaseRepository(): Repository {
  if (!singleton) singleton = new SupabaseRepository();
  return singleton;
}
