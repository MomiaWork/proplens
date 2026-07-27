# 02 — 地址 Geocoding + 快取

**What to build:** 給定台中市地址字串，呼叫 Google Maps Geocoding API 取得座標；查詢結果（地址 → 座標）存入本地 SQLite 快取，同一地址第二次查詢不重複呼叫 API。地址查詢限定台中市範圍，避免同名路段跨縣市誤判。

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [ ] 給定有效台中市地址，回傳正確座標
- [ ] 同一地址重複查詢時，第二次不觸發 Geocoding API 呼叫（從快取取得）
- [ ] 給定無法辨識的地址（查無結果），回傳明確的失敗結果而非拋例外
- [ ] 地址查詢已限定台中市範圍，同名路段不會誤判為其他縣市地址
