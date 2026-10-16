import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { open, save } from "@tauri-apps/plugin-dialog";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { openUrl } from "@tauri-apps/plugin-opener";
import { bytesToBase64 } from "../lib/base64.ts";
import type { AppInfo, Db, ExecResult, HttpRequest, HttpResult, Platform, Statement } from "./types.ts";

const db: Db = {
  select: <T,>(sql: string, params: unknown[] = []) => invoke<T[]>("db_select", { sql, params }),
  execute: (sql: string, params: unknown[] = []) => invoke<ExecResult>("db_execute", { sql, params }),
  batch: (statements: Statement[]) =>
    invoke<number>("db_batch", { statements: statements.map((s) => ({ sql: s.sql, params: s.params ?? [] })) }),
};

function withTimeout(req: HttpRequest | undefined): { signal: AbortSignal; done: () => void } {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new Error("Request timed out")), req?.timeoutMs ?? 30000);
  const outer = req?.signal;
  const onAbort = () => ctrl.abort(outer?.reason);
  if (outer) {
    if (outer.aborted) ctrl.abort(outer.reason);
    else outer.addEventListener("abort", onAbort, { once: true });
  }
  return {
    signal: ctrl.signal,
    done: () => {
      clearTimeout(timer);
      outer?.removeEventListener("abort", onAbort);
    },
  };
}

async function http(url: string, req?: HttpRequest): Promise<HttpResult> {
  const t = withTimeout(req);
  try {
    const init: RequestInit = { method: req?.method ?? "GET", signal: t.signal };
    if (req?.headers) init.headers = req.headers;
    if (req?.body !== undefined) init.body = req.body;
    const res = await tauriFetch(url, init);
    return { status: res.status, ok: res.ok, text: await res.text() };
  } finally {
    t.done();
  }
}

function single(v: string | string[] | null): string | null {
  if (v === null) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

export const tauriPlatform: Platform = {
  kind: "tauri",
  db,
  info: () => invoke<AppInfo>("app_info"),
  http,
  async httpBinary(url, signal) {
    const t = withTimeout(signal ? { signal } : undefined);
    try {
      const res = await tauriFetch(url, { method: "GET", signal: t.signal });
      const buf = new Uint8Array(await res.arrayBuffer());
      return { status: res.status, base64: bytesToBase64(buf), contentType: res.headers.get("content-type") ?? "" };
    } finally {
      t.done();
    }
  },
  files: {
    createProjectFolders: (root, name, subfolders) => invoke<string>("create_project_folders", { root, name, subfolders }),
    writeText: (path, contents) => invoke<void>("write_text_file", { path, contents }),
    writeBinary: (path, base64) => invoke<void>("write_binary_file", { path, base64 }),
    readText: (path) => invoke<string>("read_text_file", { path }),
    readBinary: (path) => invoke<string>("read_binary_file", { path }),
    exists: (path) => invoke<boolean>("path_exists", { path }),
    safetyBackup: (name, contents) => invoke<string>("write_safety_backup", { name, contents }),
    reveal: (path) => invoke<void>("reveal_folder", { path }),
    launch: (program, argument) => invoke<void>("launch_program", { program, argument: argument ?? null }),
  },
  dialogs: {
    openFile: async (title, filters) => single(await open({ title, filters, multiple: false, directory: false })),
    openFiles: async (title, filters) => {
      const r = await open({ title, filters, multiple: true, directory: false });
      if (r === null) return [];
      return Array.isArray(r) ? r : [r];
    },
    saveFile: (title, defaultPath, filters) => save({ title, defaultPath, filters }),
    pickFolder: async (title) => single(await open({ title, directory: true, multiple: false })),
    pickProgram: async (title) =>
      single(await open({ title, multiple: false, directory: false, filters: [{ name: "Programs", extensions: ["exe"] }] })),
  },
  secrets: {
    get: (name) => invoke<string | null>("secret_get", { name }),
    set: (name, value) => invoke<void>("secret_set", { name, value }),
    remove: (name) => invoke<void>("secret_delete", { name }),
  },
  openUrl: (url) => openUrl(url),
  async onFileDrop(handler) {
    return getCurrentWebview().onDragDropEvent((event) => {
      if (event.payload.type === "drop") handler(event.payload.paths);
    });
  },
};
