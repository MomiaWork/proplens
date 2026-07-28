import { createServer } from "node:http";
import { networkInterfaces } from "node:os";
import type { PropertyQueryService } from "../property-query/PropertyQueryService";

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
 * the same Wi-Fi (running the Expo app in this repo) can exercise the
 * real service logic without needing node:sqlite/node:fs support in the
 * React Native runtime. Not part of the production composition root —
 * see tools/index.ts for that. Shared by tools/server.ts (fixtures) and
 * tools/server.real.ts (live Google API + real Taichung data).
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

    try {
      const card = await service.query(address);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(card));
    } catch (err) {
      console.error(err);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
    }
  });

  server.listen(PORT, "0.0.0.0", () => {
    onListening(localLanAddresses());
  });

  return server;
}

export { PORT };
