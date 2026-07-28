# 03 — 學區欄位整合進 PropertyCard

**What to build:** 擴充現有 `PropertyQueryService` / `PropertyCard`：串接票01、票02，在 `ok` 與 `insufficient-sample` 兩種 card 狀態上新增 `elementarySchoolDistrict`、`juniorHighSchoolDistrict` 欄位（型別 `{ status: 'found'; schoolName: string } | { status: 'needs-manual-review' } | { status: 'address-not-in-registry' }`）。`address-not-recognized` / `outside-taichung` 狀態不含學區欄位。對外仍是同一個 `/property?address=...` 入口，不新增對外端點。

**Blocked by:** 01 — 地址／座標 → 里鄰比對, 02 — 里鄰 → 學校

**Status:** ready-for-agent

- [ ] 給定有效台中市地址（`ok` 或 `insufficient-sample` 狀態），PropertyCard 同時帶正確的都市計畫分區/交易統計與國小/國中學區欄位
- [ ] 給定學區判定為「需人工確認」的地址，對應欄位回傳 `needs-manual-review`，其餘卡片欄位（分區、交易統計）不受影響
- [ ] 給定學區判定為「查無對應門牌」的地址，對應欄位回傳 `address-not-in-registry`，其餘卡片欄位不受影響
- [ ] 給定地址無法辨識或超出台中市範圍（`address-not-recognized` / `outside-taichung`），card 不含任何學區欄位
- [ ] 服務對外不呈現任何自行計算的比較值、差額或百分比，學區欄位僅呈現查表得到的原始事實（學校名稱或明確的未判定狀態）
