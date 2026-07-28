// Composition root for the app: wires the expo-sqlite / expo-file-system /
// expo-location adapters into the platform-free engine in src/core. The
// test suite wires the same engine to node adapters (tests/fixtureWorld.ts),
// so what ships is what's tested.
import { AddressPointStore, TransactionStore, VillageNeighborhoodCache, GeocodingCache } from "../core/stores";
import { GeoJsonZoneLookup } from "../core/zoneLookup";
import { JsonSchoolDistrictLookup } from "../core/schoolDistrictLookup";
import { CachingGeocodingClient } from "../core/geocoding";
import {
  AddressToZoneService,
  AddressToVillageService,
  SchoolDistrictService,
  PropertyQueryService,
} from "../core/propertyQueryService";
import { enrichTransactionZones, type EnrichmentResult } from "../core/enrichTransactionZones";
import { AppleLocationGeocodingClient } from "./geocoding";
import { openDeviceDatabase } from "./sqlite";
import { deviceFileReader } from "./files";
import { localPathFor } from "./dataSync";

export type { PropertyCard, SchoolDistrictFieldResult } from "../core/propertyQueryService";
export type { EnrichmentResult } from "../core/enrichTransactionZones";

interface Engine {
  addressToZone: AddressToZoneService;
  transactionStore: TransactionStore;
  service: PropertyQueryService;
}

let cachedEngine: Engine | null = null;

function buildEngine(): Engine {
  const geocodingClient = new CachingGeocodingClient(
    new AppleLocationGeocodingClient(),
    new GeocodingCache(openDeviceDatabase("geocoding-cache.sqlite")),
  );

  const zoneLookup = new GeoJsonZoneLookup(deviceFileReader, localPathFor("taichung-zoning.geojson"));
  const addressPointStore = new AddressPointStore(openDeviceDatabase("address-points.sqlite"));
  const addressToZone = new AddressToZoneService(geocodingClient, zoneLookup, addressPointStore);

  const transactionStore = new TransactionStore(openDeviceDatabase("transactions.sqlite"));

  const villageCache = new VillageNeighborhoodCache(openDeviceDatabase("village-neighborhood-cache.sqlite"));
  const addressToVillage = new AddressToVillageService(geocodingClient, addressPointStore, villageCache);

  const elementaryLookup = new JsonSchoolDistrictLookup(
    deviceFileReader,
    localPathFor("school-district-elementary.json"),
    addressPointStore,
  );
  const juniorHighLookup = new JsonSchoolDistrictLookup(
    deviceFileReader,
    localPathFor("school-district-junior-high.json"),
    addressPointStore,
  );
  const schoolDistrictService = new SchoolDistrictService(geocodingClient, addressToVillage, elementaryLookup, juniorHighLookup);

  const service = new PropertyQueryService(addressToZone, transactionStore, schoolDistrictService);
  return { addressToZone, transactionStore, service };
}

function getEngine(forceRebuild = false): Engine {
  if (!cachedEngine || forceRebuild) {
    cachedEngine = buildEngine();
  }
  return cachedEngine;
}

/**
 * Builds (or rebuilds) the query engine against the currently-synced local
 * data files. Call with forceRebuild after syncDataIfNeeded() reports
 * updated:true — a stale cached instance would otherwise keep querying a
 * previous data snapshot's GeoJSON/SQLite connections for the rest of the
 * app session.
 */
export function getPropertyQueryService(forceRebuild = false): PropertyQueryService {
  return getEngine(forceRebuild).service;
}

/**
 * Fills in transactions.sqlite's zone_name column on-device (ADR-0012,
 * ADR-0014) — the file downloads with zone_name always NULL, since the
 * pipeline no longer geocodes it. Only unresolved rows are processed, so
 * this is a no-op on repeat calls once a snapshot is fully enriched, and
 * a run cut short by the geocoder's rate limit simply resumes next launch
 * (see enrichTransactionZones). Call once after syncDataIfNeeded().
 */
export async function enrichTransactions(
  onProgress?: (done: number, total: number) => void,
): Promise<EnrichmentResult> {
  const engine = getEngine();
  return await enrichTransactionZones(engine.transactionStore, engine.addressToZone, onProgress);
}
