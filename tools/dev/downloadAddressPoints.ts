import fs from "node:fs";
import { AddressPointStore, type AddressPoint } from "../address-to-village/AddressPointStore";
import { cityFromArgs, flagValue, hasFlag, outputPathFor } from "../cityArgs";
import { sourcesFor, type FetchedAddressPointsSource } from "../citySources";
import type { City } from "../../src/core/cities";

/**
 * Loads a city's GIS門牌號碼 (house-number address-point) CSV into
 * data/<city>-address-points.sqlite via AddressPointStore. This is the
 * dataset ADR-0008 relies on for address -> 里/鄰 resolution, since 鄰 has
 * no spatial boundary and point-in-polygon can't be used.
 *
 * Where the CSV comes from is per city (tools/citySources.ts): 臺中市
 * publishes a fetchable monthly snapshot, 新竹市 doesn't, so its file is
 * downloaded by hand and passed with --from. Everything after that point
 * — parsing, validation, loading — is identical for both.
 *
 * Usage:
 *   npm run ingest:address-points -- --city=taichung [--refresh]
 *   npm run ingest:address-points -- --city=hsinchu --from <門牌.csv>
 */

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

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/**
 * The 臺中市 dataset's own resource-download URL isn't the file itself —
 * it's a small stub CSV listing one row per monthly snapshot, each with a
 * Google Drive link to the real file. The current month's file (~150MB) is
 * large enough to trip Google Drive's "can't scan for viruses"
 * interstitial, which a plain fetch() can't get past: the first request
 * lands on an HTML confirmation page (not the file), and the real download
 * needs a second request carrying that page's `uuid` token plus the
 * session cookie Google set on the first response.
 */
