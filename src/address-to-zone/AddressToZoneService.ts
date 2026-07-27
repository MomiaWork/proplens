import type { GeocodingClient } from "../geocoding/GeocodingClient.ts";
import type { ZoneLookup } from "../zoning/ZoneLookup.ts";

export type AddressToZoneResult =
  | { status: "ok"; zoneName: string }
  | { status: "address-not-recognized" }
  | { status: "outside-taichung" };

/**
 * Composes geocoding (cached) with zone lookup (never cached, per
 * ADR-0007) into the address -> 都市計畫分區 seam. Distinguishes an
 * unrecognized address from one that geocodes fine but falls outside every
 * known zone, since those are different failure messages to the user.
 */
export class AddressToZoneService {
  constructor(
    private readonly geocodingClient: GeocodingClient,
    private readonly zoneLookup: ZoneLookup,
  ) {}

  async resolve(address: string): Promise<AddressToZoneResult> {
    const coordinate = await this.geocodingClient.geocode(address);
    if (!coordinate) {
      return { status: "address-not-recognized" };
    }

    const zoneName = this.zoneLookup.findZone(coordinate);
    if (!zoneName) {
      return { status: "outside-taichung" };
    }

    return { status: "ok", zoneName };
  }
}
