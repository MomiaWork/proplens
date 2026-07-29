import fs from "node:fs";
import path from "node:path";
import AdmZip from "adm-zip";
import type { City } from "../../src/core/cities";
import type { TransactionDownloader } from "./TransactionDownloader";
import type { RawTransactionRecord } from "./types";

/**
 * 內政部 publishes 實價登錄 in two shapes, and only using both gives any
 * real history:
 *
 * - **本期** (`/opendata/lvr_landAcsv.zip`, ~2MB): the transactions
 *   *registered* in the latest 10-day window. Its 交易年月日 can reach
 *   years back (late filings and corrections), which makes it look like
 *   history when it isn't — 新竹市's copy spans 2023-02 to 2026-06 in all
 *   of 179 rows.
 * - **季別** (`DownloadHistory?type=season`, ~120-155MB each): one archive
 *   per quarter of 登記日期, which is the actual back catalogue. 新竹市 runs
 *   1,100-2,700 rows per season.
 *
 * So this downloads the current file plus the last N seasons and merges
 * them. Overlaps are fine: TransactionStore keys rows on a hash of
 * address+date+price, so a transaction appearing in two archives lands
 * once.
 */
const CURRENT_BATCH_URL = "https://plvr.land.moi.gov.tw/opendata/lvr_landAcsv.zip";
const SEASON_LIST_URL = "https://plvr.land.moi.gov.tw/DownloadHistory_ajax_list";
const SEASON_DOWNLOAD_URL = "https://plvr.land.moi.gov.tw/DownloadHistory?type=season&fileName=";

/** 4 quarters a year; the default covers the "近三年" the card is meant to show. */
export const DEFAULT_SEASON_COUNT = 12;

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

/** Blank/non-numeric in a numeric column means "not disclosed", not "zero". */
function optionalNumber(raw: string | undefined): number {
  const value = Number(raw);
  return Number.isFinite(value) ? value : 0;
}

export interface LvrDownloadOptions {
  /** How many quarterly archives to pull, newest first. */
  seasons?: number;
  /** Where the raw zips are kept between runs. */
  cacheDir?: string;
  /** Re-download even when a cached zip exists. */
  refresh?: boolean;
}

export class LvrDownloader implements TransactionDownloader {
  private readonly seasons: number;
  private readonly cacheDir: string;
  private readonly refresh: boolean;

  constructor(
    private readonly city: City,
    options: LvrDownloadOptions = {},
  ) {
    this.seasons = options.seasons ?? DEFAULT_SEASON_COUNT;
    this.cacheDir = options.cacheDir ?? "data/lvr-cache";
    this.refresh = options.refresh ?? false;
  }

  async download(): Promise<RawTransactionRecord[]> {
    const seasons = this.seasons > 0 ? (await this.listSeasons()).slice(-this.seasons) : [];
    console.log(
      `Sources: 本期 + ${seasons.length} 季 (${seasons.at(0) ?? "-"}…${seasons.at(-1) ?? "-"}). Seasonal archives are 120-155MB each; they're cached in ${this.cacheDir}.`,
    );

    const records: RawTransactionRecord[] = [];
    records.push(...this.parseCityCsv(await this.currentBatchZip()));
    for (const season of seasons) {
      records.push(...this.parseCityCsv(await this.seasonZip(season)));
    }
    return records;
  }

  /**
   * The season codes come from the page's own list rather than being
   * computed from today's date: the newest quarter only appears once
   * 內政部 publishes it, and asking for a season that doesn't exist yet
   * returns a stub instead of failing.
   */
  private async listSeasons(): Promise<string[]> {
    const response = await fetch(SEASON_LIST_URL);
    if (!response.ok) {
      throw new Error(`Failed to list 實價登錄 seasons: ${response.status} ${response.statusText}`);
    }
    const codes = [...new Set((await response.text()).match(/1\d{2}S[1-4]/g) ?? [])].sort();
    if (codes.length === 0) {
      throw new Error("No 季別 codes found on the 實價登錄 history page — its markup may have changed.");
    }
    return codes;
  }

  private async currentBatchZip(): Promise<AdmZip> {
    return new AdmZip(await this.fetchCached("current", CURRENT_BATCH_URL));
  }

  private async seasonZip(season: string): Promise<AdmZip> {
    return new AdmZip(await this.fetchCached(season, `${SEASON_DOWNLOAD_URL}${season}`));
  }

  /**
   * Cached on disk because a full 3-year pull is ~1.5GB: re-running to
   * pick up a parser change shouldn't mean fetching it all again. Seasonal
   * archives are immutable once published, so only the current batch is
   * worth refreshing — but --refresh clears both.
   */
  private async fetchCached(name: string, url: string): Promise<Buffer> {
    fs.mkdirSync(this.cacheDir, { recursive: true });
    const cachePath = path.join(this.cacheDir, `${name}.zip`);

    const alwaysRefetch = name === "current";
    if (!this.refresh && !alwaysRefetch && fs.existsSync(cachePath)) {
      console.log(`  ${name}: cached`);
      return fs.readFileSync(cachePath);
    }

    process.stdout.write(`  ${name}: downloading… `);
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download 實價登錄 ${name}: ${response.status} ${response.statusText}`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(cachePath, buffer);
    console.log(`${Math.round(buffer.length / 1_000_000)}MB`);
    return buffer;
  }

  /**
   * Only rows whose 交易標的 includes "建物" carry a real street address
   * (土地位置建物門牌) — pure land-parcel (土地) or parking-space (車位)
   * rows only have a 地號/停車場 reference, which isn't geocodable, so
   * those are dropped here.
   */
  private parseCityCsv(zip: AdmZip): RawTransactionRecord[] {
    const entry = zip.getEntry(this.city.lvrEntryName);
    if (!entry) {
      throw new Error(`${this.city.lvrEntryName} (${this.city.name}) not found in 實價登錄 archive`);
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