async function findLatestSnapshot(source: FetchedAddressPointsSource): Promise<MonthlySnapshot> {
  const response = await fetch(source.monthlySnapshotIndexUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch address-points stub CSV: ${response.status} ${response.statusText}`);
  }
  const csv = await response.text();
  const lines = csv.split("\n").slice(1).filter((line) => line.trim().length > 0);

  // Rows are in chronological order; the last matching entry is the
  // latest month. (The stub also lists unrelated 建物成果資料 rows.)
  let latest: MonthlySnapshot | undefined;
  for (const line of lines) {
    const [name, , format, driveUrl] = parseQuotedCsvLine(line);
    if (format === "csv" && name?.includes(source.snapshotNameContains) && driveUrl) {
      latest = { name, driveUrl };
    }
  }
  if (!latest) {
    throw new Error(`No ${source.snapshotNameContains} csv entry found in the address-points stub file`);
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

/**
 * Columns are located by header name, not by position. Every city exports
 * the same TGOS 門牌 schema but not necessarily in the same order, and a
 * silently mis-positioned column would load a whole city's worth of
 * plausible-looking nonsense (a 鄰 number into the street field, say)
 * rather than failing.
 *
 * Header spellings seen in the wild are listed per column; a header
 * matches if it contains one of them, since some exports decorate names
 * ("號(戶號)").
 */
const COLUMN_HEADERS = {
  districtCode: ["鄉鎮市區代碼"],
  village: ["村里"],
  neighborhood: ["鄰"],
  street: ["街、路段", "街路段", "街道名稱"],
  lane: ["巷"],
  alley: ["弄"],
  houseNumber: ["號"],
  lon: ["WGS84經度", "經度"],
  lat: ["WGS84緯度", "緯度"],
} as const;

type ColumnName = keyof typeof COLUMN_HEADERS;

/**
 * 鄰/巷/弄/號 are substrings of longer header names (街、路段 contains 段
 * but 鄉鎮市區代碼 contains neither), so an exact match is tried across
 * every column before falling back to a contains match — otherwise "號"
 * could bind to a column merely mentioning it.
 */
function findColumn(headers: string[], candidates: readonly string[]): number {
  for (const candidate of candidates) {
    const exact = headers.indexOf(candidate);
    if (exact >= 0) return exact;
  }
  for (const candidate of candidates) {
    const partial = headers.findIndex((header) => header.includes(candidate));
    if (partial >= 0) return partial;
  }
  return -1;
}

function mapColumns(headerLine: string): Record<ColumnName, number> {
  const headers = parseQuotedCsvLine(stripBom(headerLine));
  const mapping = {} as Record<ColumnName, number>;
  const missing: string[] = [];

  for (const name of Object.keys(COLUMN_HEADERS) as ColumnName[]) {
    const index = findColumn(headers, COLUMN_HEADERS[name]);
    if (index < 0) {
      missing.push(COLUMN_HEADERS[name][0]);
    }
    mapping[name] = index;
  }

  if (missing.length > 0) {
    throw new Error(
      `門牌 CSV is missing required column(s): ${missing.join(", ")}.\nHeader row was: ${headers.join(", ")}`,
    );
  }
  return mapping;
}

/**
 * street/lane/alley/houseNumber and 鄰 are stored exactly as the source
 * gives them (full-width digits, "N巷"/"N弄"/"N號" suffixes already
 * included, 鄰 already zero-padded to 3 digits) — the same shape
 * parseAddress() produces from a user-typed address, and the shape
 * SchoolDistrictTable's neighborhood matching expects.
 */
function parseAddressPointsCsv(csv: string): AddressPoint[] {
  const lines = csv.split("\n");
  const headerLine = lines[0];
  if (!headerLine) {
    throw new Error("門牌 CSV is empty");
  }
  const column = mapColumns(headerLine);

  const points: AddressPoint[] = [];
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    const columns = line.split(",");

    const districtCode = columns[column.districtCode];
    const village = columns[column.village];
    const neighborhood = columns[column.neighborhood];
    const street = columns[column.street];
    const lane = columns[column.lane] ?? "";
    const alley = columns[column.alley] ?? "";
    const houseNumber = columns[column.houseNumber];
    const lon = Number(columns[column.lon]);
    const lat = Number(columns[column.lat]);

    if (!districtCode || !village || !neighborhood || !street || !houseNumber || !Number.isFinite(lat) || !Number.isFinite(lon)) {
      continue;
    }
    points.push({ districtCode, street, lane, alley, houseNumber, village, neighborhood, coordinate: { lat, lon } });
  }

  return points;
}

/**
 * The fetched download is ~150MB through Google Drive's interstitial, so
 * the raw CSV is kept on disk: re-running to pick up a parser change (a
 * column the first version didn't read, say) shouldn't mean fetching it
 * all again. Pass --refresh to force a new download when a newer month is
 * published.
 */
function rawCsvCachePath(city: City): string {
  return `data/${city.id}-address-points-raw.csv`;
}

async function fetchAddressPointsCsv(city: City): Promise<string> {
  const source = sourcesFor(city).addressPoints;

  const fromPath = flagValue("from");
  if (fromPath) {
    console.log(`Reading ${city.name} 門牌 CSV from ${fromPath}...`);
    return stripBom(fs.readFileSync(fromPath, "utf8"));
  }

  if (source.kind === "manual") {
    throw new Error(`${city.name}: --from <csv> is required.\n${source.note}`);
  }

  const cachePath = rawCsvCachePath(city);
  if (!hasFlag("refresh") && fs.existsSync(cachePath)) {
    console.log(`Reusing cached raw CSV at ${cachePath} (pass --refresh to re-download).`);
    return stripBom(fs.readFileSync(cachePath, "utf8"));
  }

  console.log(`Finding the latest monthly ${source.snapshotNameContains} snapshot...`);
  const snapshot = await findLatestSnapshot(source);
  console.log(`Latest snapshot: ${snapshot.name}`);

  console.log("Downloading from Google Drive (this file is typically 100-150MB)...");
  const csv = await downloadGoogleDriveFile(extractGoogleDriveFileId(snapshot.driveUrl));
  fs.writeFileSync(cachePath, csv);
  console.log(`Cached raw CSV to ${cachePath}.`);
  return stripBom(csv);
}

async function main() {
  const city = cityFromArgs();
  const outputPath = outputPathFor(city, "addressPoints");
  const csv = await fetchAddressPointsCsv(city);

  console.log("Parsing address points...");
  const points = parseAddressPointsCsv(csv);
  if (points.length === 0) {
    throw new Error("Parsed 0 address points — the CSV's columns matched but every row was rejected.");
  }
  console.log(`Parsed ${points.length} address points.`);

  console.log(`Writing to ${outputPath}...`);
  const store = new AddressPointStore(outputPath);
  store.replaceAll(points);
  store.close();

  console.log(`Wrote ${points.length} ${city.name} address points to ${outputPath}.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
