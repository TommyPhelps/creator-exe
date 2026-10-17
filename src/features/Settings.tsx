import { useEffect, useState } from "react";
import { useAction, useApp, type AppCtx } from "../app/context.tsx";
import { createBackup, inspectBackup, restoreBackup } from "../domain/backup.ts";
import { SECRET_YOUTUBE_KEY, THEMES, type Density } from "../domain/settings.ts";
import type { AppInfo } from "../platform/types.ts";
import { Button, Check, Field, Note, PageHead, Segmented, Select, Win } from "../ui/kit.tsx";
import { clearGameInfo } from "../db/repos.ts";

export async function runBackup(ctx: AppCtx): Promise<void> {
  try {
    const stamp = new Date().toISOString().slice(0, 10);
    const path = await ctx.platform.dialogs.saveFile("Back up CREATOR.EXE data", `creator-exe-backup-${stamp}.json`, [{ name: "CREATOR.EXE backup", extensions: ["json"] }]);
    if (!path) return;
    const backup = await createBackup(ctx.db, ctx.appVersion);
    await ctx.platform.files.writeText(path, JSON.stringify(backup, null, 1));
    const counts = Object.entries(backup.tables)
      .filter(([, rows]) => rows.length)
      .map(([t, rows]) => `${rows.length} ${t.replace(/_/g, " ")}`)
      .join(", ");
    ctx.toast("BACKUP COMPLETE", `${path}\n${counts || "empty database"}. API keys are not included.`);
  } catch (e) {
    ctx.toast("BACKUP FAILED", e instanceof Error ? e.message : String(e), "err");
  }
}

export async function runRestore(ctx: AppCtx): Promise<void> {
  try {
    const path = await ctx.platform.dialogs.openFile("Restore from a CREATOR.EXE backup", [{ name: "CREATOR.EXE backup", extensions: ["json"] }]);
    if (!path) return;
    const text = await ctx.platform.files.readText(path);
    const { preview, file } = await inspectBackup(ctx.db, text);
    if (!preview.ok || !file) {
      ctx.toast("RESTORE REFUSED", preview.problems.join("\n"), "err");
      return;
    }
    const summary = Object.entries(preview.counts)
      .filter(([, n]) => n)
      .map(([t, n]) => `  ${n} ${t.replace(/_/g, " ")}`)
      .join("\n");
    const ok = await ctx.confirm({
      title: "Restore backup",
      message: `Backup from ${preview.exportedAt ? new Date(preview.exportedAt).toLocaleString() : "unknown date"} contains:\n${summary}\n\nThis REPLACES everything currently in CREATOR.EXE. A safety copy of your current data is saved first.`,
      confirm: "Replace my data",
      danger: true,
    });
    if (!ok) return;
    const safety = await createBackup(ctx.db, ctx.appVersion);
    const safetyPath = await ctx.platform.files.safetyBackup(`before-restore-${new Date().toISOString().replace(/[:.]/g, "-")}`, JSON.stringify(safety));
    await restoreBackup(ctx.db, file);
    ctx.changed();
    ctx.toast("RESTORE COMPLETE", `Your previous data was saved to ${safetyPath}. Restart the app to reload settings.`);
  } catch (e) {
    ctx.toast("RESTORE FAILED", `${e instanceof Error ? e.message : String(e)}\nNothing was changed.`, "err");
  }
}

