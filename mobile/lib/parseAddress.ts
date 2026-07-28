// Mirrors ../../src/address-to-village/parseAddress.ts — duplicated
// because Metro doesn't bundle files outside this app's root. Pure regex
// string logic, no Node APIs, so it's a verbatim copy.
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
