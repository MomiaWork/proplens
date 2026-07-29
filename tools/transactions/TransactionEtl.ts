import type { City } from "../../src/core/cities";
import type { ValidTransaction } from "../../src/core/stores";
import { parseAddress } from "../../src/core/parseAddress";
import type { TransactionDownloader } from "./TransactionDownloader";
import { rocDateToIso, optionalRocDateToIso } from "./RocDate";

/** 實價登錄2.0 went live 2021/7; earlier records use un-geocodable 區段化地址. */
const VALIDITY_CUTOFF_ISO = "2021-07-01";

/**
 * A row ready to store: the card's fields plus the two the pipeline
 * derives from the address, so the phone doesn't re-parse every
 * transaction on every query.
 */
export interface StorableTransaction extends ValidTransaction {
  /** 鄉鎮市區代碼 parsed from the address, "" when it names no 行政區. */
  districtCode: string;
  /** Street parsed from the address — the 同路段 match key (ADR-0018). */
  street: string;
  /** 實價登錄's own units; converted to 坪 on the read path. */
  buildingAreaSqm: number;
  unitPricePerSqm: number;
}

/** Just the write path TransactionStore exposes — keeps the ETL testable without a database. */
export interface TransactionSink {
  upsertMany(transactions: StorableTransaction[]): void;
}

/**
 * Downloads the current 實價登錄 batch, keeps only records reported on or
 * after 實價登錄2.0 (2021/7), and upserts them as 有效交易紀錄. Safe to
 * run repeatedly (e.g. monthly on 1/11/21) — TransactionStore dedupes.
 *
 * Addresses are parsed here rather than on the phone: the 同路段 match key
 * is a pure function of the address and the city, so computing it once at
 * ingest keeps the query a single indexed lookup.
 */
export class TransactionEtl {
  constructor(
    private readonly city: City,
    private readonly downloader: TransactionDownloader,
    private readonly store: TransactionSink,
  ) {}

  async run(): Promise<void> {
    const raw = await this.downloader.download();

    const valid = raw
      .map((record): StorableTransaction => {
        // 實價登錄 addresses normally carry a full 門牌, so a parse failure
        // means a row whose 交易標的 slipped past the 建物 filter (a bare
        // 地號, say). It gets no street, so no 同路段 query can reach it —
        // but it's a real transaction and stays in the file.
        const parsed = parseAddress(record.address, this.city);
        return {
          address: record.address,
          transactionDate: rocDateToIso(record.transactionDateRoc),
          price: record.price,
          districtCode: parsed?.districtCode ?? "",
          street: parsed?.street ?? "",
          transactionSubject: record.transactionSubject,
          buildingType: record.buildingType,
          mainUse: record.mainUse,
          urbanLandUse: record.urbanLandUse || undefined,
          completionDate: optionalRocDateToIso(record.completionDateRoc),
          buildingAreaSqm: record.buildingAreaSqm,
          unitPricePerSqm: record.unitPricePerSqm,
        };
      })
      .filter((transaction) => transaction.transactionDate >= VALIDITY_CUTOFF_ISO);

    this.store.upsertMany(valid);
  }
}