function YouTubeKey() {
  const { platform, toast, settings } = useApp();
  const act = useAction();
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [draft, setDraft] = useState("");
  const [testing, setTesting] = useState(false);
  useEffect(() => {
    platform.secrets.get(SECRET_YOUTUBE_KEY).then((k) => setHasKey(!!k), () => setHasKey(false));
  }, [platform]);

  const test = async (key: string) => {
    setTesting(true);
    try {
      const id = settings.channelInput.match(/UC[\w-]{22}/)?.[0] ?? "UCGnpORs6LGRRb1b7y39wumw";
      const res = await platform.http(`https://www.googleapis.com/youtube/v3/channels?part=id&id=${id}&key=${encodeURIComponent(key)}`);
      if (res.ok) toast("KEY WORKS", "YouTube accepted the key (1 quota unit used).");
      else {
        let msg = `HTTP ${res.status}`;
        try {
          msg = (JSON.parse(res.text) as { error?: { message?: string } }).error?.message?.replace(/<[^>]+>/g, "") ?? msg;
        } catch {
          /* ignore */
        }
        toast("KEY REJECTED", msg, "err");
      }
    } catch (e) {
      toast("CONNECTION FAILED", e instanceof Error ? e.message : String(e), "err");
    } finally {
      setTesting(false);
    }
  };

  return (
    <Win title="YOUTUBE DATA API" icon="key">
      <p className="small">
        Optional. Lets Channel DNA import every public upload with lengths and view counts. Create a free key: Google Cloud console, new project, enable "YouTube Data API v3", Credentials, Create API key (restrict it to that API). The free quota is 10,000 units a day; an import uses a handful.
      </p>
      <p className="small">
        Status: <b>{hasKey === null ? "checking..." : hasKey ? "key saved in Windows Credential Manager" : "no key saved"}</b>
      </p>
      <div className="row nowrap">
        <input className="input grow" type="password" placeholder="Paste API key" value={draft} onChange={(e) => setDraft(e.target.value)} aria-label="YouTube API key" autoComplete="off" />
        <Button
          variant="primary"
          disabled={!draft.trim()}
          onClick={async () => {
            const r = await act(() => platform.secrets.set(SECRET_YOUTUBE_KEY, draft.trim()), { title: "KEY SAVED", body: "Stored in Windows Credential Manager, never in backups." });
            if (r !== undefined) {
              setHasKey(true);
              setDraft("");
            }
          }}
        >
          Save key
        </Button>
      </div>
      <div className="row">
        <Button disabled={testing || (!hasKey && !draft.trim())} onClick={async () => void test(draft.trim() || (await platform.secrets.get(SECRET_YOUTUBE_KEY)) || "")}>
          {testing ? "Testing..." : "Test key"}
        </Button>
        <Button
          variant="danger"
          disabled={!hasKey}
          onClick={async () => {
            await act(() => platform.secrets.remove(SECRET_YOUTUBE_KEY), { title: "KEY REMOVED" });
            setHasKey(false);
          }}
        >
          Remove key
        </Button>
      </div>
    </Win>
  );
}

