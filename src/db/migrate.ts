import type { Db } from "../platform/types.ts";
import { MIGRATIONS, type Migration } from "./migrations.ts";

export interface MigrationReport {
  from: number;
  to: number;
  applied: string[];
}

export async function currentSchemaVersion(db: Db): Promise<number> {
  await db.execute(
    "CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)",
  );
  const rows = await db.select<{ v: number | null }>("SELECT MAX(version) AS v FROM schema_migrations");
  return rows[0]?.v ?? 0;
}

export async function migrate(db: Db, migrations: Migration[] = MIGRATIONS): Promise<MigrationReport> {
  const from = await currentSchemaVersion(db);
  const latest = migrations.reduce((m, x) => Math.max(m, x.version), 0);
  if (from > latest) {
    throw new Error(
      `This database uses schema version ${from}, but this copy of CREATOR.EXE only understands up to ${latest}. Install the newer version instead of downgrading.`,
    );
  }
  const applied: string[] = [];
  for (const m of [...migrations].sort((a, b) => a.version - b.version)) {
    if (m.version <= from) continue;
    await db.batch([
      ...m.statements.map((sql) => ({ sql })),
      {
        sql: "INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)",
        params: [m.version, m.name, new Date().toISOString()],
      },
    ]);
    applied.push(`${m.version}: ${m.name}`);
  }
  return { from, to: Math.max(from, latest), applied };
}
