import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { PropertyQueryService } from "./PropertyQueryService.ts";
import { AddressToZoneService } from "../address-to-zone/AddressToZoneService.ts";
import { GeoJsonZoneLookup } from "../zoning/ZoneLookup.ts";
import { FixtureGeocodingClient } from "../geocoding/FixtureGeocodingClient.ts";
import { TransactionStore } from "../transactions/TransactionStore.ts";
import { TransactionEtl } from "../transactions/TransactionEtl.ts";
import { FixtureTransactionDownloader } from "../transactions/FixtureTransactionDownloader.ts";
import type { RawTransactionRecord } from "../transactions/types.ts";
import type { Coordinate } from "../shared/Coordinate.ts";

/**
 * Black-box tests for the 物件查詢 service — the spec's single agreed seam
 * (see spec.md "Testing Decisions"). Only the geocoding API boundary is
 * stubbed (FixtureGeocodingClient); zoning, ETL, and aggregation all run
 * real logic against fixture data.
 *
 * Fixture world: three 都市計畫分區 defined in
 * ../zoning/fixtures/sample-zones.geojson — 住宅區 and 商業區 share a
 * border, 農業區 sits alone. 住宅區 has 6 valid transactions (above the
 * default sample threshold of 5), 商業區 has 1, 農業區 has 2 (both below
 * threshold).
 */

const zoningDataPath = fileURLToPath(new URL("../zoning/fixtures/sample-zones.geojson", import.meta.url));

const addressBook = new Map<string, Coordinate>([
  // query targets
  ["台中市住宅區示範路1號", { lat: 24.155, lon: 120.645 }], // interior of 住宅區
  ["台中市住宅區示範路2號近商業區", { lat: 24.155, lon: 120.6499 }], // 住宅區 side of the 住宅區/商業區 border
  ["台中市商業區興中路1號近住宅區", { lat: 24.155, lon: 120.6501 }], // 商業區 side of the same border
  ["台中市農業區產業道路1號", { lat: 24.2025, lon: 120.7025 }], // interior of 農業區
  ["台北市信義區信義路五段7號", { lat: 24.3, lon: 120.9 }], // geocodes fine, outside every zone
  // transaction addresses (住宅區: 6, above threshold)
  ["住宅區交易1號", { lat: 24.151, lon: 120.641 }],
  ["住宅區交易2號", { lat: 24.152, lon: 120.642 }],
  ["住宅區交易3號", { lat: 24.153, lon: 120.643 }],
  ["住宅區交易4號", { lat: 24.154, lon: 120.644 }],
  ["住宅區交易5號", { lat: 24.156, lon: 120.646 }],
  ["住宅區交易6號", { lat: 24.157, lon: 120.647 }],
  // transaction addresses (商業區: 1, below threshold)
  ["商業區交易1號", { lat: 24.151, lon: 120.651 }],
  // transaction addresses (農業區: 2, below threshold)
  ["農業區交易1號", { lat: 24.201, lon: 120.701 }],
  ["農業區交易2號", { lat: 24.202, lon: 120.702 }],
  // "台中市打字錯誤路999號" is intentionally absent, to simulate a typo'd address
]);

const rawTransactions: RawTransactionRecord[] = [
  { address: "住宅區交易1號", transactionDateRoc: "1110101", price: 10_000_000 },
  { address: "住宅區交易2號", transactionDateRoc: "1110102", price: 11_000_000 },
  { address: "住宅區交易3號", transactionDateRoc: "1110103", price: 12_000_000 },
  { address: "住宅區交易4號", transactionDateRoc: "1110104", price: 13_000_000 },
  { address: "住宅區交易5號", transactionDateRoc: "1110105", price: 14_000_000 },
  { address: "住宅區交易6號", transactionDateRoc: "1110106", price: 15_000_000 },
  { address: "商業區交易1號", transactionDateRoc: "1110201", price: 20_000_000 },
  { address: "農業區交易1號", transactionDateRoc: "1110301", price: 5_000_000 },
  { address: "農業區交易2號", transactionDateRoc: "1110302", price: 4_800_000 },
];

async function buildService(): Promise<PropertyQueryService> {
  const geocodingClient = new FixtureGeocodingClient(addressBook);
  const zoneLookup = new GeoJsonZoneLookup(zoningDataPath);
  const addressToZone = new AddressToZoneService(geocodingClient, zoneLookup);

  const store = new TransactionStore(":memory:");
  const etl = new TransactionEtl(new FixtureTransactionDownloader(rawTransactions), store);
  await etl.run();

  return new PropertyQueryService(addressToZone, store);
}

describe("PropertyQueryService", () => {
  it("一般案例：回傳正確分區名稱 + 同分區均價 + 樣本數", async () => {
    const service = await buildService();
    const card = await service.query("台中市住宅區示範路1號");
    expect(card).toEqual({ status: "ok", zoneName: "住宅區", averagePrice: 12_500_000, sampleCount: 6 });
  });

  it("分區交界案例：交界兩側地址分別得到正確分區，且統計只涵蓋各自分區的交易", async () => {
    const service = await buildService();

    const residentialSide = await service.query("台中市住宅區示範路2號近商業區");
    expect(residentialSide).toEqual({ status: "ok", zoneName: "住宅區", averagePrice: 12_500_000, sampleCount: 6 });

    const commercialSide = await service.query("台中市商業區興中路1號近住宅區");
    expect(commercialSide.status).toBe("insufficient-sample");
    if (commercialSide.status === "insufficient-sample") {
      expect(commercialSide.zoneName).toBe("商業區");
      expect(commercialSide.transactions.map((t) => t.address)).toEqual(["商業區交易1號"]);
    }
  });

  it("樣本不足案例：回傳原始交易清單而非均價，並標示樣本數", async () => {
    const service = await buildService();
    const card = await service.query("台中市農業區產業道路1號");
    expect(card.status).toBe("insufficient-sample");
    if (card.status === "insufficient-sample") {
      expect(card.zoneName).toBe("農業區");
      expect(card.sampleCount).toBe(2);
      expect(card.transactions.map((t) => t.address).sort()).toEqual(["農業區交易1號", "農業區交易2號"]);
    }
  });

  it("Geocoding 失敗案例：無法辨識的地址回傳明確錯誤", async () => {
    const service = await buildService();
    const card = await service.query("台中市打字錯誤路999號");
    expect(card).toEqual({ status: "address-not-recognized" });
  });

  it("超出範圍案例：地址有效但不在台中市任何分區內，回傳與「無法辨識」不同的錯誤", async () => {
    const service = await buildService();
    const card = await service.query("台北市信義區信義路五段7號");
    expect(card).toEqual({ status: "outside-taichung" });
  });

  it("不呈現任何自行計算的比較值、差額或百分比——只有原始事實欄位", async () => {
    const service = await buildService();
    const card = await service.query("台中市住宅區示範路1號");
    expect(Object.keys(card).sort()).toEqual(["averagePrice", "sampleCount", "status", "zoneName"]);
  });
});
