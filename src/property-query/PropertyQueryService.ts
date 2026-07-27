import type { AddressToZoneService } from "../address-to-zone/AddressToZoneService.ts";
import type { TransactionStore } from "../transactions/TransactionStore.ts";
import type { ValidTransaction } from "../transactions/types.ts";

export type PropertyCard =
  | { status: "ok"; zoneName: string; averagePrice: number; sampleCount: number }
  | { status: "insufficient-sample"; zoneName: string; sampleCount: number; transactions: ValidTransaction[] }
  | { status: "address-not-recognized" }
  | { status: "outside-taichung" };

const DEFAULT_SAMPLE_THRESHOLD = 5;

/**
 * The single 物件查詢 entry point (spec's one seam): address in, 物件資訊卡
 * out. Composes address-to-zone resolution with the 有效交易紀錄 store —
 * callers never need to know about the ETL or point-in-polygon logic
 * underneath.
 *
 * Only ever surfaces raw facts (zone name, average price, sample count) —
 * never a cross-object comparison, per ADR-0005.
 */
export class PropertyQueryService {
  constructor(
    private readonly addressToZone: AddressToZoneService,
    private readonly transactionStore: TransactionStore,
    private readonly sampleThreshold: number = DEFAULT_SAMPLE_THRESHOLD,
  ) {}

  async query(address: string): Promise<PropertyCard> {
    const resolution = await this.addressToZone.resolve(address);
    if (resolution.status !== "ok") {
      return resolution;
    }
    const { zoneName } = resolution;

    const sameZoneTransactions = await this.findSameZoneTransactions(zoneName);

    if (sameZoneTransactions.length < this.sampleThreshold) {
      return {
        status: "insufficient-sample",
        zoneName,
        sampleCount: sameZoneTransactions.length,
        transactions: sameZoneTransactions,
      };
    }

    const averagePrice =
      sameZoneTransactions.reduce((sum, t) => sum + t.price, 0) / sameZoneTransactions.length;

    return { status: "ok", zoneName, averagePrice, sampleCount: sameZoneTransactions.length };
  }

  /**
   * Re-resolves every stored transaction's zone on every call, by design:
   * ADR-0007 forbids caching the zone judgment itself, since the zoning
   * dataset updates unpredictably. This stays cheap because the geocoding
   * step underneath (address -> coordinate) IS cached — each transaction
   * address is only ever sent to the Geocoding API once, no matter how many
   * property queries run afterward. Only the local point-in-polygon check
   * re-runs every time.
   */
  private async findSameZoneTransactions(zoneName: string): Promise<ValidTransaction[]> {
    const sameZone: ValidTransaction[] = [];
    for (const transaction of this.transactionStore.all()) {
      const transactionZone = await this.addressToZone.resolve(transaction.address);
      if (transactionZone.status === "ok" && transactionZone.zoneName === zoneName) {
        sameZone.push(transaction);
      }
    }
    return sameZone;
  }
}
