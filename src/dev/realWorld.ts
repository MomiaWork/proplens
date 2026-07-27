import { GoogleGeocodingClient } from "../geocoding/GoogleGeocodingClient.ts";
import { NominatimGeocodingClient } from "../geocoding/NominatimGeocodingClient.ts";
import { CachingGeocodingClient } from "../geocoding/CachingGeocodingClient.ts";
import { GeocodingCache } from "../geocoding/GeocodingCache.ts";
import type { GeocodingClient } from "../geocoding/GeocodingClient.ts";
import { GeoJsonZoneLookup } from "../zoning/ZoneLookup.ts";
import { AddressToZoneService } from "../address-to-zone/AddressToZoneService.ts";
import { TransactionStore } from "../transactions/TransactionStore.ts";
import { TransactionEtl } from "../transactions/TransactionEtl.ts";
import { TaichungLvrDownloader } from "../transactions/TaichungLvrDownloader.ts";
import { PropertyQueryService } from "../property-query/PropertyQueryService.ts";

/**
 * Real-data composition: geocoding (Google if GOOGLE_MAPS_API_KEY is set,
 * otherwise the free Nominatim/OpenStreetMap client) + the converted
 * Taichung zoning GeoJSON (see convertZoningShpToGeoJson.ts) + a real
 * 實價登錄 ETL run against the government's live batch download. Used by
 * src/server.real.ts. Contrast with fixtureWorld.ts, which backs the
 * automated test suite and the offline demo server.
 */
export async function buildRealPropertyQueryService(): Promise<PropertyQueryService> {
  const geocodingClient = new CachingGeocodingClient(
    buildGeocodingClient(),
    new GeocodingCache("data/geocoding-cache.sqlite"),
  );
  const zoneLookup = new GeoJsonZoneLookup("data/taichung-zoning.geojson");
  const addressToZone = new AddressToZoneService(geocodingClient, zoneLookup);

  const transactionStore = new TransactionStore("data/transactions.sqlite");
  const etl = new TransactionEtl(new TaichungLvrDownloader(), transactionStore);
  await etl.run();

  return new PropertyQueryService(addressToZone, transactionStore);
}

function buildGeocodingClient(): GeocodingClient {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (apiKey) {
    console.log("Geocoding via Google Maps API.");
    return new GoogleGeocodingClient(apiKey);
  }
  console.log("GOOGLE_MAPS_API_KEY not set — falling back to free Nominatim geocoding (rate-limited to 1 req/sec).");
  return new NominatimGeocodingClient();
}
