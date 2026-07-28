import { buildFixturePropertyQueryService } from "./dev/fixtureWorld";
import { startPropertyServer, PORT } from "./dev/httpServer";

async function main() {
  const service = await buildFixturePropertyQueryService();

  startPropertyServer(service, (lanAddresses) => {
    console.log(`PropLens dev server (fixture data) listening on port ${PORT}`);
    console.log("Fixture addresses to try (see tools/dev/fixtureWorld.ts):");
    console.log("  台中市住宅區示範路1號        (一般案例)");
    console.log("  台中市農業區產業道路1號       (樣本不足)");
    console.log("  台中市打字錯誤路999號         (地址無法辨識)");
    console.log("  台北市信義區信義路五段7號     (超出台中市範圍)");
    console.log("");
    console.log("From the iPhone (same Wi-Fi), use one of:");
    for (const address of lanAddresses) {
      console.log(`  http://${address}:${PORT}/property?address=...`);
    }
  });
}

main();
