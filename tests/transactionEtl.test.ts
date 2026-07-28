import { describe, it, expect } from "vitest";
import type { ValidTransaction } from "../src/core/stores";
import { TransactionEtl, type TransactionSink } from "../tools/transactions/TransactionEtl";
import type { RawTransactionRecord } from "../tools/transactions/types";

/**
 * The ingestion pipeline's half of ADR-0001: 民國 date conversion and the
 * 實價登錄2.0 (2021/7) validity cutoff. Pre-cutoff records carry 區段化
 * addresses that can't be geocoded, so they must never reach the engine —
 * the query engine has no way to tell them apart afterwards.
 */

class CollectingSink implements TransactionSink {
  readonly saved: ValidTransaction[] = [];

  upsertMany(transactions: ValidTransaction[]): void {
    this.saved.push(...transactions);
  }
}

function etlOver(records: RawTransactionRecord[]): { run: () => Promise<void>; sink: CollectingSink } {
  const sink = new CollectingSink();
  const etl = new TransactionEtl({ download: async () => records }, sink);
  return { run: () => etl.run(), sink };
}

describe("TransactionEtl", () => {
  it("把民國日期轉成 ISO 日期", async () => {
    const { run, sink } = etlOver([{ address: "測試路1號", transactionDateRoc: "1110715", price: 10_000_000 }]);
    await run();
    expect(sink.saved).toEqual([{ address: "測試路1號", transactionDate: "2022-07-15", price: 10_000_000 }]);
  });

  it("2021/7 實價登錄2.0 上路前的紀錄一律排除", async () => {
    const { run, sink } = etlOver([
      { address: "上路前1號", transactionDateRoc: "1100630", price: 9_000_000 },
      { address: "上路當天1號", transactionDateRoc: "1100701", price: 9_500_000 },
      { address: "上路後1號", transactionDateRoc: "1100801", price: 9_800_000 },
    ]);
    await run();
    expect(sink.saved.map((t) => t.address)).toEqual(["上路當天1號", "上路後1號"]);
  });

  it("無法辨識的民國日期直接報錯，不靜默略過", async () => {
    const { run } = etlOver([{ address: "壞日期1號", transactionDateRoc: "abc", price: 1 }]);
    await expect(run()).rejects.toThrow(/民國/);
  });
});
