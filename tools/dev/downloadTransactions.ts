import { DEFAULT_SEASON_COUNT, LvrDownloader } from "../transactions/LvrDownloader";
import { TransactionEtl } from "../transactions/TransactionEtl";
import { TransactionStore } from "../transactions/TransactionStore";
import { cityFromArgs, flagValue, hasFlag, outputPathFor } from "../cityArgs";

/**
 * Downloads the current 實價登錄 batch, keeps only one city's 有效交易紀錄
 * (reported under 實價登錄2.0, 2021/7 onward — ADR-0001), and writes them
 * to data/<city>-transactions.sqlite for publishing to GitHub Releases.
 *
 * zone_name stays NULL in the published snapshot: per ADR-0014 the phone
 * fills it in itself after downloading, using its free on-device geocoder.
 *
 * Safe to re-run (e.g. monthly on the 1st/11th/21st, when a new batch is
 * published) — rows are keyed on a hash of address+date+price, so an
 * overlapping download won't duplicate anything.
 *
 * Pulls the current 10-day batch plus the last --seasons quarterly
 * archives (default 12 ≈ 3 years), which is the only way to get history:
 * the current batch alone is one reporting window. The quarterly zips are
 * 120-155MB each and are cached under data/lvr-cache, so the first run is
 * slow and later ones aren't.
 *
 * Usage:
 *   npm run ingest:transactions -- --city=taichung
 *   npm run ingest:transactions -- --city=hsinchu --seasons=4
 *   npm run ingest:transactions -- --city=hsinchu --seasons=0   # 本期 only
 */
async function main() {
  const city = cityFromArgs();
  const outputPath = outputPathFor(city, "transactions");
  const seasonsFlag = flagValue("seasons");
  const seasons = seasonsFlag === undefined ? DEFAULT_SEASON_COUNT : Number(seasonsFlag);
  if (!Number.isInteger(seasons) || seasons < 0) {
    throw new Error(`--seasons must be a non-negative integer, got "${seasonsFlag}"`);
  }

  const store = new TransactionStore(outputPath);
  try {
    const before = store.count();
    const downloader = new LvrDownloader(city, { seasons, refresh: hasFlag("refresh") });
    await new TransactionEtl(city, downloader, store).run();
    const after = store.count();
    console.log(`${outputPath}: ${after} ${city.name} 有效交易紀錄 (${after - before} new).`);
  } finally {
    store.close();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
