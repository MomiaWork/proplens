## Project layout

This repo **is** the Expo app. There is no server and no web app — the phone runs
the whole query engine on-device (ADR-0013/0014).

```
App.tsx  index.ts  app.json   the app shell
src/core/                     the whole query engine — pure TypeScript, no platform APIs
src/device/                   thin adapters: expo-sqlite, expo-file-system, expo-location,
                              plus dataSync and the app's composition root
tools/                        runs on your computer only, via tsx — builds the data files
                              the app downloads (see tools/README.md)
tests/                        the spec suite, wiring src/core to node adapters
data/                         pipeline output, gitignored, published via GitHub Releases
```

**`src/core/` must not import `expo-*`, `react`, `react-native`, or `node:*`.**
Platform differences go through a seam declared in core — `sqlite.ts`, `files.ts`,
`geocoding.ts` — implemented once in `src/device/` (expo) and once in
`tests/nodeAdapters.ts` (node). That is what lets the test suite exercise the
code that actually ships instead of a parallel copy of it, and what keeps the
app and the pipeline from drifting into two implementations of the same logic.

Business logic belongs in `src/core/` even when only the app uses it today.
`src/device/` should stay adapters and wiring.

**Anything that differs between 縣市 goes in `src/core/cities.ts`** — the app,
the test suite and the pipeline all read that one table (ADR-0017). Adding a
city should not require touching anything else.

Anything under `tools/` and `tests/` is free to use Node APIs; neither is
reachable from `index.ts`, so Metro never bundles them.

### Expo

Read `AGENTS.md` before writing app code.

## Agent skills

### Issue tracker

Issues and specs live as markdown files under `.scratch/<feature-slug>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default canonical labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout — `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
