// Mirrors src/address-to-village/AddressPointStore.ts,
// VillageNeighborhoodCache.ts, src/geocoding/GeocodingCache.ts, and
// src/transactions/TransactionStore.ts — duplicated (and ported from
// node:sqlite to expo-sqlite) because Metro doesn't bundle files outside
// this app's root and RN has no node:sqlite. SQLite is a portable file
// format, so the pre-built .sqlite files downloaded by dataSync.ts (built
// server-side by the same node:sqlite code these mirror) open here
// unmodified — only the two device-local caches are ever written to on
// the phone.
import * as SQLite from "expo-sqlite";
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

/** Read-only: address-points.sqlite is pre-built server-side and downloaded as-is. */
export class AddressPointStore {
  constructor(private readonly db: SQLite.SQLiteDatabase) {}

  findExact(parsed: ParsedAddress): VillageNeighborhood | undefined {
    const row = this.db.getFirstSync<{ street: string; house_number: string; village: string; neighborhood: string }>(
      "SELECT street, house_number, village, neighborhood FROM address_points WHERE street = ? AND lane = ? AND alley = ? AND house_number = ? LIMIT 1",
      parsed.street,
      parsed.lane,
      parsed.alley,
      parsed.houseNumber,
    );
    return row
      ? { village: row.village, neighborhood: row.neighborhood, street: row.street, houseNumber: row.house_number }
      : undefined;
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
 * transactions.sqlite's rows (address/date/price) are pre-built
 * server-side and downloaded as-is — but per ADR-0014, zone_name is no
 * longer precomputed server-side (that needed Google), so this store is
 * responsible for filling zone_name in on-device, via
 * enrichTransactionZones.ts, using the free on-device geocoder.
 */
export class TransactionStore {
  constructor(private readonly db: SQLite.SQLiteDatabase) {}

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
  constructor(private readonly db: SQLite.SQLiteDatabase) {
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
  constructor(private readonly db: SQLite.SQLiteDatabase) {
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
