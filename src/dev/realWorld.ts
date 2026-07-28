import { GoogleGeocodingClient } from "../geocoding/GoogleGeocodingClient.ts";
import { CachingGeocodingClient } from "../geocoding/CachingGeocodingClient.ts";
import { GeocodingCache } from "../geocoding/GeocodingCache.ts";
import { GeoJsonZoneLookup } from "../zoning/ZoneLookup.ts";
import { AddressToZoneService } from "../address-to-zone/AddressToZoneService.ts";
import { TransactionStore } from "../transactions/TransactionStore.ts";
import { TransactionEtl } from "../transactions/TransactionEtl.ts";
import { TaichungLvrDownloader } from "../transactions/TaichungLvrDownloader.ts";
import { PropertyQueryService } from "../property-query/PropertyQueryService.ts";
import { AddressPointStore } from "../address-to-village/AddressPointStore.ts";
import { VillageNeighborhoodCache } from "../address-to-village/VillageNeighborhoodCache.ts";
import { AddressToVillageService } from "../address-to-village/AddressToVillageService.ts";
import { JsonSchoolDistrictLookup } from "../school-district/SchoolDistrictLookup.ts";
import { SchoolDistrictService } from "../school-district/SchoolDistrictService.ts";

/**
 * Real-data composition: live Google Geocoding API + the converted
 * Taichung zoning GeoJSON (see convertZoningShpToGeoJson.ts) + a real
 * 實價登錄 ETL run against the government's live batch download. Used by
 * src/server.real.ts. Contrast with fixtureWorld.ts, which backs the
 * automated test suite and the offline demo server.
 *
 * School-district wiring (see .scratch/school-district-lookup/) expects
 * `data/address-points.sqlite` to already be populated from the monthly
 * 門牌 CSV, and `data/school-district-elementary.json` /
 * `data/school-district-junior-high.json` to hold the parsed 學區文字表
 * rows (see SchoolDistrictLookup.ts for the shape). None of the three
 * currently has an ingestion script — that's a follow-up to this spec, not
 * yet built. Until then, an empty/missing address-point store means every
 * query's school-district fields come back address-not-in-registry, and a
 * missing school-district JSON file throws (surfaced as a clear 500 by
 * httpServer.ts, not a silent wrong answer).
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

  const addressPointStore = new AddressPointStore("data/address-points.sqlite");
  const villageCache = new VillageNeighborhoodCache("data/village-neighborhood-cache.sqlite");
  const addressToVillage = new AddressToVillageService(geocodingClient, addressPointStore, villageCache);
  const elementaryLookup = new JsonSchoolDistrictLookup("data/school-district-elementary.json", addressPointStore);
  const juniorHighLookup = new JsonSchoolDistrictLookup("data/school-district-junior-high.json", addressPointStore);
  const schoolDistrictService = new SchoolDistrictService(geocodingClient, addressToVillage, elementaryLookup, juniorHighLookup);

  return new PropertyQueryService(addressToZone, transactionStore, schoolDistrictService);
}
