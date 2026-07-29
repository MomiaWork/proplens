import { DatabaseSync } from "node:sqlite";
import type { Coordinate } from "../../src/core/geo";

export interface AddressPoint {
  /**
   * 鄉鎮市區代碼 straight from the source CSV (e.g. "6600600"). Stored as
   * the raw code rather than a district name because the code is what the
   * dataset actually carries — see src/core/cities.ts for each city's
   * name -> code map and how it was derived.
   */
  districtCode: string;
  street: string;
  lane: string;
  alley: string;
  houseNumber: string;
  village: string;
  neighborhood: string;
  coordinate: Coordinate;
}

/**
 * Writes the 門牌 (house-number) address-point dataset — one row per real
 * door plate, each carrying 里/鄰 and coordinates. Per ADR-0008 this is the
 * only reliable address -> 里/鄰 source: 鄰 has no spatial boundary, so this
 * lookup table stands in for the point-in-polygon Phase 1 used for zoning.
 *
 * Write-only by design: the file this produces ships to the phone, and
 * everything that reads it — the app and the test suite alike — goes
 * through src/core/stores.ts. A schema change here has to be matched
 * there (tests/fixtureWorld.ts builds the same tables, so a mismatch
 * fails the suite rather than shipping silently).
 */
export class AddressPointStore {
  private readonly db: DatabaseSync;

  constructor(dbPath: string) {
    this.db = new DatabaseSync(dbPath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS address_points (
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
    this.db.exec(
      "CREATE INDEX IF NOT EXISTS idx_address_points_exact ON address_points(district_code, street, lane, alley, house_number)",
    );
    this.db.exec("CREATE INDEX IF NOT EXISTS idx_address_points_street ON address_points(district_code, street)");
  }

  insertMany(points: AddressPoint[]): void {
    const insert = this.db.prepare(
      "INSERT INTO address_points (district_code, street, lane, alley, house_number, village, neighborhood, lat, lon) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    );
    this.db.exec("BEGIN");
    try {
      for (const p of points) {
        insert.run(p.districtCode, p.street, p.lane, p.alley, p.houseNumber, p.village, p.neighborhood, p.coordinate.lat, p.coordinate.lon);
      }
      this.db.exec("COMMIT");
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }
  }

  /**
   * Replaces the entire table with `points` in one transaction. There's no
   * natural per-row dedup key across monthly 門牌 snapshots (a door plate's
   * own coordinate/鄰 can change between months), so re-ingesting a fresh
   * snapshot means starting clean rather than upserting — see
   * downloadAddressPoints.ts, which re-runs this against the same on-disk
   * file every time the dataset is refreshed.
   */
  replaceAll(points: AddressPoint[]): void {
    this.db.exec("BEGIN");
    try {
      this.db.exec("DELETE FROM address_points");
      this.db.exec("COMMIT");
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }
    this.insertMany(points);
  }

  close(): void {
    this.db.close();
  }
}
