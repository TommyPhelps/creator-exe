import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Ctx, type AppCtx, type ConfirmOptions, type Route, type SectionId, type ToastMsg } from "./context.tsx";
import type { Platform } from "../platform/types.ts";
import { DEFAULT_SETTINGS, THEMES, saveSettings, type AppSettings, type Density } from "../domain/settings.ts";
import { AppMark, Icon } from "../ui/icons.tsx";
import { Button, Dialog } from "../ui/kit.tsx";
import { QuickCapture } from "../features/QuickCapture.tsx";
import { ControlRoom } from "../features/ControlRoom.tsx";
import { Tonight } from "../features/Tonight.tsx";
import { IdeaMachine } from "../features/IdeaMachine.tsx";
import { Projects } from "../features/Projects.tsx";
import { Workshop } from "../features/Workshop.tsx";
import { Research } from "../features/Research.tsx";
import { ThumbnailLab } from "../features/thumbnail/ThumbnailLab.tsx";
import { PackagingLab } from "../features/PackagingLab.tsx";
import { ChannelDna } from "../features/ChannelDna.tsx";
import { CreatorMemory } from "../features/CreatorMemory.tsx";
import { Settings, runBackup, runRestore } from "../features/Settings.tsx";
import { createProject } from "../db/repos.ts";

interface NavItem {
  id: SectionId;
  title: string;
  sub: string;
  icon: string;
  group: string;
  key: string;
}

export const NAV: NavItem[] = [
  { id: "control", title: "CONTROL ROOM", sub: "What to make today", icon: "control", group: "MAKE", key: "1" },
  { id: "tonight", title: "TONIGHT.EXE", sub: "Make something tonight", icon: "tonight", group: "MAKE", key: "2" },
  { id: "ideas", title: "IDEA MACHINE", sub: "Generate & compare ideas", icon: "ideas", group: "MAKE", key: "3" },
  { id: "projects", title: "VIDEO WORKSHOP", sub: "Projects & archive", icon: "projects", group: "MAKE", key: "4" },
  { id: "research", title: "RESEARCH", sub: "Sources & notes", icon: "research", group: "PREPARE", key: "5" },
  { id: "thumbnails", title: "THUMBNAIL LAB", sub: "Layered design", icon: "thumbnail", group: "PREPARE", key: "6" },
  { id: "packaging", title: "PACKAGING LAB", sub: "Titles & upload text", icon: "packaging", group: "PREPARE", key: "7" },
  { id: "channel", title: "CHANNEL DNA", sub: "Your past videos", icon: "channel", group: "YOU", key: "8" },
  { id: "memory", title: "CREATOR MEMORY", sub: "Your creative profile", icon: "memory", group: "YOU", key: "9" },
  { id: "settings", title: "SETTINGS", sub: "Integrations & data", icon: "settings", group: "YOU", key: "0" },
];

const DENSITIES: { id: Density; label: string }[] = [
  { id: "compact", label: "Compact" },
  { id: "comfortable", label: "Comfortable" },
  { id: "spacious", label: "Spacious" },
];

interface MenuEntry {
  label?: string;
  kbd?: string;
  action?: () => void;
  checked?: boolean;
  disabled?: boolean;
  sep?: boolean;
}

