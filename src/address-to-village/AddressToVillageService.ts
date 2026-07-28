import type { GeocodingClient } from "../geocoding/GeocodingClient.ts";
import type { AddressPointStore } from "./AddressPointStore.ts";
import type { VillageNeighborhoodCache, VillageNeighborhood } from "./VillageNeighborhoodCache.ts";
import { parseAddress } from "./parseAddress.ts";

export type AddressToVillageResult = ({ status: "found" } & VillageNeighborhood) | { status: "address-not-in-registry" };

const DEFAULT_MAX_FALLBACK_DISTANCE_METERS = 200;

/**
 * Address -> 里/鄰, per ADR-0008: matched against the local 門牌
 * (house-number) dataset rather than point-in-polygon, since 鄰 has no
 * spatial boundary. Exact match against the normalized address first; if
 * the address isn't in the current monthly snapshot, falls back to the
 * nearest door plate within maxFallbackDistanceMeters (ADR-0011). Found
 * results are cached (ADR-0009); "not found at all" is not cached, same
 * reasoning as GeocodingCache not caching misses.
 */
export class AddressToVillageService {
  constructor(
    private readonly geocodingClient: GeocodingClient,
    private readonly store: AddressPointStore,
    private readonly cache: VillageNeighborhoodCache,
    private readonly maxFallbackDistanceMeters: number = DEFAULT_MAX_FALLBACK_DISTANCE_METERS,
  ) {}

  async resolve(address: string): Promise<AddressToVillageResult> {
    const cached = this.cache.get(address);
    if (cached) {
      return { status: "found", ...cached };
    }

    const parsed = parseAddress(address);
    const exact = parsed ? this.store.findExact(parsed) : undefined;
    if (exact) {
      this.cache.set(address, exact);
      return { status: "found", ...exact };
    }

    const coordinate = await this.geocodingClient.geocode(address);
    const nearest = coordinate ? this.store.findNearest(coordinate, this.maxFallbackDistanceMeters) : undefined;
    if (!nearest) {
      return { status: "address-not-in-registry" };
    }

    this.cache.set(address, nearest);
    return { status: "found", ...nearest };
  }
}
