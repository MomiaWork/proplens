// The read side of every SQLite file the query engine touches, written
// once against the SqliteDatabase seam so the phone (expo-sqlite) and the
// test suite (node:sqlite) run the same SQL.
//
// SQLite is a portable file format: the .sqlite files the pipeline builds
// with node:sqlite and dataSync.ts downloads open here unmodified. Only
// the two device-local caches are ever written to at query time.
import type { SqliteDatabase } from "./sqlite";
import type { Coordinate } from "./geo";
import { haversineDistanceMeters } from "./geo";
import type { ParsedAddress } from "./parseAddress";

export interface VillageNeighborhood {
  village: string;
  neighborhood: string;
  street: string;
  houseNumber: string;
}

/**
 * One 有效交易紀錄 as the card shows it. Every field is a value 實價登錄
 * published, or a unit conversion of one (平方公尺 -> 坪) — never a figure
 * derived by combining rows, which ADR-0005 rules out.
 *
 * The optional fields are genuinely absent in the source for some rows
 * (預售屋 has no 建築完成年月, 非都市土地 has no 都市土地使用分區), and are
 * left absent rather than defaulted, so the card can say 不詳 instead of
 * showing a made-up 0.
 */
export interface ValidTransaction {
  address: string;
  /** 交易年月日, ISO. */
  transactionDate: string;
  /** 總價元 */
  price: number;
  /** 交易標的 — 房地(土地+建物) / 建物 … */
  transactionSubject: string;
  /** 建物型態 — 公寓/華廈/透天厝 … */
  buildingType: string;
  /** 主要用途 — 住家用 … */
  mainUse: string;
  /** 都市土地使用分區 as 實價登錄 states it (住/商/工), when it does. */
  urbanLandUse?: string;
  /** 建築完成年月, ISO — the 年份 the building was finished. */
  completionDate?: string;
  /** 建物移轉總面積, 坪. */
  areaPing?: number;
  /** 每坪單價, 元. */
  unitPricePerPing?: number;
}

/** 1 坪 = 3.305785 m² (地政 standard). */
export const SQM_PER_PING = 3.305785;

export function sqmToPing(sqm: number): number {
  return sqm / SQM_PER_PING;
}

export function pricePerSqmToPricePerPing(pricePerSqm: number): number {
  return pricePerSqm * SQM_PER_PING;
}

/**
 * Door plates this far apart can't be the same building, so an address key
 * matching several of them is genuinely ambiguous rather than duplicated.
 */
const SAME_BUILDING_TOLERANCE_METERS = 100;

/** Read-only: address-points.sqlite is pre-built by the pipeline and shipped as-is. */
export class AddressPointStore {
  constructor(private readonly db: SqliteDatabase) {}

  findExact(parsed: ParsedAddress): VillageNeighborhood | undefined {
    const row = this.db.getFirstSync<{ street: string; house_number: string; village: string; neighborhood: string }>(
      `SELECT street, house_number, village, neighborhood FROM address_points
       WHERE (? = '' OR district_code = ?) AND street = ? AND lane = ? AND alley = ? AND house_number = ? LIMIT 1`,
      parsed.districtCode,
      parsed.districtCode,
      parsed.street,
      parsed.lane,
      parsed.alley,
      parsed.houseNumber,
    );
    return row
      ? { village: row.village, neighborhood: row.neighborhood, street: row.street, houseNumber: row.house_number }
      : undefined;
  }

  /**
   * Coordinate for an exact door-plate match, straight from the 門牌
   * dataset — no geocoder call needed. AddressToZoneService tries this
   * before falling back to GeocodingClient, so bulk zone enrichment over
   * hundreds of transactions doesn't spend a rate-limited geocoder call on
   * every one.
   *
   * Returns undefined when the key still matches door plates in different
   * places — identically-named streets repeat across districts, so an
   * address whose district we couldn't identify (districtCode "") stays
   * ambiguous. Picking one arbitrarily would mean a confidently wrong 分區,
   * so ambiguity defers to the geocoder, which sees the whole address.
   */
  findExactCoordinate(parsed: ParsedAddress): Coordinate | undefined {
    const rows = this.db.getAllSync<{ lat: number; lon: number }>(
      `SELECT lat, lon FROM address_points
       WHERE (? = '' OR district_code = ?) AND street = ? AND lane = ? AND alley = ? AND house_number = ?`,
      parsed.districtCode,
      parsed.districtCode,
      parsed.street,
      parsed.lane,
      parsed.alley,
      parsed.houseNumber,
    );

    const first = rows[0];
    if (!first) {
      return undefined;
    }
    const coordinate = { lat: first.lat, lon: first.lon };
    const allSamePlace = rows.every(
      (row) => haversineDistanceMeters(coordinate, { lat: row.lat, lon: row.lon }) <= SAME_BUILDING_TOLERANCE_METERS,
    );
    return allSamePlace ? coordinate : undefined;
  }

