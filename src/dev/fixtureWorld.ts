import { fileURLToPath } from "node:url";
import { PropertyQueryService } from "../property-query/PropertyQueryService.ts";
import { AddressToZoneService } from "../address-to-zone/AddressToZoneService.ts";
import { GeoJsonZoneLookup } from "../zoning/ZoneLookup.ts";
import { FixtureGeocodingClient } from "../geocoding/FixtureGeocodingClient.ts";
import { TransactionStore } from "../transactions/TransactionStore.ts";
import { TransactionEtl } from "../transactions/TransactionEtl.ts";
import { FixtureTransactionDownloader } from "../transactions/FixtureTransactionDownloader.ts";
import type { RawTransactionRecord } from "../transactions/types.ts";
import type { Coordinate } from "../shared/Coordinate.ts";

/**
 * Shared fixture world for dev/test wiring — no live Google Maps key or
 * real Taichung GIS/實價登錄 data is available yet (see .scratch/property-zone-lookup/spec.md).
 * Used by both the black-box test suite and the local dev server
 * (src/server.ts) so the two stay in sync.
 *
 * Three 都市計畫分區 defined in ../zoning/fixtures/sample-zones.geojson —
 * 住宅區 and 商業區 share a border, 農業區 sits alone. 住宅區 has 6 valid
 * transactions (above the default sample threshold of 5), 商業區 has 1,
 * 農業區 has 2 (both below threshold).
 */

export const zoningDataPath = fileURLToPath(new URL("../zoning/fixtures/sample-zones.geojson", import.meta.url));

export const addressBook = new Map<string, Coordinate>([
  // query targets
  ["台中市住宅區示範路1號", { lat: 24.155, lon: 120.645 }], // interior of 住宅區
  ["台中市住宅區示範路2號近商業區", { lat: 24.155, lon: 120.6499 }], // 住宅區 side of the 住宅區/商業區 border
  ["台中市商業區興中路1號近住宅區", { lat: 24.155, lon: 120.6501 }], // 商業區 side of the same border
  ["台中市農業區產業道路1號", { lat: 24.2025, lon: 120.7025 }], // interior of 農業區
  ["台北市信義區信義路五段7號", { lat: 24.3, lon: 120.9 }], // geocodes fine, outside every zone
  // transaction addresses (住宅區: 6, above threshold)
  ["住宅區交易1號", { lat: 24.151, lon: 120.641 }],
  ["住宅區交易2號", { lat: 24.152, lon: 120.642 }],
  ["住宅區交易3號", { lat: 24.153, lon: 120.643 }],
  ["住宅區交易4號", { lat: 24.154, lon: 120.644 }],
  ["住宅區交易5號", { lat: 24.156, lon: 120.646 }],
  ["住宅區交易6號", { lat: 24.157, lon: 120.647 }],
  // transaction addresses (商業區: 1, below threshold)
  ["商業區交易1號", { lat: 24.151, lon: 120.651 }],
  // transaction addresses (農業區: 2, below threshold)
  ["農業區交易1號", { lat: 24.201, lon: 120.701 }],
  ["農業區交易2號", { lat: 24.202, lon: 120.702 }],
  // "台中市打字錯誤路999號" is intentionally absent, to simulate a typo'd address
]);

export const rawTransactions: RawTransactionRecord[] = [
  { address: "住宅區交易1號", transactionDateRoc: "1110101", price: 10_000_000 },
  { address: "住宅區交易2號", transactionDateRoc: "1110102", price: 11_000_000 },
  { address: "住宅區交易3號", transactionDateRoc: "1110103", price: 12_000_000 },
  { address: "住宅區交易4號", transactionDateRoc: "1110104", price: 13_000_000 },
  { address: "住宅區交易5號", transactionDateRoc: "1110105", price: 14_000_000 },
  { address: "住宅區交易6號", transactionDateRoc: "1110106", price: 15_000_000 },
  { address: "商業區交易1號", transactionDateRoc: "1110201", price: 20_000_000 },
  { address: "農業區交易1號", transactionDateRoc: "1110301", price: 5_000_000 },
  { address: "農業區交易2號", transactionDateRoc: "1110302", price: 4_800_000 },
];

export async function buildFixturePropertyQueryService(): Promise<PropertyQueryService> {
  const geocodingClient = new FixtureGeocodingClient(addressBook);
  const zoneLookup = new GeoJsonZoneLookup(zoningDataPath);
  const addressToZone = new AddressToZoneService(geocodingClient, zoneLookup);

  const store = new TransactionStore(":memory:");
  const etl = new TransactionEtl(new FixtureTransactionDownloader(rawTransactions), store);
  await etl.run();

  return new PropertyQueryService(addressToZone, store);
}
