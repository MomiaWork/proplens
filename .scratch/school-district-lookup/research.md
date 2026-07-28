# 學區 (School District) Data Research — Taichung 國小/國中

Researched 2026-07-28 for PropLens Phase 2 (學區 dimension on the 物件資訊卡).

## Summary conclusion

**Point-in-polygon is NOT possible for school districts.** Unlike Phase 1's zoning data, Taichung's official 國小/國中 school-district data is published as **plain-text address-matching rules keyed to 里 (village) and 鄰 (neighborhood) numbers, with ad-hoc street-segment/house-number carve-outs** — there is no polygon/GIS geometry anywhere in the official pipeline. I confirmed this by actually downloading the real CSV (not just reading a catalog description): `https://newdatacenter.taichung.gov.tw/api/v1/no-auth/resource.download?rid=7dea3695-ade0-46c7-bb81-b883ce6027f5` (臺中市國小112學年度學區劃分表, 56KB, 260 rows). Rows look like `綠川里（第20-24、29鄰）...大誠里（第1-6鄰）【與中教大附小共同學區】`, and finer entries carve by street/house-number, e.g. `第20鄰建德街以北` (north of Jiande St. within neighborhood 20) or `忠孝路【172~192(偶數)...】`. A realistic ingestion path is: geocode → reverse-lookup the point's 里/鄰 (via TGOS or a 門牌 API) → text-match against this table, falling back to manual/street-range logic for the split-neighborhood cases. This repeats the Phase 1 lesson: the catalog page's own claimed API domain (`datacenter.taichung.gov.tw`, referenced from the opendata.taichung.gov.tw dataset pages) **does not resolve in DNS** — confirmed dead by direct `curl`/`dig`, exactly like the old zoning Swagger API. The dataset is real and live, but only via the actual working domain `newdatacenter.taichung.gov.tw`, which I found by fetching the data.gov.tw mirror page (not the catalog description) and verified by downloading and inspecting the file.

---

## Q1: Does an open dataset exist, and in what format?

Yes. 台中市政府教育局 publishes school-district tables on **opendata.taichung.gov.tw**, catalogued separately per school level and academic year:

- 國小 (elementary): `臺中市國民小學學區表(112年度)` — https://opendata.taichung.gov.tw/search/2fd1209f-8df8-41c3-835a-7f0ecbf78e79 (also mirrored on the national portal: https://data.gov.tw/dataset/84169)
- 國中 (junior high): `臺中市國民中學學區劃分表` (111學年度) — https://opendata.taichung.gov.tw/search/80eb3531-12df-457f-a9d4-f3bad33eb89d
- Older academic-year snapshots also exist as separate dataset entries, e.g. 103/104/105/106學年度 (found via search but not individually re-verified): https://opendata.taichung.gov.tw/search?q=%E5%AD%B8%E5%8D%80

**Format actually verified**: CSV (also offered as XML/JSON per the catalog page, not independently checked). This is a **flat roster/text-list, not GIS**. I downloaded and opened the elementary CSV directly:

```
編號,縣市別代碼,行政區,學校名稱,學區範圍_行政區,學區範圍_里鄰,校址,聯絡電話
1,66000,中區,光復國小,中區,綠川里（第20-24、29鄰）繼光里（第12-25鄰）...,中區三民路二段148號,22294174
2,66000,東區,臺中國小,南區,國光里（第13、34、35鄰）...,東區臺中路153號,22815103
2,66000,東區,臺中國小,東區,東興里（第1-4、20、22鄰）...,東區臺中路153號,22815103
```
(Note row 2 = 臺中國小 appears twice, once per 學區範圍_行政區 — the same school draws from li across two different administrative districts, listed as separate rows.)

The 國中 dataset page (fetched, catalog description only — CSV not independently downloaded because I could not locate its working `rid`; the catalog claims the same distribution mechanism) lists fields `編號、編號1、縣市別代碼、學校名稱、行政區、里鄰、校址、連絡電話` — same 里鄰-text-list shape as the elementary file, just without the elementary file's extra `學區範圍_行政區` split column. **I did not personally open the 國中 CSV bytes** — this is reported from the catalog page's field list, flagged as unverified content (verified-to-exist metadata only).

