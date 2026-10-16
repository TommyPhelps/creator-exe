import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/app.css";
import { App } from "./app/App.tsx";
import { loadPlatform } from "./platform/index.ts";
import { migrate } from "./db/migrate.ts";
import { loadSettings } from "./domain/settings.ts";

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
    const settings = await loadSettings(platform.db);
    show("> SYSTEM ONLINE");
    const notes = report.from > 0 && report.applied.length ? [`Database upgraded from schema v${report.from} to v${report.to}. Your data was kept.`] : [];
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
