# 手機端完全不用 Google Geocoding，改用裝置內建的免費地理編碼

ADR-0013 讓手機直接呼叫 Google Geocoding API v4，POC 階段接受 Demo Key 曝光在公開 App 裡的風險。實測後這個安排有兩個問題：

1. Demo Key 每日 100 次額度，跟電腦端測試、資料處理共用，手機端互動查詢很容易在單一測試 session 就把額度用完。
2. 過程中意外發現：iOS 內建的地理編碼（`expo-location` 的 `geocodeAsync`，跟 Shortcuts App「取得位置詳細資訊」用的是同一套系統服務）對台中地址的準確度足夠——實測「台中市西屯區台灣大道三段99號」解析出的座標，跟已知正確答案只差約50-70公尺，在 ADR-0011 訂的 200 公尺容許範圍內。這跟 Phase 1 測過的 Nominatim（OpenStreetMap 地理編碼）完全不同——Nominatim 對台中地址常解析到錯誤路段，因此被放棄（見 [[project_proplens_phase1_impl]]）；蘋果/Android 系統內建的地理編碼是不同的服務，準確度顯著更好。

決定：手機端完全不呼叫 Google，`mobile/lib/geocoding.ts` 的 `AppleLocationGeocodingClient` 取代 `GoogleGeocodingClient` 成為手機端唯一的地理編碼實作。連帶效果：
- 不再需要在 App 裡藏 Google API key，`mobile/config.ts`／`config.local.ts` 整組移除，ADR-0013 提到的 key 曝光風險直接消失，不需要之後再處理。
- 額度限制的問題也一併消失——裝置內建地理編碼沒有每日次數限制。

**衍生決定：交易分區的預先計算（ADR-0012）也搬到手機端做。** 原本 ADR-0012 讓電腦端在發布資料快照前，用 Google 把每筆交易的都市計畫分區算好存進 `transactions.sqlite`。既然手機不再依賴 Google，這一步沒必要留在電腦端（電腦端的 Node.js 環境本來就無法使用 `expo-location`，唯一的替代方案是 Nominatim，但如上所述準確度不可靠，不適合用在需要精準的分區判定）。改成：電腦端只跑 ETL、產出「分區欄位全部是 NULL」的 `transactions.sqlite` 快照發布上去；手機下載後，在資料同步流程裡自己跑一次 `mobile/lib/enrichTransactionZones.ts`（用裝置內建地理編碼 + 本地已有的都市計畫圖資做 point-in-polygon），把分區欄位補齊、存進手機本地的資料庫。只處理 `zone_name IS NULL` 的資料列，所以同一份快照重複同步不會重工。

**現況**：電腦端 `src/dev/realWorld.ts`（`npm run dev:server:real` 用的那個手動測試工具）仍然使用 Google——這是獨立於手機 App 之外的電腦端互動測試工具，跟這次要解決的「手機額度耗盡」問題無關，沒有理由跟著改。它現在也不會再產生分區已算好的 `transactions.sqlite`（那個步驟被拿掉了），純粹作為電腦端的手動除錯用途保留。

> 註：檔案路徑已於 ADR-0015 改動——`mobile/lib/` 現為 `src/device/`，`src/dev/realWorld.ts` 現為 `tools/dev/realWorld.ts`。
