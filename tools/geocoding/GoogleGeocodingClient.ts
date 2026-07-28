import type { Coordinate } from "../../src/core/geo";
import type { GeocodingClient } from "./GeocodingClient";

const GEOCODING_ENDPOINT = "https://geocode.googleapis.com/v4/geocode/address";

interface GeocodeAddressResponse {
  results?: Array<{
    location: { latitude: number; longitude: number };
  }>;
}

/**
 * Real Google Geocoding API (v4) client. Not exercised by the automated
 * test suite (per the spec, only the geocoding API boundary is stubbed) —
 * needs GOOGLE_MAPS_API_KEY to run against the live API.
 *
 * Uses the newer v4 REST API (geocode.googleapis.com), not the classic
 * maps.googleapis.com/maps/api/geocode/json — the classic API requires a
 * billed Cloud project even within its free tier, while v4 is covered by
 * Google's no-credit-card Maps Demo Key
 * (developers.google.com/maps/demo-key). v4 has no hard
 * country/administrative-area filter equivalent to the classic API's
 * `components` param (only `regionCode` as a soft bias) — this project's
 * addresses always spell out 台中市/臺中市 in the query text itself, which
 * does the disambiguation instead.
 */
export class GoogleGeocodingClient implements GeocodingClient {
  constructor(private readonly apiKey: string) {}

  async geocode(address: string): Promise<Coordinate | null> {
    const url = new URL(`${GEOCODING_ENDPOINT}/${encodeURIComponent(address)}`);
    url.searchParams.set("regionCode", "TW");

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
