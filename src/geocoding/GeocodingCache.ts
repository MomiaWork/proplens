import { DatabaseSync } from "node:sqlite";
import type { Coordinate } from "../shared/Coordinate.ts";

/**
 * Persists address -> coordinate geocoding results in SQLite. Per the spec,
 * only a *successful* geocode is a permanent fact worth caching (unlike
 * zone lookups, which must never be cached — see ZoneLookup.ts). A miss is
 * NOT cached: an address the API can't resolve today (typo, or simply not
 * yet in Google's index — e.g. a newly registered building) may resolve
 * tomorrow, so it isn't a fact and shouldn't be locked in.
 */
export class GeocodingCache {
  private readonly db: DatabaseSync;

  constructor(dbPath: string) {
    this.db = new DatabaseSync(dbPath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS geocoding_cache (
        address TEXT PRIMARY KEY,
        lat REAL NOT NULL,
        lon REAL NOT NULL
      )
    `);
  }

  get(address: string): Coordinate | undefined {
    const row = this.db.prepare("SELECT lat, lon FROM geocoding_cache WHERE address = ?").get(address) as
      | { lat: number; lon: number }
      | undefined;
    return row ? { lat: row.lat, lon: row.lon } : undefined;
  }

  set(address: string, coordinate: Coordinate): void {
    this.db
      .prepare(
        "INSERT INTO geocoding_cache (address, lat, lon) VALUES (?, ?, ?) " +
          "ON CONFLICT(address) DO UPDATE SET lat = excluded.lat, lon = excluded.lon",
      )
      .run(address, coordinate.lat, coordinate.lon);
  }

  close(): void {
    this.db.close();
  }
}
