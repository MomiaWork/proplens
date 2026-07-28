import { DatabaseSync } from "node:sqlite";
import { readFile } from "node:fs/promises";
import type { SqliteDatabase, SqlParam } from "../src/core/sqlite";
import type { TextFileReader } from "../src/core/files";

/**
 * node:sqlite behind the SqliteDatabase seam, so the test suite drives the
 * engine's real SQL rather than a hand-written fake. expo-sqlite's
 * statement-per-call API collapses into node:sqlite's prepare().get()/
 * .all()/.run() one-to-one; the only real difference is that node returns
 * undefined for a missing row where expo returns null.
 */
export class NodeSqliteDatabase implements SqliteDatabase {
  private readonly db: DatabaseSync;

  constructor(path = ":memory:") {
    this.db = new DatabaseSync(path);
  }

  getFirstSync<T>(sql: string, ...params: SqlParam[]): T | null {
    return (this.db.prepare(sql).get(...params) as T | undefined) ?? null;
  }

  getAllSync<T>(sql: string, ...params: SqlParam[]): T[] {
    return this.db.prepare(sql).all(...params) as T[];
  }

  runSync(sql: string, ...params: SqlParam[]): unknown {
    return this.db.prepare(sql).run(...params);
  }

  execSync(sql: string): void {
    this.db.exec(sql);
  }

  close(): void {
    this.db.close();
  }
}

export const nodeFileReader: TextFileReader = {
  read(path: string): Promise<string> {
    return readFile(path, "utf8");
  },
};
