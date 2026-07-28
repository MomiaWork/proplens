import type { Coordinate } from "../../src/core/geo";
import type { GeocodingClient } from "./GeocodingClient";
import type { GeocodingCache } from "./GeocodingCache";

/**
 * Wraps any GeocodingClient with a cache lookup, so a second query for the
 * same address never re-hits the underlying API.
 */
export class CachingGeocodingClient implements GeocodingClient {
  constructor(
    private readonly inner: GeocodingClient,
    private readonly cache: GeocodingCache,
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
