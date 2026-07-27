import { createServer } from "node:http";
import { networkInterfaces } from "node:os";
import { buildFixturePropertyQueryService } from "./dev/fixtureWorld.ts";

/**
 * Local dev-only HTTP wrapper around PropertyQueryService, so a phone on
 * the same Wi-Fi (running the Expo mobile app in mobile/) can exercise the
 * real service logic without needing node:sqlite/node:fs support in the
 * React Native runtime. Not part of the production composition root —
 * see src/index.ts for that.
 */

const PORT = 4000;

function localLanAddresses(): string[] {
  const addresses: string[] = [];
  for (const iface of Object.values(networkInterfaces())) {
    for (const info of iface ?? []) {
      if (info.family === "IPv4" && !info.internal && !info.address.startsWith("169.254.")) {
        addresses.push(info.address);
      }
    }
  }
  return addresses;
}

async function main() {
  const service = await buildFixturePropertyQueryService();

  const server = createServer(async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);

    if (url.pathname !== "/property") {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "not found" }));
      return;
    }

    const address = url.searchParams.get("address");
    if (!address) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "missing ?address= query param" }));
      return;
    }

    const card = await service.query(address);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(card));
  });

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`PropLens dev server listening on port ${PORT}`);
    console.log("Fixture addresses to try (see src/dev/fixtureWorld.ts):");
    console.log("  台中市住宅區示範路1號        (一般案例)");
    console.log("  台中市農業區產業道路1號       (樣本不足)");
    console.log("  台中市打字錯誤路999號         (地址無法辨識)");
    console.log("  台北市信義區信義路五段7號     (超出台中市範圍)");
    console.log("");
    console.log("From the iPhone (same Wi-Fi), use one of:");
    for (const address of localLanAddresses()) {
      console.log(`  http://${address}:${PORT}/property?address=...`);
    }
  });
}

main();
