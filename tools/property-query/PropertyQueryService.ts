import type { AddressToZoneService } from "../address-to-zone/AddressToZoneService";
import type { TransactionStore } from "../transactions/TransactionStore";
import type { ValidTransaction } from "../transactions/types";
import type { SchoolDistrictService, SchoolDistrictCard } from "../school-district/SchoolDistrictService";

export type PropertyCard =
  | ({ status: "ok"; zoneName: string; averagePrice: number; sampleCount: number } & SchoolDistrictCard)
  | ({ status: "insufficient-sample"; zoneName: string; sampleCount: number; transactions: ValidTransaction[] } &
      SchoolDistrictCard)
  | { status: "address-not-recognized" }
  | { status: "outside-taichung" };

const DEFAULT_SAMPLE_THRESHOLD = 5;

/**
 * The single 物件查詢 entry point (spec's one seam): address in, 物件資訊卡
 * out. Composes address-to-zone resolution, the 有效交易紀錄 store, and
 * school-district lookup — callers never need to know about the ETL,
 * point-in-polygon, or 門牌/學區表比對 logic underneath.
 *
 * Only ever surfaces raw facts (zone name, average price, sample count,
 * school names) — never a cross-object comparison, per ADR-0005. School
 * district fields are omitted entirely when the address itself is invalid
 * (address-not-recognized / outside-taichung) — there's no zone to anchor
 * a school-district lookup to in that case.
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

    const averagePrice =
      sameZoneTransactions.reduce((sum, t) => sum + t.price, 0) / sameZoneTransactions.length;

    return { status: "ok", zoneName, averagePrice, sampleCount: sameZoneTransactions.length, ...schoolDistricts };
  }
}
