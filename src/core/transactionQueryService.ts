// 實價登錄-only 物件查詢 (ADR-0018): address in, 同路段有效交易 out.
//
// This is the reduced card the app currently ships — it needs nothing but
// <city>-transactions.sqlite, so it works for every supported city today,
// including the ones whose 門牌/分區/學區 files nobody has been able to
// obtain yet. The fuller 分區-anchored card lives in propertyQueryService.ts
// and comes back when those files exist for every city.
//
// Platform-free, like everything in src/core: no seams are needed at all
// here beyond the SQLite one, since 同路段 matching is string comparison
// rather than geocoding.
import type { City } from "./cities";
import type { TransactionStore, ValidTransaction } from "./stores";
import { parseAddress } from "./parseAddress";

export type TransactionCard =
  | {
      status: "ok";
      /** The 路段 the transactions were matched on, e.g. 西大路. */
      street: string;
      count: number;
      transactions: ValidTransaction[];
    }
  | {
      /** The address parsed fine; this street simply has no 有效交易紀錄. */
      status: "no-transactions-on-street";
      street: string;
    }
  | { status: "address-not-recognized" };

/**
 * The single 物件查詢 entry point while the card is 實價登錄-only.
 *
 * Deliberately returns the raw records and their count, and nothing
 * aggregated: 同路段 is a much looser scope than the 同分區 ADR-0003 chose,
 * so a single headline number over it would carry more authority than the
 * scope supports. Every field the card shows is a value 實價登錄 published
 * or a unit conversion of one (ADR-0005).
 */
export class TransactionQueryService {
  constructor(
    private readonly city: City,
    private readonly transactionStore: TransactionStore,
  ) {}

  async query(address: string): Promise<TransactionCard> {
    const parsed = parseAddress(address, this.city);
    // No 門牌 pattern at all — there's no street to match on, and unlike
    // the 分區 path there's no geocoder fallback to rescue it here.
    if (!parsed || !parsed.street) {
      return { status: "address-not-recognized" };
    }

    const transactions = this.transactionStore.findByStreet(parsed.districtCode, parsed.street);
    if (transactions.length === 0) {
      return { status: "no-transactions-on-street", street: parsed.street };
    }

    return { status: "ok", street: parsed.street, count: transactions.length, transactions };
  }
}
