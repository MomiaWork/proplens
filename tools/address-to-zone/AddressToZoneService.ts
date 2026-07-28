import type { GeocodingClient } from "../geocoding/GeocodingClient";
import type { ZoneLookup } from "../zoning/ZoneLookup";
import type { AddressPointStore } from "../address-to-village/AddressPointStore";
import { parseAddress } from "../../src/core/parseAddress";

export type AddressToZoneResult =
  | { status: "ok"; zoneName: string }
  | { status: "address-not-recognized" }
  | { status: "outside-taichung" };

/**
 * Composes geocoding (cached) with zone lookup (never cached, per
 * ADR-0007) into the address -> 都市計畫分區 seam. Distinguishes an
 * unrecognized address from one that geocodes fine but falls outside every
 * known zone, since those are different failure messages to the user.
 *
 * Tries the 門牌 dataset (exact door-plate match) for a coordinate before
 * calling the geocoder — every 有效交易紀錄 address has a precise 門牌, so
 * this keeps bulk zone enrichment (enrichTransactionZones) from making a
 * network geocoding call per transaction.
 */
export class AddressToZoneService {
  constructor(
    private readonly geocodingClient: GeocodingClient,
    private readonly zoneLookup: ZoneLookup,
    private readonly addressPointStore: AddressPointStore,
  ) {}

  async resolve(address: string): Promise<AddressToZoneResult> {
    const parsed = parseAddress(address);
    const fromAddressPoints = parsed ? this.addressPointStore.findExactCoordinate(parsed) : undefined;
    const coordinate = fromAddressPoints ?? (await this.geocodingClient.geocode(address));
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
