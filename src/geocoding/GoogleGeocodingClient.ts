import type { Coordinate } from "../shared/Coordinate.ts";
import type { GeocodingClient } from "./GeocodingClient.ts";

const GEOCODING_ENDPOINT = "https://maps.googleapis.com/maps/api/geocode/json";

interface GoogleGeocodeResponse {
  status: string;
  results: Array<{
    geometry: { location: { lat: number; lng: number } };
  }>;
}

/**
 * Real Google Maps Geocoding API client. Not exercised by the automated
 * test suite (per the spec, only the geocoding API boundary is stubbed) —
 * needs GOOGLE_MAPS_API_KEY to run against the live API.
 *
 * Queries are constrained to 台中市 (`components=administrative_area:台中市|country:TW`)
 * so a same-named road in another county doesn't get geocoded by mistake.
 */
export class GoogleGeocodingClient implements GeocodingClient {
  constructor(private readonly apiKey: string) {}

  async geocode(address: string): Promise<Coordinate | null> {
    const url = new URL(GEOCODING_ENDPOINT);
    url.searchParams.set("address", address);
    url.searchParams.set("components", "administrative_area:台中市|country:TW");
    url.searchParams.set("region", "tw");
    url.searchParams.set("key", this.apiKey);

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Google Geocoding API request failed: ${response.status} ${response.statusText}`);
    }

    const body = (await response.json()) as GoogleGeocodeResponse;

    if (body.status === "ZERO_RESULTS") {
      return null;
    }
    if (body.status !== "OK") {
      throw new Error(`Google Geocoding API returned status ${body.status}`);
    }

    const location = body.results[0]?.geometry.location;
    if (!location) {
      return null;
    }
    return { lat: location.lat, lon: location.lng };
  }
}
