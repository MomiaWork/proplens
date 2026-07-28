import * as SQLite from "expo-sqlite";
import type { SqliteDatabase } from "../core/sqlite";

/**
 * expo-sqlite's SQLiteDatabase already has the shape core's stores need,
 * so this is just the naming boundary — nothing structural to adapt.
 *
 * Opens by *name*, not path: dataSync.ts downloads the .sqlite files into
 * expo-file-system's default `SQLite/` directory precisely so that
 * openDatabaseSync finds them this way.
 */
export function openDeviceDatabase(name: string): SqliteDatabase {
  return SQLite.openDatabaseSync(name);
}
