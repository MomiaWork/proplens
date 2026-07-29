// The set of 縣市 the app supports, and everything that differs between
// them. Platform-free: the app, the test suite and the ingestion pipeline
// all read this one table, so adding a city is a matter of adding an entry
// here plus publishing its five data files (ADR-0017).

/**
 * 鄉鎮市區 name -> 鄉鎮市區代碼, the code the 門牌 dataset stores
 * (address_points.district_code). Empty for cities whose addresses don't
 * name a 區 at all — see 新竹市 below.
 */
export type DistrictCodeTable = Readonly<Record<string, string>>;

/**
 * 臺中市 rural/urban district (行政區) name -> 鄉鎮市區代碼.
 *
 * The source CSV carries only the code, never the name, and no official
 * machine-readable code table was findable, so this mapping was derived
 * and then corroborated three independent ways before being written down:
 *
 * 1. OpenStreetMap reverse geocoding of a real door plate near each code's
 *    centroid (reverse-geocoding a point to an administrative district is
 *    a much coarser job than the street-address forward geocoding ADR-0014
 *    found unreliable, and OSM's Taiwan district boundaries are sound).
 * 2. The 實價登錄 transaction addresses, which state their own district in
 *    the address string: matching those against the 門牌 rows yielded 15
 *    unambiguous code/name pairs, every one of which agrees with (1).
 * 3. Village names, which settle the two codes whose sampled point sat on
 *    a boundary: 6601900 contains 新社里 and 6602000 contains 石岡里.
 *
 * Regenerating: the mapping is stable (district codes change only when the
 * administrative divisions themselves do), so this is a static table
 * rather than a step in the ingestion pipeline.
 */
const TAICHUNG_DISTRICT_CODES: DistrictCodeTable = {
  中區: "6600100",
  東區: "6600200",
  南區: "6600300",
  西區: "6600400",
  北區: "6600500",
  西屯區: "6600600",
  南屯區: "6600700",
  北屯區: "6600800",
  豐原區: "6600900",
  東勢區: "6601000",
  大甲區: "6601100",
  清水區: "6601200",
  沙鹿區: "6601300",
  梧棲區: "6601400",
  后里區: "6601500",
  神岡區: "6601600",
  潭子區: "6601700",
  大雅區: "6601800",
  新社區: "6601900",
  石岡區: "6602000",
  外埔區: "6602100",
  大安區: "6602200",
  烏日區: "6602300",
  大肚區: "6602400",
  龍井區: "6602500",
  霧峰區: "6602600",
  太平區: "6602700",
  大里區: "6602800",
  和平區: "6602900",
};

export type CityId = "taichung" | "hsinchu";

export type DataFileKey =
  | "addressPoints"
  | "transactions"
  | "zoning"
  | "schoolDistrictElementary"
  | "schoolDistrictJuniorHigh";

/**
 * The files the app actually downloads. Only 實價登錄 for now (ADR-0018):
 * the 分區-anchored card needs the other four, but two of them can't be
 * obtained for 新竹市 at all, so the shipping card is the one that runs on
 * this file alone — and the sync is a ~150KB download rather than ~200MB.
 *
 * The other keys stay defined because the pipeline still builds those
 * files and src/core still contains the engine that reads them; putting a
 * key back in this list is what re-enables downloading it.
 */
export const DATA_FILE_KEYS = ["transactions"] as const satisfies readonly DataFileKey[];

export interface City {
  id: CityId;
  /**
   * 正式全名 in the 臺 form. parseAddress normalizes 台 -> 臺 before
   * matching, so only this spelling needs to be listed.
   */
  name: string;
  /** The spelling shown in the UI, which is the everyday one (台中市). */
  displayName: string;
  districtCodes: DistrictCodeTable;
  /** A real address in this city, shown as the query field's placeholder. */
  exampleAddress: string;
  /**
   * This city's file inside 內政部's nationwide 實價登錄 zip. The letters
   * are the ministry's own 縣市 codes (see manifest.csv in the zip):
   * b = 臺中市, o = 新竹市.
   */
  lvrEntryName: string;
}

const CITY_LIST: readonly City[] = [
  {
    id: "taichung",
    name: "臺中市",
    displayName: "台中市",
    districtCodes: TAICHUNG_DISTRICT_CODES,
    exampleAddress: "台中市西屯區台灣大道三段99號",
    lvrEntryName: "b_lvr_land_a.csv",
  },
  {
    id: "hsinchu",
    name: "新竹市",
    displayName: "新竹市",
    /**
     * The names are listed but every code is "" on purpose. 新竹市
     * addresses normally omit the 區 — both the everyday form
     * (新竹市光復路一段89號) and 實價登錄's own strings, which repeat the
     * city instead of naming a district (新竹市新竹市西大路７２巷４７弄３號)
     * — but a user may still type one, and parseAddress has to recognize
     * it to strip it off the street name.
     *
     * The codes stay empty because they can't be checked against a 門牌
     * file nobody has been able to obtain (ADR-0017); a guessed code would
     * silently filter every lookup down to nothing, whereas "" means
     * "don't filter on district", which is correct here.
     */
    districtCodes: { 東區: "", 北區: "", 香山區: "" },
    exampleAddress: "新竹市中華路二段445號",
    lvrEntryName: "o_lvr_land_a.csv",
  },
];

export const CITIES: readonly City[] = CITY_LIST;

export const DEFAULT_CITY_ID: CityId = "taichung";

export function isCityId(value: string): value is CityId {
  return CITY_LIST.some((city) => city.id === value);
}

export function cityById(id: CityId): City {
  const city = CITY_LIST.find((c) => c.id === id);
  if (!city) {
    throw new Error(`Unknown city: ${id}`);
  }
  return city;
}

/**
 * Code for a district name, or "" when the name isn't one of this city's
 * districts. Callers treat "" as "district unknown — don't filter on it",
 * which keeps addresses whose prefix isn't a real district (test fixtures,
 * every 新竹市 address, or a user typing something unexpected) working.
 */
export function districtCodeFor(city: City, districtName: string): string {
  return city.districtCodes[districtName] ?? "";
}

/**
 * Whether this is one of the city's real 行政區 — which is a different
 * question from whether it has a code (新竹市's are all ""), and the one
 * that decides whether a leading 區 in an address the user typed without
 * the city name should be stripped off the street.
 */
export function isDistrictOf(city: City, districtName: string): boolean {
  return Object.hasOwn(city.districtCodes, districtName);
}

/** Longest district name this address starts with, or "" — longest wins so 北區 can't shadow 北屯區. */
export function leadingDistrictOf(city: City, address: string): string {
  let longest = "";
  for (const name of Object.keys(city.districtCodes)) {
    if (address.startsWith(name) && name.length > longest.length) {
      longest = name;
    }
  }
  return longest;
}

/**
 * Data files are named per city and downloaded per city, so one release
 * can carry every supported city's snapshot and the phone only fetches the
 * ~200MB belonging to the city being looked at.
 */
export function dataFileName(city: City, key: DataFileKey): string {
  switch (key) {
    case "addressPoints":
      return `${city.id}-address-points.sqlite`;
    case "transactions":
      return `${city.id}-transactions.sqlite`;
    case "zoning":
      return `${city.id}-zoning.geojson`;
    case "schoolDistrictElementary":
      return `${city.id}-school-district-elementary.json`;
    case "schoolDistrictJuniorHigh":
      return `${city.id}-school-district-junior-high.json`;
  }
}