  /** Nearest door plate within maxDistanceMeters, or undefined if none is close enough (ADR-0011). */
  findNearest(coordinate: Coordinate, maxDistanceMeters: number): VillageNeighborhood | undefined {
    for (const row of this.rowsInBoundingBox(coordinate, maxDistanceMeters)) {
      const distance = haversineDistanceMeters(coordinate, { lat: row.lat, lon: row.lon });
      if (distance <= maxDistanceMeters) {
        return { village: row.village, neighborhood: row.neighborhood, street: row.street, houseNumber: row.house_number };
      }
    }
    return undefined;
  }

  /** Nearest door plate on a specific named street — used to resolve 以南/以北/以東/以西 carve-out clauses. */
  findNearestOnStreet(coordinate: Coordinate, street: string): Coordinate | undefined {
    const rows = this.db.getAllSync<{ lat: number; lon: number }>(
      "SELECT lat, lon FROM address_points WHERE street = ?",
      street,
    );

    let best: (Coordinate & { distance: number }) | undefined;
    for (const row of rows) {
      const distance = haversineDistanceMeters(coordinate, { lat: row.lat, lon: row.lon });
      if (!best || distance < best.distance) {
        best = { lat: row.lat, lon: row.lon, distance };
      }
    }
    return best ? { lat: best.lat, lon: best.lon } : undefined;
  }

  private rowsInBoundingBox(
    coordinate: Coordinate,
    maxDistanceMeters: number,
  ): Array<{ street: string; house_number: string; village: string; neighborhood: string; lat: number; lon: number }> {
    const latDelta = maxDistanceMeters / 111_000;
    const lonDelta = maxDistanceMeters / (111_000 * Math.cos((coordinate.lat * Math.PI) / 180));

    const rows = this.db.getAllSync<{
      street: string;
      house_number: string;
      village: string;
      neighborhood: string;
      lat: number;
      lon: number;
    }>(
      "SELECT street, house_number, village, neighborhood, lat, lon FROM address_points WHERE lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?",
      coordinate.lat - latDelta,
      coordinate.lat + latDelta,
      coordinate.lon - lonDelta,
      coordinate.lon + lonDelta,
    );

    return rows.sort((a, b) => haversineDistanceMeters(coordinate, a) - haversineDistanceMeters(coordinate, b));
  }
}

/**
 * transactions.sqlite's rows (address/date/price) are pre-built by the
 * pipeline and shipped as-is — but per ADR-0014, zone_name is no longer
 * precomputed there (that needed Google), so this store is responsible for
 * filling zone_name in on-device, via enrichTransactionZones.ts, using the
 * free on-device geocoder.
 */
interface TransactionRow {
  address: string;
  transaction_date: string;
  price: number;
  transaction_subject: string;
  building_type: string;
  main_use: string;
  urban_land_use: string | null;
  completion_date: string | null;
  building_area_sqm: number | null;
  unit_price_per_sqm: number | null;
}

const TRANSACTION_COLUMNS =
  "address, transaction_date, price, transaction_subject, building_type, main_use, urban_land_use, completion_date, building_area_sqm, unit_price_per_sqm";

/**
 * The stored file mirrors 實價登錄's own units (平方公尺); the conversion to
 * 坪 happens here so it exists once, on the read path both the app and the
 * test suite go through.
 */
function toValidTransaction(row: TransactionRow): ValidTransaction {
  return {
    address: row.address,
    transactionDate: row.transaction_date,
    price: row.price,
    transactionSubject: row.transaction_subject,
    buildingType: row.building_type,
    mainUse: row.main_use,
    urbanLandUse: row.urban_land_use || undefined,
    completionDate: row.completion_date || undefined,
    areaPing: row.building_area_sqm ? sqmToPing(row.building_area_sqm) : undefined,
    unitPricePerPing: row.unit_price_per_sqm ? pricePerSqmToPricePerPing(row.unit_price_per_sqm) : undefined,
  };
}

