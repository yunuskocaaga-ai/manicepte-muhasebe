import { z } from "zod";

export const PersonSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
  deletedAt: z.string().nullable(),
});
export type Person = z.infer<typeof PersonSchema>;

export const SplitModeSchema = z.enum(["equal", "custom_amount", "percentage"]);
export type SplitMode = z.infer<typeof SplitModeSchema>;

export const SplitConfigEntrySchema = z.object({
  personId: z.string(),
  value: z.number().optional(),
});
export type SplitConfigEntry = z.infer<typeof SplitConfigEntrySchema>;

export const RecurringStatusSchema = z.enum(["active", "paused", "ended"]);
export type RecurringStatus = z.infer<typeof RecurringStatusSchema>;

export const RecurringExpenseSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  amountKurus: z.number().int().positive(),
  dueDay: z.number().int().min(1).max(31),
  splitMode: SplitModeSchema,
  splitConfig: z.array(SplitConfigEntrySchema),
  status: RecurringStatusSchema,
  startMonth: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  deletedAt: z.string().nullable(),
});
export type RecurringExpense = z.infer<typeof RecurringExpenseSchema>;

export const ExpenseSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  amountKurus: z.number().int().positive(),
  month: z.string(),
  dueDay: z.number().int().min(1).max(31),
  description: z.string().nullable(),
  recurringExpenseId: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  deletedAt: z.string().nullable(),
});
export type Expense = z.infer<typeof ExpenseSchema>;

export const ExpenseShareSchema = z.object({
  id: z.string(),
  expenseId: z.string(),
  personId: z.string(),
  amountKurus: z.number().int().nonnegative(),
});
export type ExpenseShare = z.infer<typeof ExpenseShareSchema>;

export const PaymentSchema = z.object({
  id: z.string(),
  expenseId: z.string(),
  payerPersonId: z.string(),
  beneficiaryPersonId: z.string(),
  amountKurus: z.number().int().positive(),
  paidAt: z.string(),
  note: z.string().nullable(),
  createdAt: z.string(),
  deletedAt: z.string().nullable(),
});
export type Payment = z.infer<typeof PaymentSchema>;

export const DebtSourceSchema = z.enum(["expense_payment", "manual", "opening_balance"]);
export type DebtSource = z.infer<typeof DebtSourceSchema>;

export const DebtSchema = z.object({
  id: z.string(),
  debtorPersonId: z.string(),
  creditorPersonId: z.string(),
  amountKurus: z.number().int().positive(),
  source: DebtSourceSchema,
  sourceExpenseId: z.string().nullable(),
  sourcePaymentId: z.string().nullable(),
  sourceMonth: z.string().nullable(),
  description: z.string().nullable(),
  createdAt: z.string(),
  deletedAt: z.string().nullable(),
});
export type Debt = z.infer<typeof DebtSchema>;

export const DebtRepaymentSchema = z.object({
  id: z.string(),
  debtId: z.string(),
  amountKurus: z.number().int().positive(),
  paidAt: z.string(),
  description: z.string().nullable(),
  createdAt: z.string(),
  deletedAt: z.string().nullable(),
});
export type DebtRepayment = z.infer<typeof DebtRepaymentSchema>;

export const DocumentOwnerTypeSchema = z.enum(["expense", "backup"]);
export type DocumentOwnerType = z.infer<typeof DocumentOwnerTypeSchema>;

export const DocumentSchema = z.object({
  id: z.string(),
  ownerType: DocumentOwnerTypeSchema,
  ownerId: z.string(),
  fileName: z.string(),
  storagePath: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  uploadedAt: z.string(),
  deletedAt: z.string().nullable(),
});
export type Document = z.infer<typeof DocumentSchema>;

export const AuditActionSchema = z.enum(["create", "update", "delete", "restore"]);
export type AuditAction = z.infer<typeof AuditActionSchema>;

export const AuditLogEntrySchema = z.object({
  id: z.string(),
  entityType: z.string(),
  entityId: z.string(),
  action: AuditActionSchema,
  beforeJson: z.unknown().nullable(),
  afterJson: z.unknown().nullable(),
  createdAt: z.string(),
});
export type AuditLogEntry = z.infer<typeof AuditLogEntrySchema>;

export const NotificationTypeSchema = z.enum(["before_due", "overdue"]);
export type NotificationType = z.infer<typeof NotificationTypeSchema>;

export const NotificationLogEntrySchema = z.object({
  id: z.string(),
  expenseId: z.string(),
  type: NotificationTypeSchema,
  dateKey: z.string(),
  sentAt: z.string(),
  simulated: z.boolean(),
});
export type NotificationLogEntry = z.infer<typeof NotificationLogEntrySchema>;

export const SCHEMA_VERSION = 1;

export const BackupSchema = z.object({
  schemaVersion: z.number(),
  exportedAt: z.string(),
  checksum: z.string(),
  data: z.object({
    persons: z.array(PersonSchema),
    recurringExpenses: z.array(RecurringExpenseSchema),
    expenses: z.array(ExpenseSchema),
    expenseShares: z.array(ExpenseShareSchema),
    payments: z.array(PaymentSchema),
    debts: z.array(DebtSchema),
    debtRepayments: z.array(DebtRepaymentSchema),
    documents: z.array(DocumentSchema),
    auditLog: z.array(AuditLogEntrySchema),
    notificationLog: z.array(NotificationLogEntrySchema),
  }),
});
export type Backup = z.infer<typeof BackupSchema>;
