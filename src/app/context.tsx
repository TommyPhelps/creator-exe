import { createContext, useCallback, useContext, useEffect, useRef, useState, type DependencyList } from "react";
import type { Db, Platform } from "../platform/types.ts";
import type { AppSettings } from "../domain/settings.ts";

export type SectionId =
  | "control"
  | "tonight"
  | "ideas"
  | "projects"
  | "workshop"
  | "research"
  | "thumbnails"
  | "packaging"
  | "channel"
  | "memory"
  | "settings";

export interface Route {
  section: SectionId;
  projectId?: string | null;
  tab?: string;
  thumbnailId?: string | null;
}

export interface ToastMsg {
  id: number;
  title: string;
  body?: string;
  kind?: "ok" | "err";
}

export interface ConfirmOptions {
  title: string;
  message: string;
  confirm?: string;
  danger?: boolean;
}

export interface AppCtx {
  platform: Platform;
  db: Db;
  appVersion: string;
  settings: AppSettings;
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>;
  route: Route;
  go: (r: Route) => void;
  toast: (title: string, body?: string, kind?: "ok" | "err") => void;
  confirm: (o: ConfirmOptions) => Promise<boolean>;
  /** Asks for a line of text. Resolves null when cancelled. */
  prompt: (o: ConfirmOptions & { initial?: string }) => Promise<string | null>;
  /** Increments whenever data changes; screens re-query when it does. */
  version: number;
  changed: () => void;
  lastSaved: string | null;
  openQuickCapture: () => void;
}

export const Ctx = createContext<AppCtx | null>(null);

export function useApp(): AppCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useApp outside provider");
  return c;
}

/** Loads data and reloads whenever the app's data version changes. */
export function useData<T>(load: () => Promise<T>, deps: DependencyList = []): { data: T | null; error: string | null; loading: boolean; reload: () => void } {
  const { version } = useApp();
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean }>({ data: null, error: null, loading: true });
  const [nonce, setNonce] = useState(0);
  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true }));
    loadRef
      .current()
      .then((data) => alive && setState({ data, error: null, loading: false }))
      .catch((e: unknown) => alive && setState({ data: null, error: e instanceof Error ? e.message : String(e), loading: false }));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, nonce, ...deps]);
  return { ...state, reload: useCallback(() => setNonce((n) => n + 1), []) };
}

/** Wraps an async action with error reporting through a toast. */
export function useAction() {
  const { toast, changed } = useApp();
  return useCallback(
    async <T,>(fn: () => Promise<T>, done?: { title: string; body?: string }): Promise<T | undefined> => {
      try {
        const r = await fn();
        changed();
        if (done) toast(done.title, done.body);
        return r;
      } catch (e) {
        toast("ERROR", e instanceof Error ? e.message : String(e), "err");
        return undefined;
      }
    },
    [toast, changed],
  );
}
