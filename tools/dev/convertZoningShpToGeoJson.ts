import { writeFileSync } from "node:fs";
import shapefile from "shapefile";
import proj4 from "proj4";
import type { FeatureCollection, Polygon, MultiPolygon, Position } from "geojson";
import { cityFromArgs, outputPathFor, positionalArgs } from "../cityArgs";

/**
 * Converts a downloaded 都市計畫圖(GIS) Shapefile into the GeoJSON format
 * ZoneLookup expects (WGS84 lon/lat, `zoneName` property).
 *
 * Every city distributes this one as a manual download (a .rar of
 * Shapefiles via Google Drive for 臺中市 — see
 * .scratch/property-zone-lookup/spec.md's "都市計畫圖資取得方式" note; that
 * note assumed a live Swagger API, which turned out to be a dead link).
 * That matches the spec's own design though: issue 01 only requires the
 * zoning file path to be swappable without code changes, not an automated
 * fetcher — so this conversion is meant to be re-run by hand whenever a
 * city re-publishes its dataset, per ADR-0007's "不定期更新" cadence.
 *
 * --city only decides the output file name, but it decides it rather than
 * the operator: a 新竹市 shapefile written to taichung-zoning.geojson
 * would be published as the wrong city's zoning with nothing to catch it.
 *
 * The 臺中市 source .prj is TWD97 / TM2 zone 121 (EPSG:3826), a projected
 * coordinate system in meters — NOT lon/lat despite the dataset's
 * "_WGS84" name on the open data catalog page. Every coordinate is
 * reprojected to WGS84 (EPSG:4326) here; check a new city's .prj says the
 * same before trusting the output.
 *
 * Usage:
 *   npm run convert:zoning -- --city=taichung <input.shp> <input.dbf>
 */

const TWD97_TM2_ZONE121 = "+proj=tmerc +lat_0=0 +lon_0=121 +k=0.9999 +x_0=250000 +y_0=0 +ellps=GRS80 +units=m +no_defs";

type NestedPosition = Position | NestedPosition[];

function reprojectCoordinates(coordinates: NestedPosition): NestedPosition {
  if (typeof coordinates[0] === "number") {
    const [lon, lat] = proj4(TWD97_TM2_ZONE121, "WGS84", coordinates as Position) as [number, number];
    return [lon, lat];
  }
  return (coordinates as NestedPosition[]).map(reprojectCoordinates);
}

async function main() {
  const city = cityFromArgs();
  const outputPath = outputPathFor(city, "zoning");
  const [shpPath, dbfPath] = positionalArgs(["city"]);
  if (!shpPath || !dbfPath) {
    console.error("Usage: convertZoningShpToGeoJson.ts --city=<id> <input.shp> <input.dbf>");
    process.exit(1);
  }

  const source = await shapefile.open(shpPath, dbfPath, { encoding: "utf-8" });
  const features: FeatureCollection<Polygon | MultiPolygon, { zoneName: string }>["features"] = [];

  let result = await source.read();
  while (!result.done) {
    const { geometry, properties } = result.value;
    const zoneName = (properties as Record<string, unknown>).U2C;

    if (typeof zoneName === "string" && (geometry.type === "Polygon" || geometry.type === "MultiPolygon")) {
      features.push({
        type: "Feature",
        properties: { zoneName },
        geometry: {
          type: geometry.type,
          coordinates: reprojectCoordinates(geometry.coordinates as NestedPosition),
        } as Polygon | MultiPolygon,
      });
    }

    result = await source.read();
  }

  const collection: FeatureCollection<Polygon | MultiPolygon, { zoneName: string }> = {
    type: "FeatureCollection",
    features,
  };

  writeFileSync(outputPath, JSON.stringify(collection));
  console.log(`Wrote ${features.length} ${city.name} zones to ${outputPath}`);
}

main();
