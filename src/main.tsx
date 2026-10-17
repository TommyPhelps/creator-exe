import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/app.css";
import { App } from "./app/App.tsx";
import { loadPlatform } from "./platform/index.ts";
import { migrate } from "./db/migrate.ts";
import { loadSettings, saveSettings } from "./domain/settings.ts";
import { seedProfileFromBrief } from "./domain/brief.ts";
import { upgradeProfileTo011 } from "./domain/upgrade011.ts";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("missing #root");
const root = createRoot(rootEl);

function Boot({ lines, error }: { lines: string[]; error?: string }) {
  return (
    <div style={{ height: "100%", display: "grid", placeItems: "center" }}>
      <div className="lcd" style={{ width: "min(620px, 92vw)", minHeight: 220 }}>
        <div className="lcd-label">CREATOR.EXE BIOS</div>
        {lines.map((l, i) => (
          <div key={i} className="lcd-line">
            {l}
          </div>
        ))}
        {error ? (
          <div className="lcd-line" style={{ color: "var(--err)", marginTop: 12, whiteSpace: "pre-wrap" }}>
            {error}
          </div>
        ) : (
          <div className="lcd-line">_</div>
        )}
      </div>
    </div>
  );
}

async function boot() {
  const lines: string[] = [];
  const show = (l: string, error?: string) => {
    lines.push(l);
    root.render(<Boot lines={[...lines]} error={error} />);
  };
  document.documentElement.dataset.theme = "midnight-2003";
  try {
    show("> LOADING PLATFORM ......");
    const platform = await loadPlatform();
    const info = await platform.info();
    show(`> DATABASE ............. ${info.dbPath ? "LOCAL" : "PREVIEW"}`);
    const report = await migrate(platform.db);
    show(`> SCHEMA ............... v${report.to}${report.applied.length ? ` (+${report.applied.length} migration${report.applied.length > 1 ? "s" : ""})` : ""}`);
    let settings = await loadSettings(platform.db);
    const notes = report.from > 0 && report.applied.length ? [`Database upgraded from schema v${report.from} to v${report.to}. Your data was kept.`] : [];
    if (!settings.briefSeeded) {
      const added = await seedProfileFromBrief(platform.db);
      settings = { ...settings, briefSeeded: true };
      await saveSettings(platform.db, settings);
      if (added) {
        show(`> CREATOR MEMORY ....... ${added} ENTRIES FROM YOUR BRIEF`);
        notes.push(`Creator Memory starts with ${added} interests from your brief. Edit or delete them any time.`);
      }
    }
    if (!settings.v011Upgraded) {
      const r = await upgradeProfileTo011(platform.db);
      settings = { ...settings, v011Upgraded: true };
      await saveSettings(platform.db, settings);
      show(`> CONTENT FOCUS ........ GAMING FIRST`);
      if (r.movedToPersonal.length || r.added.length) {
        notes.push(
          `Gaming first: ${r.movedToPersonal.length} non-gaming interests are now marked Personal (kept, but they no longer steer ideas) and ${r.added.length} gaming preferences were added. Review them in Creator Memory.`,
        );
      }
    }
    show("> SYSTEM ONLINE");
    root.render(
      <StrictMode>
        <App platform={platform} initialSettings={settings} appVersion={info.version} bootNotes={notes} />
      </StrictMode>,
    );
  } catch (e) {
    show("> BOOT FAILED", e instanceof Error ? e.message : String(e));
  }
}

void boot();
