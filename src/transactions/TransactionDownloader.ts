import type { RawTransactionRecord } from "./types.ts";

/** Fetches the current batch of published 實價登錄 records. */
export interface TransactionDownloader {
  download(): Promise<RawTransactionRecord[]>;
}
