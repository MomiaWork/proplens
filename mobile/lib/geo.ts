// Mirrors ../../src/shared/geo.ts — duplicated because Metro doesn't
// bundle files outside this app's root. Pure math, no Node APIs, so it's a
// verbatim copy.
export interface Coordinate {
  lat: number;
  lon: number;
}

const EARTH_RADIUS_METERS = 6_371_000;

export function haversineDistanceMeters(a: Coordinate, b: Coordinate): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(h));
}
