import { createServer } from "node:http";
import { networkInterfaces } from "node:os";
import type { PropertyQueryService } from "../property-query/PropertyQueryService.ts";

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

/**
 * Local dev-only HTTP wrapper around PropertyQueryService, so a phone on
 * the same Wi-Fi (running the Expo mobile app in mobile/) can exercise the
 * real service logic without needing node:sqlite/node:fs support in the
 * React Native runtime. Not part of the production composition root —
 * see src/index.ts for that. Shared by src/server.ts (fixtures) and
 * src/server.real.ts (live Google API + real Taichung data).
 */
export function startPropertyServer(service: PropertyQueryService, onListening: (lanAddresses: string[]) => void) {
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
    onListening(localLanAddresses());
  });

  return server;
}

export { PORT };
