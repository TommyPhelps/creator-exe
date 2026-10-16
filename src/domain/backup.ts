// JSON backup and restore. Backups contain everything in the database but
// never API keys (those live in Windows Credential Manager). Restore is
// atomic: it validates first, then replaces all tables in one transaction.
import type { Db, Statement } from "../platform/types.ts";
import { BACKUP_TABLES, LATEST_SCHEMA_VERSION, type BackupTable } from "../db/migrations.ts";
import { currentSchemaVersion } from "../db/migrate.ts";

export const BACKUP_FORMAT = "creator-exe-backup";
export const BACKUP_FORMAT_VERSION = 1;

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  formatVersion: number;
  appVersion: string;
  schemaVersion: number;
  exportedAt: string;
  tables: Record<string, Record<string, unknown>[]>;
}

const SECRET_SETTING = /(key|token|secret|password)/i;

export async function createBackup(db: Db, appVersion: string): Promise<BackupFile> {
  const tables: BackupFile["tables"] = {};
  for (const t of BACKUP_TABLES) {
    let rows = await db.select<Record<string, unknown>>(`SELECT * FROM ${t}`);
    if (t === "settings") rows = rows.filter((r) => !SECRET_SETTING.test(String(r.key)));
    tables[t] = rows;
  }
  return {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    appVersion,
    schemaVersion: await currentSchemaVersion(db),
    exportedAt: new Date().toISOString(),
    tables,
  };
}

export interface RestorePreview {
  ok: boolean;
  problems: string[];
  counts: Record<string, number>;
  exportedAt: string;
}

async function columnsOf(db: Db, table: BackupTable): Promise<Set<string>> {
  const rows = await db.select<{ name: string }>(`SELECT name FROM pragma_table_info('${table}')`);
  return new Set(rows.map((r) => r.name));
}

export async function inspectBackup(db: Db, text: string): Promise<{ preview: RestorePreview; file: BackupFile | null }> {
  const problems: string[] = [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { preview: { ok: false, problems: ["The file is not valid JSON."], counts: {}, exportedAt: "" }, file: null };
  }
  const f = parsed as Partial<BackupFile>;
  if (!f || typeof f !== "object" || f.format !== BACKUP_FORMAT) problems.push("This is not a CREATOR.EXE backup file.");
  if (typeof f.formatVersion !== "number" || f.formatVersion > BACKUP_FORMAT_VERSION) problems.push("This backup was made by a newer version of CREATOR.EXE.");
  if (typeof f.schemaVersion === "number" && f.schemaVersion > LATEST_SCHEMA_VERSION) problems.push(`Backup schema ${f.schemaVersion} is newer than this app (${LATEST_SCHEMA_VERSION}).`);
  if (!f.tables || typeof f.tables !== "object") problems.push("The backup has no tables.");
  const counts: Record<string, number> = {};
  if (f.tables && typeof f.tables === "object") {
    for (const [name, rows] of Object.entries(f.tables)) {
      if (!(BACKUP_TABLES as readonly string[]).includes(name)) {
        problems.push(`Unknown table "${name}" in backup.`);
        continue;
      }
      if (!Array.isArray(rows)) {
        problems.push(`Table "${name}" is malformed.`);
        continue;
      }
      if (rows.some((r) => !r || typeof r !== "object" || Array.isArray(r))) problems.push(`Table "${name}" contains malformed rows.`);
      const cols = await columnsOf(db, name as BackupTable);
      const unknown = new Set<string>();
      for (const r of rows as Record<string, unknown>[]) for (const k of Object.keys(r ?? {})) if (!cols.has(k)) unknown.add(k);
      if (unknown.size) problems.push(`Table "${name}" has columns this version does not know: ${[...unknown].join(", ")}.`);
      counts[name] = rows.length;
    }
  }
  return {
    preview: { ok: problems.length === 0, problems, counts, exportedAt: typeof f.exportedAt === "string" ? f.exportedAt : "" },
    file: problems.length === 0 ? (f as BackupFile) : null,
  };
}

export async function restoreBackup(db: Db, file: BackupFile): Promise<number> {
  const statements: Statement[] = [];
  for (const t of [...BACKUP_TABLES].reverse()) statements.push({ sql: `DELETE FROM ${t}` });
  for (const t of BACKUP_TABLES) {
    const rows = file.tables[t] ?? [];
    const cols = await columnsOf(db, t);
    for (const r of rows) {
      const keys = Object.keys(r).filter((k) => cols.has(k));
      if (!keys.length) continue;
      statements.push({
        sql: `INSERT INTO ${t} (${keys.map((k) => `"${k}"`).join(", ")}) VALUES (${keys.map(() => "?").join(", ")})`,
        params: keys.map((k) => r[k] ?? null),
      });
    }
  }
  return db.batch(statements);
}
