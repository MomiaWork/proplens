import { LvrDownloader } from "../transactions/LvrDownloader";
import { TransactionEtl } from "../transactions/TransactionEtl";
import { TransactionStore } from "../transactions/TransactionStore";
import { cityFromArgs, outputPathFor } from "../cityArgs";

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
 * Usage: npm run ingest:transactions -- --city=taichung
 */
async function main() {
  const city = cityFromArgs();
  const outputPath = outputPathFor(city, "transactions");

  const store = new TransactionStore(outputPath);
  try {
    const before = store.count();
    await new TransactionEtl(city, new LvrDownloader(city), store).run();
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
