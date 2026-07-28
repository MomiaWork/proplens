import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import { point } from "@turf/helpers";
import type { Feature, FeatureCollection, Polygon, MultiPolygon } from "geojson";
import type { Coordinate } from "./geo";
import type { TextFileReader } from "./files";

type ZoneFeature = Feature<Polygon | MultiPolygon, { zoneName: string }>;
type ZoneCollection = FeatureCollection<Polygon | MultiPolygon, { zoneName: string }>;

/**
 * Coordinate -> 都市計畫分區 name, or null outside every zone in the loaded
 * dataset. The parsed GeoJSON (26MB) is cached in memory for the session
 * rather than re-read on every query — re-parsing it per query is not
 * cheap on a phone. Call invalidate() after dataSync downloads a newer
 * file, so a stale zoning judgment can't survive a data refresh.
 */
export class GeoJsonZoneLookup {
  private cachedZones: ZoneCollection | null = null;

  constructor(
    private readonly files: TextFileReader,
    private readonly zoningDataPath: string,
  ) {}

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
      const raw = await this.files.read(this.zoningDataPath);
      this.cachedZones = JSON.parse(raw) as ZoneCollection;
    }
    return this.cachedZones;
  }
}
