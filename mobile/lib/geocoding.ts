// GeocodingClient interface mirrors src/geocoding/GeocodingClient.ts.
// CachingGeocodingClient mirrors src/geocoding/CachingGeocodingClient.ts
// (only GeocodingCache's storage moved from node:sqlite to expo-sqlite —
// see db.ts). AppleLocationGeocodingClient has no server-side equivalent:
// it uses expo-location's on-device geocoder (Apple/Android's own, same
// one iOS Shortcuts' "Get Details of Location" action uses) instead of a
// network API — free, no quota, no API key shipped in the app bundle. See
// ADR-0014 for why the mobile app no longer calls Google at all.
import * as Location from "expo-location";
import type { Coordinate } from "./geo";
import type { GeocodingCache } from "./db";

export interface GeocodingClient {
  geocode(address: string): Promise<Coordinate | null>;
}

export class AppleLocationGeocodingClient implements GeocodingClient {
  private permissionGranted: boolean | null = null;

  async geocode(address: string): Promise<Coordinate | null> {
    if (this.permissionGranted === null) {
      const { status } = await Location.requestForegroundPermissionsAsync();
      this.permissionGranted = status === "granted";
    }
    if (!this.permissionGranted) {
      throw new Error("沒有位置權限，無法把地址轉換成座標。請到系統設定開啟後再試一次。");
    }

    const [result] = await Location.geocodeAsync(address);
    return result ? { lat: result.latitude, lon: result.longitude } : null;
  }
}

export class CachingGeocodingClient implements GeocodingClient {
  constructor(
    private readonly inner: GeocodingClient,
    private readonly cache: GeocodingCache,
  ) {}

  async geocode(address: string): Promise<Coordinate | null> {
    const cached = this.cache.get(address);
    if (cached) {
      return cached;
    }

    const result = await this.inner.geocode(address);
    if (result) {
      this.cache.set(address, result);
    }
    return result;
  }
}
