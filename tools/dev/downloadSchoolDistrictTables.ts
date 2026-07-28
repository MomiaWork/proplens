import { writeFileSync } from "node:fs";
import AdmZip from "adm-zip";
import type { SchoolDistrictRawRow } from "../../src/core/schoolDistrictLookup";

/**
 * Downloads and converts the real 臺中市國民小學/國民中學學區表 datasets
 * into the SchoolDistrictRawRow[] JSON shape src/core/schoolDistrictLookup.ts expects.
 *
 * Both catalog pages advertise a Swagger/API domain (datacenter.taichung.gov.tw)
 * that's dead — same trap as the Phase 1 zoning dataset (see ADR-0008 and
 * .scratch/school-district-lookup/research.md). The catalog UUIDs below are
 * real and stable though (they're the `/search/<uuid>` path on
 * opendata.taichung.gov.tw); found via those catalog pages that this
 * generic endpoint (reverse-engineered from the open-data portal's own
 * Nuxt.js bundle, not documented anywhere) downloads a zip of every
 * resource for a given dataset UUID — no per-file `rid` hunting needed:
 *
 *   GET /api/v1/dataset.all.resource.download?pid=<catalog-uuid>
 *
 * Usage: npx tsx tools/dev/downloadSchoolDistrictTables.ts
 */

const DATASET_DOWNLOAD_ENDPOINT = "https://opendata.taichung.gov.tw/api/v1/dataset.all.resource.download";

// 臺中市國民小學學區表 — https://opendata.taichung.gov.tw/search/2fd1209f-8df8-41c3-835a-7f0ecbf78e79
const ELEMENTARY_DATASET_UUID = "2fd1209f-8df8-41c3-835a-7f0ecbf78e79";
// 臺中市國民中學學區劃分表 — https://opendata.taichung.gov.tw/search/80eb3531-12df-457f-a9d4-f3bad33eb89d
const JUNIOR_HIGH_DATASET_UUID = "80eb3531-12df-457f-a9d4-f3bad33eb89d";

interface SchoolDistrictSource {
  label: string;
  datasetUuid: string;
  /** Column index of 學校名稱 in the real CSV (0-based). */
  schoolNameColumn: number;
  /** Column index of the 里鄰 text cell — named 學區範圍_里鄰 in the elementary CSV, 里鄰 in the junior-high one. */
  villageNeighborhoodColumn: number;
  outputPath: string;
}

const SOURCES: SchoolDistrictSource[] = [
  {
    label: "國小",
    datasetUuid: ELEMENTARY_DATASET_UUID,
    schoolNameColumn: 3,
    villageNeighborhoodColumn: 5,
    outputPath: "data/school-district-elementary.json",
  },
  {
    label: "國中",
    datasetUuid: JUNIOR_HIGH_DATASET_UUID,
    schoolNameColumn: 3,
    villageNeighborhoodColumn: 5,
    outputPath: "data/school-district-junior-high.json",
  },
];

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

// Real fields never contain an embedded ASCII comma (地址/里鄰 text uses the
// ideographic 、 as its separator instead), so this only needs to strip
// surrounding quotes — the elementary CSV is unquoted, the junior-high one
// quotes every field defensively. Same naive-split precedent as
// TaichungLvrDownloader.ts.
function parseCsvLine(line: string): string[] {
  return line.split(",").map((field) => field.trim().replace(/^"|"$/g, ""));
}

async function downloadDatasetCsv(datasetUuid: string): Promise<string> {
  const response = await fetch(`${DATASET_DOWNLOAD_ENDPOINT}?pid=${datasetUuid}`);
  if (!response.ok) {
    throw new Error(`Failed to download dataset ${datasetUuid}: ${response.status} ${response.statusText}`);
  }

  const zip = new AdmZip(Buffer.from(await response.arrayBuffer()));
  const csvEntry = zip.getEntries().find((entry) => entry.entryName.toLowerCase().endsWith(".csv"));
  if (!csvEntry) {
    throw new Error(`No CSV file found in dataset ${datasetUuid}'s zip (found: ${zip.getEntries().map((e) => e.entryName).join(", ")})`);
  }

  return stripBom(zip.readAsText(csvEntry, "utf-8"));
}

async function ingestSource(source: SchoolDistrictSource): Promise<void> {
  const csv = await downloadDatasetCsv(source.datasetUuid);
  const dataLines = csv.split("\n").slice(1).filter((line) => line.trim().length > 0);

  const rows: SchoolDistrictRawRow[] = [];
  for (const line of dataLines) {
    const columns = parseCsvLine(line);
    const schoolName = columns[source.schoolNameColumn];
    const villageNeighborhoodText = columns[source.villageNeighborhoodColumn];
    if (!schoolName || !villageNeighborhoodText) continue;
    rows.push({ schoolName, villageNeighborhoodText });
  }

  writeFileSync(source.outputPath, JSON.stringify(rows));
  console.log(`${source.label}: wrote ${rows.length} rows to ${source.outputPath}`);
}

async function main() {
  for (const source of SOURCES) {
    await ingestSource(source);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
