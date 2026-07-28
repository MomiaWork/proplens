import { TaichungLvrDownloader } from "../transactions/TaichungLvrDownloader";
import { TransactionEtl } from "../transactions/TransactionEtl";
import { TransactionStore } from "../transactions/TransactionStore";

/**
 * Downloads the current 實價登錄 batch, keeps only 有效交易紀錄 (reported
 * under 實價登錄2.0, 2021/7 onward — ADR-0001), and writes them to
 * data/transactions.sqlite for publishing to GitHub Releases.
 *
 * zone_name stays NULL in the published snapshot: per ADR-0014 the phone
 * fills it in itself after downloading, using its free on-device geocoder.
 *
 * Safe to re-run (e.g. monthly on the 1st/11th/21st, when a new batch is
 * published) — rows are keyed on a hash of address+date+price, so an
 * overlapping download won't duplicate anything.
 *
 * Usage: npx tsx tools/dev/downloadTransactions.ts [outputSqlitePath]
 */
const DEFAULT_OUTPUT_PATH = "data/transactions.sqlite";

async function main() {
  const outputPath = process.argv[2] ?? DEFAULT_OUTPUT_PATH;

  const store = new TransactionStore(outputPath);
  try {
    const before = store.count();
    await new TransactionEtl(new TaichungLvrDownloader(), store).run();
    const after = store.count();
    console.log(`${outputPath}: ${after} 有效交易紀錄 (${after - before} new).`);
  } finally {
    store.close();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
