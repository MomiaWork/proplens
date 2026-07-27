/** A single 實價登錄 row as published, before validity filtering. */
export interface RawTransactionRecord {
  address: string;
  /** 民國 (ROC) format, e.g. "1100715" */
  transactionDateRoc: string;
  price: number;
}

/** A transaction confirmed to be reported under 實價登錄2.0 (2021/7 onward). */
export interface ValidTransaction {
  address: string;
  /** ISO format, e.g. "2021-07-15" */
  transactionDate: string;
  price: number;
}
