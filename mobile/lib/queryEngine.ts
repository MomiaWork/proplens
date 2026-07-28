// Composition root for the on-device query engine — mirrors
// src/dev/realWorld.ts's role, but wires expo-sqlite/expo-file-system
// instead of node:sqlite/node:fs, uses the free on-device geocoder instead
// of Google (ADR-0014), and never talks to a backend server.
import * as SQLite from "expo-sqlite";
import { AddressPointStore, TransactionStore, VillageNeighborhoodCache, GeocodingCache } from "./db";
import { GeoJsonZoneLookup } from "./zoneLookup";
import { JsonSchoolDistrictLookup } from "./schoolDistrictLookup";
import { AppleLocationGeocodingClient, CachingGeocodingClient } from "./geocoding";
import {
  AddressToZoneService,
  AddressToVillageService,
  SchoolDistrictService,
  PropertyQueryService,
} from "./propertyQueryService";
import { enrichTransactionZones } from "./enrichTransactionZones";
import { localPathFor } from "./dataSync";

export type { PropertyCard, SchoolDistrictFieldResult } from "./propertyQueryService";

interface Engine {
  addressToZone: AddressToZoneService;
  transactionStore: TransactionStore;
  service: PropertyQueryService;
}

let cachedEngine: Engine | null = null;

function buildEngine(): Engine {
  const geocodingClient = new CachingGeocodingClient(
    new AppleLocationGeocodingClient(),
    new GeocodingCache(SQLite.openDatabaseSync("geocoding-cache.sqlite")),
  );

  const zoneLookup = new GeoJsonZoneLookup(localPathFor("taichung-zoning.geojson"));
  const addressToZone = new AddressToZoneService(geocodingClient, zoneLookup);

  const transactionStore = new TransactionStore(SQLite.openDatabaseSync("transactions.sqlite"));

  const addressPointStore = new AddressPointStore(SQLite.openDatabaseSync("address-points.sqlite"));
  const villageCache = new VillageNeighborhoodCache(SQLite.openDatabaseSync("village-neighborhood-cache.sqlite"));
  const addressToVillage = new AddressToVillageService(geocodingClient, addressPointStore, villageCache);

  const elementaryLookup = new JsonSchoolDistrictLookup(localPathFor("school-district-elementary.json"), addressPointStore);
  const juniorHighLookup = new JsonSchoolDistrictLookup(localPathFor("school-district-junior-high.json"), addressPointStore);
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
 * server no longer geocodes it. Only unresolved rows are processed, so
 * this is a no-op on repeat calls once a snapshot is fully enriched. Call
 * once after syncDataIfNeeded(), before letting the user query.
 */
export async function enrichTransactions(onProgress?: (done: number, total: number) => void): Promise<void> {
  const engine = getEngine();
  await enrichTransactionZones(engine.transactionStore, engine.addressToZone, onProgress);
}
