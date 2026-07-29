// Where each city's 門牌 and 學區 data comes from.
//
// These two datasets are published by each city government separately,
// with no national equivalent that carries what the engine needs (the
// nationwide 全國路名資料 has neither coordinates nor 里/鄰), so the source
// is per city rather than per dataset. 實價登錄 is the exception and lives
// in cities.ts, since one nationwide file covers everybody.
//
// A "fetched" source is one this repo can pull unattended; a "manual" one
// has to be downloaded by hand and passed in with --from. Manual isn't a
// stub — the parsing, validation and SQLite loading are identical either
// way, and the scripts read the CSV header rather than fixed column
// positions precisely so a hand-fetched file from a different city still
// loads (see downloadAddressPoints.ts).
import type { City, CityId } from "../src/core/cities";

export interface FetchedAddressPointsSource {
  kind: "fetched";
  /**
   * A stub CSV listing one row per monthly snapshot, each with a Google
   * Drive link to the real ~150MB file (see downloadAddressPoints.ts for
   * why that indirection exists).
   */
  monthlySnapshotIndexUrl: string;
  /** Substring identifying the 門牌 rows among the stub's other datasets. */
  snapshotNameContains: string;
}

export interface ManualSource {
  kind: "manual";
  /** Printed when --from is missing: where a human goes to get the file. */
  note: string;
}

export type AddressPointsSource = FetchedAddressPointsSource | ManualSource;

export interface TaichungSchoolDistrictDataset {
  datasetUuid: string;
  /** Column index of 學校名稱 in the real CSV (0-based). */
  schoolNameColumn: number;
  /** Column index of the 里鄰 text cell — named 學區範圍_里鄰 in the elementary CSV, 里鄰 in the junior-high one. */
  villageNeighborhoodColumn: number;
}

export interface FetchedSchoolDistrictSource {
  kind: "fetched";
  /**
   * Generic "download every resource for a dataset as a zip" endpoint,
   * reverse-engineered from the open-data portal's own Nuxt.js bundle —
   * not documented anywhere: GET <endpoint>?pid=<catalog-uuid>
   */
  datasetDownloadEndpoint: string;
  elementary: TaichungSchoolDistrictDataset;
  juniorHigh: TaichungSchoolDistrictDataset;
}

export type SchoolDistrictSource = FetchedSchoolDistrictSource | ManualSource;

export interface CitySources {
  addressPoints: AddressPointsSource;
  schoolDistricts: SchoolDistrictSource;
}

/**
 * 新竹市's portal (opendata.hccg.gov.tw) has no URL-addressable search and
 * publishes neither its GIS門牌 file nor its 學區劃分表 as a fetchable CSV
 * resource — the 學區表 is a PDF on the 教育處 site. Both therefore have to
 * be obtained by hand (portal download or a 資料申請) and fed in with
 * --from; the scripts do the rest.
 */
const HSINCHU_ADDRESS_POINTS_NOTE =
  "新竹市 GIS門牌 CSV 沒有可自動抓取的網址。請自 https://opendata.hccg.gov.tw/ 搜尋「門牌」下載（或向新竹市政府申請），" +
  "再以 --from <路徑> 指定該 CSV。檔案須含 鄉鎮市區代碼／村里／鄰／街、路段／巷／弄／號／WGS84經度／WGS84緯度 欄位（欄位順序不拘，以標題列比對）。";

const HSINCHU_SCHOOL_DISTRICT_NOTE =
  "新竹市學區劃分表目前僅以 PDF 公告於 https://www.hc.edu.tw/edub/basic/schoolArea.aspx 。" +
  "請先轉為 CSV（每列一所學校，含學校名稱與里鄰文字欄位），再以 --from-elementary <路徑> --from-junior-high <路徑> 指定。";

const SOURCES: Record<CityId, CitySources> = {
  taichung: {
    addressPoints: {
      kind: "fetched",
      // Found via data.gov.tw/dataset/169806 (see research.md).
      monthlySnapshotIndexUrl:
        "https://newdatacenter.taichung.gov.tw/api/v1/no-auth/resource.download?rid=42350484-812f-4c08-a06f-45783904fe88",
      snapshotNameContains: "GIS門牌號碼",
    },
    schoolDistricts: {
      kind: "fetched",
      datasetDownloadEndpoint: "https://opendata.taichung.gov.tw/api/v1/dataset.all.resource.download",
      // 臺中市國民小學學區表 — https://opendata.taichung.gov.tw/search/2fd1209f-8df8-41c3-835a-7f0ecbf78e79
      elementary: {
        datasetUuid: "2fd1209f-8df8-41c3-835a-7f0ecbf78e79",
        schoolNameColumn: 3,
        villageNeighborhoodColumn: 5,
      },
      // 臺中市國民中學學區劃分表 — https://opendata.taichung.gov.tw/search/80eb3531-12df-457f-a9d4-f3bad33eb89d
      juniorHigh: {
        datasetUuid: "80eb3531-12df-457f-a9d4-f3bad33eb89d",
        schoolNameColumn: 3,
        villageNeighborhoodColumn: 5,
      },
    },
  },
  hsinchu: {
    addressPoints: { kind: "manual", note: HSINCHU_ADDRESS_POINTS_NOTE },
    schoolDistricts: { kind: "manual", note: HSINCHU_SCHOOL_DISTRICT_NOTE },
  },
};

export function sourcesFor(city: City): CitySources {
  return SOURCES[city.id];
}
