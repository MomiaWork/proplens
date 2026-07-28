import type { RawTransactionRecord } from "./types";
import type { TransactionDownloader } from "./TransactionDownloader";

/**
 * Returns a fixed batch of raw records, standing in for a real 實價登錄
 * open-data download in dev/tests. Simulates re-running the ETL against an
 * overlapping monthly download: calling download() repeatedly returns the
 * same records each time.
 */
export class FixtureTransactionDownloader implements TransactionDownloader {
  constructor(private readonly records: RawTransactionRecord[]) {}

  async download(): Promise<RawTransactionRecord[]> {
    return this.records;
  }
}
