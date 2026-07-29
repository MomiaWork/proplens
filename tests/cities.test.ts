import { describe, it, expect } from "vitest";
import { CITIES, cityById, dataFileName, districtCodeFor, isCityId } from "../src/core/cities";
import { parseAddress } from "../src/core/parseAddress";

/**
 * The 縣市 registry is the one place a city's differences are written
 * down, and address parsing is where those differences actually bite:
 * 臺中市 addresses name a 行政區 and 新竹市 addresses never do, so the
 * same parser has to strip a different prefix per city.
 */

const taichung = cityById("taichung");
const hsinchu = cityById("hsinchu");

describe("縣市清單", () => {
  it("目前支援台中市與新竹市", () => {
    expect(CITIES.map((c) => c.displayName)).toEqual(["台中市", "新竹市"]);
  });

  it("每個縣市的五份資料檔名互不相同，才能放在同一個 release 裡", () => {
    const names = CITIES.flatMap((city) => [
      dataFileName(city, "addressPoints"),
      dataFileName(city, "transactions"),
      dataFileName(city, "zoning"),
      dataFileName(city, "schoolDistrictElementary"),
      dataFileName(city, "schoolDistrictJuniorHigh"),
    ]);
    expect(new Set(names).size).toBe(names.length);
  });

  it("isCityId 擋掉未支援的縣市代碼", () => {
    expect(isCityId("taichung")).toBe(true);
    expect(isCityId("taipei")).toBe(false);
  });
});

describe("parseAddress 依縣市剝除地址前綴", () => {
  it("台中市：剝除縣市+行政區，並帶出該行政區的鄉鎮市區代碼", () => {
    expect(parseAddress("台中市西屯區台灣大道三段99號", taichung)).toEqual({
      districtCode: "6600600",
      street: "臺灣大道三段",
      lane: "",
      alley: "",
      houseNumber: "９９號",
    });
  });

  it("台中市：地址沒寫行政區時仍剝除縣市，代碼留空表示「不依行政區篩選」", () => {
    expect(parseAddress("臺中市西屯路100號", taichung)).toMatchObject({
      districtCode: "",
      street: "西屯路",
      houseNumber: "１００號",
    });
  });

  it("台中市：地址完全沒有縣市前綴時不剝除任何東西（交易地址就長這樣）", () => {
    expect(parseAddress("住宅區交易1號", taichung)).toMatchObject({
      districtCode: "",
      street: "住宅區交易",
      houseNumber: "１號",
    });
  });

  it("新竹市：一般地址沒有行政區，代碼恆為空", () => {
    expect(parseAddress("新竹市中華路二段445號", hsinchu)).toEqual({
      districtCode: "",
      street: "中華路二段",
      lane: "",
      alley: "",
      houseNumber: "４４５號",
    });
  });

  it("新竹市：實價登錄把縣市寫兩次，兩次都要剝掉", () => {
    expect(parseAddress("新竹市新竹市西大路７２巷４７弄３號二樓", hsinchu)).toEqual({
      districtCode: "",
      street: "西大路",
      lane: "７２巷",
      alley: "４７弄",
      houseNumber: "３號",
    });
  });

  it("新竹市：使用者若自行加上行政區也要剝掉，否則街道名對不上門牌表", () => {
    expect(parseAddress("新竹市東區中華路二段445號", hsinchu)).toMatchObject({
      districtCode: "",
      street: "中華路二段",
      houseNumber: "４４５號",
    });
  });

  it("選錯縣市時，前綴留在街道名上而不會誤配到門牌——寧可查不到也不要查錯", () => {
    expect(parseAddress("台中市西屯區台灣大道三段99號", hsinchu)).toMatchObject({
      districtCode: "",
      street: "臺中市西屯區臺灣大道三段",
    });
  });

  it("沒有門牌號的地址回傳 null，由呼叫端改用座標比對", () => {
    expect(parseAddress("新竹市中華路二段", hsinchu)).toBeNull();
  });
});

describe("districtCodeFor", () => {
  it("回傳台中市行政區代碼", () => {
    expect(districtCodeFor(taichung, "北屯區")).toBe("6600800");
  });

  it("非該縣市的行政區回傳空字串（不篩選），而不是丟錯", () => {
    expect(districtCodeFor(taichung, "香山區")).toBe("");
    expect(districtCodeFor(hsinchu, "東區")).toBe("");
  });
});