function MenuBar({ menus }: { menus: { title: string; items: MenuEntry[] }[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(null);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", esc);
    };
  }, []);
  return (
    <div className="menubar" ref={ref} role="menubar">
      {menus.map((m, i) => (
        <div key={m.title} className={`menu ${open === i ? "open" : ""}`}>
          <button className="menu-title" role="menuitem" aria-haspopup="true" aria-expanded={open === i} onClick={() => setOpen(open === i ? null : i)} onMouseEnter={() => open !== null && setOpen(i)}>
            {m.title}
          </button>
          {open === i ? (
            <div className="menu-list" role="menu">
              {m.items.map((it, j) =>
                it.sep ? (
                  <div key={j} className="menu-sep" />
                ) : (
                  <button
                    key={j}
                    role="menuitem"
                    className={`menu-item ${it.checked ? "checked" : ""}`}
                    disabled={it.disabled}
                    onClick={() => {
                      setOpen(null);
                      it.action?.();
                    }}
                  >
                    <span>{it.label}</span>
                    {it.kbd ? <span className="kbd">{it.kbd}</span> : null}
                  </button>
                ),
              )}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function Clock() {
  const [t, setT] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setT(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  return <>{t.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</>;
}

const SHORTCUTS: [string, string][] = [
  ["Ctrl+1 ... Ctrl+0", "Switch section (in navigation order)"],
  ["Ctrl+N", "New project"],
  ["Ctrl+K", "Quick capture an idea"],
  ["Ctrl+B", "Collapse or expand navigation"],
  ["Ctrl+= / Ctrl+- / Ctrl+0 (with Shift)", "Larger / smaller / reset text size"],
  ["F1", "This list"],
  ["Esc", "Close a dialog or menu"],
  ["Thumbnail Lab: Ctrl+Z / Ctrl+Y", "Undo / redo"],
  ["Thumbnail Lab: Ctrl+S", "Save thumbnail"],
  ["Thumbnail Lab: Ctrl+D", "Duplicate layer"],
  ["Thumbnail Lab: Delete", "Delete layer"],
  ["Thumbnail Lab: arrows (Shift = 10px)", "Nudge layer"],
  ["Thumbnail Lab: Ctrl+[ / Ctrl+]", "Send backward / bring forward"],
];

export function App(props: { platform: Platform; initialSettings: AppSettings; appVersion: string; bootNotes: string[] }) {
  const { platform, appVersion } = props;
  const [settings, setSettings] = useState(props.initialSettings);
  const [route, setRoute] = useState<Route>({ section: "control" });
  const [version, setVersion] = useState(0);
  const [toasts, setToasts] = useState<ToastMsg[]>([]);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [confirmState, setConfirmState] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);
  const [promptState, setPromptState] = useState<(ConfirmOptions & { initial?: string; resolve: (v: string | null) => void }) | null>(null);
  const [promptValue, setPromptValue] = useState("");
  const [capture, setCapture] = useState(false);
  const [help, setHelp] = useState<"shortcuts" | "about" | null>(null);
  const toastId = useRef(0);

  const toast = useCallback((title: string, body?: string, kind?: "ok" | "err") => {
    const id = ++toastId.current;
    setToasts((t) => [...t.slice(-3), { id, title, body, kind }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === "err" ? 9000 : title === "SYSTEM" ? 7000 : 4200);
  }, []);

  const changed = useCallback(() => {
    setVersion((v) => v + 1);
    setLastSaved(new Date().toISOString());
  }, []);

  const updateSettings = useCallback(
    async (patch: Partial<AppSettings>) => {
      const next = { ...settings, ...patch };
      setSettings(next);
      try {
        await saveSettings(platform.db, next);
        setLastSaved(new Date().toISOString());
      } catch (e) {
        toast("ERROR", `Settings were not saved: ${e instanceof Error ? e.message : String(e)}`, "err");
      }
    },
    [settings, platform, toast],
  );

  const confirm = useCallback((o: ConfirmOptions) => new Promise<boolean>((resolve) => setConfirmState({ ...o, resolve })), []);
  const prompt = useCallback(
    (o: ConfirmOptions & { initial?: string }) =>
      new Promise<string | null>((resolve) => {
        setPromptValue(o.initial ?? "");
        setPromptState({ ...o, resolve });
      }),
    [],
  );

  const go = useCallback((r: Route) => {
    setRoute(r);
    document.querySelector(".workspace")?.scrollTo({ top: 0 });
  }, []);

  const newProject = useCallback(async () => {
    try {
      const p = await createProject(platform.db, { title: "Untitled video", nextAction: "Write one sentence about why you want to make this." });
      changed();
      toast("PROJECT INITIALIZED", "Give it a working title on the recording sheet.");
      go({ section: "workshop", projectId: p.id });
    } catch (e) {
      toast("ERROR", e instanceof Error ? e.message : String(e), "err");
    }
  }, [platform, changed, toast, go]);

  const ctx: AppCtx = useMemo(
    () => ({
      platform,
      db: platform.db,
      appVersion,
      settings,
      updateSettings,
      route,
      go,
      toast,
      confirm,
      prompt,
      version,
      changed,
      lastSaved,
      openQuickCapture: () => setCapture(true),
    }),
    [platform, appVersion, settings, updateSettings, route, go, toast, confirm, prompt, version, changed, lastSaved],
  );

  // Apply theme, density and text scale.
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = settings.theme;
    root.dataset.density = settings.density;
    root.style.setProperty("zoom", String(settings.textScale));
  }, [settings.theme, settings.density, settings.textScale]);

  const bootShown = useRef(false);
  useEffect(() => {
    if (bootShown.current) return;
    bootShown.current = true;
    for (const n of props.bootNotes) toast("SYSTEM", n);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setScale = useCallback((s: number) => void updateSettings({ textScale: Math.round(Math.min(1.6, Math.max(0.8, s)) * 100) / 100 }), [updateSettings]);

  // Global keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = !!target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (e.key === "F1") {
        e.preventDefault();
        setHelp("shortcuts");
        return;
      }
      if (!e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (!e.shiftKey && /^[0-9]$/.test(k)) {
        const item = NAV.find((n) => n.key === k);
        if (item) {
          e.preventDefault();
          go({ section: item.id });
        }
        return;
      }
      if (k === "n" && !e.shiftKey) {
        e.preventDefault();
        void newProject();
      } else if (k === "k") {
        e.preventDefault();
        setCapture(true);
      } else if (k === "b" && !typing) {
        e.preventDefault();
        void updateSettings({ navCollapsed: !settings.navCollapsed });
      } else if (e.shiftKey && (k === "=" || k === "+")) {
        e.preventDefault();
        setScale(settings.textScale + 0.1);
      } else if (e.shiftKey && (k === "-" || k === "_")) {
        e.preventDefault();
        setScale(settings.textScale - 0.1);
      } else if (e.shiftKey && (k === "0" || k === ")")) {
        e.preventDefault();
        setScale(1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, newProject, settings.navCollapsed, settings.textScale, setScale, updateSettings]);

  const menus = [
    {
      title: "File",
      items: [
        { label: "New project", kbd: "Ctrl+N", action: () => void newProject() },
        { label: "Quick capture idea", kbd: "Ctrl+K", action: () => setCapture(true) },
        { sep: true },
        { label: "Back up data...", action: () => void runBackup(ctx) },
        { label: "Restore from backup...", action: () => void runRestore(ctx) },
      ],
    },
    {
      title: "View",
      items: [
        ...THEMES.map((t) => ({ label: t.label, checked: settings.theme === t.id, action: () => void updateSettings({ theme: t.id }) })),
        { sep: true },
        ...DENSITIES.map((d) => ({ label: `${d.label} density`, checked: settings.density === d.id, action: () => void updateSettings({ density: d.id }) })),
        { sep: true },
        { label: "Larger text", kbd: "Ctrl+Shift+=", action: () => setScale(settings.textScale + 0.1) },
        { label: "Smaller text", kbd: "Ctrl+Shift+-", action: () => setScale(settings.textScale - 0.1) },
        { label: "Reset text size", kbd: "Ctrl+Shift+0", action: () => setScale(1) },
        { label: settings.navCollapsed ? "Expand navigation" : "Collapse navigation", kbd: "Ctrl+B", action: () => void updateSettings({ navCollapsed: !settings.navCollapsed }) },
      ],
    },
    {
      title: "Go",
      items: NAV.map((n) => ({ label: n.title, kbd: `Ctrl+${n.key}`, action: () => go({ section: n.id }) })),
    },
    {
      title: "Help",
      items: [
        { label: "Keyboard shortcuts", kbd: "F1", action: () => setHelp("shortcuts") },
        { label: "About CREATOR.EXE", action: () => setHelp("about") },
      ],
    },
  ];

  const activeSection: SectionId = route.section === "workshop" ? "projects" : route.section;
  const groups = [...new Set(NAV.map((n) => n.group))];

  return (
    <Ctx.Provider value={ctx}>
      <div className="app">
        <MenuBar menus={menus} />
        <div className="toolbar" role="toolbar" aria-label="Main toolbar">
          <span className="brand">
            <AppMark />
            CREATOR.EXE
          </span>
          <span className="sep" />
          <button className="toolbtn" onClick={() => go({ section: "tonight" })} title="Make something tonight">
            <Icon name="tonight" />
            Tonight
          </button>
          <button className="toolbtn" onClick={() => void newProject()} title="New project (Ctrl+N)">
            <Icon name="plus" />
            New project
          </button>
          <button className="toolbtn" onClick={() => setCapture(true)} title="Quick capture (Ctrl+K)">
            <Icon name="bolt" />
            Capture
          </button>
          <button className="toolbtn" onClick={() => go({ section: "ideas" })} title="Idea Machine">
            <Icon name="ideas" />
            Ideas
          </button>
          <button className="toolbtn" onClick={() => go({ section: "thumbnails" })} title="Thumbnail Lab">
            <Icon name="thumbnail" />
            Thumbnail
          </button>
          <span className="spacer" />
          <button className="toolbtn" onClick={() => void runBackup(ctx)} title="Back up all data to a file">
            <Icon name="save" />
            Backup
          </button>
        </div>
        <div className="body">
          <nav className={`nav ${settings.navCollapsed ? "collapsed" : ""}`} aria-label="Sections">
            {groups.map((g) => (
              <div key={g} className="stack tight">
                <div className="nav-group">{g}</div>
                {NAV.filter((n) => n.group === g).map((n) => (
                  <button key={n.id} className={activeSection === n.id ? "active" : ""} onClick={() => go({ section: n.id })} title={`${n.title} (Ctrl+${n.key})`} aria-current={activeSection === n.id ? "page" : undefined}>
                    <Icon name={n.icon} />
                    <span className="label">
                      <b>{n.title}</b>
                      <small>{n.sub}</small>
                    </span>
                  </button>
                ))}
              </div>
            ))}
          </nav>
          <main className="workspace">
            <Screen route={route} />
          </main>
        </div>
        <footer className="statusbar">
          <span className="cell">
            <span className="led" /> SYSTEM ONLINE
          </span>
          <span className="cell grow">{statusLine(route)}</span>
          <span className="cell" title="All data is stored locally on this PC">
            {lastSaved ? `Saved ${new Date(lastSaved).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", second: "2-digit" })}` : "Local database"}
          </span>
          <span className="cell" title="Phase 1 runs without AI. Local and cloud AI are planned for Phase 3.">
            <span className="led off" /> AI: OFF
          </span>
          <span className="cell">v{appVersion}</span>
          <span className="cell">
            <Clock />
          </span>
        </footer>
      </div>

      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`toast ${t.kind === "err" ? "err" : ""}`}
            role={t.kind === "err" ? "alert" : "status"}
            title="Click to dismiss"
            onClick={() => setToasts((all) => all.filter((x) => x.id !== t.id))}
          >
            <div className="t-head">
              <span className={`led ${t.kind === "err" ? "warn" : ""}`} />
              {t.title}
            </div>
            {t.body ? <div className="t-body selectable">{t.body}</div> : null}
          </div>
        ))}
      </div>

      {capture ? <QuickCapture onClose={() => setCapture(false)} /> : null}

      {confirmState ? (
        <Dialog
          title={confirmState.title}
          icon="settings"
          onClose={() => {
            confirmState.resolve(false);
            setConfirmState(null);
          }}
          actions={
            <>
              <Button
                onClick={() => {
                  confirmState.resolve(false);
                  setConfirmState(null);
                }}
              >
                Cancel
              </Button>
              <Button
                variant={confirmState.danger ? "danger" : "primary"}
                onClick={() => {
                  confirmState.resolve(true);
                  setConfirmState(null);
                }}
              >
                {confirmState.confirm ?? "OK"}
              </Button>
            </>
          }
        >
          <p className="selectable" style={{ whiteSpace: "pre-wrap" }}>
            {confirmState.message}
          </p>
        </Dialog>
      ) : null}

      {promptState ? (
        <Dialog
          title={promptState.title}
          icon="bolt"
          onClose={() => {
            promptState.resolve(null);
            setPromptState(null);
          }}
          actions={
            <>
              <Button
                onClick={() => {
                  promptState.resolve(null);
                  setPromptState(null);
                }}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  promptState.resolve(promptValue);
                  setPromptState(null);
                }}
              >
                {promptState.confirm ?? "OK"}
              </Button>
            </>
          }
        >
          <p>{promptState.message}</p>
          <input
            className="input"
            autoFocus
            value={promptValue}
            aria-label={promptState.title}
            onChange={(e) => setPromptValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                promptState.resolve(promptValue);
                setPromptState(null);
              }
            }}
          />
        </Dialog>
      ) : null}

      {help === "shortcuts" ? (
        <Dialog title="Keyboard shortcuts" icon="settings" onClose={() => setHelp(null)} actions={<Button onClick={() => setHelp(null)}>Close</Button>}>
          <table className="table">
            <tbody>
              {SHORTCUTS.map(([k, d]) => (
                <tr key={k}>
                  <td>
                    <span className="kbd">{k}</span>
                  </td>
                  <td>{d}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Dialog>
      ) : null}
      {help === "about" ? (
        <Dialog title="About CREATOR.EXE" icon="control" onClose={() => setHelp(null)} actions={<Button onClick={() => setHelp(null)}>OK</Button>}>
          <div className="row nowrap">
            <div style={{ width: 72, flex: "none" }}>
              <AppMark />
            </div>
            <div className="stack tight">
              <h2>CREATOR.EXE {appVersion}</h2>
              <p>A personal producer, research desk and thumbnail workstation. You are the creator; this is the support team.</p>
              <p className="dim small">Everything is stored locally on this PC. No account, no AI and no cloud service is required.</p>
            </div>
          </div>
        </Dialog>
      ) : null}
    </Ctx.Provider>
  );
}

function statusLine(route: Route): string {
  const n = NAV.find((x) => x.id === (route.section === "workshop" ? "projects" : route.section));
  return n ? `${n.title} :: ${n.sub}` : "";
}

function Screen({ route }: { route: Route }) {
  switch (route.section) {
    case "control":
      return <ControlRoom />;
    case "tonight":
      return <Tonight />;
    case "ideas":
      return <IdeaMachine />;
    case "projects":
      return <Projects />;
    case "workshop":
      return route.projectId ? <Workshop projectId={route.projectId} tab={route.tab} /> : <Projects />;
    case "research":
      return <Research />;
    case "thumbnails":
      return <ThumbnailLab projectId={route.projectId ?? null} thumbnailId={route.thumbnailId ?? null} />;
    case "packaging":
      return <PackagingLab projectId={route.projectId ?? null} tab={route.tab} />;
    case "channel":
      return <ChannelDna />;
    case "memory":
      return <CreatorMemory />;
    case "settings":
      return <Settings />;
    default:
      return null;
  }
}

export { DEFAULT_SETTINGS };