**API claim vs. reality (repeats the Phase 1 zoning lesson):** Both dataset catalog pages advertise an Open API at `https://datacenter.taichung.gov.tw/swagger/yaml/387040000E` and `https://datacenter.taichung.gov.tw/swagger/api-docs/`. I tested this directly:
```
$ dig +short datacenter.taichung.gov.tw   →  (empty)
$ curl https://datacenter.taichung.gov.tw/swagger/yaml/387040000E  →  curl: (6) Could not resolve host
```
**Confirmed dead — DNS does not resolve**, same failure mode as the zoning API. The *actually working* distribution channel, found not on the catalog page's rendered text but by fetching the data.gov.tw national-portal mirror of the elementary dataset (https://data.gov.tw/dataset/84169), is:
```
https://newdatacenter.taichung.gov.tw/api/v1/no-auth/resource.download?rid=7dea3695-ade0-46c7-bb81-b883ce6027f5
```
`newdatacenter.taichung.gov.tw` resolves (163.29.86.115) and the URL returns a real 56,585-byte CSV (HTTP 200, verified with `curl` and `file`). This is a **different subdomain** than the one the catalog page/API-docs area implies — worth remembering for future ingestion work: always resolve the actual `newdatacenter.taichung.gov.tw` resource-download link per dataset (per-file `rid` UUID), not the swagger domain.

Beyond the open-data CSVs, both the Education Bureau and individual 區公所 (district offices) publish the same information as human-facing pages/PDFs, e.g.:
- Official lookup UI: https://www.tc.edu.tw/page/02b0fa2f-7dda-404f-b411-8286cd97c9c1 (fetched: a filter/browse UI by school name, school type 市立國民中學/市立國民小學, and 行政區 — **no free-text street-address search**, no visible 學年度 selector on the UI itself even though the underlying data is versioned by academic year)
- District office pages replicate the same li/neighborhood text tables and downloadable PDFs, e.g. West District: https://www.west.taichung.gov.tw/831924/832063/832225/927048 (fetched: table + a linked PDF `115學年度本市國民小學學區表.pdf`, with entries like `美村路一段756巷2~20(偶數)` — house-number-parity carve-outs), and North District household-registration office: https://www.hnorth.taichung.gov.tw/1597317/1597368/1597381/1597390/1635846 (fetched: same li/neighborhood-only table for 國中, explicit disclaimer "本表僅供參考，實際請以每學年度教育局公布之學區為準").

## Q2: Geographic granularity — 里 boundary, street-range text, or true polygon?

**Confirmed: 里 (village) + 鄰 (sub-village neighborhood number) is the base unit, with street-segment/house-number-range carve-outs layered on top where a 里/鄰 is split between two schools. There is no polygon/GIS boundary anywhere in the official chain.** This matches the general pattern across Taiwanese counties/cities described in the task brief — Taichung is **not** an exception.

Evidence, all from primary sources I opened directly:
- Elementary CSV (downloaded and read, see Q1): boundary values are `里名（鄰號範圍）`, e.g. `干城里（第6、12、20鄰及第7鄰福智街以南）` — note the last clause splits *within* 鄰 7 by street name (`福智街以南` = "south of Fuzhi St."), and `東門里（第1─5、8─18、21─26鄰及第20鄰建德街以南）` similarly splits neighborhood 20 by a street line.
- West District PDF/table (fetched): carve-outs go down to house-number parity within a road segment, e.g. `民生路【140、140之1~140之12號】` and `美村路一段756巷2~20(偶數)`.
- North District 國中 table (fetched): same li/鄰 unit, no finer GIS, with an explicit disclaimer pointing back to the Education Bureau's annual official publication as the source of truth (i.e., the district office's table is itself a manually-transcribed copy, not authoritative geometry).

None of the pages, CSVs, or dataset catalog entries I opened reference a shapefile, GeoJSON, KML, or any coordinate/polygon field. The 里/鄰 unit itself does have official polygon boundaries (via 内政部/戶政 TGOS 村里界圖), but the *school-district-to-里鄰* **mapping** is a text table, and the street-segment carve-outs mean even a 里/鄰 polygon join would be wrong at the edges for a meaningful fraction of addresses (every school in the sample CSV rows had at least one split-鄰 clause).

