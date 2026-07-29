import { districtCodeFor, leadingDistrictOf, type City } from "./cities";

export interface ParsedAddress {
  /**
   * 鄉鎮市區代碼 for the address's district, or "" when the prefix isn't one
   * of the city's districts (and always "" for cities whose addresses don't
   * name a 區 — see cities.ts). Lookups filter on it only when it's set,
   * since street names repeat across districts (中山路 alone spans 臺中市).
   */
  districtCode: string;
  street: string;
  lane: string;
  alley: string;
  houseNumber: string;
}

const DIGITS = "[0-9０-９]";
// 巷/弄/號 numbers all take the same "12" or "12之3" shape — 268之8巷 is a real
// lane name, so 之 has to be part of the number, not left behind on the street.
const NUMBER = `${DIGITS}+(?:之${DIGITS}+)?`;
const TAIL_PATTERN = new RegExp(
  `^(?<street>.*?)(?:(?<lane>${NUMBER}巷))?(?:(?<alley>${NUMBER}弄))?(?<houseNumber>${NUMBER}號)(?:.*)?$`,
);

/**
 * `臺中市西屯區` / `新竹市新竹市` — the city name, repeated if the source
 * repeats it (實價登錄's 新竹市 rows do exactly that, since the city has no
 * district to name in that slot), followed by an optional 區.
 *
 * When the city name is present the 區 is stripped whatever it says: the
 * 門牌 dataset's street column never includes it, so leaving it attached
 * would break every exact match. Only the *code* depends on the name
 * being a real district.
 */
const cityPrefixPatterns = new Map<string, RegExp>();

function cityPrefixPattern(city: City): RegExp {
  const cached = cityPrefixPatterns.get(city.id);
  if (cached) {
    return cached;
  }
  const pattern = new RegExp(`^(?:${city.name})+(?<district>[一-鿿]{1,3}區)?`);
  cityPrefixPatterns.set(city.id, pattern);
  return pattern;
}

function toFullWidthDigits(input: string): string {
  return input.replace(/[0-9]/g, (digit) => String.fromCharCode(digit.charCodeAt(0) + 0xfee0));
}

/**
 * Parses a raw address string into the street/lane/alley/house-number shape
 * used by the 門牌 (house-number) dataset's own columns, so the two can be
 * compared directly (see ADR-0008). Strips the leading 縣市+行政區 prefix
 * (the 門牌 dataset doesn't carry it as part of the street field),
 * normalizes 台/臺, converts digits to full-width to match the dataset's
 * convention (accepting either width on input — 實價登錄's own address
 * strings already come in full-width, e.g. "５８號", while a user typing
 * into the app uses ASCII), and discards anything trailing the house number
 * (floor/unit annotations like "五樓之２" — irrelevant to which door plate
 * the address matches, since a door plate is per-building, not per-floor).
 *
 * `city` decides which prefix to strip and which district code table to
 * consult; an address for a different city simply keeps its prefix as part
 * of the street and won't match any door plate, which is the correct
 * outcome — the caller is querying the wrong city's data.
 *
 * Returns null when the address doesn't end in a recognizable house-number
 * pattern at all — callers should fall back to coordinate-based
 * nearest-neighbor matching in that case, not treat this as an error.
 */
export function parseAddress(rawAddress: string, city: City): ParsedAddress | null {
  const normalized = rawAddress.trim().replace(/台/g, "臺");

  let districtName = "";
  let withoutPrefix = normalized;

  const prefix = normalized.match(cityPrefixPattern(city));
  if (prefix) {
    districtName = prefix.groups?.district ?? "";
    withoutPrefix = normalized.slice(prefix[0].length);
  } else {
    // No city name, but people routinely write just the 行政區 —
    // 「烏日區中山路一段592號」. Only a name this city actually has is
    // stripped, so a street that merely starts with something 區-shaped
    // (or a fixture address like 住宅區交易1號) keeps it.
    districtName = leadingDistrictOf(city, normalized);
    withoutPrefix = normalized.slice(districtName.length);
  }

  const match = withoutPrefix.match(TAIL_PATTERN);
  if (!match?.groups) {
    return null;
  }

  const { street = "", lane = "", alley = "", houseNumber = "" } = match.groups;
  return {
    districtCode: districtCodeFor(city, districtName),
    street: toFullWidthDigits(street),
    lane: toFullWidthDigits(lane),
    alley: toFullWidthDigits(alley),
    houseNumber: toFullWidthDigits(houseNumber),
  };
}
