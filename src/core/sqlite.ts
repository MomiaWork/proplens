/**
 * The SQLite seam. The stores in stores.ts run the same SQL on the phone
 * (expo-sqlite) and on a computer (node:sqlite) — this is the surface they
 * need, and nothing more.
 *
 * expo-sqlite's own `SQLiteDatabase` satisfies this structurally, so the
 * app passes `SQLite.openDatabaseSync(...)` straight in (see
 * src/device/sqlite.ts). node:sqlite has a different shape and needs a
 * small adapter (see tests/nodeSqlite.ts).
 */
export type SqlParam = string | number | null;

export interface SqliteDatabase {
  getFirstSync<T>(sql: string, ...params: SqlParam[]): T | null;
  getAllSync<T>(sql: string, ...params: SqlParam[]): T[];
  runSync(sql: string, ...params: SqlParam[]): unknown;
  execSync(sql: string): void;
}
