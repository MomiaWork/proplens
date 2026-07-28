import type { Coordinate } from "../../src/core/geo";
import type { GeocodingClient } from "./GeocodingClient";

/**
 * In-memory address -> coordinate dictionary, used in place of a live
 * Google Maps API call in dev/tests. This is the one boundary the spec
 * calls out for stubbing; everything downstream of it (zoning, ETL,
 * aggregation) runs real logic against this fixture data.
 */
export class FixtureGeocodingClient implements GeocodingClient {
  constructor(private readonly addressBook: ReadonlyMap<string, Coordinate>) {}

  async geocode(address: string): Promise<Coordinate | null> {
    return this.addressBook.get(address) ?? null;
  }
}
