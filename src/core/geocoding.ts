import type { Coordinate } from "./geo";

/**
 * The geocoding seam — address in, coordinate out, or null when the
 * address isn't recognizable. Per the spec this is the single boundary the
 * test suite stubs; everything downstream of it runs real logic.
 */
export interface GeocodingClient {
  geocode(address: string): Promise<Coordinate | null>;
}

/**
 * Thrown when the geocoder refused the request because we're going too
 * fast, as opposed to failing on a bad address or a dead network. The
 * distinction matters to bulk work: throttling means "stop and resume
 * later" (see enrichTransactionZones), not "this address is bad".
 *
 * Platform adapters translate their own error into this — the on-device
 * geocoder's rate-limit error code is Apple's, and nothing in core should
 * have to know it (see src/device/geocoding.ts).
 */
export class GeocodingRateLimitError extends Error {
  constructor(message = "地理編碼服務暫時限制請求頻率，稍後會自動繼續。", options?: { cause?: unknown }) {
    super(message, options);
    this.name = "GeocodingRateLimitError";
  }
}

/**
 * Caches results in whatever store is passed in (ADR-0007: geocoding
 * results are cached, zone lookups are not). Null results are deliberately
 * not cached — an address that failed to geocode may well succeed later.
 */
export class CachingGeocodingClient implements GeocodingClient {
  constructor(
    private readonly inner: GeocodingClient,
    private readonly cache: {
      get(address: string): Coordinate | undefined;
      set(address: string, coordinate: Coordinate): void;
    },
  ) {}

  async geocode(address: string): Promise<Coordinate | null> {
    const cached = this.cache.get(address);
    if (cached) {
      return cached;
    }

    const result = await this.inner.geocode(address);
    if (result) {
      this.cache.set(address, result);
    }
    return result;
  }
}
