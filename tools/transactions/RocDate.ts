/**
 * 實價登錄 dates are published in 民國 (ROC) format: a 2-4 digit ROC year
 * followed by 2-digit month and 2-digit day, e.g. "1100715" = ROC 110,
 * i.e. 2021-07-15. Returns an ISO date string ("YYYY-MM-DD").
 */
export function rocDateToIso(rocDate: string): string {
  const trimmed = rocDate.trim();
  if (trimmed.length < 5 || trimmed.length > 7) {
    throw new Error(`Unrecognized 民國 date format: "${rocDate}"`);
  }

  const month = trimmed.slice(-4, -2);
  const day = trimmed.slice(-2);
  const rocYear = trimmed.slice(0, -4);
  const westernYear = Number(rocYear) + 1911;

  return `${westernYear}-${month}-${day}`;
}

/**
 * Same conversion for columns that are legitimately blank — 建築完成年月 is
 * empty on 預售屋 and land-only rows, and some rows carry a literal "0".
 * Those mean "not disclosed", so they become undefined rather than an
 * error (unlike 交易年月日, where a bad value is a real data problem) and
 * the card can say 不詳.
 */
export function optionalRocDateToIso(rocDate: string): string | undefined {
  const trimmed = rocDate.trim();
  if (!trimmed || Number(trimmed) === 0) {
    return undefined;
  }
  try {
    return rocDateToIso(trimmed);
  } catch {
    return undefined;
  }
}
