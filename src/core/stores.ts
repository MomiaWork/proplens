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

export interface ValidTransaction {
  address: string;
  transactionDate: string;
  price: number;
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
export class TransactionStore {
  constructor(private readonly db: SqliteDatabase) {}

  all(): ValidTransaction[] {
    const rows = this.db.getAllSync<{ address: string; transaction_date: string; price: number }>(
      "SELECT address, transaction_date, price FROM valid_transactions",
    );
    return rows.map((row) => ({ address: row.address, transactionDate: row.transaction_date, price: row.price }));
  }

  /** Same-zone transactions by pre-computed zone_name (see enrichTransactionZones.ts / ADR-0012). */
  findByZone(zoneName: string): ValidTransaction[] {
    const rows = this.db.getAllSync<{ address: string; transaction_date: string; price: number }>(
      "SELECT address, transaction_date, price FROM valid_transactions WHERE zone_name = ?",
      zoneName,
    );
    return rows.map((row) => ({ address: row.address, transactionDate: row.transaction_date, price: row.price }));
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
