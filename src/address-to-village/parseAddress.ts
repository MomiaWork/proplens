export interface ParsedAddress {
  street: string;
  lane: string;
  alley: string;
  houseNumber: string;
}

const DISTRICT_PREFIX = /^(?:台中市|臺中市)[一-鿿]{1,3}區/;
const TAIL_PATTERN =
  /^(?<street>.*?)(?:(?<lane>[0-9]+巷))?(?:(?<alley>[0-9]+弄))?(?<houseNumber>[0-9]+(?:之[0-9]+)?號)$/;

function toFullWidthDigits(input: string): string {
  return input.replace(/[0-9]/g, (digit) => String.fromCharCode(digit.charCodeAt(0) + 0xfee0));
}

/**
 * Parses a raw Taichung address string into the street/lane/alley/house-number
 * shape used by the 門牌 (house-number) dataset's own columns, so the two can
 * be compared directly (see ADR-0008). Strips the leading 縣市+行政區 prefix
 * (the 門牌 dataset doesn't carry it as part of the street field), normalizes
 * 台/臺, and converts digits to full-width to match the dataset's convention.
 *
 * Returns null when the address doesn't end in a recognizable house-number
 * pattern (e.g. it has a trailing annotation) — callers should fall back to
 * coordinate-based nearest-neighbor matching in that case, not treat this as
 * an error.
 */
export function parseAddress(rawAddress: string): ParsedAddress | null {
  const withoutPrefix = rawAddress.trim().replace(/台/g, "臺").replace(DISTRICT_PREFIX, "");

  const match = withoutPrefix.match(TAIL_PATTERN);
  if (!match?.groups) {
    return null;
  }

  const { street = "", lane = "", alley = "", houseNumber = "" } = match.groups;
  return {
    street: toFullWidthDigits(street),
    lane: toFullWidthDigits(lane),
    alley: toFullWidthDigits(alley),
    houseNumber: toFullWidthDigits(houseNumber),
  };
}
