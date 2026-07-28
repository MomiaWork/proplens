# tools/

Code that runs on **your computer**, never on the phone. Run with `tsx` via the
npm scripts in the root `package.json`. Nothing here is reachable from `index.ts`,
so Metro never bundles it and its Node-only dependencies (`node:sqlite`,
`shapefile`, `proj4`, `adm-zip`) stay out of the app.

Everything here is a **data producer**. The query engine lives in `src/core/`;
these scripts build the files it reads, and publish them to GitHub Releases for
`src/device/dataSync.ts` to download.

| Script | Entry point | Output |
| --- | --- | --- |
| `npm run ingest:address-points` | `dev/downloadAddressPoints.ts` | `data/address-points.sqlite` |
| `npm run ingest:school-districts` | `dev/downloadSchoolDistrictTables.ts` | `data/school-district-*.json` |
| `npm run ingest:transactions` | `dev/downloadTransactions.ts` | `data/transactions.sqlite` |
| `npm run convert:zoning` | `dev/convertZoningShpToGeoJson.ts` | `data/taichung-zoning.geojson` |

`transactions.sqlite` ships with `zone_name` NULL on purpose — per ADR-0014 the
phone fills that column in itself with its free on-device geocoder.

**Republishing needs a new release tag, never `--clobber` onto the existing one:**
`dataSync.ts` decides whether to re-download by comparing `releases/latest`'s
`tag_name` against the cached one, so overwriting assets under the same tag ships
data no phone will ever fetch.

## The stores here are write-only

`address-to-village/AddressPointStore.ts` and `transactions/TransactionStore.ts`
create the schema and insert rows; they have no read methods. Every read — in the
app and in the test suite alike — goes through `src/core/stores.ts`, so the SQL
that queries these files exists once.

The schema is therefore asserted in two places: here, and in
`tests/fixtureWorld.ts`, which builds the same tables to run the spec suite
against. Change a column here and the suite fails, which is the point.
