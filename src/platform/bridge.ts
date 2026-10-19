// Preview platform used by the screenshot/test harness: the database is a real
// SQLite database owned by the harness process, everything else is inert.
import type { Db, Platform } from "./types.ts";

export interface PreviewBridge {
  select(sql: string, params: unknown[]): Promise<Record<string, unknown>[]>;
  execute(sql: string, params: unknown[]): Promise<{ rowsAffected: number; lastInsertId: number }>;
  batch(statements: { sql: string; params: unknown[] }[]): Promise<number>;
  /** The screenshot harness can run the same cutout model with OpenCV, so the flow can be shown. */
  cutoutRun?(rgba320: string): Promise<string>;
  /** The harness can answer file pickers and reads with its own sample files. */
  openFiles?(): Promise<string[]>;
  readBinary?(path: string): Promise<string>;
  /** …and save dialogs and writes, so exports can be checked. */
  saveFile?(defaultName: string): Promise<string | null>;
  writeBinary?(path: string, base64: string): Promise<void>;
  writeText?(path: string, contents: string): Promise<void>;
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
    http: unavailable("Network access"),
    httpBinary: unavailable("Network access"),
    files: {
      createProjectFolders: unavailable("Folder creation"),
      writeText: (path, contents) => (bridge.writeText ? bridge.writeText(path, contents) : Promise.reject(new Error("Saving files is only available in the installed app"))),
      writeBinary: (path, b64) => (bridge.writeBinary ? bridge.writeBinary(path, b64) : Promise.reject(new Error("Saving files is only available in the installed app"))),
      readText: unavailable("Opening files"),
      readBinary: (path) => (bridge.readBinary ? bridge.readBinary(path) : Promise.reject(new Error("Opening files is only available in the installed app"))),
      exists: async () => false,
      safetyBackup: async () => "(preview)",
      reveal: unavailable("File Explorer"),
      launch: unavailable("Launching programs"),
    },
    dialogs: {
      openFile: async () => null,
      openFiles: async () => (bridge.openFiles ? bridge.openFiles() : []),
      saveFile: async (_title, defaultName) => (bridge.saveFile ? bridge.saveFile(defaultName) : null),
      pickFolder: async () => null,
      pickProgram: async () => null,
    },
    secrets: { get: async () => null, set: unavailable("Secure storage"), remove: async () => undefined },
    cutout: {
      status: async () => ({ modelReady: !!bridge.cutoutRun, runtimeReady: !!bridge.cutoutRun, modelBytes: 175_997_641, modelUrl: "", modelPath: "(preview)" }),
      download: unavailable("Downloading the cutout model"),
      run: (rgba) => (bridge.cutoutRun ? bridge.cutoutRun(rgba) : Promise.reject(new Error("Face cutout is only available in the installed app"))),
    },
    openUrl: async () => undefined,
    onFileDrop: async () => () => undefined,
  };
}
