// Real secrets live in config.local.ts (gitignored, never committed — this
// repo is public). If Metro fails to resolve that import, copy
// config.local.example.ts to config.local.ts and fill in a real key.
export { GOOGLE_MAPS_API_KEY } from "./config.local";
