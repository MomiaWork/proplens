Status: ready-for-agent

# Phase 2（第一項）：學區查詢（國小 / 國中）

## Problem Statement

Phase 1 驗證了「物件查詢」服務的技術可行性（實價登錄 ETL + 都市計畫圖資疊圖）。Phase 2 要開始把更多客觀資料維度疊加進同一張「物件資訊卡」，第一個維度是學區——使用者輸入的物件地址，所屬的國小、國中學區分別是哪一間學校。

這個功能一開始被假設可以比照 Phase 1 的做法，用座標對圖資做 point-in-polygon。經查證（見 `research.md`）後發現走不通：台中市官方國小/國中學區資料是以「里」+「鄰」為單位的文字表，沒有任何圖資座標；且「鄰」本身沒有空間邊界（鄰的分配跟著門牌／戶籍登記走，不是連續地理範圍），村里界圖也只到里的層級。因此本 spec 的技術路徑跟 Phase 1 完全不同：改用「地址 → 門牌比對表 → 里/鄰 → 學區文字表比對」的查表方式，不使用座標疊圖。詳見 `docs/adr/0008` 至 `docs/adr/0011`。

## Solution

擴充現有的 `PropertyQueryService` / `PropertyCard`（不建立獨立對外服務），新增一個內部的學區查詢流程，串接兩層比對：

1. **地址 → 里/鄰**：比對台中市每月更新的門牌位置資料（GIS 門牌，涵蓋全市每個門牌點，帶里/鄰/座標欄位）。正規化地址後精確比對；比對失敗時，用 Google Geocoding 給的座標找最近的門牌點（200 公尺內）繼承其里/鄰；仍找不到則回傳「查無對應門牌」。
2. **里/鄰 → 學校**：比對台中市教育局公告的國小/國中學區文字表（兩份獨立資料，各自處理）。整鄰對應單一學校的情況直接回傳；遇到「街道以南/以北/以東/以西」這類單一分界條款，用門牌比對表已知的街道/門牌號欄位判定落在哪一側；遇到無法解析的複雜條款，回傳「需人工確認」，不猜測。

查詢結果併入既有 `PropertyCard` 的 `ok` 與 `insufficient-sample` 兩種狀態，各自新增 `elementarySchoolDistrict`、`juniorHighSchoolDistrict` 兩個欄位。`address-not-recognized` / `outside-taichung` 這兩種狀態的地址本身無效，不含學區欄位。對外仍是同一個 `/property?address=...` 入口，行動 App 端不需改介面（只需擴充型別、顯示新欄位）。

## User Stories

1. As a PropLens 使用者, I want 看到物件所屬的國小與國中學區, so that 我有客觀的教育資源背景資訊可以參考
2. As a PropLens 使用者, I want 當學區判定牽涉到分界條款而系統無法自動判定時，得到「需人工確認」的明確狀態, so that 我不會被一個可能錯誤的學校名稱誤導
3. As a PropLens 使用者, I want 當地址找不到對應門牌資料時，得到「查無對應門牌」的明確狀態, so that 我知道是資料涵蓋不到而不是系統故障
4. As a system, I want 只快取「地址→里鄰」的比對結果, so that 重複查詢同一地址不需要重新掃描整份門牌資料
5. As a system, I want 「里鄰→學校」的判定每次都即時比對本地最新一份學區文字表, so that 學區每學年調整後，判定不會因為快取而靜默過時
6. As a maintainer, I want 門牌資料與學區文字表都能獨立於查詢邏輯手動重新下載, so that 這兩份「不定期更新」的資料不需要額外設計快取失效機制

## Implementation Decisions

- **不使用 point-in-polygon**：查證確認「鄰」沒有空間邊界，村里界圖只到里的層級，無法處理學區文字表在鄰內部的街道/門牌細分條款。改用地址字串比對台中市每月更新的門牌位置資料（本身帶里/鄰欄位）。詳見 `docs/adr/0008-school-district-address-match-not-polygon.md`。
- **快取切分**：地址→里鄰比對結果快取（比照 geocoding，行政區劃事實穩定）；里鄰→學校判定不快取（比照都市計畫分區判定，學區每學年可能調整）。詳見 `docs/adr/0009-cache-address-to-village-not-school-match.md`。
- **分界條款解析範圍**：只處理「整鄰對應單一學校」與「單一街道以南/以北/以東/以西」兩種模式；無法解析的條款回傳 `needs-manual-review`，不猜測。詳見 `docs/adr/0010-school-district-boundary-clause-scope.md`。
- **最近門牌點 fallback 距離門檻**：200 公尺（可依實測資料分布調整），超過視為查無，回傳 `address-not-in-registry`。詳見 `docs/adr/0011-address-point-fallback-distance-threshold.md`。
- **國小、國中一起做**：兩者資料集結構不同（國小多一個「學區範圍_行政區」欄位）但比對邏輯相同，拆成兩個階段反而增加不必要的維護成本。
- **PropertyCard 欄位設計**：`elementarySchoolDistrict` 與 `juniorHighSchoolDistrict`，型別皆為 `{ status: 'found'; schoolName: string } | { status: 'needs-manual-review' } | { status: 'address-not-in-registry' }`。只出現在 `ok` 與 `insufficient-sample` 兩種 card 狀態上。
- **資料來源與正規化 gotcha**（詳見 `research.md`）：門牌資料使用「臺」而非「台」，門牌號為全形數字；學區文字表的分界條款寫法不一致，需要正規化後才能比對。

## Testing Decisions

- 比照 Phase 1，只在服務邊界（geocoding API 呼叫）做 stub，不 mock 門牌比對、學區文字表比對等內部邏輯——這些是本 spec 要驗證的核心風險，用真實邏輯測試 fixture 資料才有意義。
- 測試案例覆蓋以下五種情境：
  1. 一般案例——地址精確比對到門牌表，里/鄰對應到單一學校，正確回傳國小+國中學區
  2. 可解析分界條款案例——地址落在「街道以南/以北」這類簡單分界條款裡，驗證回傳正確側的學校
  3. 無法解析分界條款案例——複雜條款，驗證回傳 `needs-manual-review`
  4. 門牌表查無此地址案例——驗證最近門牌點 fallback（含超過 200 公尺門檻回傳 `address-not-in-registry` 的邊界情況）
  5. 超出台中市範圍案例——沿用既有 `outside-taichung` 狀態，不額外跑學區比對

## Out of Scope

- Phase 2 其餘資料類別（捷運距離、人口/戶數趨勢、嫌惡設施）——留待本項完成後再擴充
- UI／物件資訊卡的視覺呈現——延續 Phase 1 的決定，待資料結構穩定後才做
- NLSC 里級別交叉驗證 API——先驗證技術可行性，不在初版做雙重保險，待實測發現誤判問題再加
- TGOS「全國門牌地址定位服務」——需機構審核申請，且查證確認台中市開放的門牌 CSV 本身就是從 TGOS 門牌資料庫同步的，等同資料，不需另外申請
- 學區文字表分界條款的完整解析（多重巷弄門牌區間等複雜寫法）——初版只處理常見模式，其餘回傳 `needs-manual-review`
- 門牌資料／學區文字表的排程自動更新——比照 Phase 1 都市計畫圖資，先手動下載，不做排程

## Further Notes

- 本 spec 對應的 domain glossary 見 `CONTEXT.md`（里/鄰、門牌資料、學區文字表）。
- 相關研究見 `.scratch/school-district-lookup/research.md`（學區資料格式、門牌比對可行性的完整查證過程與原始連結）。
- 相關 ADR：`docs/adr/0008` 至 `docs/adr/0011`。