## Q3: Revision frequency / school-year (學年度) field

- The open-data catalog metadata field is **"不定期更新" (updated irregularly / as-needed)** — confirmed on both the elementary (https://opendata.taichung.gov.tw/search/2fd1209f-8df8-41c3-835a-7f0ecbf78e79) and junior-high (https://opendata.taichung.gov.tw/search/80eb3531-12df-457f-a9d4-f3bad33eb89d) dataset pages — there is no fixed periodic schedule metadata field.
- In practice, revisions are **annual**, tied to the school-year (學年度) enrollment cycle, announced as a named PDF/公告 each year ahead of new-student registration. I fetched a live example: **臺中市115學年度國民小學學區表及調整說明公告**, issued 115年2月23日 (Feb 23, 2026 ROC/Gregorian), covering children born 2019/9/2–2020/9/1 — https://csjhs.tc.edu.tw/p/406-1107-570708,r715.php. A parallel, separately-numbered **115學年度國民中學學區表** announcement also exists, e.g. distributed via Beitun District Office: https://www.beitun.taichung.gov.tw/831946/832024/832030/3882496 and Xitun District Office: https://www.xitun.taichung.gov.tw/831932/832178/832214/3885985.
- Each open-data CSV/dataset entry is versioned by 學年度 in its title (e.g. "112年度", "111學年度", separate historical entries for 103/104/105/106學年度), so **the school-year is encoded in the dataset title/filename, not as a structured field inside the CSV row** (the elementary CSV's own columns are 編號/縣市別代碼/行政區/學校名稱/學區範圍_行政區/學區範圍_里鄰/校址/聯絡電話 — no 學年度 or effective-date column). An ingestion pipeline must track "as-of school year" externally, e.g. from the filename/dataset title, not from row data.

## Q4: Are 國小 and 國中 published as separate datasets/announcements?

**Yes, confirmed separate at every level I checked:**
- Separate opendata.taichung.gov.tw dataset catalog entries (different UUIDs, different column schemas — elementary has the extra `學區範圍_行政區` split column, junior high does not).
- Separate annual 公告 (the 115學年度 elementary announcement I fetched, https://csjhs.tc.edu.tw/p/406-1107-570708,r715.php, is explicitly elementary-only; the 115學年度 junior-high table is announced and distributed separately by district offices, e.g. Beitun and Xitun links above).
- The official tc.edu.tw 學區查詢 lookup UI also requires picking either 市立國民小學 or 市立國民中學 as a school-type filter — you cannot view both in one query (fetched and confirmed directly).

## Q5: Fallback approach if no polygon exists

Given Q1–Q4 confirm there is no official polygon data, the realistic ingestion approach is address → 里/鄰 (via a household-registration/TGOS lookup, separate from Google Geocoding's lat/lon) → text-match against the 學年度-versioned CSV, with special-case logic for the street-segment/house-number carve-out clauses (parseable with moderate effort since they follow fairly consistent patterns: `X街道 Y以南/以北/以東/以西`, `X路Y巷 A~B號(單/雙)`, `第N鄰`).

Two comparison points for how others structure this, found via public interfaces only (no scraping of private/paid data):
- **住商不動產 (Sinyi/Hsin Yi-network real-estate site)** — per a secondary how-to article I fetched (https://mrjoewang.com/school-search/), its property-map UI accepts a street address and offers separate toggle buttons for "國小學區" and "國中學區" that highlight a boundary on the map. This implies they've already done the 里/鄰-to-polygon approximation work internally (likely by joining 村里界 polygons to the same text table PropLens would ingest), but I did not access or reverse-engineer their underlying map data/API — this is reported purely from the public map-UI behavior described in the article, not verified first-hand.
- **591 (591.com.tw) "地圖找屋"** — search results reference a "學校找房" (search-by-school) feature, but I could not confirm from public pages whether it does true polygon-based address→district lookup or just school-proximity search; not independently verified, flagging as unconfirmed.
- The most reliable **structurally analogous** approach is really just the district offices' own PDF tables (West, North, Beitun, Xitun, Central — all fetched above) — they are literally re-publications of the same Education Bureau li/鄰 + street-carve-out text list, per-administrative-district. If PropLens wants a bundled "official" fallback, these district-office PDFs are the same source data as the CSV, just resegmented — no new structure to model.

## Sources fetched/verified directly in this research (not just read from search snippets)

- https://opendata.taichung.gov.tw/search/2fd1209f-8df8-41c3-835a-7f0ecbf78e79 (elementary dataset catalog page)
- https://opendata.taichung.gov.tw/search/80eb3531-12df-457f-a9d4-f3bad33eb89d (junior-high dataset catalog page)
- https://data.gov.tw/dataset/84169 (national portal mirror — this is where the real download link was found)
- `https://newdatacenter.taichung.gov.tw/api/v1/no-auth/resource.download?rid=7dea3695-ade0-46c7-bb81-b883ce6027f5` — **downloaded and opened the actual CSV bytes** (curl, 200 OK, 56,585 bytes, `file` confirms CSV text)
- `https://datacenter.taichung.gov.tw/...` (old swagger API domain) — **confirmed dead via `dig`/`curl`: does not resolve**
- https://www.tc.edu.tw/page/02b0fa2f-7dda-404f-b411-8286cd97c9c1 (official 學區查詢 UI)
- https://www.west.taichung.gov.tw/831924/832063/832225/927048 (West District 國小 table)
- https://www.hnorth.taichung.gov.tw/1597317/1597368/1597381/1597390/1635846 (North District household-registration office 國中 table)
- https://csjhs.tc.edu.tw/p/406-1107-570708,r715.php (115學年度國小學區調整公告)
- https://www.beitun.taichung.gov.tw/831946/832024/832030/3882496, https://www.xitun.taichung.gov.tw/831932/832178/832214/3885985 (115學年度國中學區表, district-office republications)
- https://mrjoewang.com/school-search/ (secondary source, real-estate-site UI description only — flagged as not independently verified)

---

## 地址/座標 → 里/鄰 解析

Researched 2026-07-28 for PropLens Phase 2, to determine whether address/coordinate → 里(village)/鄰(neighborhood) resolution is possible at all — the missing link needed before the 學區 text table above can be applied to a real address.

### 結論摘要

**Partial-but-strong yes.** There is no free, no-key, single-call API that goes straight from an address string to 里/鄰 (TGOS's own address-locate service exists but is access-gated). However, I found and directly verified a **complete, real, publicly downloadable per-門牌 (house-number) point dataset covering all of Taichung** that already carries 村里 *and* 鄰 as columns, refreshed monthly, sourced from the same underlying TGOS national 門牌 database — this is a materially better fit than point-in-polygon, because it lets PropLens match on **address string** (or nearest-coordinate as fallback) directly to 里/鄰, at the same granularity the school-district CSV's carve-out clauses use, without ever needing a 鄰-level polygon (which does not exist — see Q3). I additionally found and verified a free, no-key, working coordinate→里 (village-level only) API from 內政部國土測繪中心 (NLSC), useful as an independent QA cross-check. This repeats the Phase 1/school-district pattern exactly: the *catalog-advertised* API domain (`datacenter.taichung.gov.tw` swagger) is the same dead/misleading pointer as before, and the real distribution mechanism (once you dig past the catalog page) is a Google-Drive-hosted file.

### Q1a: TGOS (tgos.tw) address→里鄰 API — exists, but access-gated, not tested end-to-end

- `https://www.tgos.tw/tgos/Web/Address/TGOS_Address.aspx` — fetched directly: **HTTP 404**, dead/moved link (the URL is what search results and secondary articles cite, but it no longer resolves).
- `https://api.tgos.tw/TGOS_MAP_API/docs/site/android/AddrLocate` and related TGOS MAP API docs pages describe an address-locate service ("地址定位") that takes `oAPPId`/`oAPIKey` and optional `oCanIgnoreVillage`/`oCanIgnoreNeighborhood` parameters — i.e. the API is documented as village/neighborhood-aware, and per secondary sources (Medium walkthrough, iThome article) it is **the only Taiwanese geocoding service that returns 村里/鄰 as structured fields**.
- Getting a key is **not self-service**: per TGOS's own onboarding page (`https://ws.tycg.gov.tw/...TGOS_MAP_API_工作坊報名簡章`) and the 我的E政府 service-application pages (`https://www.gov.tw/News_Content_2_371654`, `https://www.gov.tw/News3_Content.aspx?n=2&s=371655`), you must first become a TGOS member, then apply for the specific service ("全國門牌地址定位服務"), and wait for approval — **restricted to 政府機關/法人機構/學術單位/業界**, i.e. an organizational application+review process, not an instant API key. It is free once approved, but I do **not** have credentials and could not call it — this part is reported from docs/secondary sources only, explicitly flagged as **not independently verified**.
- `http://addressmt.tgos.nat.gov.tw/address/index.html` (內政部門牌電子地圖查詢系統, surfaced in search results as a public lookup UI) — **confirmed dead**: `curl`/DNS resolution fails (`Could not resolve host`), same failure mode as the old zoning/school-district swagger domain.

### Q1b: NLSC (內政部國土測繪中心) coordinate→里 API — free, no key, VERIFIED WORKING (里-level only)

Found via `api.nlsc.gov.tw` code-service family (國土測繪圖資服務雲). Called directly, no auth required:

```
$ curl https://api.nlsc.gov.tw/other/TownVillagePointQuery/120.6415/24.1637/4326
<townVillageItem>
    <ctyCode>B</ctyCode><ctyName>臺中市</ctyName>
    <townCode>B06</townCode><townName>西屯區</townName>
    <officeCode>BC</officeCode><officeName>中興</officeName>
    <sectCode>1630</sectCode><sectName>惠民段</sectName>
    <villageCode>66000060005</villageCode><villageName>惠來里</villageName>
</townVillageItem>
```
Coordinate `120.6415, 24.1637` is the Taichung City Hall area (near 台灣大道三段99號, West Tun District) — the API correctly returned **惠來里**, cross-validated independently by the 門牌 CSV match in Q1c below (same village, same area). This is a genuine point-in-polygon service (it also returns cadastral 地籍段/小段 info, i.e. it's built on land-parcel polygons), free, no API key, and I verified it works with a real Taichung coordinate. **It only returns 村里, not 鄰** — confirmed by the response schema, no 鄰 field exists.

Related free/no-key code lookups also verified live (useful for building a county/town/village code crosswalk): `https://api.nlsc.gov.tw/other/ListCounty` (returns 臺中市 = code `B`), `https://api.nlsc.gov.tw/other/ListTown1/B` (returns all 29 Taichung districts, e.g. 西屯區 = `B06`), `https://api.nlsc.gov.tw/other/ListVillage/B/B06` (returns all village names/codes in 西屯區, confirms 惠來里 = `66000060005`).

### Q1c: Taichung monthly GIS 門牌 (address-point) dataset — the real answer, VERIFIED WORKING end-to-end

This is the single most important finding. 台中市政府 publishes a **per-address-point CSV covering the entire city**, with 村里 *and* 鄰 *and* coordinates as columns — i.e., a ready-made 門牌→里鄰 lookup table, already built by the government, refreshed monthly.

- Catalog/master entry: `https://data.gov.tw/dataset/169806` (臺中市空間資訊建物及門牌號碼位置新版本資料), mirrored from `opendata.taichung.gov.tw`. Like the school-district dataset, the catalog page's own "OAS API" reference (`https://datacenter.taichung.gov.tw/swagger/yaml/387020000A`) is the same dead swagger domain pattern as before — **not independently re-tested this time (already confirmed dead in the school-district research above), not the real path**.
- The real path: `data.gov.tw/dataset/169806`'s actual resource link is `https://newdatacenter.taichung.gov.tw/api/v1/no-auth/resource.download?rid=42350484-812f-4c08-a06f-45783904fe88`. **New gotcha not seen in the school-district research**: this `newdatacenter.taichung.gov.tw` URL — the domain previously confirmed as the *working* one — this time returns HTTP 200 but the body is only a tiny (~5.8 KB) **stub CSV**, not the actual address data. The stub lists one row per monthly snapshot (113年1月 through 115年1月, i.e. Jan 2024–Jan 2026, 25 months), each with a `地圖網址` (map URL) column pointing to a Google Drive file. **Lesson for future ingestion work: even a "known-good" `newdatacenter.taichung.gov.tw` resource.download URL can itself be an indirection stub — always open and inspect the downloaded bytes/size, never trust HTTP 200 + Content-Type alone.**
- I downloaded and fully inspected one full month end-to-end: **臺中市110年2月GIS門牌號碼** (Feb 2021), via its own stub → Google Drive link `https://drive.google.com/file/d/1Nl4xNrD2zxZSzzZAUUDZA31Ov8a72Q6P` → direct-download confirmed **publicly accessible, no login required** (`curl -L "https://drive.google.com/uc?export=download&id=..."` → real 17.4 MB zip, no Google auth/"request access" prompt). Unzipped to a 136.5 MB, **1,191,053-row** CSV.
- **Exact columns** (header row, verified byte-for-byte): `省市縣市代碼,鄉鎮市區代碼,村里,鄰,街_路段,地區,巷,弄,號,TWD97橫坐標,TWD97縱坐標,WGS84經度,WGS84緯度` — i.e. **county/district code, 村里 name, 鄰 number (as a zero-padded 3-digit string, e.g. `045`), street name, area, 巷/弄, house number, and both TWD97 and WGS84 coordinates, per individual address point** (including per-floor sub-addresses for apartment buildings, e.g. `５號三樓`/`５號四樓` as separate rows sharing one coordinate).
- **Direct hit on the task's own test address**: `grep`ing the file for `臺灣大道三段` + `９９號` (note: dataset uses traditional 臺, not simplified 台 — my first grep attempt with 台 silently matched nothing, a real gotcha worth flagging) returned:
  ```
  66,6600600,惠來里,045,臺灣大道三段,,,,９９號,214160.2912,2673008.3139,120.647296502,24.1619892378
  ```
  **臺中市西屯區台灣大道三段99號 → 惠來里, 第45鄰**, WGS84 (120.647297, 24.161989) — matching the same 惠來里 village the independent NLSC point-in-polygon call returned for the same neighborhood in Q1b. Two independently-sourced primary lookups agree.
- **Currency check**: confirmed the *latest* available monthly file, `臺中市115年1月GIS門牌號碼` (Jan 2026, ~6 months old as of this research), is **still live and publicly downloadable** — checked via `curl` against its Google Drive link, which serves Google's standard "file too large to virus-scan, download anyway?" interstitial (not a login/access-denied page, confirming public access) and reveals the real filename: **`115年1月GIS門牌_台中市_TGOS__WGS84.CSV`** (150 MB). The filename itself confirms this monthly export is **sourced from/synced with TGOS's own 門牌 database** — meaning Taichung's open CSV and TGOS's gated API are, functionally, the same underlying data. There is no need to pursue TGOS's access-gated API (Q1a) when the identical data is already open and download-verified here.
- New monthly files have been published every month from 113年1月 through 115年1月 without gaps in the master stub list — a real, maintained, actively-updated pipeline, not a one-off historical dump.

### Q2: 村里界圖 (village boundary polygon) — exists, VERIFIED WORKING download, 里-level only (no 鄰)

- `https://data.gov.tw/dataset/7438` (村里界圖, TWD97經緯度) catalog page, published by 內政部國土測繪中心. Actual download link, found on the page (not the dead swagger domain this time — this one points straight at `tgos.tw`): `https://www.tgos.tw/tgos/VirtualDir/Product/a04697c8-64db-450a-a105-3eb471c45abd/村(里)界(TWD97經緯度)1150624.zip` — **verified live via `curl -I`: HTTP 200, Content-Type `application/x-zip-compressed`, Content-Length 22,419,620 bytes (22.4 MB), Last-Modified 2026-06-30** (i.e. actively maintained, updated within the last month relative to this research).
- Fields (from the catalog page): `VILLCODE, COUNTYNAME, TOWNNAME, VILLNAME, VILLENG, COUNTYID, COUNTYCODE, TOWNID, TOWNCODE, NOTE` — **里-level only, no 鄰 field**, confirming (independently of Q3's evidence below) that the *only* official GIS polygon granularity anywhere in this chain is 里, never 鄰.
- Format: Shapefile (SHP), also offered in TWD97 119°/121°-TM-projected variants (`data.gov.tw/dataset/7439`, `/7440`) not independently downloaded — same publisher/mechanism, not re-verified byte-for-byte.
- Given Google Geocoding returns WGS84 lat/lon and this dataset has a TWD97-lon/lat (not TM-projected) variant, the projection mismatch is minor (TWD97 and WGS84 differ by only ~1m in Taiwan) and not a practical blocker if this polygon were used — but per Q1c/Q4, PropLens likely doesn't need this dataset at all, since the 門牌 CSV already gives 里/鄰 directly without a point-in-polygon step.

### Q3: Does 鄰 have any spatial boundary, or is it purely a per-門牌/household tag?

**Confirmed: 鄰 is not spatially contiguous — it is assigned per address/household, not per polygon.** Evidence, from the same 門牌 CSV downloaded and inspected in Q1c: multiple house-number rows sharing the **exact same building coordinate** on 大誠街 (中區) carry **different 鄰 numbers** (`012`, `013`, `015` all appear at effectively the same point, interleaved by house-number suffix). This is consistent with — and gives a concrete data-level mechanism for — the school-district research's earlier finding that carve-out clauses split a single 鄰 by street segment (e.g. `第7鄰福智街以南`, `第20鄰建德街以北`): 鄰 assignment tracks household registration, not a drawn boundary, so no 鄰-level polygon exists anywhere in the official chain (the 村里界圖 in Q2 stops at 里). This means point-in-polygon can **never** resolve 鄰, at any level of official Taiwanese GIS data — the only path to 鄰 is a per-門牌 lookup table, which is exactly what Q1c's dataset already is.

### Q4: Recommended concrete approach

**Primary path — direct address-string match against the monthly Taichung 門牌 CSV (Q1c), not point-in-polygon:**
1. Normalize the address to ingest (from Google Geocoding's formatted result, or the raw user input) to the CSV's conventions before matching: traditional character variant (臺 not 台), full-width numerals for house numbers, and split into 街_路段/巷/弄/號 components matching the CSV's column layout. This is the same kind of normalization work already required for the school-district CSV's own street-segment carve-out clauses, so it's not new surface area.
2. Exact-match the normalized address against the current month's 門牌 CSV (~1.19M rows citywide — small enough to load into SQLite as a lookup table, consistent with PropLens's existing `node:sqlite` Phase 1 approach) to get 村里+鄰 directly, then text-match that against the school-district table from the first half of this file.
3. **Fallback when exact match fails** (new construction not yet in this month's snapshot, or address-formatting mismatch): reverse-geocode by nearest-neighbor — take the Google Geocoding lat/lon and find the closest point in the same 門牌 CSV (already has WGS84 columns, so no reprojection needed) and inherit its 里/鄰. Cheap to implement since the table is already loaded.
4. **Independent QA cross-check, not primary path**: call NLSC's free `TownVillagePointQuery` (Q1b) with the geocoded coordinate and confirm it agrees with the 里 implied by the nearest-neighbor/exact match. Free, no key, sub-second — cheap insurance against a bad address match silently landing you in the wrong village entirely.
5. **Do not pursue TGOS's own "全國門牌地址定位服務" API** (Q1a) — it requires an organizational membership+approval application with no self-service path, and the Q1c finding that Taichung's own open CSV is itself generated from the TGOS 門牌 database (filename `...TGOS__WGS84.CSV`) means the gated API would return the same data PropLens can already get for free and already verified byte-for-byte.
6. **Operational gotcha to track**: like the school-district CSV, the 門牌 dataset has no reliable "effective date" field beyond its filename/month, is republished monthly (confirmed 113年1月–115年1月, no gaps), and should be refreshed on a similar cadence; treat any address absent from the current snapshot as a signal to use the nearest-neighbor fallback (step 3) rather than a hard failure, since new-construction 門牌 assignment can lag the monthly export.

### Sources fetched/verified directly in this section

- `https://www.tgos.tw/tgos/Web/Address/TGOS_Address.aspx` — fetched directly, **HTTP 404** (dead/moved)
- `http://addressmt.tgos.nat.gov.tw/address/index.html` — **confirmed dead via `curl`: DNS does not resolve**
- `https://api.tgos.tw/TGOS_MAP_API/docs/site/android/AddrLocate` and related TGOS MAP API doc pages — fetched, describes address-locate endpoint requiring `oAPPId`/`oAPIKey`; **endpoint itself not called (no credentials) — flagged as docs-only, not verified end-to-end**
- `https://ws.tycg.gov.tw/...TGOS_MAP_API_工作坊報名簡章`, `https://www.gov.tw/News_Content_2_371654`, `https://www.gov.tw/News3_Content.aspx?n=2&s=371655` — fetched/read, describe TGOS's membership+approval application process for the address-locate API
- `https://api.nlsc.gov.tw/other/TownVillagePointQuery/120.6415/24.1637/4326` — **called directly with `curl`, real response inspected**: returned 惠來里/西屯區 for a real Taichung coordinate
- `https://api.nlsc.gov.tw/other/ListCounty`, `https://api.nlsc.gov.tw/other/ListTown1/B`, `https://api.nlsc.gov.tw/other/ListVillage/B/B06` — **all called directly with `curl`, real XML responses inspected**
- `https://data.gov.tw/dataset/169806` (臺中市空間資訊建物及門牌號碼位置新版本資料, master catalog page) — fetched directly for its real resource link
- `https://newdatacenter.taichung.gov.tw/api/v1/no-auth/resource.download?rid=42350484-812f-4c08-a06f-45783904fe88` — **downloaded and opened the actual bytes**: a stub CSV listing 25 monthly Google-Drive-hosted files (113年1月–115年1月)
- `https://drive.google.com/file/d/1Nl4xNrD2zxZSzzZAUUDZA31Ov8a72Q6P` (臺中市110年2月GIS門牌號碼) — **downloaded the full 17.4 MB zip via direct `curl`, no login required; unzipped and inspected the full 136.5 MB / 1,191,053-row CSV**, confirmed column schema and a direct match for 臺灣大道三段99號 → 惠來里/第45鄰
- `https://drive.google.com/file/d/1oxPMFv5twHRSkK6BtlHD-8t2qfwGF1R9` (臺中市115年1月GIS門牌號碼, latest available) — **verified live and publicly accessible via `curl`** (Google's virus-scan interstitial, not a login/access-denied page); real filename `115年1月GIS門牌_台中市_TGOS__WGS84.CSV` confirms TGOS as the underlying data source; full 150 MB file not downloaded (schema already verified via the 110年2月 file above, which shares the identical stub-file format and column layout)
- `https://data.gov.tw/dataset/7438` (村里界圖, TWD97經緯度) — fetched, real download link found
- `https://www.tgos.tw/tgos/VirtualDir/Product/a04697c8-64db-450a-a105-3eb471c45abd/村(里)界(TWD97經緯度)1150624.zip` — **verified live via `curl -I`: HTTP 200, 22.4 MB, Last-Modified 2026-06-30** (file itself not downloaded/unzipped, only existence and freshness confirmed)
- `https://opendata.taichung.gov.tw/search/58ef760b-e26c-4cc4-848c-cb5857c4b3ba`, `https://opendata.taichung.gov.tw/search/f0c0712a-a604-4716-8b3f-33e9f4c8049e`, `https://data.gov.tw/dataset/121049`, `https://data.gov.tw/dataset/137998`, `https://data.gov.tw/dataset/177733`, `https://data.gov.tw/dataset/123742` — fetched, various Taichung/national 門牌 dataset catalog pages consulted to trace the real download chain (most led to the same `newdatacenter.taichung.gov.tw` stub → Google Drive pattern; `dataset/177733` led to a Digital Development Ministry-hosted CSV of per-county record counts, not itself an address database)
