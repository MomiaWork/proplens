import { describe, it, expect } from "vitest";
import { formatWan } from "../src/core/formatMoney";

describe("formatWan", () => {
  it("元換算成萬，固定小數點後一位", () => {
    expect(formatWan(11_800_000)).toBe("1,180.0 萬");
    expect(formatWan(7_000_000)).toBe("700.0 萬");
  });

  it("每坪單價這種較小的金額也用同一個單位", () => {
    expect(formatWan(428_066)).toBe("42.8 萬");
    expect(formatWan(90_753)).toBe("9.1 萬");
  });

  it("整數萬仍然補上 .0，讓整欄價格對齊且精度一致", () => {
    expect(formatWan(20_000_000)).toBe("2,000.0 萬");
  });

  it("四捨五入到小數第一位", () => {
    expect(formatWan(1_234_900)).toBe("123.5 萬");
    expect(formatWan(1_234_400)).toBe("123.4 萬");
  });

  it("小於一萬的金額不會變成空白小數", () => {
    expect(formatWan(500)).toBe("0.1 萬");
    expect(formatWan(0)).toBe("0.0 萬");
  });
});
