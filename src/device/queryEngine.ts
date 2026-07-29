// Composition root for the app: wires the expo-sqlite adapter into the
// platform-free engine in src/core. The test suite wires the same engine
// to node adapters (tests/fixtureWorld.ts), so what ships is what's tested.
//
// One engine per 縣市 (ADR-0017), and — for now — the 實價登錄-only card
// (ADR-0018), which needs nothing but <city>-transactions.sqlite. That's
// why there's no geocoder, no zoning file and no 門牌 store wired up here
// any more: the fuller card's engine still lives in src/core, but nothing
// on the phone can run it until every supported city has those files.
import { TransactionStore } from "../core/stores";
import { cityById, dataFileName, type CityId } from "../core/cities";
import { TransactionQueryService } from "../core/transactionQueryService";
import { openDeviceDatabase } from "./sqlite";

export type { TransactionCard } from "../core/transactionQueryService";
export type { ValidTransaction } from "../core/stores";

const services = new Map<CityId, TransactionQueryService>();

function buildService(cityId: CityId): TransactionQueryService {
  const city = cityById(cityId);
  // SQLite files open by name — openDeviceDatabase resolves them inside
  // expo-file-system's SQLite/ directory, where dataSync puts them.
  const transactionStore = new TransactionStore(openDeviceDatabase(dataFileName(city, "transactions")));
  return new TransactionQueryService(city, transactionStore);
}

/**
 * Builds (or rebuilds) the query engine for one city against its
 * currently-synced local data file. Call with forceRebuild after
 * syncCityDataIfNeeded() reports updated:true — a stale cached instance
 * would otherwise keep querying the previous snapshot's SQLite connection
 * for the rest of the app session.
 */
export function getTransactionQueryService(cityId: CityId, forceRebuild = false): TransactionQueryService {
  const cached = services.get(cityId);
  if (cached && !forceRebuild) {
    return cached;
  }
  const service = buildService(cityId);
  services.set(cityId, service);
  return service;
}
