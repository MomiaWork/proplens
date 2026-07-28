import { fileURLToPath } from "node:url";
import type { Coordinate } from "../src/core/geo";
import type { GeocodingClient } from "../src/core/geocoding";
import type { SqliteDatabase } from "../src/core/sqlite";
import { AddressPointStore, TransactionStore, VillageNeighborhoodCache } from "../src/core/stores";
import { GeoJsonZoneLookup } from "../src/core/zoneLookup";
import { JsonSchoolDistrictLookup } from "../src/core/schoolDistrictLookup";
import {
  AddressToZoneService,
  AddressToVillageService,
  SchoolDistrictService,
  PropertyQueryService,
} from "../src/core/propertyQueryService";
import { enrichTransactionZones } from "../src/core/enrichTransactionZones";
import { NodeSqliteDatabase, nodeFileReader } from "./nodeAdapters";

/**
 * Fixture world for the black-box spec suite. This wires the *shipping*
 * engine (src/core) — the only substitutions are the platform seams:
 * node:sqlite for expo-sqlite, node:fs for expo-file-system, and a
 * dictionary for the geocoder, which is the one boundary the spec allows
 * stubbing (see .scratch/property-zone-lookup/spec.md "Testing Decisions").
 * Zoning, aggregation, 門牌比對 and 學區文字表比對 all run real logic
 * against the fixture data below.
 *
 * Three 都市計畫分區 in fixtures/sample-zones.geojson — 住宅區 and 商業區
 * share a border, 農業區 sits alone. 住宅區 has 6 valid transactions (above
 * the default sample threshold of 5), 商業區 has 1, 農業區 has 2.
 *
 * School-district fixtures cover the five scenarios from
 * .scratch/school-district-lookup/spec.md: 康寧里/仁和里/興農里 have plain
 * whole-neighborhood coverage (一般案例); 興安里第5鄰 is split by a
 * resolvable 仁愛街以南/以北 carve-out; 大同里第8鄰 has an unparseable
 * house-number-range clause (needs-manual-review); 示範路5號 isn't in the
 * 門牌 fixture at all, exercising the nearest-door-plate fallback.
 */

export const elementaryDistrictDataPath = fileURLToPath(new URL("./fixtures/elementary.json", import.meta.url).href);
export const juniorHighDistrictDataPath = fileURLToPath(new URL("./fixtures/juniorHigh.json", import.meta.url).href);
export const zoningDataPath = fileURLToPath(new URL("./fixtures/sample-zones.geojson", import.meta.url).href);

interface AddressPoint {
  districtCode: string;
  street: string;
  lane: string;
  alley: string;
  houseNumber: string;
  village: string;
  neighborhood: string;
  coordinate: Coordinate;
}

export const addressPoints: AddressPoint[] = [
  // 康寧里 第1、2鄰 — exact match for the existing 一般案例/分區交界案例 addresses
  { districtCode: "", street: "示範路", lane: "", alley: "", houseNumber: "１號", village: "康寧里", neighborhood: "001", coordinate: { lat: 24.155, lon: 120.645 } },
  { districtCode: "", street: "仁和路", lane: "", alley: "", houseNumber: "５號", village: "康寧里", neighborhood: "002", coordinate: { lat: 24.155, lon: 120.6499 } },
  // 仁和里 第10鄰 — exact match for the 商業區側 boundary address
  { districtCode: "", street: "仁和路", lane: "", alley: "", houseNumber: "１號", village: "仁和里", neighborhood: "010", coordinate: { lat: 24.155, lon: 120.6501 } },
  // 興農里 第3鄰 — exact match for the existing 樣本不足案例 address
  { districtCode: "", street: "產業道路", lane: "", alley: "", houseNumber: "１號", village: "興農里", neighborhood: "003", coordinate: { lat: 24.2025, lon: 120.7025 } },
  // 興安里 第5鄰 — carve-out scenario: test address on 信義街, reference point on 仁愛街 (south of it)
  { districtCode: "", street: "信義街", lane: "", alley: "", houseNumber: "１０號", village: "興安里", neighborhood: "005", coordinate: { lat: 24.153, lon: 120.642 } },
  { districtCode: "", street: "仁愛街", lane: "", alley: "", houseNumber: "２０號", village: "興安里", neighborhood: "005", coordinate: { lat: 24.152, lon: 120.642 } },
  // 大同里 第8鄰 — unparseable carve-out scenario
  { districtCode: "", street: "忠孝路", lane: "", alley: "", houseNumber: "１４５號", village: "大同里", neighborhood: "008", coordinate: { lat: 24.154, lon: 120.644 } },
  // 東橋里 — 全里 (whole-village) clause, half-width parens in the elementary fixture row
  { districtCode: "", street: "東橋路", lane: "", alley: "", houseNumber: "１號", village: "東橋里", neighborhood: "099", coordinate: { lat: 24.156, lon: 120.643 } },
  // Note: 台中市住宅區示範路5號 is intentionally NOT in this list, to exercise the nearest-door-plate fallback (see addressBook below).
];

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
  ["台中市住宅區示範路9號", { lat: 24.159, lon: 120.649 }], // not in the 門牌 fixture; >200m from every door plate (fallback threshold miss)
  ["台中市住宅區東橋路1號", { lat: 24.156, lon: 120.643 }], // 東橋里, 全里 clause (half-width parens in the source row)
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

