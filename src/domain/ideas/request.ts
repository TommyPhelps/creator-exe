// Turns what you type into "Build around games" into game requests the
// generator can honour: "Warband" means Mount & Blade: Warband, "modded
// Skyrim" means Skyrim with mods, "Minecraft modpacks" means the modpacks.
// A name the catalog doesn't know stays exactly as you typed it, and is
// marked unknown so nothing specific is claimed about it.

import { GAME_CATALOG, canon, catalogNames, findCatalogGame, type CatalogGame } from "../games/catalog.ts";

export interface GameRequest {
  /** What you typed. */
  asked: string;
  /** Display name: the catalog title, or what you typed when unknown. */
  title: string;
  /** Canonical names that count as this game, including mods and modpacks that run on it. */
  names: Set<string>;
  catalog: CatalogGame | null;
  /** You asked for mods ("modded Skyrim", "Minecraft modpacks"). */
  mods: boolean;
  /** Not in the catalog: only neutral formats are offered for it. */
  unknown: boolean;
}

const MOD_WORDS = /\b(modded|mods?|modding|modpacks?|mod ?lists?)\b/gi;
const FILLER = /\b(with|some|playing|play)\b/gi;

function fuzzy(text: string): CatalogGame | null {
  const c = canon(text);
  if (c.length < 3) return null;
  const hits = GAME_CATALOG.filter((g) => !g.generic && catalogNames(g).some((n) => n === c || n.startsWith(`${c} `) || n.endsWith(` ${c}`) || n.includes(` ${c} `)));
  return hits.length === 1 ? (hits[0] ?? null) : null;
}

function withRelated(cat: CatalogGame): Set<string> {
  const names = new Set(catalogNames(cat));
  for (const g of GAME_CATALOG) if (g.requires && findCatalogGame(g.requires) === cat) for (const n of catalogNames(g)) names.add(n);
  return names;
}

export function parseRequest(asked: string): GameRequest | null {
  const text = asked.trim();
  if (!text) return null;
  const mods = new RegExp(MOD_WORDS.source, "i").test(text);
  const stripped = text.replace(MOD_WORDS, " ").replace(FILLER, " ").replace(/\s+/g, " ").trim();
  const cat = findCatalogGame(text) ?? (stripped ? findCatalogGame(stripped) ?? fuzzy(stripped) : null);
  if (cat) return { asked: text, title: cat.title, names: withRelated(cat), catalog: cat, mods, unknown: false };
  if (/\bitch(\.io| io)?\b/i.test(text)) {
    // "itch.io horror", "free itch games": the itch.io placeholders and itch.io collections the catalog knows.
    const horror = /horror|scary/i.test(text);
    const names = new Set<string>();
    for (const g of GAME_CATALOG) {
      if (!/itch\.io/i.test(`${g.title} ${g.accessNote ?? ""}`)) continue;
      if (horror && !g.genres.includes("horror-games")) continue;
      for (const n of catalogNames(g)) names.add(n);
    }
    return { asked: text, title: horror ? "itch.io horror" : "itch.io games", names, catalog: null, mods: false, unknown: false };
  }
  if (mods && !stripped) {
    // Just "modpacks": every modpack the catalog knows, plus Minecraft itself.
    const names = new Set<string>();
    for (const g of GAME_CATALOG) if (g.genres.includes("modpacks")) for (const n of catalogNames(g)) names.add(n);
    return { asked: text, title: "Minecraft modpacks", names, catalog: findCatalogGame("Minecraft"), mods: true, unknown: false };
  }
  const title = stripped || text;
  return { asked: text, title, names: new Set([canon(title)]), catalog: null, mods, unknown: true };
}

export function parseRequests(inspiration: string[]): GameRequest[] {
  const out: GameRequest[] = [];
  for (const a of inspiration) {
    const r = parseRequest(a);
    if (r && !out.some((x) => x.title === r.title && x.mods === r.mods)) out.push(r);
  }
  return out;
}
