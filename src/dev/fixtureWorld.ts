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
import { AddressPointStore, type AddressPoint } from "../address-to-village/AddressPointStore.ts";
import { VillageNeighborhoodCache } from "../address-to-village/VillageNeighborhoodCache.ts";
import { AddressToVillageService } from "../address-to-village/AddressToVillageService.ts";
import { SchoolDistrictLookup } from "../school-district/SchoolDistrictLookup.ts";
import { SchoolDistrictService } from "../school-district/SchoolDistrictService.ts";

/**
 * Shared fixture world for dev/test wiring — no live Google Maps key or
 * real Taichung GIS/實價登錄/門牌/學區 data is available yet (see
 * .scratch/property-zone-lookup/spec.md and .scratch/school-district-lookup/spec.md).
 * Used by both the black-box test suite and the local dev server
 * (src/server.ts) so the two stay in sync.
 *
 * Three 都市計畫分區 defined in ../zoning/fixtures/sample-zones.geojson —
 * 住宅區 and 商業區 share a border, 農業區 sits alone. 住宅區 has 6 valid
 * transactions (above the default sample threshold of 5), 商業區 has 1,
 * 農業區 has 2 (both below threshold).
 *
 * School-district fixtures cover the five scenarios from
 * .scratch/school-district-lookup/spec.md: 康寧里/仁和里/興農里 have plain
 * whole-neighborhood coverage (一般案例); 興安里第5鄰 is split by a
 * resolvable 仁愛街以南/以北 carve-out; 大同里第8鄰 has an unparseable
 * house-number-range clause (needs-manual-review); 示範路5號 isn't in the
 * 門牌 fixture at all, exercising the nearest-door-plate fallback.
 */

export const elementaryDistrictDataPath = fileURLToPath(
  new URL("../school-district/fixtures/elementary.json", import.meta.url),
);
export const juniorHighDistrictDataPath = fileURLToPath(
  new URL("../school-district/fixtures/juniorHigh.json", import.meta.url),
);

export const addressPoints: AddressPoint[] = [
  // 康寧里 第1、2鄰 — exact match for the existing 一般案例/分區交界案例 addresses
  { street: "示範路", lane: "", alley: "", houseNumber: "１號", village: "康寧里", neighborhood: "001", coordinate: { lat: 24.155, lon: 120.645 } },
  { street: "仁和路", lane: "", alley: "", houseNumber: "５號", village: "康寧里", neighborhood: "002", coordinate: { lat: 24.155, lon: 120.6499 } },
  // 仁和里 第10鄰 — exact match for the 商業區側 boundary address
  { street: "仁和路", lane: "", alley: "", houseNumber: "１號", village: "仁和里", neighborhood: "010", coordinate: { lat: 24.155, lon: 120.6501 } },
  // 興農里 第3鄰 — exact match for the existing 樣本不足案例 address
  { street: "產業道路", lane: "", alley: "", houseNumber: "１號", village: "興農里", neighborhood: "003", coordinate: { lat: 24.2025, lon: 120.7025 } },
  // 興安里 第5鄰 — carve-out scenario: test address on 信義街, reference point on 仁愛街 (south of it)
  { street: "信義街", lane: "", alley: "", houseNumber: "１０號", village: "興安里", neighborhood: "005", coordinate: { lat: 24.153, lon: 120.642 } },
  { street: "仁愛街", lane: "", alley: "", houseNumber: "２０號", village: "興安里", neighborhood: "005", coordinate: { lat: 24.152, lon: 120.642 } },
  // 大同里 第8鄰 — unparseable carve-out scenario
  { street: "忠孝路", lane: "", alley: "", houseNumber: "１４５號", village: "大同里", neighborhood: "008", coordinate: { lat: 24.154, lon: 120.644 } },
  // Note: 台中市住宅區示範路5號 is intentionally NOT in this list, to exercise the nearest-door-plate fallback (see addressBook below).
];

export const zoningDataPath = fileURLToPath(new URL("../zoning/fixtures/sample-zones.geojson", import.meta.url));

export const addressBook = new Map<string, Coordinate>([
  // query targets
  ["台中市住宅區示範路1號", { lat: 24.155, lon: 120.645 }], // interior of 住宅區
  ["台中市住宅區示範路2號近商業區", { lat: 24.155, lon: 120.6499 }], // 住宅區 side of the 住宅區/商業區 border
  ["台中市商業區興中路1號近住宅區", { lat: 24.155, lon: 120.6501 }], // 商業區 side of the same border
  ["台中市農業區產業道路1號", { lat: 24.2025, lon: 120.7025 }], // interior of 農業區
  ["台北市信義區信義路五段7號", { lat: 24.3, lon: 120.9 }], // geocodes fine, outside every zone
  // school-district query targets
  ["台中市住宅區信義街10號", { lat: 24.153, lon: 120.642 }], // 興安里第5鄰, resolvable carve-out (north of 仁愛街 reference point)
  ["台中市住宅區忠孝路145號", { lat: 24.154, lon: 120.644 }], // 大同里第8鄰, unparseable carve-out
  ["台中市住宅區示範路5號", { lat: 24.1551, lon: 120.6451 }], // not in the 門牌 fixture; ~15m from 示範路1號's door plate
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

  const addressPointStore = new AddressPointStore(":memory:");
  addressPointStore.insertMany(addressPoints);
  const villageCache = new VillageNeighborhoodCache(":memory:");
  const addressToVillage = new AddressToVillageService(geocodingClient, addressPointStore, villageCache);

  const elementaryLookup = new SchoolDistrictLookup(elementaryDistrictDataPath, addressPointStore);
  const juniorHighLookup = new SchoolDistrictLookup(juniorHighDistrictDataPath, addressPointStore);
  const schoolDistrictService = new SchoolDistrictService(geocodingClient, addressToVillage, elementaryLookup, juniorHighLookup);

  return new PropertyQueryService(addressToZone, store, schoolDistrictService);
}
