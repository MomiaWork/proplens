import { DatabaseSync } from "node:sqlite";
import { CITIES, DATA_FILE_KEYS, dataFileName } from "../../src/core/cities";

/**
 * Checks the published GitHub Release the way the phone reads it: same
 * `releases/latest` call, same expected asset names, same download URLs.
 *
 * Worth having as a script rather than a checklist item because the two
 * ways this goes wrong are both silent from the publisher's side — an
 * asset whose name doesn't match `dataFileName()` (the app reports
 * "資料尚未發布" and nothing else), and a release published under the tag
 * a phone has already cached (the app decides it's up to date and never
 * downloads). Neither is visible on the releases page.
 *
 * Usage: npm run verify:release
 */

const REPO = "MomiaWork/proplens";

interface GitHubRelease {
  tag_name: string;
  assets: Array<{ name: string; size: number; browser_download_url: string }>;
}

async function main() {
  const response = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`);
  if (!response.ok) {
    throw new Error(`Failed to read releases/latest: ${response.status} ${response.statusText}`);
  }
  const release = (await response.json()) as GitHubRelease;
  console.log(`releases/latest = ${release.tag_name}\n`);

  let failures = 0;
  for (const city of CITIES) {
    for (const key of DATA_FILE_KEYS) {
      const name = dataFileName(city, key);
      const asset = release.assets.find((a) => a.name === name);
      if (!asset) {
        console.log(`✗ ${city.displayName}: 缺少 ${name}`);
        failures += 1;
        continue;
      }

      const download = await fetch(asset.browser_download_url);
      const buffer = Buffer.from(await download.arrayBuffer());
      if (buffer.subarray(0, 15).toString() !== "SQLite format 3") {
        console.log(`✗ ${city.displayName}: ${name} 不是 SQLite 檔`);
        failures += 1;
        continue;
      }

      // Open what was actually downloaded, not the local build — a
      // truncated upload still has a valid header.
      const tempPath = `data/.verify-${name}`;
      const { writeFileSync, rmSync } = await import("node:fs");
      writeFileSync(tempPath, buffer);
      try {
        const db = new DatabaseSync(tempPath);
        const { n } = db.prepare("SELECT COUNT(*) AS n FROM valid_transactions").get() as { n: number };
        const range = db
          .prepare("SELECT MIN(transaction_date) a, MAX(transaction_date) b FROM valid_transactions")
          .get() as { a: string; b: string };
        const { s } = db.prepare("SELECT COUNT(*) AS s FROM valid_transactions WHERE street = ''").get() as { s: number };
        db.close();
        console.log(
          `✓ ${city.displayName}: ${name}  ${Math.round(buffer.length / 1000)}KB  ${n} 筆  ${range.a}~${range.b}  街名空白 ${s} 筆`,
        );
      } finally {
        rmSync(tempPath, { force: true });
      }
    }
  }

  if (failures > 0) {
    throw new Error(`${failures} 項未通過——手機會顯示「資料尚未發布」。`);
  }
  console.log("\n全部通過：手機以這個 release 同步得到資料。");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
