import { GoogleGeocodingClient } from "../geocoding/GoogleGeocodingClient";
import { CachingGeocodingClient } from "../geocoding/CachingGeocodingClient";
import { GeocodingCache } from "../geocoding/GeocodingCache";
import { GeoJsonZoneLookup } from "../zoning/ZoneLookup";
import { AddressToZoneService } from "../address-to-zone/AddressToZoneService";
import { TransactionStore } from "../transactions/TransactionStore";
import { TransactionEtl } from "../transactions/TransactionEtl";
import { TaichungLvrDownloader } from "../transactions/TaichungLvrDownloader";
import { PropertyQueryService } from "../property-query/PropertyQueryService";
import { AddressPointStore } from "../address-to-village/AddressPointStore";
import { VillageNeighborhoodCache } from "../address-to-village/VillageNeighborhoodCache";
import { AddressToVillageService } from "../address-to-village/AddressToVillageService";
import { JsonSchoolDistrictLookup } from "../school-district/SchoolDistrictLookup";
import { SchoolDistrictService } from "../school-district/SchoolDistrictService";

/**
 * Real-data composition: live Google Geocoding API + the converted
 * Taichung zoning GeoJSON (see convertZoningShpToGeoJson.ts) + a real
 * 實價登錄 ETL run against the government's live batch download. Used by
 * tools/server.real.ts. Contrast with fixtureWorld.ts, which backs the
 * automated test suite and the offline demo server.
 *
 * School-district wiring (see .scratch/school-district-lookup/) expects
 * `data/address-points.sqlite`, `data/school-district-elementary.json`,
 * and `data/school-district-junior-high.json` to exist — run
 * `npm run ingest:address-points` and `npm run ingest:school-districts`
 * first (see tools/dev/downloadAddressPoints.ts and
 * downloadSchoolDistrictTables.ts). Both download real government data
 * directly (no manual shapefile-extraction step needed, unlike zoning). If
 * either hasn't been run yet, missing data files throw a clear error,
 * surfaced as a 500 by httpServer.ts rather than a silent wrong answer.
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
  const addressPointStore = new AddressPointStore("data/address-points.sqlite");
  const addressToZone = new AddressToZoneService(geocodingClient, zoneLookup, addressPointStore);

  const transactionStore = new TransactionStore("data/transactions.sqlite");
  const etl = new TransactionEtl(new TaichungLvrDownloader(), transactionStore);
  await etl.run();
  // zone_name is intentionally left NULL here — per ADR-0014, transaction-zone
  // enrichment moved to the phone (src/device/enrichTransactionZones.ts), using
  // the free on-device geocoder, so the published transactions.sqlite snapshot
  // no longer needs Google at all. This dev server's own same-zone queries will
  // see 0 results until something enriches this local file; that's expected —
  // this composition exists for ad hoc computer-side testing, not for producing
  // the file that ships in the GitHub Release.

  const villageCache = new VillageNeighborhoodCache("data/village-neighborhood-cache.sqlite");
  const addressToVillage = new AddressToVillageService(geocodingClient, addressPointStore, villageCache);
  const elementaryLookup = new JsonSchoolDistrictLookup("data/school-district-elementary.json", addressPointStore);
  const juniorHighLookup = new JsonSchoolDistrictLookup("data/school-district-junior-high.json", addressPointStore);
  const schoolDistrictService = new SchoolDistrictService(geocodingClient, addressToVillage, elementaryLookup, juniorHighLookup);

  return new PropertyQueryService(addressToZone, transactionStore, schoolDistrictService);
}
