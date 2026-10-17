// Preview platform used by the screenshot/test harness: the database is a real
// SQLite database owned by the harness process, everything else is inert.
import type { Db, Platform } from "./types.ts";

export interface PreviewBridge {
  select(sql: string, params: unknown[]): Promise<Record<string, unknown>[]>;
  execute(sql: string, params: unknown[]): Promise<{ rowsAffected: number; lastInsertId: number }>;
  batch(statements: { sql: string; params: unknown[] }[]): Promise<number>;
}

const unavailable = (what: string) => () => Promise.reject(new Error(`${what} is only available in the installed app`));

export function bridgePlatform(bridge: PreviewBridge): Platform {
  const db: Db = {
    select: async <T,>(sql: string, params: unknown[] = []) => (await bridge.select(sql, params)) as T[],
    execute: (sql, params = []) => bridge.execute(sql, params),
    batch: (statements) => bridge.batch(statements.map((s) => ({ sql: s.sql, params: s.params ?? [] }))),
  };
  return {
    kind: "bridge",
    db,
    info: async () => ({ version: "preview", dataDir: "(preview)", dbPath: "(preview)", platform: "preview" }),
    inspectVideo: unavailable("Local video analysis"),
    http: unavailable("Network access"),
    httpBinary: unavailable("Network access"),
    files: {
      createProjectFolders: unavailable("Folder creation"),
      writeText: unavailable("Saving files"),
      writeBinary: unavailable("Saving files"),
      readText: unavailable("Opening files"),
      readBinary: unavailable("Opening files"),
      exists: async () => false,
      safetyBackup: async () => "(preview)",
      reveal: unavailable("File Explorer"),
      launch: unavailable("Launching programs"),
    },
    dialogs: {
      openFile: async () => null,
      openFiles: async () => [],
      saveFile: async () => null,
      pickFolder: async () => null,
      pickProgram: async () => null,
    },
    secrets: { get: async () => null, set: unavailable("Secure storage"), remove: async () => undefined },
    openUrl: async () => undefined,
    onFileDrop: async () => () => undefined,
  };
}
