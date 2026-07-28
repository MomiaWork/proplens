// Fills in transactions.sqlite's zone_name column (ADR-0014). The file
// ships from the pipeline with zone_name always NULL — enriching it there
// needed Google. The phone fills it in itself, once per download (only
// unresolved rows are processed, so a second sync with the same file is a
// no-op).
//
// Most rows resolve straight from the local 門牌 dataset with no network
// at all; the rest fall back to the device geocoder, which is rate-limited
// per app (see geocoding.ts). Several hundred such rows can't all be done
// in one sitting, so this is deliberately resumable: hitting the limit
// stops the batch and leaves the remaining rows NULL for the next launch
// to pick up, rather than failing the whole data sync.
import type { AddressToZoneService } from "./propertyQueryService";
import type { TransactionStore } from "./stores";
import { GeocodingRateLimitError } from "./geocoding";

export interface EnrichmentResult {
  /** Rows given a zone (or a definitive "no zone") this run. */
  processed: number;
  /** Rows still unresolved — a later launch will retry them. */
  remaining: number;
  /** True when the device geocoder throttled us and the batch stopped early. */
  stoppedByRateLimit: boolean;
}

export async function enrichTransactionZones(
  store: TransactionStore,
  addressToZone: AddressToZoneService,
  onProgress?: (done: number, total: number) => void,
): Promise<EnrichmentResult> {
  const unresolved = store.findUnresolvedZones();
  let processed = 0;

  for (const { id, address } of unresolved) {
    try {
      const resolution = await addressToZone.resolve(address);
      store.setZone(id, resolution.status === "ok" ? resolution.zoneName : null);
    } catch (err) {
      if (err instanceof GeocodingRateLimitError) {
        return { processed, remaining: unresolved.length - processed, stoppedByRateLimit: true };
      }
      throw err;
    }
    processed += 1;
    onProgress?.(processed, unresolved.length);
  }

  return { processed, remaining: 0, stoppedByRateLimit: false };
}
