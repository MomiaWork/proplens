import { describe, it, expect } from "vitest";
import { buildFixturePropertyQueryService } from "../dev/fixtureWorld.ts";

/**
 * Black-box tests for the 物件查詢 service — the spec's single agreed seam
 * (see spec.md "Testing Decisions"). Only the geocoding API boundary is
 * stubbed (FixtureGeocodingClient, via buildFixturePropertyQueryService);
 * zoning, ETL, aggregation, 門牌比對, and 學區文字表比對 all run real logic
 * against fixture data. See ../dev/fixtureWorld.ts for the fixture data
 * itself.
 */

describe("PropertyQueryService", () => {
  it("一般案例：回傳正確分區名稱 + 同分區均價 + 樣本數 + 學區", async () => {
    const service = await buildFixturePropertyQueryService();
    const card = await service.query("台中市住宅區示範路1號");
    expect(card).toEqual({
      status: "ok",
      zoneName: "住宅區",
      averagePrice: 12_500_000,
      sampleCount: 6,
      elementarySchoolDistrict: { status: "found", schoolName: "康寧國小" },
      juniorHighSchoolDistrict: { status: "found", schoolName: "至善國中" },
    });
  });

  it("分區交界案例：交界兩側地址分別得到正確分區，且統計只涵蓋各自分區的交易", async () => {
    const service = await buildFixturePropertyQueryService();

    const residentialSide = await service.query("台中市住宅區示範路2號近商業區");
    expect(residentialSide).toEqual({
      status: "ok",
      zoneName: "住宅區",
      averagePrice: 12_500_000,
      sampleCount: 6,
      elementarySchoolDistrict: { status: "found", schoolName: "康寧國小" },
      juniorHighSchoolDistrict: { status: "found", schoolName: "至善國中" },
    });

    const commercialSide = await service.query("台中市商業區興中路1號近住宅區");
    expect(commercialSide.status).toBe("insufficient-sample");
    if (commercialSide.status === "insufficient-sample") {
      expect(commercialSide.zoneName).toBe("商業區");
      expect(commercialSide.transactions.map((t) => t.address)).toEqual(["商業區交易1號"]);
      expect(commercialSide.elementarySchoolDistrict).toEqual({ status: "found", schoolName: "仁和國小" });
      expect(commercialSide.juniorHighSchoolDistrict).toEqual({ status: "found", schoolName: "大墩國中" });
    }
  });

  it("樣本不足案例：回傳原始交易清單而非均價，並標示樣本數", async () => {
    const service = await buildFixturePropertyQueryService();
    const card = await service.query("台中市農業區產業道路1號");
    expect(card.status).toBe("insufficient-sample");
    if (card.status === "insufficient-sample") {
      expect(card.zoneName).toBe("農業區");
      expect(card.sampleCount).toBe(2);
      expect(card.transactions.map((t) => t.address).sort()).toEqual(["農業區交易1號", "農業區交易2號"]);
      expect(card.elementarySchoolDistrict).toEqual({ status: "found", schoolName: "興農國小" });
      expect(card.juniorHighSchoolDistrict).toEqual({ status: "found", schoolName: "新社國中" });
    }
  });

  it("Geocoding 失敗案例：無法辨識的地址回傳明確錯誤", async () => {
    const service = await buildFixturePropertyQueryService();
    const card = await service.query("台中市打字錯誤路999號");
    expect(card).toEqual({ status: "address-not-recognized" });
  });

  it("超出範圍案例：地址有效但不在台中市任何分區內，回傳與「無法辨識」不同的錯誤，且不含學區欄位", async () => {
    const service = await buildFixturePropertyQueryService();
    const card = await service.query("台北市信義區信義路五段7號");
    expect(card).toEqual({ status: "outside-taichung" });
  });

  it("不呈現任何自行計算的比較值、差額或百分比——只有原始事實欄位", async () => {
    const service = await buildFixturePropertyQueryService();
    const card = await service.query("台中市住宅區示範路1號");
    expect(Object.keys(card).sort()).toEqual([
      "averagePrice",
      "elementarySchoolDistrict",
      "juniorHighSchoolDistrict",
      "sampleCount",
      "status",
      "zoneName",
    ]);
  });

  describe("學區", () => {
    it("可解析分界條款案例：地址落在「街道以南/以北」分界條款裡，回傳正確側的學校", async () => {
      const service = await buildFixturePropertyQueryService();
      const card = await service.query("台中市住宅區信義街10號");
      expect(card.status).toBe("ok");
      if (card.status === "ok" || card.status === "insufficient-sample") {
        expect(card.elementarySchoolDistrict).toEqual({ status: "found", schoolName: "文昌國小" });
        // 國中該鄰整鄰對應單一學校，不受國小分界條款影響 — 兩者互相獨立
        expect(card.juniorHighSchoolDistrict).toEqual({ status: "found", schoolName: "大同國中" });
      }
    });

    it("無法解析分界條款案例：複雜條款回傳需人工確認，不猜測學校名稱", async () => {
      const service = await buildFixturePropertyQueryService();
      const card = await service.query("台中市住宅區忠孝路145號");
      expect(card.status).toBe("ok");
      if (card.status === "ok" || card.status === "insufficient-sample") {
        expect(card.elementarySchoolDistrict).toEqual({ status: "needs-manual-review" });
        expect(card.juniorHighSchoolDistrict).toEqual({ status: "needs-manual-review" });
      }
    });

    it("門牌表查無此地址案例：用最近門牌點 fallback 找到里/鄰並回傳正確學區", async () => {
      const service = await buildFixturePropertyQueryService();
      const card = await service.query("台中市住宅區示範路5號");
      expect(card.status).toBe("ok");
      if (card.status === "ok" || card.status === "insufficient-sample") {
        expect(card.elementarySchoolDistrict).toEqual({ status: "found", schoolName: "康寧國小" });
        expect(card.juniorHighSchoolDistrict).toEqual({ status: "found", schoolName: "至善國中" });
      }
    });
  });
});
