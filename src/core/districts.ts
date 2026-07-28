/**
 * 臺中市 rural/urban district (行政區) name -> 鄉鎮市區代碼, the code the
 * 門牌 dataset actually stores (see AddressPoint.districtCode).
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
export const DISTRICT_CODE_BY_NAME: Readonly<Record<string, string>> = {
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

/**
 * Code for a district name, or "" when the name isn't one of Taichung's 29
 * districts. Callers treat "" as "district unknown — don't filter on it",
 * which keeps addresses whose prefix isn't a real district (test fixtures,
 * or a user typing something unexpected) working exactly as before.
 */
export function districtCodeFor(districtName: string): string {
  return DISTRICT_CODE_BY_NAME[districtName] ?? "";
}
