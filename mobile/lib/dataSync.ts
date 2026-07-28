// Downloads the pre-built reference data (門牌/都市計畫/學區/實價登錄
// snapshots) from this project's GitHub Releases and caches it in the
// app's local storage, so the query engine (propertyQueryService.ts) can
// run entirely on-device without any backend. The computer's role is now
// just an occasional batch step: run `npm run ingest:*` / `convert:zoning`
// then `gh release upload` — never a live server the phone talks to.
// expo-file-system v19 replaced this API with a File/Directory class
// model; `/legacy` keeps the documentDirectory/downloadAsync-style API
// this module is written against.
import * as FileSystem from "expo-file-system/legacy";

const REPO = "MomiaWork/proplens";
const RELEASE_API_URL = `https://api.github.com/repos/${REPO}/releases/latest`;

const SQLITE_DIRECTORY = `${FileSystem.documentDirectory}SQLite/`;
const VERSION_FILE_PATH = `${FileSystem.documentDirectory}data-version.json`;

interface DataFile {
  name: string;
  /** SQLite files must live in SQLITE_DIRECTORY for expo-sqlite's default openDatabaseSync() to find them by name. */
  isSqlite: boolean;
}

const DATA_FILES: DataFile[] = [
  { name: "address-points.sqlite", isSqlite: true },
  { name: "transactions.sqlite", isSqlite: true },
  { name: "taichung-zoning.geojson", isSqlite: false },
  { name: "school-district-elementary.json", isSqlite: false },
  { name: "school-district-junior-high.json", isSqlite: false },
];

interface GitHubReleaseAsset {
  name: string;
  browser_download_url: string;
}

interface GitHubRelease {
  tag_name: string;
  assets: GitHubReleaseAsset[];
}

export interface SyncResult {
  updated: boolean;
  tag: string;
}

export function localPathFor(fileName: string): string {
  const file = DATA_FILES.find((f) => f.name === fileName);
  if (!file) {
    throw new Error(`Unknown data file: ${fileName}`);
  }
  return file.isSqlite ? `${SQLITE_DIRECTORY}${fileName}` : `${FileSystem.documentDirectory}${fileName}`;
}

/**
 * Checks the latest GitHub Release against the locally cached tag; if
 * they differ (or any expected file is missing), downloads every file
 * fresh. Call this on app launch — per ADR-0009/0012, these files are
 * refreshed as a whole snapshot, not incrementally, so a partial download
 * from an interrupted sync must not be treated as "up to date".
 */
export async function syncDataIfNeeded(onProgress?: (message: string) => void): Promise<SyncResult> {
  onProgress?.("檢查資料更新...");
  const response = await fetch(RELEASE_API_URL);
  if (!response.ok) {
    throw new Error(`Failed to check for data updates: ${response.status} ${response.statusText}`);
  }
  const release = (await response.json()) as GitHubRelease;

  const currentTag = await readLocalTag();
  if (currentTag === release.tag_name && (await allFilesPresent())) {
    return { updated: false, tag: release.tag_name };
  }

  await FileSystem.makeDirectoryAsync(SQLITE_DIRECTORY, { intermediates: true }).catch(() => {});

  // Download to temporary names first, so a mid-sync failure leaves the
  // previous (still-consistent) snapshot in place rather than a mix of
  // old and new files.
  const downloaded: Array<{ tempPath: string; finalPath: string }> = [];
  for (const file of DATA_FILES) {
    const asset = release.assets.find((a) => a.name === file.name);
    if (!asset) {
      throw new Error(`Release ${release.tag_name} is missing expected asset: ${file.name}`);
    }
    onProgress?.(`下載 ${file.name}...`);
    const finalPath = localPathFor(file.name);
    const tempPath = `${finalPath}.download`;
    await FileSystem.downloadAsync(asset.browser_download_url, tempPath);
    downloaded.push({ tempPath, finalPath });
  }

  for (const { tempPath, finalPath } of downloaded) {
    await FileSystem.deleteAsync(finalPath, { idempotent: true });
    await FileSystem.moveAsync({ from: tempPath, to: finalPath });
  }

  await writeLocalTag(release.tag_name);
  return { updated: true, tag: release.tag_name };
}

async function readLocalTag(): Promise<string | null> {
  const info = await FileSystem.getInfoAsync(VERSION_FILE_PATH);
  if (!info.exists) {
    return null;
  }
  const content = await FileSystem.readAsStringAsync(VERSION_FILE_PATH);
  return (JSON.parse(content) as { tag: string }).tag;
}

async function writeLocalTag(tag: string): Promise<void> {
  await FileSystem.writeAsStringAsync(VERSION_FILE_PATH, JSON.stringify({ tag }));
}

async function allFilesPresent(): Promise<boolean> {
  for (const file of DATA_FILES) {
    const info = await FileSystem.getInfoAsync(localPathFor(file.name));
    if (!info.exists) {
      return false;
    }
  }
  return true;
}