export function Settings() {
  const app = useApp();
  const act = useAction();
  const { settings, updateSettings, platform } = app;
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [template, setTemplate] = useState(settings.folderTemplate.join("\n"));
  useEffect(() => {
    platform.info().then(setInfo, () => setInfo(null));
  }, [platform]);

  return (
    <div className="page">
      <PageHead sys="SETTINGS :: CONTROL PANEL" title="Settings" lede="Appearance, integrations, folders and your data. Everything stays on this PC." />
      <div className="grid cols-2">
        <Win title="APPEARANCE" icon="control">
          <Field label="Theme">{(id) => <Select id={id} value={settings.theme} options={THEMES} onChange={(v) => void updateSettings({ theme: v })} />}</Field>
          <div className="row">
            <span className="label">Density</span>
            <Segmented<Density>
              value={settings.density}
              options={[
                { id: "compact", label: "Compact" },
                { id: "comfortable", label: "Comfortable" },
                { id: "spacious", label: "Spacious" },
              ]}
              onChange={(v) => v && void updateSettings({ density: v })}
              label="Density"
            />
          </div>
          <div className="row">
            <span className="label">Text & interface size</span>
            <Button size="small" onClick={() => void updateSettings({ textScale: Math.max(0.8, Math.round((settings.textScale - 0.1) * 10) / 10) })}>
              A-
            </Button>
            <span className="mono">{Math.round(settings.textScale * 100)}%</span>
            <Button size="small" onClick={() => void updateSettings({ textScale: Math.min(1.6, Math.round((settings.textScale + 0.1) * 10) / 10) })}>
              A+
            </Button>
            <Button size="small" variant="flat" onClick={() => void updateSettings({ textScale: 1 })}>
              Reset
            </Button>
          </div>
          <p className="dim small">On a 1440p monitor, 110-120% is often more comfortable.</p>
        </Win>

        <YouTubeKey />

        <Win title="PROJECT FOLDERS" icon="folder">
          <Field label="Where project folders are created">
            {() => (
              <div className="row nowrap">
                <input className="input grow" readOnly value={settings.projectRoot || "(not set)"} aria-label="Project root folder" />
                <Button
                  onClick={async () => {
                    const p = await platform.dialogs.pickFolder("Choose where to create project folders");
                    if (p) void updateSettings({ projectRoot: p });
                  }}
                >
                  Choose...
                </Button>
              </div>
            )}
          </Field>
          <Field label="Subfolders (one per line, nested folders with /)" hint="You are always asked before anything is created. Existing files are never touched.">
            {(id) => (
              <textarea
                id={id}
                className="textarea mono"
                rows={8}
                value={template}
                onChange={(e) => setTemplate(e.target.value)}
                onBlur={() => void updateSettings({ folderTemplate: template.split("\n").map((l) => l.trim()).filter(Boolean) })}
              />
            )}
          </Field>
        </Win>

        <Win title="EDITING APP" icon="play">
          <p className="small">Choose the program you edit in (for example DaVinci Resolve or Shotcut). Projects get an "Open editor" button. CREATOR.EXE only launches it.</p>
          <div className="row nowrap">
            <input className="input grow" readOnly value={settings.editorPath || "(not set)"} aria-label="Editor program" />
            <Button
              onClick={async () => {
                const p = await platform.dialogs.pickProgram("Choose your video editor (.exe)");
                if (p) void updateSettings({ editorPath: p });
              }}
            >
              Choose...
            </Button>
            {settings.editorPath ? (
              <Button variant="flat" onClick={() => void updateSettings({ editorPath: "" })}>
                Clear
              </Button>
            ) : null}
          </div>
        </Win>

        <Win title="YOUR DATA" icon="save">
          <p className="small">
            Database: <span className="mono selectable">{info?.dbPath ?? "..."}</span>
          </p>
          <div className="row">
            <Button variant="primary" icon="save" onClick={() => void runBackup(app)}>
              Back up to file...
            </Button>
            <Button icon="import" onClick={() => void runRestore(app)}>
              Restore from backup...
            </Button>
            {info?.dataDir ? (
              <Button icon="folder" onClick={() => void platform.files.reveal(info.dataDir).catch((e: unknown) => app.toast("ERROR", e instanceof Error ? e.message : String(e), "err"))}>
                Open data folder
              </Button>
            ) : null}
          </div>
          <p className="dim small">Backups are plain JSON and never include API keys. Restoring first saves a safety copy of your current data in the data folder's "backups" subfolder.</p>
        </Win>

        <Win title="AI & ONLINE SERVICES" icon="bolt">
          <p className="small">
            <b>Current mode: No AI.</b> Idea suggestions, titles and thumbnail concepts come from curated libraries and rules that run entirely on this PC.
          </p>
          <p className="small">
            Network use today: YouTube (only when you import), Wikipedia (only when you search), image downloads for thumbnails you choose, and the Steam store for game covers and prices (below). Nothing is uploaded.
          </p>
          <div className="row">
            <Check checked={app.settings.gameCovers} onChange={(v) => void app.updateSettings({ gameCovers: v })}>
              Show game covers and current prices from the Steam store
            </Check>
            <Button size="small" onClick={() => void act(() => clearGameInfo(app.db), { title: "STORE INFO CLEARED", body: "Covers and prices will be looked up again." })}>
              Clear cached store info
            </Button>
          </div>
          <p className="dim small">Sends only game names (or the Steam app ID from your imported library) to store.steampowered.com. A cover or price is shown only when Steam's name matches the game exactly, with the date it was checked; results are kept for 30 days.</p>
          <Note>Optional local AI (Ollama) and cloud AI with your own API key are planned for Phase 3. They will always show which service receives your data and never run silently.</Note>
        </Win>

        <Win title="ABOUT & ROADMAP" icon="settings">
          <p className="small">
            CREATOR.EXE {app.appVersion} :: {info?.platform ?? ""}
          </p>
          <p className="small">Not built yet (so not shown in the navigation):</p>
          <ul className="plain small">
            <li>Rabbit Hole topic map and source-backed research assistant (Phase 4)</li>
            <li>Analytics with Google sign-in, retention and fair comparisons (Phase 6)</li>
            <li>Asset Vault (Phase 6)</li>
            <li>Thumbnail analysis of your old videos, transcripts and original-file inspection (Phase 2)</li>
            <li>Local and cloud AI modes (Phase 3)</li>
          </ul>
        </Win>
      </div>
    </div>
  );
}

