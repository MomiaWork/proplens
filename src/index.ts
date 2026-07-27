import { GoogleGeocodingClient } from "./geocoding/GoogleGeocodingClient.ts";
import { CachingGeocodingClient } from "./geocoding/CachingGeocodingClient.ts";
import { GeocodingCache } from "./geocoding/GeocodingCache.ts";
import { GeoJsonZoneLookup } from "./zoning/ZoneLookup.ts";
import { AddressToZoneService } from "./address-to-zone/AddressToZoneService.ts";
import { TransactionStore } from "./transactions/TransactionStore.ts";
import { PropertyQueryService } from "./property-query/PropertyQueryService.ts";

export { PropertyQueryService } from "./property-query/PropertyQueryService.ts";
export type { PropertyCard } from "./property-query/PropertyQueryService.ts";

export interface ProductionConfig {
  /** Google Maps Geocoding API key (see GoogleGeocodingClient). */
  googleMapsApiKey: string;
  /** Path to the locally-downloaded 都市計畫圖(GIS)_WGS84 GeoJSON file. */
  zoningDataPath: string;
  /** SQLite file backing the geocoding cache (see ADR-0007). */
  geocodingCacheDbPath: string;
  /** SQLite file backing the 有效交易紀錄 store, populated by TransactionEtl. */
  transactionsDbPath: string;
}

/**
 * Composition root for the 物件查詢 service (spec's single seam). Wires
 * the real Google Geocoding client through the SQLite cache, and the real
 * zoning/transaction stores — as opposed to the fixture-backed wiring used
 * in tests. Not exercised by the automated test suite, since it needs a
 * live API key and a real GIS dataset (see .scratch/property-zone-lookup/spec.md).
 */
export function buildPropertyQueryService(config: ProductionConfig): PropertyQueryService {
  const geocodingClient = new CachingGeocodingClient(
    new GoogleGeocodingClient(config.googleMapsApiKey),
    new GeocodingCache(config.geocodingCacheDbPath),
  );
  const zoneLookup = new GeoJsonZoneLookup(config.zoningDataPath);
  const addressToZone = new AddressToZoneService(geocodingClient, zoneLookup);
  const transactionStore = new TransactionStore(config.transactionsDbPath);

  return new PropertyQueryService(addressToZone, transactionStore);
}
