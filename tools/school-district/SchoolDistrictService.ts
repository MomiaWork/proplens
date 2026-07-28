import type { GeocodingClient } from "../geocoding/GeocodingClient";
import type { AddressToVillageService } from "../address-to-village/AddressToVillageService";
import type { SchoolDistrictLookup } from "./SchoolDistrictLookup";

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

/**
 * Composes address -> 里/鄰 (ticket 01) with 里/鄰 -> school (ticket 02) for
 * both 國小 and 國中, which are independent lookups against separate
 * datasets (per spec, built together but never blocking each other — one
 * can be needs-manual-review while the other is found).
 */
export class SchoolDistrictService {
  constructor(
    private readonly geocodingClient: GeocodingClient,
    private readonly addressToVillage: AddressToVillageService,
    private readonly elementaryLookup: SchoolDistrictLookup,
    private readonly juniorHighLookup: SchoolDistrictLookup,
  ) {}

  async resolve(address: string): Promise<SchoolDistrictCard> {
    const villageResult = await this.addressToVillage.resolve(address);
    if (villageResult.status === "address-not-in-registry") {
      return NOT_IN_REGISTRY_CARD;
    }

    // Carve-out clauses need the address's own coordinate. Geocoding is
    // cached, so this never costs a second live API call.
    const coordinate = await this.geocodingClient.geocode(address);
    if (!coordinate) {
      return NOT_IN_REGISTRY_CARD;
    }

    const { village, neighborhood } = villageResult;
    return {
      elementarySchoolDistrict: this.elementaryLookup.match(village, neighborhood, coordinate),
      juniorHighSchoolDistrict: this.juniorHighLookup.match(village, neighborhood, coordinate),
    };
  }
}
