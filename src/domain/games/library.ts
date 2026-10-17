// Importing the user's own game library (explicitly, from a file they pick)
// and answering "do I own this game?" from that data only.
//
// Supported files:
// - REWIND 2 backups ({ format: "rewind-backup", data: { games, game_tags } })
// - REWIND artifact backups ({ state, lib0: { g: [...] }, lib1, ... })
// - CSV with a title/name/game column (optional ownership, platform, hours, appid)
// - Plain text, one game per line
//
// Formats that don't record ownership ask the user whether the list is games
// they own; nothing is assumed.

import { parseCsv } from "../channel/csv.ts";
import { canon, catalogNames, findCatalogGame, type CatalogGame } from "./catalog.ts";

export type Ownership = "owned" | "wishlist" | "not_owned" | "unknown";

export interface LibraryGame {
  title: string;
  canon: string;
  platform: string;
  ownership: Ownership;
  status: string | null;
  rating: number | null;
  favorite: boolean;
  playtimeMin: number | null;
  steamAppId: number | null;
  releaseYear: number | null;
  tags: string[];
  source: string;
}

export interface LibraryImport {
  source: "rewind-backup" | "rewind-artifact" | "csv" | "text";
  label: string;
  games: LibraryGame[];
  /** True when the file itself says which games are owned. */
  hasOwnership: boolean;
  warnings: string[];
}

const OWNERSHIP = new Set<Ownership>(["owned", "wishlist", "not_owned", "unknown"]);

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function game(title: string, patch: Partial<LibraryGame>, source: string): LibraryGame | null {
  const t = title.trim();
  if (!t || t.length > 300) return null;
  return {
    title: t,
    canon: canon(t),
    platform: "PC",
    ownership: "unknown",
    status: null,
    rating: null,
    favorite: false,
    playtimeMin: null,
    steamAppId: null,
    releaseYear: null,
    tags: [],
    source,
    ...patch,
  };
}

function dedupe(games: LibraryGame[]): LibraryGame[] {
  const rank: Record<Ownership, number> = { owned: 3, wishlist: 1, not_owned: 0, unknown: 2 };
  const by = new Map<string, LibraryGame>();
  for (const g of games) {
    if (!g.canon) continue;
    const cur = by.get(g.canon);
    if (!cur || rank[g.ownership] > rank[cur.ownership]) by.set(g.canon, { ...g, tags: [...new Set([...(cur?.tags ?? []), ...g.tags])] });
  }
  return [...by.values()].sort((a, b) => a.title.localeCompare(b.title));
}

function parseRewindBackup(o: Record<string, unknown>): LibraryImport {
  const data = (o.data ?? {}) as Record<string, unknown>;
  const rows = Array.isArray(data.games) ? (data.games as Record<string, unknown>[]) : [];
  const tagRows = Array.isArray(data.game_tags) ? (data.game_tags as Record<string, unknown>[]) : [];
  const tags = new Map<string, string[]>();
  for (const t of tagRows) {
    const id = String(t.game_id ?? "");
    if (id && typeof t.tag === "string") tags.set(id, [...(tags.get(id) ?? []), t.tag]);
  }
  const games: LibraryGame[] = [];
  for (const r of rows) {
    if (!r || typeof r !== "object" || typeof r.title !== "string") continue;
    const own = String(r.ownership ?? "unknown") as Ownership;
    const rating = num(r.rating);
    const g = game(
      r.title,
      {
        platform: typeof r.platform === "string" && r.platform ? r.platform : "PC",
        ownership: OWNERSHIP.has(own) ? own : "unknown",
        status: typeof r.status === "string" ? r.status : null,
        rating: rating !== null && rating >= 1 && rating <= 5 ? rating : null,
        favorite: r.favorite === 1 || r.favorite === true,
        playtimeMin: num(r.imported_playtime_min),
        steamAppId: num(r.steam_app_id),
        releaseYear: num(r.release_year),
        tags: tags.get(String(r.id ?? "")) ?? [],
      },
      "REWIND backup",
    );
    if (g) games.push(g);
  }
  return {
    source: "rewind-backup",
    label: `REWIND backup (${games.length} games)`,
    games: dedupe(games),
    hasOwnership: true,
    warnings: rows.length && !games.length ? ["The backup's game list couldn't be read."] : [],
  };
}

