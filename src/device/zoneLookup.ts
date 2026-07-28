// The shipping zone lookup: tools/zoning/ZoneLookup.ts ported from
// node:fs.readFileSync to expo-file-system (RN has no node:fs). The two
// are still a second copy of each other — see tools/README.md.
import * as FileSystem from "expo-file-system/legacy";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import { point } from "@turf/helpers";
import type { Feature, FeatureCollection, Polygon, MultiPolygon } from "geojson";
import type { Coordinate } from "../core/geo";

type ZoneFeature = Feature<Polygon | MultiPolygon, { zoneName: string }>;
type ZoneCollection = FeatureCollection<Polygon | MultiPolygon, { zoneName: string }>;

/**
 * Coordinate -> 都市計畫分區 name, or null outside every zone in the loaded
 * dataset. The parsed GeoJSON (26MB) is cached in memory for the app
 * session rather than re-read on every query (the server version re-reads
 * from disk every call per ADR-0007, since re-parsing is cheap there —
 * it's not cheap on a phone). Call invalidate() after dataSync downloads a
 * newer file, so a stale zoning judgment can't survive a data refresh.
 */
export class GeoJsonZoneLookup {
  private cachedZones: ZoneCollection | null = null;

  constructor(private readonly zoningDataPath: string) {}

  async findZone(coordinate: Coordinate): Promise<string | null> {
    const zones = await this.loadZones();
    const target = point([coordinate.lon, coordinate.lat]);

    for (const zone of zones.features) {
      if (booleanPointInPolygon(target, zone as ZoneFeature)) {
        return zone.properties?.zoneName ?? null;
      }
    }
    return null;
  }

  invalidate(): void {
    this.cachedZones = null;
  }

  private async loadZones(): Promise<ZoneCollection> {
    if (!this.cachedZones) {
      const raw = await FileSystem.readAsStringAsync(this.zoningDataPath);
      this.cachedZones = JSON.parse(raw) as ZoneCollection;
    }
    return this.cachedZones;
  }
}