/**
 * Already past the 實價登錄2.0 cutoff — the ROC-date parsing and the
 * pre-2021/7 filter belong to the ingestion pipeline, and are covered
 * separately in transactionEtl.test.ts.
 */
export const validTransactions = [
  { address: "住宅區交易1號", transactionDate: "2022-01-01", price: 10_000_000 },
  { address: "住宅區交易2號", transactionDate: "2022-01-02", price: 11_000_000 },
  { address: "住宅區交易3號", transactionDate: "2022-01-03", price: 12_000_000 },
  { address: "住宅區交易4號", transactionDate: "2022-01-04", price: 13_000_000 },
  { address: "住宅區交易5號", transactionDate: "2022-01-05", price: 14_000_000 },
  { address: "住宅區交易6號", transactionDate: "2022-01-06", price: 15_000_000 },
  { address: "商業區交易1號", transactionDate: "2022-02-01", price: 20_000_000 },
  { address: "農業區交易1號", transactionDate: "2022-03-01", price: 5_000_000 },
  { address: "農業區交易2號", transactionDate: "2022-03-02", price: 4_800_000 },
];

/** In-memory address -> coordinate dictionary, standing in for the device geocoder. */
class FixtureGeocodingClient implements GeocodingClient {
  constructor(private readonly addressBook: ReadonlyMap<string, Coordinate>) {}

  async geocode(address: string): Promise<Coordinate | null> {
    return this.addressBook.get(address) ?? null;
  }
}

/**
 * Creates the two tables the pipeline normally ships pre-built and fills
 * them with the fixture rows. Mirrors the schema in
 * tools/address-to-village/AddressPointStore.ts and
 * tools/transactions/TransactionStore.ts — if those change, this fails
 * loudly rather than silently testing a different shape.
 */
function seedDatabase(db: SqliteDatabase): void {
  db.execSync(`
    CREATE TABLE address_points (
      district_code TEXT NOT NULL,
      street TEXT NOT NULL,
      lane TEXT NOT NULL,
      alley TEXT NOT NULL,
      house_number TEXT NOT NULL,
      village TEXT NOT NULL,
      neighborhood TEXT NOT NULL,
      lat REAL NOT NULL,
      lon REAL NOT NULL
    )
  `);
  for (const p of addressPoints) {
    db.runSync(
      "INSERT INTO address_points (district_code, street, lane, alley, house_number, village, neighborhood, lat, lon) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      p.districtCode,
      p.street,
      p.lane,
      p.alley,
      p.houseNumber,
      p.village,
      p.neighborhood,
      p.coordinate.lat,
      p.coordinate.lon,
    );
  }

  db.execSync(`
    CREATE TABLE valid_transactions (
      id TEXT PRIMARY KEY,
      address TEXT NOT NULL,
      transaction_date TEXT NOT NULL,
      price REAL NOT NULL,
      zone_name TEXT
    )
  `);
  for (const [index, t] of validTransactions.entries()) {
    db.runSync(
      "INSERT INTO valid_transactions (id, address, transaction_date, price) VALUES (?, ?, ?, ?)",
      `txn-${index}`,
      t.address,
      t.transactionDate,
      t.price,
    );
  }
}

export async function buildFixturePropertyQueryService(): Promise<PropertyQueryService> {
  const db = new NodeSqliteDatabase();
  seedDatabase(db);

  const geocodingClient = new FixtureGeocodingClient(addressBook);
  const zoneLookup = new GeoJsonZoneLookup(nodeFileReader, zoningDataPath);
  const addressPointStore = new AddressPointStore(db);
  const addressToZone = new AddressToZoneService(geocodingClient, zoneLookup, addressPointStore);

  const transactionStore = new TransactionStore(db);
  // The snapshot ships with zone_name NULL (ADR-0014); the same on-device
  // enrichment the app runs after a data sync fills it in here too.
  await enrichTransactionZones(transactionStore, addressToZone);

  const villageCache = new VillageNeighborhoodCache(db);
  const addressToVillage = new AddressToVillageService(geocodingClient, addressPointStore, villageCache);

  const elementaryLookup = new JsonSchoolDistrictLookup(nodeFileReader, elementaryDistrictDataPath, addressPointStore);
  const juniorHighLookup = new JsonSchoolDistrictLookup(nodeFileReader, juniorHighDistrictDataPath, addressPointStore);
  const schoolDistrictService = new SchoolDistrictService(geocodingClient, addressToVillage, elementaryLookup, juniorHighLookup);

  return new PropertyQueryService(addressToZone, transactionStore, schoolDistrictService);
}
