import AdmZip from "adm-zip";
import type { City } from "../../src/core/cities";
import type { TransactionDownloader } from "./TransactionDownloader";
import type { RawTransactionRecord } from "./types";

const LVR_CSV_ZIP_URL = "https://plvr.land.moi.gov.tw/opendata/lvr_landAcsv.zip";

/** Column indices in <x>_lvr_land_a.csv (see its header row / manifest.csv's schema-main.csv). */
const COLUMN = {
  transactionSubject: 1, // 交易標的 — "土地"/"建物"/"房地(土地+建物)"[+車位]/"車位"
  address: 2, // 土地位置建物門牌
  urbanLandUse: 4, // 都市土地使用分區 — 住/商/工…
  transactionDateRoc: 7, // 交易年月日 (ROC, e.g. "1150704")
  buildingType: 11, // 建物型態 — 公寓/華廈/大樓/透天厝…
  mainUse: 12, // 主要用途 — 住家用/商業用…
  completionDateRoc: 14, // 建築完成年月 (ROC, e.g. "0941030")
  buildingAreaSqm: 15, // 建物移轉總面積平方公尺
  totalPrice: 21, // 總價元
  unitPricePerSqm: 22, // 單價元平方公尺
};

/** Blank/zero in a numeric column means "not disclosed", not "zero". */
function optionalNumber(raw: string | undefined): number {
  const value = Number(raw);
  return Number.isFinite(value) ? value : 0;
}

/**
 * Downloads the nationwide 實價登錄 batch (released ~1st/11th/21st monthly)
 * and extracts just one city's rows — every supported city is a file in
 * the same zip, named by the ministry's own 縣市 letter (city.lvrEntryName).
 * This is the one data source that needs no per-city work at all.
 *
 * Only rows whose 交易標的 includes "建物" carry a real street address
 * (土地位置建物門牌) — pure land-parcel (土地) or parking-space (車位) rows
 * only have a 地號/停車場 reference, which isn't geocodable, so those are
 * dropped here.
 */
export class LvrDownloader implements TransactionDownloader {
  constructor(private readonly city: City) {}

  async download(): Promise<RawTransactionRecord[]> {
    const response = await fetch(LVR_CSV_ZIP_URL);
    if (!response.ok) {
      throw new Error(`Failed to download 實價登錄 batch: ${response.status} ${response.statusText}`);
    }

    const zip = new AdmZip(Buffer.from(await response.arrayBuffer()));
    const entry = zip.getEntry(this.city.lvrEntryName);
    if (!entry) {
      throw new Error(`${this.city.lvrEntryName} (${this.city.name}) not found in downloaded 實價登錄 batch`);
    }

    const csv = zip.readAsText(entry, "utf-8");
    // Row 1: Chinese headers, row 2: English headers, data starts at row 3.
    const dataLines = csv.split("\n").slice(2).filter((line) => line.trim().length > 0);

    const records: RawTransactionRecord[] = [];
    for (const line of dataLines) {
      const columns = line.split(",");
      const transactionSubject = columns[COLUMN.transactionSubject];
      if (!transactionSubject?.includes("建物")) continue;

      const address = columns[COLUMN.address];
      const transactionDateRoc = columns[COLUMN.transactionDateRoc];
      const price = Number(columns[COLUMN.totalPrice]);
      if (!address || !transactionDateRoc || !Number.isFinite(price)) continue;

      records.push({
        address,
        transactionDateRoc,
        price,
        transactionSubject,
        buildingType: columns[COLUMN.buildingType]?.trim() ?? "",
        mainUse: columns[COLUMN.mainUse]?.trim() ?? "",
        urbanLandUse: columns[COLUMN.urbanLandUse]?.trim() ?? "",
        completionDateRoc: columns[COLUMN.completionDateRoc]?.trim() ?? "",
        buildingAreaSqm: optionalNumber(columns[COLUMN.buildingAreaSqm]),
        unitPricePerSqm: optionalNumber(columns[COLUMN.unitPricePerSqm]),
      });
    }

    return records;
  }
}
