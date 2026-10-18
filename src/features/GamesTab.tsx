// v0.1.3 Games tab: find a game first, then ask what you could make with it.
// Your imported library plus the built-in catalog, in one sortable table.
// Steam details (developer, genres, co-op) are fetched only when you press
// the button, one game at a time; nothing is guessed.

import { useMemo, useState } from "react";
import { useApp, useData } from "../app/context.tsx";
import { listGameMeta, listGames } from "../db/repos.ts";
import { GAME_CATALOG, canon, findCatalogGame } from "../domain/games/catalog.ts";
import { factsFromMeta, refreshLibraryMeta } from "../domain/games/meta.ts";
import { GAMING_SUBJECTS, subjectLabel } from "../domain/ideas/subjects.ts";
import { Button, Empty, Note, Segmented, Select, Win } from "../ui/kit.tsx";

interface Row {
  title: string;
  year: number | null;
  genres: string[];
  dev: string;
  inLibrary: boolean;
  owned: boolean;
  free: boolean;
  hours: number | null;
}

type Show = "all" | "library" | "unplayed" | "free";
type Sort = "title" | "year" | "hours";

export function GamesTab({ onMakeWith }: { onMakeWith: (game: string) => void }) {
  const { db, platform, settings, toast, changed } = useApp();
  const [q, setQ] = useState("");
  const [genre, setGenre] = useState("any");
  const [show, setShow] = useState<Show>("all");
  const [era, setEra] = useState<"retro" | "modern" | null>(null);
  const [sort, setSort] = useState<Sort>("title");
  const [progress, setProgress] = useState<string | null>(null);
  const { data } = useData(async () => ({ games: await listGames(db), meta: await listGameMeta(db) }), []);

  const rows = useMemo<Row[]>(() => {
    if (!data) return [];
    const facts = factsFromMeta(data.meta);
    const out = new Map<string, Row>();
    for (const g of data.games) {
      const cat = findCatalogGame(g.title);
      if (cat?.generic || cat?.domain === "gaming-tech") continue;
      const title = cat?.title ?? g.title;
      const f = facts.get(canon(title)) ?? facts.get(g.canon);
      out.set(canon(title), {
        title,
        year: cat?.year ?? f?.year ?? g.releaseYear ?? null,
        genres: [...new Set([...(cat?.genres ?? []), ...(f?.genres ?? [])])],
        dev: cat?.dev ?? f?.developers[0] ?? "",
        inLibrary: true,
        owned: g.ownership === "owned",
        free: cat?.access === "free",
        hours: g.playtimeMin === null ? null : Math.round((g.playtimeMin / 60) * 10) / 10,
      });
    }
    for (const c of GAME_CATALOG) {
      if (c.generic || c.domain === "gaming-tech" || out.has(canon(c.title))) continue;
      out.set(canon(c.title), { title: c.title, year: c.year ?? null, genres: c.genres, dev: c.dev ?? "", inLibrary: false, owned: false, free: c.access === "free", hours: null });
    }
    return [...out.values()];
  }, [data]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = rows.filter((r) => {
      if (needle && !`${r.title} ${r.dev}`.toLowerCase().includes(needle)) return false;
      if (genre !== "any" && !r.genres.includes(genre)) return false;
      if (era && (r.year === null || (era === "retro" ? r.year >= 2008 : r.year < 2008))) return false;
      if (show === "library" && !r.inLibrary) return false;
      if (show === "unplayed" && !(r.inLibrary && (r.hours ?? 0) < 1)) return false;
      if (show === "free" && !r.free) return false;
      return true;
    });
    return list.sort((a, b) => (sort === "year" ? (b.year ?? 0) - (a.year ?? 0) : sort === "hours" ? (b.hours ?? -1) - (a.hours ?? -1) : a.title.localeCompare(b.title)));
  }, [rows, q, genre, era, show, sort]);

  const libraryCount = rows.filter((r) => r.inLibrary).length;
  const missingDetails = data ? data.games.length - new Set(data.meta.filter((m) => m.source === "steam").map((m) => m.canon)).size : 0;

  const refresh = async () => {
    setProgress("Starting...");
    try {
      const r = await refreshLibraryMeta(db, (u) => platform.http(u, { timeoutMs: 8000 }), { onProgress: (done, total) => setProgress(`Checked ${done} of ${total}`) });
      toast(
        "STEAM DETAILS",
        `${r.found} found, ${r.notFound} not on Steam under that exact name${r.errors ? `, ${r.errors} failed` : ""}${r.stoppedEarly ? ". Stopped early after repeated errors; try again later." : "."}`,
        r.stoppedEarly ? "err" : "ok",
      );
      changed();
    } catch (e) {
      toast("ERROR", e instanceof Error ? e.message : String(e), "err");
    } finally {
      setProgress(null);
    }
  };

  return (
    <div className="stack">
      <Win title="GAMES :: FIND ONE, THEN MAKE SOMETHING" icon="ideas" meta={`${libraryCount} in your library · ${rows.length - libraryCount} more in the catalog`}>
        <div className="stack">
          <div className="row">
            <input className="input" style={{ width: 280 }} placeholder="Search games or developers" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search games" />
            <Select value={genre} options={[{ id: "any", label: "Any genre" }, ...GAMING_SUBJECTS.filter((s) => s.id !== "video-games").map((s) => ({ id: s.id, label: s.label }))]} onChange={setGenre} />
            <Segmented
              value={show}
              options={[
                { id: "all", label: "All" },
                { id: "library", label: "My library" },
                { id: "unplayed", label: "Never played" },
                { id: "free", label: "Free" },
              ]}
              onChange={(v) => setShow((v ?? "all") as Show)}
              label="Which games"
            />
            <Segmented value={era} options={[{ id: "retro", label: "Before 2008" }, { id: "modern", label: "2008 on" }]} onChange={(v) => setEra(v)} allowNone label="Era" />
            <span className="right row">
              <span className="label">Sort</span>
              <Segmented value={sort} options={[{ id: "title", label: "A-Z" }, { id: "year", label: "Newest" }, { id: "hours", label: "Most played" }]} onChange={(v) => setSort((v ?? "title") as Sort)} label="Sort" />
            </span>
          </div>
          {libraryCount === 0 ? (
            <Note>Import your REWIND library in Creator Memory → Game Library to see your own games here. The catalog below works without it.</Note>
          ) : settings.gameCovers ? (
            <div className="row small">
              <Button size="small" icon="refresh" onClick={() => void refresh()} disabled={progress !== null}>
                {progress ?? "Get genres and developers from Steam"}
              </Button>
              <span className="dim">
                {missingDetails > 0 ? `${missingDetails} library games have no Steam details yet. ` : ""}Only game names or Steam app IDs are sent to the Steam store, one at a time. Discovering games you don't own yet (through IGDB) is planned for v0.1.4.
              </span>
            </div>
          ) : (
            <span className="dim small">Steam lookups are switched off in Settings.</span>
          )}
        </div>
      </Win>
      {!data ? null : filtered.length === 0 ? (
        <Empty icon="ideas" title="No games match">
          Try fewer filters.
        </Empty>
      ) : (
        <div className="games-table-wrap">
          <table className="table games-table">
            <thead>
              <tr>
                <th>Game</th>
                <th>Year</th>
                <th>Genres</th>
                <th>Developer</th>
                <th>Yours</th>
                <th title="From your imported library">Hours</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 400).map((r) => (
                <tr key={r.title}>
                  <td className="selectable">
                    <b>{r.title}</b>
                  </td>
                  <td className="mono">{r.year ?? ""}</td>
                  <td className="dim">{r.genres.slice(0, 3).map(subjectLabel).join(", ")}</td>
                  <td className="dim">{r.dev}</td>
                  <td>{r.owned ? "Owned" : r.inLibrary ? "In library" : r.free ? "Free" : ""}</td>
                  <td className="mono">{r.hours === null ? "" : r.hours}</td>
                  <td>
                    <Button size="small" onClick={() => onMakeWith(r.title)} title="Build a batch of ideas around this game">
                      What could I make?
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length > 400 ? <p className="dim small">Showing 400 of {filtered.length}. Search or filter to narrow it down.</p> : null}
        </div>
      )}
    </div>
  );
}
