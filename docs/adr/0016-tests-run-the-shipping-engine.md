# 測試改跑實際出貨的引擎，平台差異收斂成三個 core 介面

ADR-0013 把查詢引擎搬上手機時，是把電腦端的 Node 版模組**手動移植**成 `expo-sqlite`／`expo-file-system` 版。移植後兩份並存，而 spec 測試套件（11 個案例，涵蓋 .scratch 兩份 spec 的全部情境）掛在電腦端那一份上。

也就是說：**手機上真正跑的那份程式，一個測試都沒有。**兩份的控制流程當時是逐字對應的，但沒有任何機制保證它們維持一致——一邊改了 SQL 或判定順序，測試依然全綠。

決定：查詢引擎只留一份，放在 `src/core/`，平台差異用三個介面隔開：

| 介面 | `src/device/`（手機） | `tests/`（電腦） |
| --- | --- | --- |
| `SqliteDatabase` (`core/sqlite.ts`) | `expo-sqlite`（結構上直接符合，不需包裝） | `NodeSqliteDatabase`（`node:sqlite`） |
| `TextFileReader` (`core/files.ts`) | `expo-file-system/legacy` | `node:fs/promises` |
| `GeocodingClient` (`core/geocoding.ts`) | `AppleLocationGeocodingClient` | `FixtureGeocodingClient`（地址字典） |

spec 測試因此跑的是出貨程式本身：`tests/fixtureWorld.ts` 換掉的只有這三個接縫，分區疊圖、同分區統計、門牌比對、學區文字表比對、交易分區補值全部是真實邏輯。地理編碼是 spec 唯一同意 stub 的邊界。

**節流錯誤改成領域錯誤。** 原本 `enrichTransactionZones` 直接比對 Apple 的 `ERR_GEOCODING_NETWORK` 字串來判斷「被限流、該停下來下次再續」。現在 core 定義 `GeocodingRateLimitError`，由 `src/device/geocoding.ts` 把 Apple 的錯誤翻譯過來——core 不需要知道任何平台錯誤碼，測試也能模擬限流。

**電腦端的 store 變成唯寫。** `tools/` 底下的 `AddressPointStore`／`TransactionStore` 只保留建表與寫入，讀取全部走 `src/core/stores.ts`。schema 因此在兩個地方被斷言：寫入端，以及 `tests/fixtureWorld.ts` 建的同一組表——改了欄位測試就會紅，這正是目的。

連帶刪除：上機前的整套 Node 引擎（`property-query/`、`address-to-zone/`、`zoning/`、`geocoding/`、`school-district/` 的 Service 與 Lookup、`AddressToVillageService`、`VillageNeighborhoodCache`、`enrichTransactionZones`）與依賴它的區網 dev server（`server.ts`、`server.real.ts`、`dev/httpServer.ts`、`dev/realWorld.ts`、`dev/fixtureWorld.ts`、`index.ts`）。ADR-0013 之後這個 server 已無角色，留著只是讓測試有東西可測。

**新增 `npm run ingest:transactions`**（`tools/dev/downloadTransactions.ts`）。原本 `transactions.sqlite` 是 `npm run dev:server:real` 啟動時跑 ETL 的副作用產生的；那個 server 刪掉後，實價登錄的 ETL 需要一個真正的入口。ROC 日期轉換與 2021/7 有效性門檻（ADR-0001）現在由 `tests/transactionEtl.test.ts` 直接覆蓋，不再夾在引擎測試裡。
