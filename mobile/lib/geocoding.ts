// Mirrors src/geocoding/GoogleGeocodingClient.ts and
// CachingGeocodingClient.ts — duplicated because Metro doesn't bundle
// files outside this app's root. fetch() works the same in RN, so this is
// a near-verbatim copy; only GeocodingCache's storage moved from
// node:sqlite to expo-sqlite (see db.ts).
import type { Coordinate } from "./geo";
import type { GeocodingCache } from "./db";

export interface GeocodingClient {
  geocode(address: string): Promise<Coordinate | null>;
}

const GEOCODING_ENDPOINT = "https://geocode.googleapis.com/v4/geocode/address";

interface GeocodeAddressResponse {
  results?: Array<{
    location: { latitude: number; longitude: number };
  }>;
}

/**
 * Real Google Geocoding API (v4) client, called directly from the phone.
 * The API key ships inside the app bundle (see config.ts) — acceptable
 * for now because it's a rate-limited, no-billing Maps Demo Key (POC
 * only); this should be swapped for a proxied/restricted key before any
 * real release.
 */
export class GoogleGeocodingClient implements GeocodingClient {
  constructor(private readonly apiKey: string) {}

  async geocode(address: string): Promise<Coordinate | null> {
    const url = `${GEOCODING_ENDPOINT}/${encodeURIComponent(address)}?regionCode=TW`;

    const response = await fetch(url, {
      headers: { "X-Goog-Api-Key": this.apiKey },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Google Geocoding API request failed: ${response.status} ${response.statusText} — ${body}`);
    }

    const body = (await response.json()) as GeocodeAddressResponse;
    const location = body.results?.[0]?.location;
    if (!location) {
      return null;
    }
    return { lat: location.latitude, lon: location.longitude };
  }
}

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
