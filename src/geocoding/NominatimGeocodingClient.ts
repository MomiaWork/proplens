import type { Coordinate } from "../shared/Coordinate.ts";
import type { GeocodingClient } from "./GeocodingClient.ts";

const NOMINATIM_ENDPOINT = "https://nominatim.openstreetmap.org/search";
const MIN_REQUEST_INTERVAL_MS = 1000; // Nominatim's usage policy: max 1 request/second.

interface NominatimResult {
  lat: string;
  lon: string;
}

/**
 * Free OpenStreetMap geocoding, used as a fallback when no
 * GOOGLE_MAPS_API_KEY is configured. Restricted to Taiwan
 * (`countrycodes=tw`); addresses in this project's data always include
 * "台中市"/"臺中市" already, so no further city biasing is applied.
 *
 * Self-throttles to Nominatim's public-instance usage policy (max 1
 * request/second, identifying User-Agent) — this is a shared community
 * server, not a dedicated API, so callers of `geocode` may see up to ~1s
 * of added latency per uncached address.
 */
export class NominatimGeocodingClient implements GeocodingClient {
  private nextRequestAt = 0;

  async geocode(address: string): Promise<Coordinate | null> {
    await this.waitForRateLimit();

    const url = new URL(NOMINATIM_ENDPOINT);
    url.searchParams.set("format", "json");
    url.searchParams.set("q", address);
    url.searchParams.set("countrycodes", "tw");
    url.searchParams.set("limit", "1");

    const response = await fetch(url, {
      headers: { "User-Agent": "PropLens-POC/0.1 (local dev/test use)" },
    });
    if (!response.ok) {
      throw new Error(`Nominatim request failed: ${response.status} ${response.statusText}`);
    }

    const results = (await response.json()) as NominatimResult[];
    const first = results[0];
    if (!first) {
      return null;
    }
    return { lat: Number(first.lat), lon: Number(first.lon) };
  }

  private async waitForRateLimit(): Promise<void> {
    const now = Date.now();
    const waitMs = this.nextRequestAt - now;
    this.nextRequestAt = Math.max(now, this.nextRequestAt) + MIN_REQUEST_INTERVAL_MS;
    if (waitMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
}
