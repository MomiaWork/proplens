import { AddressPointStore, type AddressPoint } from "../address-to-village/AddressPointStore.ts";

/**
 * Downloads the latest monthly 臺中市GIS門牌號碼 (house-number address-point)
 * CSV and loads it into data/address-points.sqlite via AddressPointStore.
 * This is the dataset ADR-0008 relies on for address -> 里/鄰 resolution,
 * since 鄰 has no spatial boundary and point-in-polygon can't be used.
 *
 * The dataset's own `newdatacenter.taichung.gov.tw` resource-download URL
 * (found via data.gov.tw/dataset/169806, see research.md) isn't the file
 * itself — it's a small stub CSV listing one row per monthly snapshot,
 * each with a Google Drive link to the real file. The current month's file
 * (~150MB) is large enough to trip Google Drive's "can't scan for
 * viruses" interstitial, which a plain fetch() can't get past: the first
 * request lands on an HTML confirmation page (not the file), and the real
 * download needs a second request carrying that page's `uuid` token plus
 * the session cookie Google set on the first response.
 *
 * Usage: npx tsx src/dev/downloadAddressPoints.ts [outputSqlitePath]
 */

const STUB_CSV_URL =
  "https://newdatacenter.taichung.gov.tw/api/v1/no-auth/resource.download?rid=42350484-812f-4c08-a06f-45783904fe88";

interface MonthlySnapshot {
  name: string;
  driveUrl: string;
}

// The stub CSV quotes every field but never embeds a literal comma inside
// one, so stripping one leading/trailing quote per comma-split field is
// enough — no full RFC 4180 parser needed.
function parseQuotedCsvLine(line: string): string[] {
  return line.split(",").map((field) => field.trim().replace(/^"|"$/g, ""));
}

async function findLatestAddressPointsSnapshot(): Promise<MonthlySnapshot> {
  const response = await fetch(STUB_CSV_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch address-points stub CSV: ${response.status} ${response.statusText}`);
  }
  const csv = await response.text();
  const lines = csv.split("\n").slice(1).filter((line) => line.trim().length > 0);

  // Rows are in chronological order; the last GIS門牌號碼 entry is the
  // latest month. (The stub also lists unrelated 建物成果資料 rows.)
  let latest: MonthlySnapshot | undefined;
  for (const line of lines) {
    const [name, , format, driveUrl] = parseQuotedCsvLine(line);
    if (format === "csv" && name?.includes("GIS門牌號碼") && driveUrl) {
      latest = { name, driveUrl };
    }
  }
  if (!latest) {
    throw new Error("No GIS門牌號碼 csv entry found in the address-points stub file");
  }
  return latest;
}

function extractGoogleDriveFileId(driveUrl: string): string {
  const match = driveUrl.match(/\/d\/([^/]+)/);
  if (!match?.[1]) {
    throw new Error(`Could not extract a Google Drive file id from ${driveUrl}`);
  }
  return match[1];
}

/**
 * Downloads a public Google Drive file, handling the "too large to scan
 * for viruses" interstitial that files over ~25MB hit. Small files that
 * don't trigger it come back directly on the first request.
 */
async function downloadGoogleDriveFile(fileId: string): Promise<string> {
  const first = await fetch(`https://drive.google.com/uc?export=download&id=${fileId}`);
  if (!first.ok) {
    throw new Error(`Google Drive request failed: ${first.status} ${first.statusText}`);
  }

  const contentType = first.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html")) {
    return await first.text();
  }

  const cookie = first.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  const interstitialHtml = await first.text();
  const uuidMatch = interstitialHtml.match(/name="uuid" value="([^"]+)"/);
  if (!uuidMatch) {
    throw new Error(
      "Google Drive served an HTML page instead of the file, and no confirm token was found — the interstitial page format may have changed.",
    );
  }

  const confirmUrl = `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t&uuid=${uuidMatch[1]}`;
  const second = await fetch(confirmUrl, { headers: cookie ? { cookie } : {} });
  if (!second.ok) {
    throw new Error(`Google Drive confirmed download failed: ${second.status} ${second.statusText}`);
  }
  return await second.text();
}

// Columns: 省市縣市代碼,鄉鎮市區代碼,村里,鄰,街、路段,地區,巷,弄,號,TWD97橫坐標,TWD97縱坐標,WGS84經度,WGS84緯度
// street/lane/alley/houseNumber and 鄰 are stored exactly as the source
// gives them (full-width digits, "N巷"/"N弄"/"N號" suffixes already
// included, 鄰 already zero-padded to 3 digits) — the same shape
// parseAddress() produces from a user-typed address, and the shape
// SchoolDistrictTable's neighborhood matching expects.
function parseAddressPointsCsv(csv: string): AddressPoint[] {
  const lines = csv.split("\n").slice(1);
  const points: AddressPoint[] = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    const columns = line.split(",");
    const village = columns[2];
    const neighborhood = columns[3];
    const street = columns[4];
    const lane = columns[6] ?? "";
    const alley = columns[7] ?? "";
    const houseNumber = columns[8];
    const lon = Number(columns[11]);
    const lat = Number(columns[12]);

    if (!village || !neighborhood || !street || !houseNumber || !Number.isFinite(lat) || !Number.isFinite(lon)) {
      continue;
    }
    points.push({ street, lane, alley, houseNumber, village, neighborhood, coordinate: { lat, lon } });
  }

  return points;
}

async function main() {
  const outputPath = process.argv[2] ?? "data/address-points.sqlite";

  console.log("Finding the latest monthly GIS門牌號碼 snapshot...");
  const snapshot = await findLatestAddressPointsSnapshot();
  console.log(`Latest snapshot: ${snapshot.name}`);

  console.log("Downloading from Google Drive (this file is typically 100-150MB)...");
  const fileId = extractGoogleDriveFileId(snapshot.driveUrl);
  const csv = await downloadGoogleDriveFile(fileId);

  console.log("Parsing address points...");
  const points = parseAddressPointsCsv(csv);
  console.log(`Parsed ${points.length} address points.`);

  console.log(`Writing to ${outputPath}...`);
  const store = new AddressPointStore(outputPath);
  store.replaceAll(points);
  store.close();

  console.log(`Wrote ${points.length} address points to ${outputPath}.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
