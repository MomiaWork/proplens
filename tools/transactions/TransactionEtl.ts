import type { ValidTransaction } from "../../src/core/stores";
import type { TransactionDownloader } from "./TransactionDownloader";
import { rocDateToIso } from "./RocDate";

/** 實價登錄2.0 went live 2021/7; earlier records use un-geocodable 區段化地址. */
const VALIDITY_CUTOFF_ISO = "2021-07-01";

/** Just the write path TransactionStore exposes — keeps the ETL testable without a database. */
export interface TransactionSink {
  upsertMany(transactions: ValidTransaction[]): void;
}

/**
 * Downloads the current 實價登錄 batch, keeps only records reported on or
 * after 實價登錄2.0 (2021/7), and upserts them as 有效交易紀錄. Safe to
 * run repeatedly (e.g. monthly on 1/11/21) — TransactionStore dedupes.
 */
export class TransactionEtl {
  constructor(
    private readonly downloader: TransactionDownloader,
    private readonly store: TransactionSink,
  ) {}

  async run(): Promise<void> {
    const raw = await this.downloader.download();

    const valid = raw
      .map((record) => ({
        address: record.address,
        transactionDate: rocDateToIso(record.transactionDateRoc),
        price: record.price,
      }))
      .filter((transaction) => transaction.transactionDate >= VALIDITY_CUTOFF_ISO);

    this.store.upsertMany(valid);
  }
}
