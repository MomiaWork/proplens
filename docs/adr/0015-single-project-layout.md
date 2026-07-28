# 專案收斂成單一 Expo 專案，共用邏輯集中在 `src/core/`

ADR-0013 把查詢引擎整條搬進手機後，repo 維持著兩個各自獨立的 npm 專案：根目錄的 Node/TS 專案（`src/`）和 `mobile/` 的 Expo App，各有自己的 `package.json` 與 `package-lock.json`。當時 `mobile/lib/` 下的檔案被寫成 `src/` 對應模組的手動移植版，理由是「Metro 不會打包 App 根目錄以外的檔案」。

這個理由只有在 App 不是專案根目錄時才成立，而代價是純邏輯被逐字複製了四份：`parseAddress.ts`、`districts.ts`、`geo.ts`、`SchoolDistrictTable.ts` 兩邊內容完全相同（比對過，只有註解有差），沒有任何機制防止它們哪天各自被改。

決定：**App 就是專案本身**。`mobile/` 整個升到 repo 根目錄，全 repo 只剩一份 `package.json` 和一份 lockfile，不用 monorepo／workspaces／Turborepo——只有一個可發佈的產物，多一層套件邊界換不到東西。

```
App.tsx  index.ts  app.json   App 外殼
src/core/                     純 TypeScript，App 與 tools/ 共用
src/device/                   只在手機上跑（expo-sqlite / expo-location / expo-file-system）
tools/                        只在電腦上跑（tsx + node:sqlite / shapefile / proj4）
```

維持這個結構的唯一規則：**`src/core/` 不得 import `expo-*`、`react`、`react-native` 或 `node:*`**。平台差異一律走 `src/core/` 定義的介面，`src/device/` 與 `tools/` 各實作一次。`tools/` 從 `index.ts` 連不到，所以 Metro 不會打包它，它的 Node-only 相依（`node:sqlite`、`shapefile`、`proj4`、`adm-zip`）不會進 App bundle。

App 目錄不用 `src/app/`：Expo CLI 會把 `src/app/` 認成 expo-router 的路由根目錄（實測 `expo export` 會印出 `Using src/app as the root directory for Expo Router`），因此命名為 `src/device/`。

當時尚未解決的一件事：`tools/` 底下仍留著上機前的 Node 版查詢引擎，因為 repo 唯一的測試套件測的是那一份，而不是實際出貨的程式。**已於 ADR-0016 處理**——查詢引擎整個收進 `src/core/`，平台差異走三個介面，測試接上出貨引擎，那批舊檔案刪除。`src/device/` 現在只剩 adapter 與組裝。
