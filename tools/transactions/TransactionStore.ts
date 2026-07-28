import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import type { ValidTransaction } from "../../src/core/stores";
import type { TransactionSink } from "./TransactionEtl";

function naturalKey(transaction: ValidTransaction): string {
  return createHash("sha1")
    .update(`${transaction.address}|${transaction.transactionDate}|${transaction.price}`)
    .digest("hex");
}

/**
 * Writes 有效交易紀錄 (valid transactions). Upserts are keyed on a hash of
 * (address, date, price) rather than an ID from the source data, so
 * re-running the ETL against overlapping downloads never creates duplicate
 * rows.
 *
 * zone_name is left NULL here on purpose (ADR-0014): the phone fills it in
 * after downloading the snapshot, using its own free geocoder. Write-only
 * for the same reason as AddressPointStore — reads go through
 * src/core/stores.ts.
 */
export class TransactionStore implements TransactionSink {
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

  /** Row count, so the ingest script can report what it wrote. */
  count(): number {
    const row = this.db.prepare("SELECT COUNT(*) AS n FROM valid_transactions").get() as { n: number };
    return row.n;
  }

  close(): void {
    this.db.close();
  }
}
