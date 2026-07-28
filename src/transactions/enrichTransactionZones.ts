import type { AddressToZoneService } from "../address-to-zone/AddressToZoneService.ts";
import type { TransactionStore } from "./TransactionStore.ts";

/**
 * Resolves and stores each valid transaction's 都市計畫分區, so
 * PropertyQueryService can filter same-zone transactions with a plain
 * indexed SQL query instead of re-resolving every transaction's zone on
 * every property query (see TransactionStore.findByZone and ADR-0012).
 * Only processes rows that don't have a zone_name yet, so re-running this
 * after a fresh ETL only pays for new/changed rows.
 */
export async function enrichTransactionZones(
  store: TransactionStore,
  addressToZone: AddressToZoneService,
): Promise<void> {
  for (const { id, address } of store.findUnresolvedZones()) {
    const resolution = await addressToZone.resolve(address);
    store.setZone(id, resolution.status === "ok" ? resolution.zoneName : null);
  }
}
