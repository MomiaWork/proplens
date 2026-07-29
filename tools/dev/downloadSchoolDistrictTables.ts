import { readFileSync, writeFileSync } from "node:fs";
import AdmZip from "adm-zip";
import type { SchoolDistrictRawRow } from "../../src/core/schoolDistrictLookup";
import type { City, DataFileKey } from "../../src/core/cities";
import { cityFromArgs, flagValue, outputPathFor } from "../cityArgs";
import { sourcesFor, type TaichungSchoolDistrictDataset } from "../citySources";

/**
 * Converts a city's 國民小學/國民中學學區表 into the SchoolDistrictRawRow[]
 * JSON shape src/core/schoolDistrictLookup.ts expects.
 *
 * 臺中市 publishes both as fetchable CSV resources (see citySources.ts for
 * the undocumented endpoint that gets at them); 新竹市 publishes PDFs, so
 * its converted CSVs are passed in by hand. Either way the output is the
 * same two JSON files.
 *
 * Usage:
 *   npm run ingest:school-districts -- --city=taichung
 *   npm run ingest:school-districts -- --city=hsinchu \
 *     --from-elementary <國小學區.csv> --from-junior-high <國中學區.csv>
 */

interface Level {
  label: string;
  outputKey: DataFileKey;
  /** Flag a hand-fetched CSV for this level is passed with. */
  fromFlag: string;
}

const LEVELS: Level[] = [
  { label: "國小", outputKey: "schoolDistrictElementary", fromFlag: "from-elementary" },
  { label: "國中", outputKey: "schoolDistrictJuniorHigh", fromFlag: "from-junior-high" },
];

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

// Real fields never contain an embedded ASCII comma (地址/里鄰 text uses the
// ideographic 、 as its separator instead), so this only needs to strip
// surrounding quotes — the elementary CSV is unquoted, the junior-high one
// quotes every field defensively. Same naive-split precedent as
// LvrDownloader.ts.
function parseCsvLine(line: string): string[] {
  return line.split(",").map((field) => field.trim().replace(/^"|"$/g, ""));
}

async function downloadDatasetCsv(endpoint: string, datasetUuid: string): Promise<string> {
  const response = await fetch(`${endpoint}?pid=${datasetUuid}`);
  if (!response.ok) {
    throw new Error(`Failed to download dataset ${datasetUuid}: ${response.status} ${response.statusText}`);
  }

  const zip = new AdmZip(Buffer.from(await response.arrayBuffer()));
  const csvEntry = zip.getEntries().find((entry) => entry.entryName.toLowerCase().endsWith(".csv"));
  if (!csvEntry) {
    throw new Error(
      `No CSV file found in dataset ${datasetUuid}'s zip (found: ${zip.getEntries().map((e) => e.entryName).join(", ")})`,
    );
  }

  return stripBom(zip.readAsText(csvEntry, "utf-8"));
}

interface ColumnLayout {
  schoolNameColumn: number;
  villageNeighborhoodColumn: number;
}

/**
 * A hand-converted CSV won't have 臺中市's column positions, so its two
 * columns are located by header name. Guessing wrong here would silently
 * produce a table of school-district rules keyed on the wrong text, so an
 * unrecognized header is an error rather than a fallback to position 0.
 */
function layoutFromHeader(headerLine: string): ColumnLayout {
  const headers = parseCsvLine(stripBom(headerLine));
  const schoolNameColumn = headers.findIndex((h) => h.includes("學校") || h.includes("校名"));
  const villageNeighborhoodColumn = headers.findIndex((h) => h.includes("里鄰") || h.includes("學區範圍"));

  if (schoolNameColumn < 0 || villageNeighborhoodColumn < 0) {
    throw new Error(
      "學區 CSV needs a 學校名稱 column and a 里鄰/學區範圍 column; neither was found in the header row.\n" +
        `Header row was: ${headers.join(", ")}`,
    );
  }
  return { schoolNameColumn, villageNeighborhoodColumn };
}

function toRows(csv: string, layout: ColumnLayout): SchoolDistrictRawRow[] {
  const dataLines = csv.split("\n").slice(1).filter((line) => line.trim().length > 0);

  const rows: SchoolDistrictRawRow[] = [];
  for (const line of dataLines) {
    const columns = parseCsvLine(line);
    const schoolName = columns[layout.schoolNameColumn];
    const villageNeighborhoodText = columns[layout.villageNeighborhoodColumn];
    if (!schoolName || !villageNeighborhoodText) continue;
    rows.push({ schoolName, villageNeighborhoodText });
  }
  return rows;
}

function fixedLayout(dataset: TaichungSchoolDistrictDataset): ColumnLayout {
  return {
    schoolNameColumn: dataset.schoolNameColumn,
    villageNeighborhoodColumn: dataset.villageNeighborhoodColumn,
  };
}

async function ingestLevel(city: City, level: Level): Promise<void> {
  const source = sourcesFor(city).schoolDistricts;
  const fromPath = flagValue(level.fromFlag);

  let csv: string;
  let layout: ColumnLayout;

  if (fromPath) {
    csv = stripBom(readFileSync(fromPath, "utf8"));
    layout = layoutFromHeader(csv.split("\n")[0] ?? "");
  } else if (source.kind === "manual") {
    throw new Error(`${city.name} ${level.label}: --${level.fromFlag} <csv> is required.\n${source.note}`);
  } else {
    const dataset = level.outputKey === "schoolDistrictElementary" ? source.elementary : source.juniorHigh;
    csv = await downloadDatasetCsv(source.datasetDownloadEndpoint, dataset.datasetUuid);
    layout = fixedLayout(dataset);
  }

  const rows = toRows(csv, layout);
  if (rows.length === 0) {
    throw new Error(`${city.name} ${level.label}: parsed 0 rows — check the source CSV's columns.`);
  }

  const outputPath = outputPathFor(city, level.outputKey);
  writeFileSync(outputPath, JSON.stringify(rows));
  console.log(`${city.name} ${level.label}: wrote ${rows.length} rows to ${outputPath}`);
}

async function main() {
  const city = cityFromArgs();
  for (const level of LEVELS) {
    await ingestLevel(city, level);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
