import { districtCodeFor } from "./districts";

export interface ParsedAddress {
  /**
   * 鄉鎮市區代碼 for the address's district, or "" when the prefix isn't one
   * of Taichung's 29 districts. Lookups filter on it only when it's set,
   * since street names repeat across districts (中山路 alone spans the city).
   */
  districtCode: string;
  street: string;
  lane: string;
  alley: string;
  houseNumber: string;
}

const DISTRICT_PREFIX = /^(?:台中市|臺中市)([一-鿿]{1,3}區)/;
const DIGITS = "[0-9０-９]";
// 巷/弄/號 numbers all take the same "12" or "12之3" shape — 268之8巷 is a real
// lane name, so 之 has to be part of the number, not left behind on the street.
const NUMBER = `${DIGITS}+(?:之${DIGITS}+)?`;
const TAIL_PATTERN = new RegExp(
  `^(?<street>.*?)(?:(?<lane>${NUMBER}巷))?(?:(?<alley>${NUMBER}弄))?(?<houseNumber>${NUMBER}號)(?:.*)?$`,
);

function toFullWidthDigits(input: string): string {
  return input.replace(/[0-9]/g, (digit) => String.fromCharCode(digit.charCodeAt(0) + 0xfee0));
}

/**
 * Parses a raw Taichung address string into the street/lane/alley/house-number
 * shape used by the 門牌 (house-number) dataset's own columns, so the two can
 * be compared directly (see ADR-0008). Strips the leading 縣市+行政區 prefix
 * (the 門牌 dataset doesn't carry it as part of the street field), normalizes
 * 台/臺, converts digits to full-width to match the dataset's convention
 * (accepting either width on input — 實價登錄's own address strings already
 * come in full-width, e.g. "５８號", while a user typing into the app uses
 * ASCII), and discards anything trailing the house number (floor/unit
 * annotations like "五樓之２" — irrelevant to which door plate the address
 * matches, since a door plate is per-building, not per-floor).
 *
 * Returns null when the address doesn't end in a recognizable house-number
 * pattern at all — callers should fall back to coordinate-based
 * nearest-neighbor matching in that case, not treat this as an error.
 */
export function parseAddress(rawAddress: string): ParsedAddress | null {
  const normalized = rawAddress.trim().replace(/台/g, "臺");
  const districtName = normalized.match(DISTRICT_PREFIX)?.[1] ?? "";
  const withoutPrefix = normalized.replace(DISTRICT_PREFIX, "");

  const match = withoutPrefix.match(TAIL_PATTERN);
  if (!match?.groups) {
    return null;
  }

  const { street = "", lane = "", alley = "", houseNumber = "" } = match.groups;
  return {
    districtCode: districtCodeFor(districtName),
    street: toFullWidthDigits(street),
    lane: toFullWidthDigits(lane),
    alley: toFullWidthDigits(alley),
    houseNumber: toFullWidthDigits(houseNumber),
  };
}
