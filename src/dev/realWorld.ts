import { GoogleGeocodingClient } from "../geocoding/GoogleGeocodingClient.ts";
import { CachingGeocodingClient } from "../geocoding/CachingGeocodingClient.ts";
import { GeocodingCache } from "../geocoding/GeocodingCache.ts";
import { GeoJsonZoneLookup } from "../zoning/ZoneLookup.ts";
import { AddressToZoneService } from "../address-to-zone/AddressToZoneService.ts";
import { TransactionStore } from "../transactions/TransactionStore.ts";
import { TransactionEtl } from "../transactions/TransactionEtl.ts";
import { TaichungLvrDownloader } from "../transactions/TaichungLvrDownloader.ts";
import { PropertyQueryService } from "../property-query/PropertyQueryService.ts";

/**
 * Real-data composition: live Google Geocoding API + the converted
 * Taichung zoning GeoJSON (see convertZoningShpToGeoJson.ts) + a real
 * 實價登錄 ETL run against the government's live batch download. Used by
 * src/server.real.ts. Contrast with fixtureWorld.ts, which backs the
 * automated test suite and the offline demo server.
 */
export async function buildRealPropertyQueryService(): Promise<PropertyQueryService> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GOOGLE_MAPS_API_KEY is not set. Create a .env file in the repo root with GOOGLE_MAPS_API_KEY=... " +
        "and run with `tsx --env-file-if-exists=.env`.",
    );
  }

  const geocodingClient = new CachingGeocodingClient(
    new GoogleGeocodingClient(apiKey),
    new GeocodingCache("data/geocoding-cache.sqlite"),
  );
  const zoneLookup = new GeoJsonZoneLookup("data/taichung-zoning.geojson");
  const addressToZone = new AddressToZoneService(geocodingClient, zoneLookup);

  const transactionStore = new TransactionStore("data/transactions.sqlite");
  const etl = new TransactionEtl(new TaichungLvrDownloader(), transactionStore);
  await etl.run();

  return new PropertyQueryService(addressToZone, transactionStore);
}
