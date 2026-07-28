// The on-device geocoder: expo-location's geocodeAsync (Apple/Android's
// own, the same service iOS Shortcuts' "Get Details of Location" action
// uses) — free, no quota, no API key shipped in the app bundle. See
// ADR-0014 for why the app no longer calls Google at all.
import * as Location from "expo-location";
import type { Coordinate } from "../core/geo";
import { type GeocodingClient, GeocodingRateLimitError } from "../core/geocoding";

// CLGeocoder is "on-device" only in the sense that it needs no API key or
// server of ours — it still round-trips to Apple's map servers, and Apple
// rate-limits it per app, surfacing ERR_GEOCODING_NETWORK when exceeded.
// Apple doesn't document the ceiling; the widely reported observed figure
// is ~50 requests per 60s, so we pace every request at least
// MIN_REQUEST_INTERVAL_MS apart (~40/min) and serialize them, which is what
// keeps bulk zone enrichment (enrichTransactionZones.ts, several hundred
// addresses) under the limit rather than tripping it within seconds.
const RATE_LIMIT_ERROR_CODE = "ERR_GEOCODING_NETWORK";
const MIN_REQUEST_INTERVAL_MS = 1500;
const MAX_RATE_LIMIT_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 5000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** True for the throttling error specifically, as opposed to a bad address or no network. */
function isAppleRateLimitError(err: unknown): boolean {
  return (err as { code?: string })?.code === RATE_LIMIT_ERROR_CODE;
}

export class AppleLocationGeocodingClient implements GeocodingClient {
  private permissionGranted: boolean | null = null;
  /** Tail of the request chain — every geocode() links onto it, so calls never overlap. */
  private queue: Promise<unknown> = Promise.resolve();
  private lastRequestAt = 0;

  async geocode(address: string): Promise<Coordinate | null> {
    const run = this.queue.then(() => this.geocodeNow(address));
    // Keep the chain alive even when this call rejects, so one failure
    // doesn't poison the pacing for every request queued behind it.
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async geocodeNow(address: string): Promise<Coordinate | null> {
    if (this.permissionGranted === null) {
      const { status } = await Location.requestForegroundPermissionsAsync();
      this.permissionGranted = status === "granted";
    }
    if (!this.permissionGranted) {
      throw new Error("沒有位置權限，無法把地址轉換成座標。請到系統設定開啟後再試一次。");
    }

    for (let attempt = 0; ; attempt++) {
      const sinceLast = Date.now() - this.lastRequestAt;
      if (sinceLast < MIN_REQUEST_INTERVAL_MS) {
        await sleep(MIN_REQUEST_INTERVAL_MS - sinceLast);
      }

      try {
        this.lastRequestAt = Date.now();
        const [result] = await Location.geocodeAsync(address);
        return result ? { lat: result.latitude, lon: result.longitude } : null;
      } catch (err) {
        this.lastRequestAt = Date.now();
        if (!isAppleRateLimitError(err)) {
          throw err;
        }
        if (attempt >= MAX_RATE_LIMIT_RETRIES) {
          // Out of retries: hand core the domain error it knows how to
          // stop-and-resume on, so Apple's error code stays in this file.
          throw new GeocodingRateLimitError(undefined, { cause: err });
        }
        // Already throttled — back off well past the pacing interval.
        await sleep(RETRY_BASE_DELAY_MS * 2 ** attempt);
      }
    }
  }
}
