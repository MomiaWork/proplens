// The 物件查詢 engine: address in, 物件資訊卡 out. Platform-free — every
// dependency below is either pure logic or one of the seams in sqlite.ts /
// files.ts / geocoding.ts, so the phone and the test suite run this exact
// code (src/device/queryEngine.ts is the app's composition root,
// tests/fixtureWorld.ts the test suite's).
import type { GeocodingClient } from "./geocoding";
import type { GeoJsonZoneLookup } from "./zoneLookup";
import type { AddressPointStore, TransactionStore, VillageNeighborhoodCache, VillageNeighborhood, ValidTransaction } from "./stores";
import type { JsonSchoolDistrictLookup } from "./schoolDistrictLookup";
import type { City } from "./cities";
import { parseAddress } from "./parseAddress";

export type AddressToZoneResult =
  | { status: "ok"; zoneName: string }
  /** Not in any 都市計畫分區 of the city being queried (which city that is, is the caller's to say). */
  | { status: "outside-city" }
  | { status: "address-not-recognized" };

/**
 * Tries the 門牌 dataset (exact door-plate match) for a coordinate before
 * calling the geocoder — every 有效交易紀錄 address has a precise 門牌, so
 * this keeps bulk zone enrichment (enrichTransactionZones) from hammering
 * Apple's on-device geocoder's network rate limit with one call per
 * transaction (see geocoding.ts).
 */
export class AddressToZoneService {
  constructor(
    private readonly city: City,
    private readonly geocodingClient: GeocodingClient,
    private readonly zoneLookup: GeoJsonZoneLookup,
    private readonly addressPointStore: AddressPointStore,
  ) {}

  async resolve(address: string): Promise<AddressToZoneResult> {
    const parsed = parseAddress(address, this.city);
    const fromAddressPoints = parsed ? this.addressPointStore.findExactCoordinate(parsed) : undefined;
    const coordinate = fromAddressPoints ?? (await this.geocodingClient.geocode(address));
    if (!coordinate) {
      return { status: "address-not-recognized" };
    }

    const zoneName = await this.zoneLookup.findZone(coordinate);
    if (!zoneName) {
      return { status: "outside-city" };
    }

    return { status: "ok", zoneName };
  }
}

export type AddressToVillageResult = ({ status: "found" } & VillageNeighborhood) | { status: "address-not-in-registry" };

const DEFAULT_MAX_FALLBACK_DISTANCE_METERS = 200;

export class AddressToVillageService {
  constructor(
    private readonly city: City,
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

    const parsed = parseAddress(address, this.city);
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

export type SchoolDistrictFieldResult =
  | { status: "found"; schoolName: string }
  | { status: "needs-manual-review" }
  | { status: "address-not-in-registry" };

export interface SchoolDistrictCard {
  elementarySchoolDistrict: SchoolDistrictFieldResult;
  juniorHighSchoolDistrict: SchoolDistrictFieldResult;
}

const NOT_IN_REGISTRY_CARD: SchoolDistrictCard = {
  elementarySchoolDistrict: { status: "address-not-in-registry" },
  juniorHighSchoolDistrict: { status: "address-not-in-registry" },
};

export class SchoolDistrictService {
  constructor(
    private readonly geocodingClient: GeocodingClient,
    private readonly addressToVillage: AddressToVillageService,
    private readonly elementaryLookup: JsonSchoolDistrictLookup,
    private readonly juniorHighLookup: JsonSchoolDistrictLookup,
  ) {}

  async resolve(address: string): Promise<SchoolDistrictCard> {
    const villageResult = await this.addressToVillage.resolve(address);
    if (villageResult.status === "address-not-in-registry") {
      return NOT_IN_REGISTRY_CARD;
    }

    const coordinate = await this.geocodingClient.geocode(address);
    if (!coordinate) {
      return NOT_IN_REGISTRY_CARD;
    }

    const { village, neighborhood } = villageResult;
    const [elementarySchoolDistrict, juniorHighSchoolDistrict] = await Promise.all([
      this.elementaryLookup.match(village, neighborhood, coordinate),
      this.juniorHighLookup.match(village, neighborhood, coordinate),
    ]);
    return { elementarySchoolDistrict, juniorHighSchoolDistrict };
  }
}

export type PropertyCard =
  | ({ status: "ok"; zoneName: string; averagePrice: number; sampleCount: number } & SchoolDistrictCard)
  | ({ status: "insufficient-sample"; zoneName: string; sampleCount: number; transactions: ValidTransaction[] } &
      SchoolDistrictCard)
  | { status: "address-not-recognized" }
  | { status: "outside-city" };

const DEFAULT_SAMPLE_THRESHOLD = 5;

/**
 * The single 物件查詢 entry point (spec's one seam), running entirely
 * on-device: address in, 物件資訊卡 out. Composes address-to-zone
 * resolution, the pre-downloaded 有效交易紀錄 store, and school-district
 * lookup.
 */
export class PropertyQueryService {
  constructor(
    private readonly addressToZone: AddressToZoneService,
    private readonly transactionStore: TransactionStore,
    private readonly schoolDistrictService: SchoolDistrictService,
    private readonly sampleThreshold: number = DEFAULT_SAMPLE_THRESHOLD,
  ) {}

  async query(address: string): Promise<PropertyCard> {
    const resolution = await this.addressToZone.resolve(address);
    if (resolution.status !== "ok") {
      return resolution;
    }
    const { zoneName } = resolution;

    const schoolDistricts = await this.schoolDistrictService.resolve(address);
    const sameZoneTransactions = this.transactionStore.findByZone(zoneName);

    if (sameZoneTransactions.length < this.sampleThreshold) {
      return {
        status: "insufficient-sample",
        zoneName,
        sampleCount: sameZoneTransactions.length,
        transactions: sameZoneTransactions,
        ...schoolDistricts,
      };
    }

    const averagePrice = sameZoneTransactions.reduce((sum, t) => sum + t.price, 0) / sameZoneTransactions.length;

    return { status: "ok", zoneName, averagePrice, sampleCount: sameZoneTransactions.length, ...schoolDistricts };
  }
}
