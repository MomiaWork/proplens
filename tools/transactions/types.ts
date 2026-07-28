/** A single 實價登錄 row as published, before validity filtering. */
export interface RawTransactionRecord {
  address: string;
  /** 民國 (ROC) format, e.g. "1100715" */
  transactionDateRoc: string;
  price: number;
}

// A record that survives validity filtering is a ValidTransaction, defined
// in src/core/stores.ts — the engine reads the same rows this pipeline
// writes, so there's one definition of that shape, not two.
export type { ValidTransaction } from "../../src/core/stores";
