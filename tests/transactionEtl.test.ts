import { describe, it, expect } from "vitest";
import { cityById } from "../src/core/cities";
import { TransactionEtl, type StorableTransaction, type TransactionSink } from "../tools/transactions/TransactionEtl";
import type { RawTransactionRecord } from "../tools/transactions/types";

/**
 * The ingestion pipeline's half of ADR-0001: 民國 date conversion and the
 * 實價登錄2.0 (2021/7) validity cutoff. Pre-cutoff records carry 區段化
 * addresses that can't be geocoded, so they must never reach the engine —
 * the query engine has no way to tell them apart afterwards.
 *
 * Also the 同路段 match key (ADR-0018), which is derived here rather than
 * on the phone.
 */

class CollectingSink implements TransactionSink {
  readonly saved: StorableTransaction[] = [];

  upsertMany(transactions: StorableTransaction[]): void {
    this.saved.push(...transactions);
  }
}

function rawRecord(overrides: Partial<RawTransactionRecord> = {}): RawTransactionRecord {
  return {
    address: "測試路1號",
    transactionDateRoc: "1110715",
    price: 10_000_000,
    transactionSubject: "房地(土地+建物)",
    buildingType: "住宅大樓(11層含以上有電梯)",
    mainUse: "住家用",
    urbanLandUse: "住",
    completionDateRoc: "0941030",
    buildingAreaSqm: 132.23,
    unitPricePerSqm: 119_490,
    ...overrides,
  };
}

function etlOver(records: RawTransactionRecord[], cityId: "taichung" | "hsinchu" = "taichung") {
  const sink = new CollectingSink();
  const etl = new TransactionEtl(cityById(cityId), { download: async () => records }, sink);
  return { run: () => etl.run(), sink };
}

describe("TransactionEtl", () => {
  it("把民國日期轉成 ISO 日期", async () => {
    const { run, sink } = etlOver([rawRecord({ transactionDateRoc: "1110715" })]);
    await run();
    expect(sink.saved[0]).toMatchObject({ address: "測試路1號", transactionDate: "2022-07-15", price: 10_000_000 });
  });

  it("2021/7 實價登錄2.0 上路前的紀錄一律排除", async () => {
    const { run, sink } = etlOver([
      rawRecord({ address: "上路前1號", transactionDateRoc: "1100630" }),
      rawRecord({ address: "上路當天1號", transactionDateRoc: "1100701" }),
      rawRecord({ address: "上路後1號", transactionDateRoc: "1100801" }),
    ]);
    await run();
    expect(sink.saved.map((t) => t.address)).toEqual(["上路當天1號", "上路後1號"]);
  });

  it("無法辨識的民國日期直接報錯，不靜默略過", async () => {
    const { run } = etlOver([rawRecord({ transactionDateRoc: "abc" })]);
    await expect(run()).rejects.toThrow(/民國/);
  });

  it("保留房屋類別、類別、用途、分區與面積單價等原始欄位", async () => {
    const { run, sink } = etlOver([rawRecord()]);
    await run();
    expect(sink.saved[0]).toMatchObject({
      transactionSubject: "房地(土地+建物)",
      buildingType: "住宅大樓(11層含以上有電梯)",
      mainUse: "住家用",
      urbanLandUse: "住",
      completionDate: "2005-10-30",
      buildingAreaSqm: 132.23,
      unitPricePerSqm: 119_490,
    });
  });

  it("建築完成年月空白或 0（預售屋、土地）留空，不當成錯誤", async () => {
    const { run, sink } = etlOver([
      rawRecord({ address: "預售1號", completionDateRoc: "" }),
      rawRecord({ address: "預售2號", completionDateRoc: "0" }),
    ]);
    await run();
    expect(sink.saved.map((t) => t.completionDate)).toEqual([undefined, undefined]);
  });

  it("依縣市把地址拆出同路段比對用的行政區代碼與街名", async () => {
    const { run, sink } = etlOver([rawRecord({ address: "臺中市西屯區臺灣大道三段９９號五樓之２" })]);
    await run();
    expect(sink.saved[0]).toMatchObject({ districtCode: "6600600", street: "臺灣大道三段" });
  });

  it("新竹市地址（縣市寫兩次、無行政區）也拆得出街名", async () => {
    const { run, sink } = etlOver([rawRecord({ address: "新竹市新竹市西大路７２巷４７弄３號二樓" })], "hsinchu");
    await run();
    expect(sink.saved[0]).toMatchObject({ districtCode: "", street: "西大路" });
  });

  it("拆不出門牌的紀錄仍保留，但街名留空，不會被同路段查詢撈到", async () => {
    const { run, sink } = etlOver([rawRecord({ address: "柑林段353地號" })]);
    await run();
    expect(sink.saved[0]).toMatchObject({ address: "柑林段353地號", street: "" });
  });
});
