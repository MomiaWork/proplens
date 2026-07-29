// Downloads the pre-built reference data (門牌/都市計畫/學區/實價登錄
// snapshots) from this project's GitHub Releases and caches it in the
// app's local storage, so the query engine (propertyQueryService.ts) can
// run entirely on-device without any backend. The computer's role is now
// just an occasional batch step: run `npm run ingest:*` / `convert:zoning`
// then `gh release upload` — never a live server the phone talks to.
//
// Downloads are per 縣市 (ADR-0017): one release carries every supported
// city's files, and the phone only fetches the ~200MB belonging to the
// city the user picked, on the launch they first pick it.
//
// expo-file-system v19 replaced this API with a File/Directory class
// model; `/legacy` keeps the documentDirectory/downloadAsync-style API
// this module is written against.
import * as FileSystem from "expo-file-system/legacy";
import { DATA_FILE_KEYS, dataFileName, type City, type CityId, type DataFileKey } from "../core/cities";

const REPO = "MomiaWork/proplens";
const RELEASE_API_URL = `https://api.github.com/repos/${REPO}/releases/latest`;

const SQLITE_DIRECTORY = `${FileSystem.documentDirectory}SQLite/`;
const VERSION_FILE_PATH = `${FileSystem.documentDirectory}data-versions.json`;

/** SQLite files must live in SQLITE_DIRECTORY for expo-sqlite's default openDatabaseSync() to find them by name. */
const SQLITE_KEYS: readonly DataFileKey[] = ["addressPoints", "transactions"];

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

export interface SyncProgress {
  message: string;
  /** 0–1 when the step's size is known; omitted when it isn't measurable. */
  ratio?: number;
}

/**
 * The release exists but carries nothing for this city — the distinction
 * that matters to the UI, since it's permanent until someone publishes
 * that city's files, not something retrying will fix.
 */
export class CityDataNotPublishedError extends Error {
  constructor(
    readonly city: City,
    readonly tag: string,
    readonly missingFiles: string[],
  ) {
    super(`Release ${tag} carries no data for ${city.name} (missing: ${missingFiles.join(", ")})`);
    this.name = "CityDataNotPublishedError";
  }
}

/**
 * The download callback fires far more often than the UI needs; re-rendering
 * on every one of them just burns frames on a 200MB file.
 */
const PROGRESS_UPDATE_INTERVAL_MS = 200;

function formatMegabytes(bytes: number): string {
  return `${Math.round(bytes / 1_000_000)}MB`;
}

export function localPathFor(city: City, key: DataFileKey): string {
  const name = dataFileName(city, key);
  return SQLITE_KEYS.includes(key) ? `${SQLITE_DIRECTORY}${name}` : `${FileSystem.documentDirectory}${name}`;
}

/**
 * Checks the latest GitHub Release against the tag cached for this city;
 * if they differ (or any of the city's files is missing), downloads all
 * five fresh. Call this whenever the selected city changes — per
 * ADR-0009/0012 these files are refreshed as a whole snapshot, not
 * incrementally, so a partial download from an interrupted sync must not
 * be treated as "up to date".
 *
 * Throws CityDataNotPublishedError when the release has no assets for the
 * city; the previously synced city's files are left untouched either way.
 */
export async function syncCityDataIfNeeded(
  city: City,
  onProgress?: (progress: SyncProgress) => void,
): Promise<SyncResult> {
  onProgress?.({ message: "檢查資料更新..." });
  const response = await fetch(RELEASE_API_URL);
  if (!response.ok) {
    throw new Error(`Failed to check for data updates: ${response.status} ${response.statusText}`);
  }
  const release = (await response.json()) as GitHubRelease;

  const versions = await readLocalVersions();
  if (versions[city.id] === release.tag_name && (await allFilesPresent(city))) {
    return { updated: false, tag: release.tag_name };
  }

  // Check every asset before downloading any of them, so a city that was
  // never published fails immediately instead of part-way through 200MB.
  const missing = DATA_FILE_KEYS.filter((key) => !release.assets.some((a) => a.name === dataFileName(city, key))).map(
    (key) => dataFileName(city, key),
  );
  if (missing.length > 0) {
    throw new CityDataNotPublishedError(city, release.tag_name, missing);
  }

  await FileSystem.makeDirectoryAsync(SQLITE_DIRECTORY, { intermediates: true }).catch(() => {});

  // Download to temporary names first, so a mid-sync failure leaves the
  // previous (still-consistent) snapshot in place rather than a mix of
  // old and new files.
  const downloaded: Array<{ tempPath: string; finalPath: string }> = [];
  for (const [index, key] of DATA_FILE_KEYS.entries()) {
    const name = dataFileName(city, key);
    const asset = release.assets.find((a) => a.name === name)!;

    const label = `下載${city.displayName}資料 (${index + 1}/${DATA_FILE_KEYS.length})`;
    onProgress?.({ message: `${label} ${name}`, ratio: 0 });

    const finalPath = localPathFor(city, key);
    const tempPath = `${finalPath}.download`;
    let lastUpdateAt = 0;

    const download = FileSystem.createDownloadResumable(
      asset.browser_download_url,
      tempPath,
      {},
      ({ totalBytesWritten, totalBytesExpectedToWrite }) => {
        const now = Date.now();
        if (now - lastUpdateAt < PROGRESS_UPDATE_INTERVAL_MS) {
          return;
        }
        lastUpdateAt = now;

        // -1 means the server sent no Content-Length, so there's no honest
        // percentage to show — report bytes so far and leave the bar out.
        if (totalBytesExpectedToWrite > 0) {
          onProgress?.({
            message: `${label} ${name}\n${formatMegabytes(totalBytesWritten)} / ${formatMegabytes(totalBytesExpectedToWrite)}`,
            ratio: totalBytesWritten / totalBytesExpectedToWrite,
          });
        } else {
          onProgress?.({ message: `${label} ${name}\n已下載 ${formatMegabytes(totalBytesWritten)}` });
        }
      },
    );
    await download.downloadAsync();
    downloaded.push({ tempPath, finalPath });
  }

  for (const { tempPath, finalPath } of downloaded) {
    await FileSystem.deleteAsync(finalPath, { idempotent: true });
    await FileSystem.moveAsync({ from: tempPath, to: finalPath });
  }

  await writeLocalVersion(city.id, release.tag_name);
  return { updated: true, tag: release.tag_name };
}

/**
 * Tag per city rather than one tag for the whole app: a release that only
 * adds a new city shouldn't force everyone who looks at the old one to
 * re-download its snapshot unchanged.
 */
type LocalVersions = Partial<Record<CityId, string>>;

async function readLocalVersions(): Promise<LocalVersions> {
  const info = await FileSystem.getInfoAsync(VERSION_FILE_PATH);
  if (!info.exists) {
    return {};
  }
  const content = await FileSystem.readAsStringAsync(VERSION_FILE_PATH);
  return JSON.parse(content) as LocalVersions;
}

async function writeLocalVersion(cityId: CityId, tag: string): Promise<void> {
  const versions = await readLocalVersions();
  versions[cityId] = tag;
  await FileSystem.writeAsStringAsync(VERSION_FILE_PATH, JSON.stringify(versions));
}

async function allFilesPresent(city: City): Promise<boolean> {
  for (const key of DATA_FILE_KEYS) {
    const info = await FileSystem.getInfoAsync(localPathFor(city, key));
    if (!info.exists) {
      return false;
    }
  }
  return true;
}
