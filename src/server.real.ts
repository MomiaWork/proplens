import { buildRealPropertyQueryService } from "./dev/realWorld.ts";
import { startPropertyServer, PORT } from "./dev/httpServer.ts";

/**
 * Same /property?address=... contract as src/server.ts, but backed by the
 * live Google Geocoding API and real Taichung data — costs Google API
 * quota per unique address, and needs GOOGLE_MAPS_API_KEY set (see
 * src/dev/realWorld.ts) plus data/taichung-zoning.geojson to exist (see
 * src/dev/convertZoningShpToGeoJson.ts). The mobile app needs no changes
 * to point at this instead of src/server.ts — same host/port/contract.
 */
async function main() {
  console.log("Running 實價登錄 ETL against the live government data source...");
  const service = await buildRealPropertyQueryService();

  startPropertyServer(service, (lanAddresses) => {
    console.log(`PropLens dev server (REAL data — live Google API + real Taichung zoning/實價登錄) listening on port ${PORT}`);
    console.log("");
    console.log("Try a real Taichung address, e.g.:");
    console.log("  台中市西屯區台灣大道三段99號");
    console.log("");
    console.log("From the iPhone (same Wi-Fi), use one of:");
    for (const address of lanAddresses) {
      console.log(`  http://${address}:${PORT}/property?address=...`);
    }
  });
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
