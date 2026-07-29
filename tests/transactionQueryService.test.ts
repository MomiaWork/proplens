import { describe, it, expect } from "vitest";
import { buildFixtureTransactionQueryService } from "./fixtureWorld";

/**
 * Black-box tests for the 實價登錄-only 物件查詢 the app currently ships
 * (ADR-0018): address in, 同路段有效交易 out, every field either published
 * by 實價登錄 or a unit conversion of one.
 *
 * Fixture rows live in ./fixtureWorld.ts (`streetTransactions`).
 */

describe("TransactionQueryService", () => {
  it("一般案例：回傳同路段的全部有效交易與筆數", async () => {
    const service = buildFixtureTransactionQueryService();
    const card = await service.query("台中市西屯區台灣大道三段99號");

    expect(card.status).toBe("ok");
    if (card.status !== "ok") return;
    expect(card.street).toBe("臺灣大道三段");
    expect(card.count).toBe(2);
    expect(card.transactions.map((t) => t.address)).toEqual([
      "臺中市西屯區臺灣大道三段９９號五樓之２",
      "臺中市西屯區臺灣大道三段１０１號",
    ]);
  });

  it("查詢的門牌本身不必出現在交易裡——它只是路段的錨點", async () => {
    const service = buildFixtureTransactionQueryService();
    // 777號 is on 臺灣大道三段 but has never been transacted.
    const card = await service.query("台中市西屯區台灣大道三段777號");
    expect(card.status).toBe("ok");
    if (card.status === "ok") {
      expect(card.count).toBe(2);
    }
  });

  it("每筆交易帶齊房屋類別、類別、年份、坪數、單價，而不只有總價", async () => {
    const service = buildFixtureTransactionQueryService();
    const card = await service.query("台中市西屯區台灣大道三段99號");

    expect(card.status).toBe("ok");
    if (card.status !== "ok") return;
    const [newest] = card.transactions;
    expect(newest).toEqual({
      address: "臺中市西屯區臺灣大道三段９９號五樓之２",
      transactionDate: "2024-03-15",
      price: 15_800_000,
      transactionSubject: "房地(土地+建物)",
      buildingType: "住宅大樓(11層含以上有電梯)",
      mainUse: "住家用",
      urbanLandUse: "住",
      completionDate: "2010-06-15",
      areaPing: expect.closeTo(40, 2),
      unitPricePerPing: expect.closeTo(395_008, 0),
    });
  });

  it("平方公尺換算成坪：面積除以 3.305785，單價乘以 3.305785", async () => {
    const service = buildFixtureTransactionQueryService();
    const card = await service.query("台中市西區中山路99號");

    expect(card.status).toBe("ok");
    if (card.status !== "ok") return;
    const [transaction] = card.transactions;
    // 99.17 m² = 30.00 坪; 90,753 元/m² = 300,010 元/坪
    expect(transaction.areaPing).toBeCloseTo(30, 2);
    expect(transaction.unitPricePerPing).toBeCloseTo(300_010, 0);
  });

  it("來源沒揭露的欄位留空，不填 0——預售屋沒有建築完成年月", async () => {
    const service = buildFixtureTransactionQueryService();
    const card = await service.query("台中市西屯區台灣大道三段99號");

    expect(card.status).toBe("ok");
    if (card.status !== "ok") return;
    const presale = card.transactions.find((t) => t.address.includes("１０１號"));
    expect(presale).toMatchObject({ buildingType: "華廈(10層含以下有電梯)" });
    expect(presale?.completionDate).toBeUndefined();
    expect(presale?.areaPing).toBeUndefined();
    expect(presale?.unitPricePerPing).toBeUndefined();
    expect(presale?.urbanLandUse).toBeUndefined();
  });

  it("同名街道跨行政區：只回傳查詢地址所在行政區的交易", async () => {
    const service = buildFixtureTransactionQueryService();

    const west = await service.query("台中市西區中山路99號");
    expect(west.status).toBe("ok");
    if (west.status === "ok") {
      expect(west.count).toBe(1);
      expect(west.transactions[0]?.address).toBe("臺中市西區中山路１號");
    }

    const east = await service.query("台中市東區中山路99號");
    expect(east.status).toBe("ok");
    if (east.status === "ok") {
      expect(east.count).toBe(1);
      expect(east.transactions[0]?.address).toBe("臺中市東區中山路１號");
    }
  });

  it("地址沒寫行政區時不猜一個，回傳該街名在全市的交易", async () => {
    const service = buildFixtureTransactionQueryService();
    const card = await service.query("台中市中山路99號");
    expect(card.status).toBe("ok");
    if (card.status === "ok") {
      expect(card.count).toBe(2);
    }
  });

  it("交易依日期新到舊排列", async () => {
    const service = buildFixtureTransactionQueryService();
    const card = await service.query("台中市西屯區台灣大道三段99號");
    if (card.status === "ok") {
      expect(card.transactions.map((t) => t.transactionDate)).toEqual(["2024-03-15", "2024-01-20"]);
    }
  });

  it("新竹市：實價登錄把縣市寫兩次的地址，仍比對得到同路段", async () => {
    const service = buildFixtureTransactionQueryService("hsinchu");
    const card = await service.query("新竹市西大路72巷47弄3號");

    expect(card.status).toBe("ok");
    if (card.status !== "ok") return;
    expect(card.street).toBe("西大路");
    expect(card.count).toBe(1);
    expect(card.transactions[0]).toMatchObject({
      buildingType: "公寓(5樓含以下無電梯)",
      completionDate: "2005-10-30",
    });
    expect(card.transactions[0]?.areaPing).toBeCloseTo(44.15, 2);
  });

  it("該路段沒有交易時，明確說沒有，而不是假裝地址有問題", async () => {
    const service = buildFixtureTransactionQueryService();
    const card = await service.query("台中市西屯區沒人買過路1號");
    expect(card).toEqual({ status: "no-transactions-on-street", street: "沒人買過路" });
  });

  it("沒有門牌號的輸入無法定出路段，回傳無法辨識", async () => {
    const service = buildFixtureTransactionQueryService();
    expect(await service.query("台中市西屯區台灣大道三段")).toEqual({ status: "address-not-recognized" });
  });

  it("不呈現任何自行計算的比較值、差額或百分比——只有原始事實欄位", async () => {
    const service = buildFixtureTransactionQueryService();
    const card = await service.query("台中市西屯區台灣大道三段99號");
    expect(Object.keys(card).sort()).toEqual(["count", "status", "street", "transactions"]);
  });
});
