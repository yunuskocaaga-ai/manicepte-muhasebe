import { promises as fs } from "node:fs";
import path from "node:path";
import type {
  AuditLogEntry,
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

export interface StoreData {
  persons: Person[];
  recurringExpenses: RecurringExpense[];
  expenses: Expense[];
  expenseShares: ExpenseShare[];
  payments: Payment[];
  debts: Debt[];
  debtRepayments: DebtRepayment[];
  documents: Document[];
  auditLog: AuditLogEntry[];
  notificationLog: NotificationLogEntry[];
}

export function emptyStore(): StoreData {
  return {
    persons: [],
    recurringExpenses: [],
    expenses: [],
    expenseShares: [],
    payments: [],
    debts: [],
    debtRepayments: [],
    documents: [],
    auditLog: [],
    notificationLog: [],
  };
}

function resolveDataDir(): string {
  return process.env.DEMO_DATA_DIR ?? path.join(process.cwd(), ".data");
}

class AsyncMutex {
  private locked = false;
  private queue: Array<() => void> = [];

  async acquire(): Promise<() => void> {
    if (!this.locked) {
      this.locked = true;
      return () => this.release();
    }
    return new Promise((resolve) => {
      this.queue.push(() => {
        this.locked = true;
        resolve(() => this.release());
      });
    });
  }

  private release() {
    const next = this.queue.shift();
    if (next) next();
    else this.locked = false;
  }
}

export class DemoStore {
  private data: StoreData = emptyStore();
  private loaded = false;
  private mutex = new AsyncMutex();
  private dataDir: string;
  private dataFile: string;
  private documentsDirPath: string;

  constructor(baseDir?: string) {
    this.dataDir = baseDir ?? resolveDataDir();
    this.dataFile = path.join(this.dataDir, "demo-db.json");
    this.documentsDirPath = path.join(this.dataDir, "documents");
  }

  async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    await fs.mkdir(this.dataDir, { recursive: true });
    await fs.mkdir(this.documentsDirPath, { recursive: true });
    try {
      const raw = await fs.readFile(this.dataFile, "utf-8");
      this.data = JSON.parse(raw) as StoreData;
    } catch {
      this.data = emptyStore();
      await this.persist();
    }
    this.loaded = true;
  }

  private async persist(): Promise<void> {
    await fs.mkdir(this.dataDir, { recursive: true });
    await fs.writeFile(this.dataFile, JSON.stringify(this.data, null, 2), "utf-8");
  }

  documentsDir(): string {
    return this.documentsDirPath;
  }

  /**
   * Çok adımlı değişiklikleri atomik yapar: hata durumunda bellekteki veri
   * geri alınır ve diske hiçbir şey yazılmaz; başarılı olursa tek seferde
   * diske yazılır. Node'un tek iş parçacıklı event loop'u + mutex sayesinde
   * demo modunda gerçek bir transaction semantiği elde edilir.
   */
  async transaction<T>(fn: (draft: StoreData) => Promise<T> | T): Promise<T> {
    await this.ensureLoaded();
    const release = await this.mutex.acquire();
    const snapshot = structuredClone(this.data);
    try {
      const result = await fn(this.data);
      await this.persist();
      return result;
    } catch (err) {
      this.data = snapshot;
      throw err;
    } finally {
      release();
    }
  }

  async read<T>(fn: (data: StoreData) => T): Promise<T> {
    await this.ensureLoaded();
    return fn(this.data);
  }

  async replaceAll(data: StoreData): Promise<void> {
    await this.transaction(async (draft) => {
      Object.assign(draft, structuredClone(data));
    });
  }
}

let singleton: DemoStore | null = null;

export function getDemoStore(): DemoStore {
  if (!singleton) singleton = new DemoStore();
  return singleton;
}
