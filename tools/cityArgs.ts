import { CITIES, cityById, dataFileName, isCityId, type City, type DataFileKey } from "../src/core/cities";

/**
 * Every ingest script builds one city's file per run, so they all take the
 * same `--city=<id>` argument and derive their output path from the same
 * naming rule the app downloads by (src/core/cities.ts). Nothing here
 * defaults to a city: a run that silently ingested 臺中市 because the flag
 * was forgotten would overwrite the wrong file.
 */
export function cityFromArgs(argv: string[] = process.argv): City {
  const id = flagValue("city", argv);
  if (!id) {
    throw new Error(`Missing --city=<id>. Supported: ${CITIES.map((c) => c.id).join(", ")}`);
  }
  if (!isCityId(id)) {
    throw new Error(`Unknown city "${id}". Supported: ${CITIES.map((c) => c.id).join(", ")}`);
  }
  return cityById(id);
}

/** Reads `--name=value` or `--name value`. */
export function flagValue(name: string, argv: string[] = process.argv): string | undefined {
  const inline = argv.find((arg) => arg.startsWith(`--${name}=`));
  if (inline) {
    return inline.slice(`--${name}=`.length);
  }
  const index = argv.indexOf(`--${name}`);
  return index >= 0 ? argv[index + 1] : undefined;
}

export function hasFlag(name: string, argv: string[] = process.argv): boolean {
  return argv.includes(`--${name}`);
}

/**
 * The arguments left after the flags — file paths, for the scripts that
 * take them. `valueFlags` names the flags written as `--name value`, whose
 * value would otherwise look like a positional; the `--name=value` form
 * needs no such declaration.
 */
export function positionalArgs(valueFlags: string[] = [], argv: string[] = process.argv): string[] {
  const positionals: string[] = [];
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i]!;
    if (!arg.startsWith("--")) {
      positionals.push(arg);
      continue;
    }
    if (!arg.includes("=") && valueFlags.includes(arg.slice(2))) {
      i += 1;
    }
  }
  return positionals;
}

/** `data/<city>-<file>` — the name the release asset must carry. */
export function outputPathFor(city: City, key: DataFileKey): string {
  return `data/${dataFileName(city, key)}`;
}
