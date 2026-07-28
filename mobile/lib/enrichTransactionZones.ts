// Mirrors src/transactions/enrichTransactionZones.ts, but runs on-device
// instead of server-side (see ADR-0014). transactions.sqlite is
// downloaded from the GitHub Release with zone_name always NULL — the
// server no longer geocodes it (that needed Google). The phone fills it
// in itself with the free on-device geocoder, once per download (only
// unresolved rows are processed, so a second sync with the same file is a
// no-op).
import type { AddressToZoneService } from "./propertyQueryService";
import type { TransactionStore } from "./db";

export async function enrichTransactionZones(
  store: TransactionStore,
  addressToZone: AddressToZoneService,
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  const unresolved = store.findUnresolvedZones();
  let done = 0;
  for (const { id, address } of unresolved) {
    const resolution = await addressToZone.resolve(address);
    store.setZone(id, resolution.status === "ok" ? resolution.zoneName : null);
    done += 1;
    onProgress?.(done, unresolved.length);
  }
}
