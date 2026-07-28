import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import type { ValidTransaction } from "./types.ts";

function naturalKey(transaction: ValidTransaction): string {
  return createHash("sha1")
    .update(`${transaction.address}|${transaction.transactionDate}|${transaction.price}`)
    .digest("hex");
}

/**
 * Stores 有效交易紀錄 (valid transactions). Upserts are keyed on a hash of
 * (address, date, price) rather than an ID from the source data, so
 * re-running the ETL against overlapping downloads never creates duplicate
 * rows.
 */
export class TransactionStore {
  private readonly db: DatabaseSync;

  constructor(dbPath: string) {
    this.db = new DatabaseSync(dbPath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS valid_transactions (
        id TEXT PRIMARY KEY,
        address TEXT NOT NULL,
        transaction_date TEXT NOT NULL,
        price REAL NOT NULL,
        zone_name TEXT
      )
    `);
    this.db.exec("CREATE INDEX IF NOT EXISTS idx_valid_transactions_zone ON valid_transactions(zone_name)");
  }

  upsertMany(transactions: ValidTransaction[]): void {
    const insert = this.db.prepare(
      "INSERT OR IGNORE INTO valid_transactions (id, address, transaction_date, price) VALUES (?, ?, ?, ?)",
    );
    for (const transaction of transactions) {
      insert.run(naturalKey(transaction), transaction.address, transaction.transactionDate, transaction.price);
    }
  }

  all(): ValidTransaction[] {
    const rows = this.db.prepare("SELECT address, transaction_date, price FROM valid_transactions").all() as Array<{
      address: string;
      transaction_date: string;
      price: number;
    }>;
    return rows.map((row) => ({ address: row.address, transactionDate: row.transaction_date, price: row.price }));
  }

  findByAddress(address: string): ValidTransaction[] {
    const rows = this.db
      .prepare("SELECT address, transaction_date, price FROM valid_transactions WHERE address = ?")
      .all(address) as Array<{ address: string; transaction_date: string; price: number }>;
    return rows.map((row) => ({ address: row.address, transactionDate: row.transaction_date, price: row.price }));
  }

  /**
   * Same-zone transactions by pre-computed zone_name (see
   * enrichTransactionZones.ts / ADR-0012) — a plain indexed lookup, not a
   * live geocode+point-in-polygon per transaction. That per-query
   * re-resolution is what made same-zone aggregation impractical on a
   * phone starting from a cold geocoding cache.
   */
  findByZone(zoneName: string): ValidTransaction[] {
    const rows = this.db
      .prepare("SELECT address, transaction_date, price FROM valid_transactions WHERE zone_name = ?")
      .all(zoneName) as Array<{ address: string; transaction_date: string; price: number }>;
    return rows.map((row) => ({ address: row.address, transactionDate: row.transaction_date, price: row.price }));
  }

  /** Rows not yet enriched with a zone_name — see enrichTransactionZones.ts. */
  findUnresolvedZones(): Array<{ id: string; address: string }> {
    return this.db.prepare("SELECT id, address FROM valid_transactions WHERE zone_name IS NULL").all() as Array<{
      id: string;
      address: string;
    }>;
  }

  setZone(id: string, zoneName: string | null): void {
    this.db.prepare("UPDATE valid_transactions SET zone_name = ? WHERE id = ?").run(zoneName, id);
  }

  close(): void {
    this.db.close();
  }
}
