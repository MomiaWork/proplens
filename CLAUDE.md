## Project layout

This repo **is** the Expo app. There is no server and no web app — the phone runs
the whole query engine on-device (ADR-0013/0014).

```
App.tsx  index.ts  app.json   the app shell
src/core/                     pure TypeScript, shared by the app and tools/
src/device/                   on-device code (expo-sqlite, expo-location, expo-file-system)
tools/                        runs on your computer only, via tsx — data ingestion
                              and conversion (see tools/README.md)
data/                         pipeline output, gitignored, published via GitHub Releases
```

**`src/core/` must not import `expo-*`, `react`, `react-native`, or `node:*`.**
That rule is the only thing keeping the app and the pipeline from drifting into two
copies of the same logic again — every file there is imported by both sides.
Platform differences go through an interface defined in `src/core/`, implemented
once in `src/device/` and once in `tools/`.

Anything under `tools/` is free to use Node APIs; it is never reachable from
`index.ts`, so Metro never bundles it.

### Expo

Read `AGENTS.md` before writing app code.

## Agent skills

### Issue tracker

Issues and specs live as markdown files under `.scratch/<feature-slug>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default canonical labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout — `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
