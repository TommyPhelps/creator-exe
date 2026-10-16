// A Db implementation backed by Node's built-in SQLite, used to run the real
// migrations and repositories in tests without the Windows shell.
import { DatabaseSync } from "node:sqlite";
import type { Db, Statement } from "../../src/platform/types.ts";

type SqlParam = null | number | bigint | string;

function conv(params: unknown[] = []): SqlParam[] {
  return params.map((v) => {
    if (v === null || v === undefined) return null;
    if (typeof v === "boolean") return v ? 1 : 0;
    if (typeof v === "number" || typeof v === "string" || typeof v === "bigint") return v;
    return JSON.stringify(v);
  });
}

export function memoryDb(path = ":memory:"): Db & { raw: DatabaseSync } {
  const d = new DatabaseSync(path);
  d.exec("PRAGMA foreign_keys = ON");
  return {
    raw: d,
    async select<T>(sql: string, params: unknown[] = []) {
      return d.prepare(sql).all(...conv(params)).map((r) => ({ ...r })) as T[];
    },
    async execute(sql: string, params: unknown[] = []) {
      const r = d.prepare(sql).run(...conv(params));
      return { rowsAffected: Number(r.changes), lastInsertId: Number(r.lastInsertRowid) };
    },
    async batch(statements: Statement[]) {
      d.exec("BEGIN");
      try {
        let n = 0;
        for (const s of statements) n += Number(d.prepare(s.sql).run(...conv(s.params)).changes);
        d.exec("COMMIT");
        return n;
      } catch (e) {
        d.exec("ROLLBACK");
        throw e;
      }
    },
  };
}
