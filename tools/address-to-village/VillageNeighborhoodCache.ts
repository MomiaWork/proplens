import { DatabaseSync } from "node:sqlite";

export interface VillageNeighborhood {
  village: string;
  neighborhood: string;
  street: string;
  houseNumber: string;
}

/**
 * Persists address -> 里/鄰 resolution results in SQLite. Per ADR-0009, only
 * this half of the school-district lookup is cached — a resolved 里/鄰 is a
 * stable administrative fact, same reasoning as GeocodingCache. The other
 * half (里/鄰 -> school) is never cached, since school-district boundaries
 * are revised yearly — see SchoolDistrictLookup.ts.
 */
export class VillageNeighborhoodCache {
  private readonly db: DatabaseSync;

  constructor(dbPath: string) {
    this.db = new DatabaseSync(dbPath);
    this.db.exec(`
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
    const row = this.db
      .prepare("SELECT village, neighborhood, street, house_number FROM village_neighborhood_cache WHERE address = ?")
      .get(address) as { village: string; neighborhood: string; street: string; house_number: string } | undefined;
    return row
      ? { village: row.village, neighborhood: row.neighborhood, street: row.street, houseNumber: row.house_number }
      : undefined;
  }

  set(address: string, match: VillageNeighborhood): void {
    this.db
      .prepare(
        "INSERT INTO village_neighborhood_cache (address, village, neighborhood, street, house_number) VALUES (?, ?, ?, ?, ?) " +
          "ON CONFLICT(address) DO UPDATE SET village = excluded.village, neighborhood = excluded.neighborhood, street = excluded.street, house_number = excluded.house_number",
      )
      .run(address, match.village, match.neighborhood, match.street, match.houseNumber);
  }

  close(): void {
    this.db.close();
  }
}
