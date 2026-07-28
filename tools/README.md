# tools/

Code that runs on **your computer**, never on the phone. Run with `tsx` via the
npm scripts in the root `package.json`. Nothing here is reachable from `index.ts`,
so Metro never bundles it and its Node-only dependencies (`node:sqlite`,
`shapefile`, `proj4`, `adm-zip`) stay out of the app.

## Live — builds the data the app downloads

| Script | Entry point | Output |
| --- | --- | --- |
| `npm run ingest:address-points` | `dev/downloadAddressPoints.ts` | `data/address-points.sqlite` |
| `npm run ingest:school-districts` | `dev/downloadSchoolDistrictTables.ts` | `data/school-district-*.json` |
| `npm run convert:zoning` | `dev/convertZoningShpToGeoJson.ts` | `data/taichung-zoning.geojson` |

`transactions.sqlite` is currently built as a side effect of `npm run dev:server:real`
(`dev/realWorld.ts` runs the 實價登錄 ETL on startup). It deserves its own
`ingest:transactions` entry point.

## Pending removal — the pre-on-device engine

`property-query/`, `address-to-zone/`, `address-to-village/AddressToVillageService.ts`,
`school-district/SchoolDistrictService.ts`, `zoning/ZoneLookup.ts`,
`school-district/SchoolDistrictLookup.ts`, `geocoding/`, `dev/fixtureWorld.ts`,
`dev/httpServer.ts`, `server.ts`, `server.real.ts`, `index.ts`.

This is the Node implementation of the query engine from before the app went
on-device. `src/device/` is now the shipping implementation, and these files are a
second copy of the same logic.

They are still here for one reason: **`property-query/PropertyQueryService.test.ts`
is the only test suite in the repo**, and it tests this copy — not the one that
ships. The next step is to point those spec tests at `src/device/propertyQueryService.ts`
(which needs the SQLite and file-read seams pulled into `src/core/` as interfaces),
and then delete everything in this section. The suite is 11 tests.

The `node:sqlite` stores are the exception — `address-to-village/AddressPointStore.ts`,
`address-to-village/VillageNeighborhoodCache.ts`, `transactions/TransactionStore.ts`,
`transactions/TransactionEtl.ts` and `transactions/TaichungLvrDownloader.ts` are how
the pipeline *writes* the SQLite files, so they stay.
