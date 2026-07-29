// 台灣講房價的單位是「萬」，不是「元」——1,180.0 萬讀得出來，11,800,000 元
// 讀不出來。這裡只換單位和四捨五入，不做任何比較或估算（ADR-0005）。

const WAN = 10_000;

/**
 * 元 -> 萬, one decimal place.
 *
 * The decimal is kept even when it's .0 so a column of prices lines up and
 * "1,180 萬" can't be misread as a different precision from "1,180.5 萬".
 * Thousands separators stay on the 萬 part, since 總價 routinely runs into
 * four digits of 萬.
 */
export function formatWan(amountInYuan: number): string {
  const wan = amountInYuan / WAN;
  // toLocaleString rounds half-up-ish per locale; fixing the fraction
  // digits both ways keeps 0.05 萬 from rendering as an empty decimal.
  return `${wan.toLocaleString("zh-TW", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} 萬`;
}
