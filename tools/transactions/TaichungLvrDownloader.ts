import AdmZip from "adm-zip";
import type { TransactionDownloader } from "./TransactionDownloader";
import type { RawTransactionRecord } from "./types";

const LVR_CSV_ZIP_URL = "https://plvr.land.moi.gov.tw/opendata/lvr_landAcsv.zip";

/** Taichung's file prefix within the nationwide ZIP (see MANIFEST.CSV inside it). */
const TAICHUNG_ENTRY = "b_lvr_land_a.csv";

/** Column indices in b_lvr_land_a.csv (see its header row / MANIFEST.CSV's schema-main.csv). */
const COLUMN = {
  transactionSubject: 1, // 交易標的 — "土地"/"建物"/"房地(土地+建物)"[+車位]/"車位"
  address: 2, // 土地位置建物門牌
  transactionDateRoc: 7, // 交易年月日 (ROC, e.g. "1150704")
  totalPrice: 21, // 總價元
};

/**
 * Downloads the nationwide 實價登錄 batch (released ~1st/11th/21st monthly)
 * and extracts just Taichung's rows. Only rows whose 交易標的 includes
 * "建物" carry a real street address (土地位置建物門牌) — pure land-parcel
 * (土地) or parking-space (車位) rows only have a 地號/停車場 reference,
 * which isn't geocodable, so those are dropped here.
 */
export class TaichungLvrDownloader implements TransactionDownloader {
  async download(): Promise<RawTransactionRecord[]> {
    const response = await fetch(LVR_CSV_ZIP_URL);
    if (!response.ok) {
      throw new Error(`Failed to download 實價登錄 batch: ${response.status} ${response.statusText}`);
    }

    const zip = new AdmZip(Buffer.from(await response.arrayBuffer()));
    const entry = zip.getEntry(TAICHUNG_ENTRY);
    if (!entry) {
      throw new Error(`${TAICHUNG_ENTRY} not found in downloaded 實價登錄 batch`);
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

      records.push({ address, transactionDateRoc, price });
    }

    return records;
  }
}