function parseRewindArtifact(o: Record<string, unknown>): LibraryImport {
  const games: LibraryGame[] = [];
  for (let i = 0; o["lib" + i]; i++) {
    const chunk = o["lib" + i] as { g?: unknown };
    if (!Array.isArray(chunk.g)) continue;
    for (const raw of chunk.g) {
      if (!raw || typeof raw !== "object") continue;
      const r = raw as Record<string, unknown>;
      if (typeof r.n !== "string") continue;
      const hours = num(r.p);
      const g = game(r.n, { playtimeMin: hours === null ? null : Math.round(hours * 60) }, "REWIND artifact backup");
      if (g) games.push(g);
    }
  }
  return {
    source: "rewind-artifact",
    label: `REWIND artifact backup (${games.length} games)`,
    games: dedupe(games),
    hasOwnership: false,
    warnings: ["This older REWIND backup doesn't say which games you own."],
  };
}

function parseCsvLibrary(text: string): LibraryImport {
  const rows = parseCsv(text);
  const header = (rows[0] ?? []).map((h) => h.trim().toLowerCase());
  const col = (...names: string[]) => header.findIndex((h) => names.includes(h));
  const iTitle = col("title", "name", "game", "game title", "game name");
  if (iTitle < 0) throw new Error("The CSV needs a column called title, name or game.");
  const iOwn = col("ownership", "owned", "own");
  const iPlat = col("platform", "store", "storefront");
  const iHours = col("hours", "playtime", "hours played", "playtime_hours");
  const iApp = col("appid", "app id", "steam_app_id", "steam appid");
  const games: LibraryGame[] = [];
  for (const r of rows.slice(1)) {
    const title = r[iTitle] ?? "";
    let ownership: Ownership = "unknown";
    if (iOwn >= 0) {
      const v = (r[iOwn] ?? "").trim().toLowerCase();
      if (["owned", "yes", "y", "true", "1"].includes(v)) ownership = "owned";
      else if (["wishlist", "wishlisted"].includes(v)) ownership = "wishlist";
      else if (["no", "n", "false", "0", "not_owned", "not owned"].includes(v)) ownership = "not_owned";
    }
    const hours = iHours >= 0 ? num(r[iHours]) : null;
    const g = game(
      title,
      {
        ownership,
        platform: iPlat >= 0 && r[iPlat] ? (r[iPlat] as string) : "PC",
        playtimeMin: hours === null ? null : Math.round(hours * 60),
        steamAppId: iApp >= 0 ? num(r[iApp]) : null,
      },
      "CSV",
    );
    if (g) games.push(g);
  }
  return {
    source: "csv",
    label: `CSV (${games.length} games)`,
    games: dedupe(games),
    hasOwnership: iOwn >= 0,
    warnings: iOwn >= 0 ? [] : ["The CSV has no ownership column."],
  };
}

function parseTextList(text: string): LibraryImport {
  const games = text
    .split(/\r?\n/)
    .map((l) => l.replace(/^[-*\d.)\s]+/, "").trim())
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => game(l, {}, "Text list"))
    .filter((g): g is LibraryGame => g !== null);
  return { source: "text", label: `Text list (${games.length} games)`, games: dedupe(games), hasOwnership: false, warnings: ["A plain list doesn't say which games you own."] };
}

