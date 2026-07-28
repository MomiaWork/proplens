// Composition root for the on-device query engine — mirrors
// src/dev/realWorld.ts's role, but wires expo-sqlite/expo-file-system
// instead of node:sqlite/node:fs, and never talks to a backend server.
import * as SQLite from "expo-sqlite";
import { AddressPointStore, TransactionStore, VillageNeighborhoodCache, GeocodingCache } from "./db";
import { GeoJsonZoneLookup } from "./zoneLookup";
import { JsonSchoolDistrictLookup } from "./schoolDistrictLookup";
import { GoogleGeocodingClient, CachingGeocodingClient } from "./geocoding";
import {
  AddressToZoneService,
  AddressToVillageService,
  SchoolDistrictService,
  PropertyQueryService,
} from "./propertyQueryService";
import { localPathFor } from "./dataSync";
import { GOOGLE_MAPS_API_KEY } from "../config";

export type { PropertyCard, SchoolDistrictFieldResult } from "./propertyQueryService";

let cachedService: PropertyQueryService | null = null;

/**
 * Builds (or rebuilds) the query engine against the currently-synced local
 * data files. Call with forceRebuild after syncDataIfNeeded() reports
 * updated:true — a stale cached instance would otherwise keep querying a
 * previous data snapshot's GeoJSON/SQLite connections for the rest of the
 * app session.
 */
export function getPropertyQueryService(forceRebuild = false): PropertyQueryService {
  if (cachedService && !forceRebuild) {
    return cachedService;
  }

  const geocodingClient = new CachingGeocodingClient(
    new GoogleGeocodingClient(GOOGLE_MAPS_API_KEY),
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

  cachedService = new PropertyQueryService(addressToZone, transactionStore, schoolDistrictService);
  return cachedService;
}
