# 新竹市 Data Source Research — adding a second 縣市

Researched 2026-07-29, while implementing the 縣市 selector (ADR-0017).

## Summary conclusion

Of the four datasets a city needs, **新竹市 supplies two on the same terms as
臺中市 and two not at all through any URL a script can pull.**

| 資料 | 臺中市 | 新竹市 | 狀態 |
| --- | --- | --- | --- |
| 實價登錄 | `b_lvr_land_a.csv` | `o_lvr_land_a.csv` | ✅ verified, ingested |
| 都市計畫分區 | manual .shp download | manual .shp download | ✅ same manual step as before |
| GIS門牌 | 市府開放平台每月快照，可自動抓 | **查無可自動抓的資源** | ⛔ needs a manual file |
| 學區表 | 開放平台 CSV | **僅 PDF** | ⛔ needs conversion + manual file |

新竹市 is therefore selectable in the app today, and two of its four files can be
produced right now, but **it won't return results until the 門牌 and 學區 files
are obtained by hand and published** — see `tools/citySources.ts` for the
`--from` workflow the scripts expose for exactly this.

---

## Q1: 實價登錄 — does the nationwide zip cover 新竹市?

**Yes, verified by download.** `https://plvr.land.moi.gov.tw/opendata/lvr_landAcsv.zip`
contains one CSV per 縣市, named by the ministry's own letter codes (`manifest.csv`
inside the zip). 新竹市 is `o_lvr_land_a.csv` (57KB in the 2026-07-21 batch);
臺中市 is `b_lvr_land_a.csv`, which the pipeline already used.

Ingested for real: **129 新竹市 有效交易紀錄** after the 實價登錄2.0 cutoff
(ADR-0001), against 688 for 臺中市.

## Q2: Do 新竹市 addresses look like 臺中市 ones?

**No — and this is the one real code difference.** Two things:

1. **新竹市 addresses never name a 行政區.** The everyday form is
   「新竹市中華路二段445號」. The city does have 東區/北區/香山區, but postal
   addresses omit them.
2. **實價登錄 repeats the city instead.** Every 新竹市 row's 土地位置建物門牌
   reads 「新竹市新竹市西大路７２巷４７弄３號二樓」, and the 鄉鎮市區 column is
   「新竹市」 for all 129 rows — never a district. 臺中市's rows are the expected
   「臺中市北屯區軍福十二路５８號五樓之２」.

Consequence for `parseAddress`: the city prefix has to be stripped *repeatedly*,
and the 行政區 code table has to be allowed to be empty. Verified after
implementing: **129/129 新竹市 and 688/688 臺中市 real transaction addresses parse
into a 門牌 key**, with 臺中市's district codes coming out correct.

Consequence for the 行政區 code table: 新竹市's is deliberately left empty. No
address ever supplies a district name, so the table would never be consulted —
and codes guessed without a 門牌 file to check them against would silently filter
every lookup to nothing.

## Q3: GIS門牌 for 新竹市?

**Not findable through any addressable URL.** What was checked:

- `opendata.hccg.gov.tw` — the portal's dataset search is **not URL-driven**:
  `?keyword=`/`?q1=`/`?q=` are all accepted and all ignored (the pagination links
  echo the keyword back but the result set is the unfiltered default list). So
  there's no equivalent of the 臺中市 stub-CSV → Google Drive chain that
  `downloadAddressPoints.ts` relies on.
- `data.gov.tw` — no 新竹市 門牌 dataset surfaced; 新竹市政府 appears only on the
  *suggestion* threads asking local governments to publish this
  (data.gov.tw/suggests/106384, /suggests/80423).
- National fallbacks — 全國路名資料 (data.gov.tw/dataset/35321, 戶政司) carries
  `city`/`site_id`/`road` only: **no coordinates and no 里/鄰**, so it can't serve
  ADR-0008's address → 里/鄰 job. 內政部's 門牌電子地圖 (addressrs.moi.gov.tw) is
  an interactive query system, not a bulk download.

**Decision:** treat it as a manual source. `--from <csv>` takes a hand-downloaded
file, and the loader now maps columns **by header name** rather than by position,
so whatever column order 新竹市's TGOS export uses, it loads — or fails loudly
naming the missing columns. Verified both ways (the header-driven parser
reproduces 臺中市's 1,298,932 rows byte-identically to the old fixed-index one).

## Q4: 學區表 for 新竹市?

**Published as PDF only.** 新竹市各國民小學學區劃分表 lives on the 教育處 site
(https://www.hc.edu.tw/edub/basic/schoolArea.aspx, and the 區公所 mirror at
dep-n-district.hccg.gov.tw), as a per-學年度 PDF — the 114學年度 table was posted
2024-12-27. `opendata.hccg.gov.tw` carries school *statistics* (班級數/學生人數)
but not the district tables.

**Decision:** manual source too. The operator converts the PDF to a CSV with one
row per school, and the script locates the 學校名稱 and 里鄰 columns by header
name.

## Open question for later

Whether 新竹市's 門牌 file can be obtained by 資料申請 to 新竹市政府 rather than
waiting for it to be published. Not pursued here — it's a request-and-wait step,
not a code change, and everything on the code side is already in place for it.
