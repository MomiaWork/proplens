# 交易紀錄的都市計畫分區在資料產生時預先算好

「同分區有效交易」原本的做法是每次查詢都對資料庫裡的每一筆交易即時重新做一次地址→座標→分區判定，只是靠 geocoding 快取讓這件事變便宜。這個假設在手機端不成立：手機版把整套查詢邏輯搬到裝置上執行後，每一支手機的 geocoding 快取都是從零開始——第一次查詢就得把資料庫裡所有交易地址逐一即時呼叫 Geocoding API，會非常慢，而且會在單次查詢裡就把限流的 Demo Key 額度用完。

決定：`TransactionEtl` 匯入交易之後，多跑一個 `enrichTransactionZones` 步驟，把每筆交易的都市計畫分區算好、存進 `transactions.sqlite` 的 `zone_name` 欄位。查詢時 `TransactionStore.findByZone()` 直接用索引查詢，不再對交易地址即時 geocode 或疊圖。

這不違反 ADR-0007「不快取分區判定」的原則：`zone_name` 不是一個獨立、跨資料更新持續存在的快取值，而是跟著 `transactions.sqlite` 整份檔案一起重新產生的欄位——每次資料管線重跑（實價登錄重新下載、都市計畫圖資更新後），這個欄位會跟著整份快照一起重算，不會有「圖資已經更新但分區欄位還沒更新」的靜默過時窗口。伺服器端與手機端共用同一份 `transactions.sqlite`（見 [[project_proplens_phase2_school_district]] 的手機端架構筆記），所以伺服器端的 `PropertyQueryService` 也一併改用這個欄位，兩邊行為一致。