export function parseGameLibrary(text: string, fileName = ""): LibraryImport {
  const trimmed = text.replace(/^﻿/, "").trim();
  if (!trimmed) throw new Error("The file is empty.");
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    let obj: unknown;
    try {
      obj = JSON.parse(trimmed);
    } catch {
      throw new Error("The file looks like JSON but couldn't be read.");
    }
    if (obj && typeof obj === "object" && !Array.isArray(obj)) {
      const o = obj as Record<string, unknown>;
      if (o.format === "rewind-backup") return parseRewindBackup(o);
      if (o.state && typeof o.state === "object" && "lib0" in o) return parseRewindArtifact(o);
    }
    if (Array.isArray(obj)) {
      const games = obj
        .map((x) => (typeof x === "string" ? game(x, {}, "JSON list") : x && typeof x === "object" && typeof (x as { title?: unknown }).title === "string" ? game((x as { title: string }).title, {}, "JSON list") : null))
        .filter((g): g is LibraryGame => g !== null);
      return { source: "text", label: `JSON list (${games.length} games)`, games: dedupe(games), hasOwnership: false, warnings: ["The list doesn't say which games you own."] };
    }
    throw new Error("This JSON file isn't a REWIND backup or a list of games.");
  }
  const firstLine = trimmed.split(/\r?\n/)[0] ?? "";
  if (/\.csv$/i.test(fileName) || (firstLine.includes(",") && /\b(title|name|game)\b/i.test(firstLine))) {
    return parseCsvLibrary(trimmed);
  }
  return parseTextList(trimmed);
}

/** Marks every game of unknown ownership as owned, after the user confirms the list is their library. */
export function confirmOwned(imp: LibraryImport): LibraryImport {
  return { ...imp, games: imp.games.map((g) => (g.ownership === "unknown" ? { ...g, ownership: "owned" } : g)), hasOwnership: true };
}

// ------------------------------------------------------------ ownership lookups

export type AccessStatus =
  | { kind: "none" } // no game needed
  | { kind: "free"; note: string }
  | { kind: "owned"; via: "library" | "yours" }
  | { kind: "not_owned"; why: "not_in_library" | "wishlist" | "marked_not_owned" }
  | { kind: "unknown"; why: "no_library" | "unknown_in_library" | "unknown_price" };

export interface LibraryIndex {
  size: number;
  byCanon: Map<string, LibraryGame>;
}

export function indexLibrary(games: LibraryGame[]): LibraryIndex {
  return { size: games.length, byCanon: new Map(games.map((g) => [g.canon, g])) };
}

export function findInLibrary(lib: LibraryIndex, names: string[]): LibraryGame | null {
  for (const n of names) {
    const hit = lib.byCanon.get(n);
    if (hit) return hit;
  }
  return null;
}

/** Whether you can play this game without buying it, using only real data. */
export function accessFor(gameName: string | null, lib: LibraryIndex): AccessStatus {
  if (!gameName) return { kind: "none" };
  const cat: CatalogGame | null = findCatalogGame(gameName);
  if (cat?.yours) return { kind: "owned", via: "yours" };
  const names = cat ? catalogNames(cat) : [canon(gameName)];
  const inLib = findInLibrary(lib, names);
  if (inLib?.ownership === "owned") return { kind: "owned", via: "library" };
  if (cat?.access === "free") return { kind: "free", note: cat.accessNote ?? "Free to download." };
  if (inLib?.ownership === "wishlist") return { kind: "not_owned", why: "wishlist" };
  if (inLib?.ownership === "not_owned") return { kind: "not_owned", why: "marked_not_owned" };
  if (inLib) return { kind: "unknown", why: "unknown_in_library" };
  if (lib.size === 0) return { kind: "unknown", why: "no_library" };
  if (cat?.generic) return { kind: "unknown", why: "unknown_price" };
  return { kind: "not_owned", why: "not_in_library" };
}

export function accessLabel(a: AccessStatus): string {
  switch (a.kind) {
    case "none":
      return "No game to buy";
    case "free":
      return `Free: ${a.note}`;
    case "owned":
      return a.via === "library" ? "In your library" : "A game you already have";
    case "not_owned":
      return a.why === "wishlist" ? "On your wishlist (not owned)" : a.why === "marked_not_owned" ? "Marked not owned in your library" : "Not in your imported library: you'd need to buy it";
    case "unknown":
      return a.why === "no_library" ? "Ownership unknown (import your library to check)" : a.why === "unknown_in_library" ? "In your library, ownership not recorded" : "Price depends on which one you pick";
  }
}

/** True when playing needs no purchase, as far as real data shows. */
export function noPurchaseNeeded(a: AccessStatus): boolean {
  return a.kind === "none" || a.kind === "free" || a.kind === "owned";
}
