# 全部搬到手機端執行，電腦不再當即時 server

Phase 1／Phase 2 前半段的架構是：手機 App 是薄前端，Google Geocoding 呼叫、SQLite 查詢、GeoJSON 疊圖、學區文字表比對全部在電腦上跑的 Node.js server（`npm run dev:server:real`）執行，手機透過區網 IP 打 HTTP 過去查詢。這代表手機只有在電腦開著 server、而且跟電腦同一個 Wi-Fi 時才能用。

決定：把整條查詢邏輯（geocoding、point-in-polygon、門牌比對、學區文字表比對、交易統計）都搬進 Expo App 本身執行，`mobile/lib/` 下的檔案是 `src/` 對應模組的手動移植版（因為 Metro 不會打包 App 根目錄以外的檔案，也因為 React Native 沒有 `node:sqlite`／`node:fs`，改用 `expo-sqlite`／`expo-file-system`）。電腦的角色改成不定期跑一次批次資料管線（`npm run ingest:*`、`convert:zoning`），把處理好的 SQLite／GeoJSON／JSON 檔案發佈到 GitHub Releases；手機開啟時检查有沒有新版本，有的話下載到本機快取，之後查詢完全在裝置上執行，不需要電腦、也不需要跟電腦同一個網路。

**衍生的兩個技術決定：**

1. **Google Geocoding API key 隨 App 一起發佈**：手機直接呼叫 Google API，key 必須存在於前端程式碼裡，任何人都能從編譯後的 App 裡把它挖出來。目前用的是免信用卡、有額度限制的 Maps Demo Key（見 [[project_proplens_phase1_impl]]），POC 階段風險可接受；key 本身放在 `mobile/config.local.ts`（gitignored，不進公開 repo），避免額外曝光在 git 歷史裡。正式上線前應該換成有網域限制的 key，或加一層代理服務隱藏 key。
2. **交易分區預先算好**：見 ADR-0012——手機端 geocoding 快取從零開始，若沿用「每次查詢都重新對所有交易地址做一次分區判定」的舊做法，會在第一次查詢就打爆額度。改成資料發佈時就把每筆交易的分區算好存進 `transactions.sqlite`。

資料檔案來源見 GitHub Release `data-2026-07-28`（`https://github.com/MomiaWork/proplens/releases`），下載邏輯見 `mobile/lib/dataSync.ts`。
