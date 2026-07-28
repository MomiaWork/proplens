import { DatabaseSync } from "node:sqlite";
import type { Coordinate } from "../shared/Coordinate.ts";
import { haversineDistanceMeters } from "../shared/geo.ts";
import type { ParsedAddress } from "./parseAddress.ts";
import type { VillageNeighborhood } from "./VillageNeighborhoodCache.ts";

export interface AddressPoint {
  street: string;
  lane: string;
  alley: string;
  houseNumber: string;
  village: string;
  neighborhood: string;
  coordinate: Coordinate;
}

/**
 * Stores the 門牌 (house-number) address-point dataset — one row per real
 * door plate, each carrying 里/鄰 and coordinates. Per ADR-0008, this is the
 * only reliable address -> 里/鄰 source: 鄰 has no spatial boundary, so this
 * lookup table stands in for the point-in-polygon Phase 1 used for zoning.
 */
export class AddressPointStore {
  private readonly db: DatabaseSync;

  constructor(dbPath: string) {
    this.db = new DatabaseSync(dbPath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS address_points (
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
    this.db.exec(
      "CREATE INDEX IF NOT EXISTS idx_address_points_exact ON address_points(street, lane, alley, house_number)",
    );
    this.db.exec("CREATE INDEX IF NOT EXISTS idx_address_points_street ON address_points(street)");
  }

  insertMany(points: AddressPoint[]): void {
    const insert = this.db.prepare(
      "INSERT INTO address_points (street, lane, alley, house_number, village, neighborhood, lat, lon) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    );
    this.db.exec("BEGIN");
    try {
      for (const p of points) {
        insert.run(p.street, p.lane, p.alley, p.houseNumber, p.village, p.neighborhood, p.coordinate.lat, p.coordinate.lon);
      }
      this.db.exec("COMMIT");
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }
  }

  findExact(parsed: ParsedAddress): VillageNeighborhood | undefined {
    const row = this.db
      .prepare(
        "SELECT street, house_number, village, neighborhood FROM address_points WHERE street = ? AND lane = ? AND alley = ? AND house_number = ? LIMIT 1",
      )
      .get(parsed.street, parsed.lane, parsed.alley, parsed.houseNumber) as
      | { street: string; house_number: string; village: string; neighborhood: string }
      | undefined;
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
    const rows = this.db.prepare("SELECT lat, lon FROM address_points WHERE street = ?").all(street) as Array<{
      lat: number;
      lon: number;
    }>;

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

    const rows = this.db
      .prepare(
        "SELECT street, house_number, village, neighborhood, lat, lon FROM address_points WHERE lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?",
      )
      .all(coordinate.lat - latDelta, coordinate.lat + latDelta, coordinate.lon - lonDelta, coordinate.lon + lonDelta) as Array<{
      street: string;
      house_number: string;
      village: string;
      neighborhood: string;
      lat: number;
      lon: number;
    }>;

    return rows.sort(
      (a, b) => haversineDistanceMeters(coordinate, a) - haversineDistanceMeters(coordinate, b),
    );
  }

  close(): void {
    this.db.close();
  }
}
