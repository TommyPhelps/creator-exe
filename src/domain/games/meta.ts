// v0.1.3: game facts from outside sources, cached per game per source.
// Steam now (developer, publisher, genres, single-player/co-op/PvP, year);
// IGDB is planned for v0.1.4 behind the same GameMeta shape, so discovery of
// games you don't own can plug in without changing the generator.

import type { Db } from "../../platform/types.ts";
import { listGameMeta, listGames, saveGameMeta, type GameMeta } from "../../db/repos.ts";
import type { GameFacts } from "../ideas/generator.ts";
import { canon, findCatalogGame } from "./catalog.ts";
import { fetchSteamMeta, steamSubjects, type Get } from "./steam.ts";

const FRESH_DAYS = 90;

/** Merges every source's facts per game into what the generator uses. */
export function factsFromMeta(metas: GameMeta[]): Map<string, GameFacts> {
  const out = new Map<string, GameFacts>();
  for (const m of metas) {
    const cur = out.get(m.canon) ?? { developers: [], publishers: [], genres: [], modes: [], year: null };
    const genres = m.source === "steam" ? steamSubjects(m.genres, m.tags) : [];
    out.set(m.canon, {
      developers: [...new Set([...cur.developers, ...m.developers])],
      publishers: [...new Set([...cur.publishers, ...m.publishers])],
      genres: [...new Set([...cur.genres, ...genres])],
      modes: [...new Set([...cur.modes, ...m.modes])],
      year: cur.year ?? m.releaseYear,
    });
  }
  return out;
}

export interface RefreshResult {
  checked: number;
  found: number;
  notFound: number;
  errors: number;
  stoppedEarly: boolean;
}

/**
 * Looks up Steam details for games in your imported library, one request at a
 * time with a pause in between. Only your game titles or Steam app IDs are sent.
 */
export async function refreshLibraryMeta(
  db: Db,
  get: Get,
  opts: { now?: Date; pauseMs?: number; wait?: (ms: number) => Promise<void>; onProgress?: (done: number, total: number) => void; limit?: number } = {},
): Promise<RefreshResult> {
  const now = opts.now ?? new Date();
  const wait = opts.wait ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const have = new Map((await listGameMeta(db)).filter((m) => m.source === "steam").map((m) => [m.canon, m]));
  const todo = (await listGames(db)).filter((g) => {
    if (g.ownership === "not_owned" || g.ownership === "wishlist") return false;
    const key = canon(findCatalogGame(g.title)?.title ?? g.title);
    const m = have.get(key);
    return !m || now.getTime() - Date.parse(m.checkedAt) > FRESH_DAYS * 86_400_000;
  });
  const list = todo.slice(0, opts.limit ?? todo.length);
  const out: RefreshResult = { checked: 0, found: 0, notFound: 0, errors: 0, stoppedEarly: false };
  let errorsInARow = 0;
  for (const g of list) {
    if (out.checked > 0) await wait(opts.pauseMs ?? 1500);
    const title = findCatalogGame(g.title)?.title ?? g.title;
    const r = await fetchSteamMeta(get, title, g.steamAppId, now);
    out.checked++;
    if (r === "error") {
      out.errors++;
      if (++errorsInARow >= 3) {
        out.stoppedEarly = true;
        break;
      }
    } else {
      errorsInARow = 0;
      if (r === "not_found") {
        out.notFound++;
        // Remember the miss so it isn't retried every time (with an empty record).
        await saveGameMeta(db, { canon: canon(title), source: "steam", sourceId: "", name: "", developers: [], publishers: [], genres: [], tags: [], modes: [], releaseYear: null, checkedAt: now.toISOString() });
      } else {
        out.found++;
        await saveGameMeta(db, r);
      }
    }
    opts.onProgress?.(out.checked, list.length);
  }
  return out;
}
