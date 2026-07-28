import { readFileSync } from "node:fs";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import { point } from "@turf/helpers";
import type { Feature, FeatureCollection, Polygon, MultiPolygon } from "geojson";
import type { Coordinate } from "../../src/core/geo";

/**
 * Coordinate -> 都市計畫分區 name, or null when the coordinate doesn't fall
 * inside any zone in the loaded dataset (e.g. outside Taichung).
 *
 * Per ADR-0007, this lookup is intentionally never cached: the zoning
 * dataset is re-read from disk on every call so an unannounced re-download
 * of the GIS file is reflected immediately, with no cache to invalidate.
 */
export interface ZoneLookup {
  findZone(coordinate: Coordinate): string | null;
}

type ZoneFeature = Feature<Polygon | MultiPolygon, { zoneName: string }>;

export class GeoJsonZoneLookup implements ZoneLookup {
  constructor(private readonly zoningDataPath: string) {}

  findZone(coordinate: Coordinate): string | null {
    const zones = this.loadZones();
    const target = point([coordinate.lon, coordinate.lat]);

    for (const zone of zones.features) {
      if (booleanPointInPolygon(target, zone)) {
        return zone.properties.zoneName;
      }
    }
    return null;
  }

  private loadZones(): FeatureCollection<Polygon | MultiPolygon, { zoneName: string }> {
    const raw = readFileSync(this.zoningDataPath, "utf-8");
    return JSON.parse(raw) as FeatureCollection<Polygon | MultiPolygon, { zoneName: string }>;
  }
}
