import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import type { ValidTransaction } from "../../src/core/stores";
import type { StorableTransaction, TransactionSink } from "./TransactionEtl";

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
 * Areas and unit prices are stored in 實價登錄's own 平方公尺 — the 坪
 * conversion happens on the read path (src/core/stores.ts) so the shipped
 * file stays a faithful copy of what the ministry published, and the
 * conversion exists once.
 *
 * zone_name is left NULL here on purpose (ADR-0014): it belongs to the
 * 分區-anchored card, which the app doesn't currently compose (ADR-0018).
 * Write-only for the same reason as AddressPointStore — reads go through
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
        district_code TEXT NOT NULL DEFAULT '',
        street TEXT NOT NULL DEFAULT '',
        transaction_subject TEXT NOT NULL DEFAULT '',
        building_type TEXT NOT NULL DEFAULT '',
        main_use TEXT NOT NULL DEFAULT '',
        urban_land_use TEXT,
        completion_date TEXT,
        building_area_sqm REAL,
        unit_price_per_sqm REAL,
        zone_name TEXT
      )
    `);
    this.db.exec("CREATE INDEX IF NOT EXISTS idx_valid_transactions_zone ON valid_transactions(zone_name)");
    this.db.exec("CREATE INDEX IF NOT EXISTS idx_valid_transactions_street ON valid_transactions(district_code, street)");
  }

  /**
   * REPLACE rather than IGNORE: the natural key covers address+date+price,
   * so a re-run after a schema or parser change has to be able to refresh
   * the other columns on rows that already exist.
   */
  upsertMany(transactions: StorableTransaction[]): void {
    const insert = this.db.prepare(
      `INSERT OR REPLACE INTO valid_transactions
       (id, address, transaction_date, price, district_code, street, transaction_subject,
        building_type, main_use, urban_land_use, completion_date, building_area_sqm, unit_price_per_sqm)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const t of transactions) {
      insert.run(
        naturalKey(t),
        t.address,
        t.transactionDate,
        t.price,
        t.districtCode,
        t.street,
        t.transactionSubject,
        t.buildingType,
        t.mainUse,
        t.urbanLandUse ?? null,
        t.completionDate ?? null,
        t.buildingAreaSqm,
        t.unitPricePerSqm,
      );
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
