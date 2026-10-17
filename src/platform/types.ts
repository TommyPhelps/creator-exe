// The platform boundary. Everything that touches the operating system goes
// through this interface so product logic can be tested against a real
// SQLite database in Node and run unchanged inside the Windows app.

export interface ExecResult {
  rowsAffected: number;
  lastInsertId: number;
}

export interface Statement {
  sql: string;
  params?: unknown[];
}

export interface Db {
  select<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  execute(sql: string, params?: unknown[]): Promise<ExecResult>;
  /** Runs all statements in one transaction. */
  batch(statements: Statement[]): Promise<number>;
}

export interface AppInfo {
  version: string;
  dataDir: string;
  dbPath: string;
  platform: string;
}

export interface HttpResult {
  status: number;
  ok: boolean;
  text: string;
}

export interface HttpRequest {
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface FileFilter {
  name: string;
  extensions: string[];
}

import type { LocalMediaAnalysis } from "../domain/channel/forensics.ts";

export interface Platform {
  kind: "tauri" | "bridge" | "browser";
  db: Db;
  info(): Promise<AppInfo>;
  /** User-selected original file, analyzed only on this PC. */
  inspectVideo(path: string): Promise<LocalMediaAnalysis>;
  http(url: string, req?: HttpRequest): Promise<HttpResult>;
  /** Fetches binary content and returns it base64 encoded. */
  httpBinary(url: string, signal?: AbortSignal): Promise<{ status: number; base64: string; contentType: string }>;
  files: {
    createProjectFolders(root: string, name: string, subfolders: string[]): Promise<string>;
    writeText(path: string, contents: string): Promise<void>;
    writeBinary(path: string, base64: string): Promise<void>;
    readText(path: string): Promise<string>;
    readBinary(path: string): Promise<string>;
    exists(path: string): Promise<boolean>;
    safetyBackup(name: string, contents: string): Promise<string>;
    reveal(path: string): Promise<void>;
    launch(program: string, argument?: string): Promise<void>;
  };
  dialogs: {
    openFile(title: string, filters: FileFilter[]): Promise<string | null>;
    openFiles(title: string, filters: FileFilter[]): Promise<string[]>;
    saveFile(title: string, defaultName: string, filters: FileFilter[]): Promise<string | null>;
    pickFolder(title: string): Promise<string | null>;
    pickProgram(title: string): Promise<string | null>;
  };
  secrets: {
    get(name: string): Promise<string | null>;
    set(name: string, value: string): Promise<void>;
    remove(name: string): Promise<void>;
  };
  openUrl(url: string): Promise<void>;
  onFileDrop(handler: (paths: string[]) => void): Promise<() => void>;
}
