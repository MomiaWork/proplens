# tools/

Code that runs on **your computer**, never on the phone. Run with `tsx` via the
npm scripts in the root `package.json`. Nothing here is reachable from `index.ts`,
so Metro never bundles it and its Node-only dependencies (`node:sqlite`,
`shapefile`, `proj4`, `adm-zip`) stay out of the app.

Everything here is a **data producer**. The query engine lives in `src/core/`;
these scripts build the files it reads, and publish them to GitHub Releases for
`src/device/dataSync.ts` to download.

## One city per run

Every script takes `--city=<id>` and derives its output name from
`src/core/cities.ts`, so a release can carry every supported city and the phone
only downloads the one it needs (ADR-0017). Nothing defaults to a city — a run
that silently rebuilt 臺中市 because the flag was forgotten would overwrite the
wrong file.

| Script | Entry point | Output |
| --- | --- | --- |
| `npm run ingest:address-points -- --city=<id>` | `dev/downloadAddressPoints.ts` | `data/<id>-address-points.sqlite` |
| `npm run ingest:school-districts -- --city=<id>` | `dev/downloadSchoolDistrictTables.ts` | `data/<id>-school-district-*.json` |
| `npm run ingest:transactions -- --city=<id>` | `dev/downloadTransactions.ts` | `data/<id>-transactions.sqlite` |
| `npm run convert:zoning -- --city=<id> <in.shp> <in.dbf>` | `dev/convertZoningShpToGeoJson.ts` | `data/<id>-zoning.geojson` |

**Only `<id>-transactions.sqlite` is downloaded by the app today** (ADR-0018) —
the card is 實價登錄-only until 分區 data exists for every supported city. The
other three scripts still work and still build their files; nothing fetches them
yet, so publishing them is optional until that changes.

`<id>-transactions.sqlite` ships with `zone_name` NULL on purpose — per ADR-0014
that column belongs to the 分區-anchored card, which the app doesn't currently
compose. The 同路段 match key (`district_code`, `street`) *is* filled in here, by
the same `parseAddress` the phone uses.

## 發布資料（publishing a data release）

The phone reads `releases/latest` and downloads the assets whose names match
`dataFileName()`. Four steps:

```sh
# 1. 產生資料（第一次會抓 ~1.5GB 季別檔並快取到 data/lvr-cache）
npm run ingest:transactions -- --city=taichung
npm run ingest:transactions -- --city=hsinchu

# 2. 開一個「新的」tag，notes 隨意
TAG="data-$(date +%Y-%m-%d)"
gh release create "$TAG" --repo MomiaWork/proplens --title "$TAG" \
  --notes "實價登錄 近三年（本期 + 12 季）"

# 3. 上傳兩個縣市的檔案
gh release upload "$TAG" --repo MomiaWork/proplens \
  data/taichung-transactions.sqlite data/hsinchu-transactions.sqlite

# 4. 用手機的讀法驗證
npm run verify:release
```

**Republishing needs a new release tag, never `--clobber` onto the existing one:**
`dataSync.ts` decides whether to re-download by comparing `releases/latest`'s
`tag_name` against the cached one, so overwriting assets under the same tag ships
data no phone will ever fetch. For the same reason the new tag has to sort as
*newer* to GitHub — `gh release create` marks the newest published release as
`latest`, which is what the app asks for.

Asset names must match `dataFileName()` exactly (`<city>-transactions.sqlite`).
A mismatch isn't a visible error on the releases page — the app just reports
「該縣市資料尚未發布」. `npm run verify:release` is what catches both traps.

**資料更新不需要重新 build app.** The app re-checks `releases/latest` on every
launch, so publishing is enough — the phone picks it up next time it's opened.
Only code changes need `npx expo run:ios --configuration Release --device <udid>`.

## Fetched vs. manual sources

`citySources.ts` records where each city's 門牌 and 學區 data comes from. Some
cities publish a URL a script can pull unattended; others don't publish one at
all, and the file has to be fetched by hand and passed in with `--from`.

| | 實價登錄 | GIS門牌 | 學區表 | 都市計畫分區 |
| --- | --- | --- | --- | --- |
| 臺中市 | fetched | fetched | fetched | manual |
| 新竹市 | fetched | **manual** | **manual** | manual |

A manual source is not a stub: parsing, validation and SQLite loading are the
same code either way, and running the script without `--from` prints exactly
where to go and what the file needs to contain. The 門牌 loader maps columns by
**header name**, not position, so another city's TGOS export loads even with a
different column order — and fails loudly rather than silently loading a 鄰
number into the street field.

## The stores here are write-only

`address-to-village/AddressPointStore.ts` and `transactions/TransactionStore.ts`
create the schema and insert rows; they have no read methods. Every read — in the
app and in the test suite alike — goes through `src/core/stores.ts`, so the SQL
that queries these files exists once.

The schema is therefore asserted in two places: here, and in
`tests/fixtureWorld.ts`, which builds the same tables to run the spec suite
against. Change a column here and the suite fails, which is the point.