export class TransactionStore {
  constructor(private readonly db: SqliteDatabase) {}

  all(): ValidTransaction[] {
    return this.db.getAllSync<TransactionRow>(`SELECT ${TRANSACTION_COLUMNS} FROM valid_transactions`).map(toValidTransaction);
  }

  /**
   * 同路段有效交易 — every transaction on the same named street, newest
   * first (ADR-0018). districtCode narrows it when the queried address
   * named a 行政區, since street names repeat across a city's districts;
   * "" means the address didn't name one, and the whole city's matches for
   * that street name are returned rather than an arbitrary district's.
   */
  findByStreet(districtCode: string, street: string): ValidTransaction[] {
    return this.db
      .getAllSync<TransactionRow>(
        `SELECT ${TRANSACTION_COLUMNS} FROM valid_transactions
         WHERE street = ? AND (? = '' OR district_code = '' OR district_code = ?)
         ORDER BY transaction_date DESC`,
        street,
        districtCode,
        districtCode,
      )
      .map(toValidTransaction);
  }

  /** Same-zone transactions by pre-computed zone_name (see enrichTransactionZones.ts / ADR-0012). */
  findByZone(zoneName: string): ValidTransaction[] {
    return this.db
      .getAllSync<TransactionRow>(`SELECT ${TRANSACTION_COLUMNS} FROM valid_transactions WHERE zone_name = ?`, zoneName)
      .map(toValidTransaction);
  }

  /** Rows not yet enriched with a zone_name. */
  findUnresolvedZones(): Array<{ id: string; address: string }> {
    return this.db.getAllSync<{ id: string; address: string }>("SELECT id, address FROM valid_transactions WHERE zone_name IS NULL");
  }

  setZone(id: string, zoneName: string | null): void {
    this.db.runSync("UPDATE valid_transactions SET zone_name = ? WHERE id = ?", zoneName, id);
  }
}

/** Device-local cache the phone builds up itself as it resolves addresses -> 里/鄰 (ADR-0009). */
export class VillageNeighborhoodCache {
  constructor(private readonly db: SqliteDatabase) {
    this.db.execSync(`
      CREATE TABLE IF NOT EXISTS village_neighborhood_cache (
        address TEXT PRIMARY KEY,
        village TEXT NOT NULL,
        neighborhood TEXT NOT NULL,
        street TEXT NOT NULL,
        house_number TEXT NOT NULL
      )
    `);
  }

  get(address: string): VillageNeighborhood | undefined {
    const row = this.db.getFirstSync<{ village: string; neighborhood: string; street: string; house_number: string }>(
      "SELECT village, neighborhood, street, house_number FROM village_neighborhood_cache WHERE address = ?",
      address,
    );
    return row
      ? { village: row.village, neighborhood: row.neighborhood, street: row.street, houseNumber: row.house_number }
      : undefined;
  }

  set(address: string, match: VillageNeighborhood): void {
    this.db.runSync(
      "INSERT INTO village_neighborhood_cache (address, village, neighborhood, street, house_number) VALUES (?, ?, ?, ?, ?) " +
        "ON CONFLICT(address) DO UPDATE SET village = excluded.village, neighborhood = excluded.neighborhood, street = excluded.street, house_number = excluded.house_number",
      address,
      match.village,
      match.neighborhood,
      match.street,
      match.houseNumber,
    );
  }
}

/** Device-local cache the phone builds up itself as it geocodes addresses (ADR-0007). */
export class GeocodingCache {
  constructor(private readonly db: SqliteDatabase) {
    this.db.execSync(`
      CREATE TABLE IF NOT EXISTS geocoding_cache (
        address TEXT PRIMARY KEY,
        lat REAL NOT NULL,
        lon REAL NOT NULL
      )
    `);
  }

  get(address: string): Coordinate | undefined {
    const row = this.db.getFirstSync<{ lat: number; lon: number }>(
      "SELECT lat, lon FROM geocoding_cache WHERE address = ?",
      address,
    );
    return row ? { lat: row.lat, lon: row.lon } : undefined;
  }

  set(address: string, coordinate: Coordinate): void {
    this.db.runSync(
      "INSERT INTO geocoding_cache (address, lat, lon) VALUES (?, ?, ?) " +
        "ON CONFLICT(address) DO UPDATE SET lat = excluded.lat, lon = excluded.lon",
      address,
      coordinate.lat,
      coordinate.lon,
    );
  }
}
