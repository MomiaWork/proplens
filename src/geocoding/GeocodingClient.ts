import type { Coordinate } from "../shared/Coordinate.ts";

/**
 * Address -> Coordinate, or null when the address can't be resolved
 * (Geocoding API returned no result). Network/API failures should reject
 * the promise rather than resolving to null, so callers can tell "address
 * doesn't exist" apart from "the service is down".
 */
export interface GeocodingClient {
  geocode(address: string): Promise<Coordinate | null>;
}
