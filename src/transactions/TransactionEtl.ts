import type { TransactionDownloader } from "./TransactionDownloader.ts";
import type { TransactionStore } from "./TransactionStore.ts";
import { rocDateToIso } from "./RocDate.ts";

/** 實價登錄2.0 went live 2021/7; earlier records use un-geocodable 區段化地址. */
const VALIDITY_CUTOFF_ISO = "2021-07-01";

/**
 * Downloads the current 實價登錄 batch, keeps only records reported on or
 * after 實價登錄2.0 (2021/7), and upserts them as 有效交易紀錄. Safe to
 * run repeatedly (e.g. monthly on 1/11/21) — TransactionStore dedupes.
 */
export class TransactionEtl {
  constructor(
    private readonly downloader: TransactionDownloader,
    private readonly store: TransactionStore,
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
