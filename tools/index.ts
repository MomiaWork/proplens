import { GoogleGeocodingClient } from "./geocoding/GoogleGeocodingClient";
import { CachingGeocodingClient } from "./geocoding/CachingGeocodingClient";
import { GeocodingCache } from "./geocoding/GeocodingCache";
import { GeoJsonZoneLookup } from "./zoning/ZoneLookup";
import { AddressToZoneService } from "./address-to-zone/AddressToZoneService";
import { TransactionStore } from "./transactions/TransactionStore";
import { PropertyQueryService } from "./property-query/PropertyQueryService";
import { AddressPointStore } from "./address-to-village/AddressPointStore";
import { VillageNeighborhoodCache } from "./address-to-village/VillageNeighborhoodCache";
import { AddressToVillageService } from "./address-to-village/AddressToVillageService";
import { JsonSchoolDistrictLookup } from "./school-district/SchoolDistrictLookup";
import { SchoolDistrictService } from "./school-district/SchoolDistrictService";

export { PropertyQueryService } from "./property-query/PropertyQueryService";
export type { PropertyCard } from "./property-query/PropertyQueryService";

export interface ProductionConfig {
  /** Google Maps Geocoding API key (see GoogleGeocodingClient). */
  googleMapsApiKey: string;
  /** Path to the locally-downloaded 都市計畫圖(GIS)_WGS84 GeoJSON file. */
  zoningDataPath: string;
  /** SQLite file backing the geocoding cache (see ADR-0007). */
  geocodingCacheDbPath: string;
  /** SQLite file backing the 有效交易紀錄 store, populated by TransactionEtl. */
  transactionsDbPath: string;
  /** SQLite file backing the 門牌 (house-number) address-point dataset (see ADR-0008). */
  addressPointsDbPath: string;
  /** SQLite file backing the address -> 里/鄰 cache (see ADR-0009). */
  villageNeighborhoodCacheDbPath: string;
  /** Path to the parsed 國小學區表 JSON (see SchoolDistrictLookup). */
  elementarySchoolDistrictDataPath: string;
  /** Path to the parsed 國中學區表 JSON (see SchoolDistrictLookup). */
  juniorHighSchoolDistrictDataPath: string;
}

/**
 * Composition root for the 物件查詢 service (spec's single seam). Wires
 * the real Google Geocoding client through the SQLite cache, and the real
 * zoning/transaction/school-district stores — as opposed to the
 * fixture-backed wiring used in tests. Not exercised by the automated test
 * suite, since it needs a live API key and real datasets (see
 * .scratch/property-zone-lookup/spec.md and
 * .scratch/school-district-lookup/spec.md).
 */
export function buildPropertyQueryService(config: ProductionConfig): PropertyQueryService {
  const geocodingClient = new CachingGeocodingClient(
    new GoogleGeocodingClient(config.googleMapsApiKey),
    new GeocodingCache(config.geocodingCacheDbPath),
  );
  const zoneLookup = new GeoJsonZoneLookup(config.zoningDataPath);
  const transactionStore = new TransactionStore(config.transactionsDbPath);

  const addressPointStore = new AddressPointStore(config.addressPointsDbPath);
  const addressToZone = new AddressToZoneService(geocodingClient, zoneLookup, addressPointStore);
  const villageCache = new VillageNeighborhoodCache(config.villageNeighborhoodCacheDbPath);
  const addressToVillage = new AddressToVillageService(geocodingClient, addressPointStore, villageCache);
  const elementaryLookup = new JsonSchoolDistrictLookup(config.elementarySchoolDistrictDataPath, addressPointStore);
  const juniorHighLookup = new JsonSchoolDistrictLookup(config.juniorHighSchoolDistrictDataPath, addressPointStore);
  const schoolDistrictService = new SchoolDistrictService(geocodingClient, addressToVillage, elementaryLookup, juniorHighLookup);

  return new PropertyQueryService(addressToZone, transactionStore, schoolDistrictService);
}
