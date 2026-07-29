/** A single 實價登錄 row as published, before validity filtering. */
export interface RawTransactionRecord {
  address: string;
  /** 民國 (ROC) format, e.g. "1100715" */
  transactionDateRoc: string;
  price: number;
  /** 交易標的 — 房地(土地+建物) / 房地(土地+建物)+車位 / 建物 */
  transactionSubject: string;
  /** 建物型態 — 公寓(5樓含以下無電梯) / 華廈(10層含以下有電梯) / 透天厝 … */
  buildingType: string;
  /** 主要用途 — 住家用 / 商業用 … */
  mainUse: string;
  /** 都市土地使用分區 — 住/商/工…; blank on 非都市土地 rows. */
  urbanLandUse: string;
  /** 建築完成年月 in 民國 format; blank for 預售屋 and land-only rows. */
  completionDateRoc: string;
  /** 建物移轉總面積平方公尺 */
  buildingAreaSqm: number;
  /** 單價元平方公尺 — 總價元 ÷ 建物移轉總面積, as published. */
  unitPricePerSqm: number;
}

// A record that survives validity filtering is a ValidTransaction, defined
// in src/core/stores.ts — the engine reads the same rows this pipeline
// writes, so there's one definition of that shape, not two.
export type { ValidTransaction } from "../../src/core/stores";
