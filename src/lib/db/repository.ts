import type {
  AuditAction,
  AuditLogEntry,
  Backup,
  Debt,
  DebtRepayment,
  DebtSource,
  Document,
  Expense,
  ExpenseShare,
  NotificationLogEntry,
  NotificationType,
  Person,
  RecurringExpense,
  RecurringStatus,
  SplitConfigEntry,
  SplitMode,
} from "@/lib/domain/types";

export interface CreatePersonInput {
  name: string;
}

export interface UpdatePersonInput {
  name?: string;
  isActive?: boolean;
}

export interface CreateExpenseInput {
  name: string;
  amountKurus: number;
  month: string;
  dueDay: number;
  description?: string | null;
  splitMode: SplitMode;
  participantPersonIds: string[];
  shareValues?: SplitConfigEntry[];
  recurringExpenseId?: string | null;
}

export interface UpdateExpenseInput {
  name?: string;
  amountKurus?: number;
  dueDay?: number;
  description?: string | null;
  splitMode?: SplitMode;
  participantPersonIds?: string[];
  shareValues?: SplitConfigEntry[];
}

export interface CreateRecurringExpenseInput {
  name: string;
  amountKurus: number;
  dueDay: number;
  splitMode: SplitMode;
  participantPersonIds: string[];
  shareValues?: SplitConfigEntry[];
  startMonth: string;
}

export interface UpdateRecurringExpenseInput {
  name?: string;
  amountKurus?: number;
  dueDay?: number;
  splitMode?: SplitMode;
  participantPersonIds?: string[];
  shareValues?: SplitConfigEntry[];
  status?: RecurringStatus;
}

export interface CreatePaymentInput {
  expenseId: string;
  payerPersonId: string;
  beneficiaryPersonIds: string[];
  amountKurusPerBeneficiary?: Record<string, number>;
  paidAt: string;
  note?: string | null;
}

export interface CreateManualDebtInput {
  debtorPersonId: string;
  creditorPersonId: string;
  amountKurus: number;
  source: DebtSource;
  description?: string | null;
}

export interface CreateRepaymentInput {
  debtId: string;
  amountKurus: number;
  paidAt: string;
  description?: string | null;
}

export interface ExpenseFilter {
  month?: string;
  query?: string;
  paymentStatus?: "paid" | "unpaid";
  payerPersonId?: string;
  includeDeleted?: boolean;
}

export interface TrashEntry {
  entityType: "person" | "expense" | "recurring_expense" | "debt" | "document";
  entityId: string;
  label: string;
  deletedAt: string;
}

/**
 * Tüm veri katmanı implementasyonlarının (demo / Supabase) uyması gereken
 * arayüz. Servis katmanı (src/lib/services) sadece bu arayüzle konuşur.
 */
export interface Repository {
  persons: {
    list(includeInactive?: boolean): Promise<Person[]>;
    get(id: string): Promise<Person | null>;
    create(input: CreatePersonInput): Promise<Person>;
    update(id: string, input: UpdatePersonInput): Promise<Person>;
    softDelete(id: string): Promise<void>;
    restore(id: string): Promise<void>;
  };

  expenses: {
    list(filter?: ExpenseFilter): Promise<Expense[]>;
    get(id: string): Promise<Expense | null>;
    getShares(expenseId: string): Promise<ExpenseShare[]>;
    create(input: CreateExpenseInput): Promise<Expense>;
    update(id: string, input: UpdateExpenseInput): Promise<Expense>;
    softDelete(id: string): Promise<void>;
    restore(id: string): Promise<void>;
  };

  recurringExpenses: {
    list(includeEnded?: boolean): Promise<RecurringExpense[]>;
    get(id: string): Promise<RecurringExpense | null>;
    create(input: CreateRecurringExpenseInput): Promise<RecurringExpense>;
    update(id: string, input: UpdateRecurringExpenseInput): Promise<RecurringExpense>;
    softDelete(id: string): Promise<void>;
    restore(id: string): Promise<void>;
    /** Verilen ay için düzenli giderin dönemini idempotent biçimde üretir. */
    generatePeriod(recurringExpenseId: string, month: string): Promise<Expense | null>;
  };

  payments: {
    listByExpense(expenseId: string): Promise<import("@/lib/domain/types").Payment[]>;
    listAll(): Promise<import("@/lib/domain/types").Payment[]>;
    create(input: CreatePaymentInput): Promise<import("@/lib/domain/types").Payment[]>;
    cancel(paymentId: string): Promise<void>;
  };

  debts: {
    list(personId?: string): Promise<Debt[]>;
    get(id: string): Promise<Debt | null>;
    listRepayments(debtId: string): Promise<DebtRepayment[]>;
    createManual(input: CreateManualDebtInput): Promise<Debt>;
    addRepayment(input: CreateRepaymentInput): Promise<DebtRepayment>;
    cancelRepayment(repaymentId: string): Promise<void>;
  };

  documents: {
    get(id: string): Promise<Document | null>;
    listByOwner(ownerType: string, ownerId: string): Promise<Document[]>;
    upload(input: {
      ownerType: "expense" | "backup";
      ownerId: string;
      fileName: string;
      mimeType: string;
      data: Buffer;
    }): Promise<Document>;
    getDownloadUrl(documentId: string): Promise<string>;
    softDelete(id: string): Promise<void>;
  };

  auditLog: {
    record(entry: {
      entityType: string;
      entityId: string;
      action: AuditAction;
      before: unknown;
      after: unknown;
    }): Promise<void>;
    listByEntity(entityType: string, entityId: string): Promise<AuditLogEntry[]>;
    listRecent(limit?: number): Promise<AuditLogEntry[]>;
  };

  trash: {
    list(): Promise<TrashEntry[]>;
    restore(entityType: TrashEntry["entityType"], entityId: string): Promise<void>;
  };

  notifications: {
    hasBeenSent(expenseId: string, type: NotificationType, dateKey: string): Promise<boolean>;
    record(entry: Omit<NotificationLogEntry, "id" | "sentAt">): Promise<NotificationLogEntry>;
    listRecent(limit?: number): Promise<NotificationLogEntry[]>;
  };

  backup: {
    export(): Promise<Backup>;
    restore(backup: Backup): Promise<void>;
  };
}
