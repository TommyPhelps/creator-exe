// v0.1.3 Pass B: no Let's Plays, YouTube/Twitch/Both, variety across studios, your library, co-op.
import { test } from "node:test";
import assert from "node:assert/strict";
import { memoryDb } from "./helpers/sqliteDb.ts";
import { migrate } from "../src/db/migrate.ts";
import { upgradeProfileTo011 } from "../src/domain/upgrade011.ts";
import { loadCreatorContext } from "../src/domain/ideas/context.ts";
import { emptyContext, expandLibrary, gameGroups, generateIdeas, materialize, type GeneratorControls } from "../src/domain/ideas/generator.ts";
import { GAME_FORMATS, VARIETY_LIBRARY } from "../src/domain/ideas/libraryVariety.ts";
import * as repo from "../src/db/repos.ts";
import { indexLibrary, type LibraryGame } from "../src/domain/games/library.ts";
import { parseMeta, steamSubjects } from "../src/domain/games/steam.ts";
import { factsFromMeta, refreshLibraryMeta } from "../src/domain/games/meta.ts";
import { findCatalogGame } from "../src/domain/games/catalog.ts";
import { mulberry32 } from "../src/lib/util.ts";

const LETS_PLAY = /let'?s play|\bpart \d|\bepisode \d|first (hour|\d+ hours|ten hours)|full playthrough|in 20\d\d|underrated|still worth/i;
const owned = (title: string, extra: Partial<LibraryGame> = {}): LibraryGame => ({ title, canon: title.toLowerCase(), platform: "PC", ownership: "owned", status: null, rating: null, favorite: false, playtimeMin: 300, steamAppId: null, releaseYear: null, tags: [], source: "test", ...extra });
const batches = (controls: GeneratorControls, n = 12, ctx = emptyContext()) => Array.from({ length: n }, (_, i) => generateIdeas(controls, ctx, { count: 3, rng: mulberry32(100 + i) }).ideas).flat();

test("nothing on offer for YouTube is a Let's Play: every idea has a reason to exist", () => {
  for (const c of expandLibrary().filter((x) => !x.retired && x.video && x.domain !== "other")) {
    const m = materialize(c);
    assert.ok(!LETS_PLAY.test(`${m.title} ${m.premise}`), `${c.key}: ${m.title}`);
  }
  for (const f of GAME_FORMATS) assert.ok(!LETS_PLAY.test(`${f.title} ${f.premise}`), f.key);
  for (const i of batches({ destination: "youtube" }, 20)) {
    assert.ok(i.details.reason && i.details.reason !== "casual-live", `${i.title} has no reason`);
    assert.notEqual(i.details.video, false);
  }
});

test("Twitch: Concept Streams by default, Casual Live when you ask, never analysis or Shorts", () => {
  const lib = { ...emptyContext(), library: indexLibrary([owned("Slay the Spire"), owned("Celeste")]) };
  for (const i of batches({ destination: "twitch" }, 12, lib)) assert.notEqual(i.details.live, "no", i.title);
  const casual = batches({ destination: "twitch", streamMode: "casual" }, 4, lib);
  assert.ok(casual.length > 0 && casual.every((i) => i.details.reason === "casual-live"), casual.map((i) => i.title).join(" | "));
  assert.ok(casual.every((i) => /^Casual Live: /.test(i.title) && !/part \d|episode/i.test(`${i.title} ${i.premise}`)));
  assert.ok(batches({ destination: "twitch", streamMode: "concept" }, 6, lib).every((i) => i.details.reason !== "casual-live"));
  // Casual Live never leaks into YouTube.
  assert.ok(batches({ destination: "youtube" }, 8, lib).every((i) => i.details.reason !== "casual-live"));
});

test("Both: ideas that work live and could also become a video", () => {
  for (const i of batches({ destination: "both" }, 12)) {
    assert.notEqual(i.details.live, "no", i.title);
    assert.notEqual(i.details.video, false, i.title);
    assert.ok(i.details.reason && i.details.reason !== "casual-live");
  }
});

test("variety over 20 batches: no studio dominates, many games and kinds of premise", async () => {
  const db = memoryDb();
  await migrate(db);
  await upgradeProfileTo011(db); // favourites: The Witcher 3, Elden Ring, Dark Souls
  const rng = mulberry32(42);
  const devs = new Map<string, number>();
  const games = new Set<string>();
  const reasons = new Set<string>();
  let favouriteStudios = 0;
  let n = 0;
  for (let b = 0; b < 20; b++) {
    const r = generateIdeas({}, await loadCreatorContext(db), { count: 3, rng });
    await repo.recordImpressions(db, r.ideas.map((i) => i.key));
    const batchGroups = new Set<string>();
    for (const i of r.ideas) {
      n++;
      games.add(i.games.join("+"));
      if (i.details.reason) reasons.add(i.details.reason);
      const gs = gameGroups(i.games);
      for (const g of gs) {
        assert.ok(!batchGroups.has(g), `batch ${b}: two ideas from ${g}`);
        batchGroups.add(g);
        if (g.startsWith("dev:")) devs.set(g, (devs.get(g) ?? 0) + 1);
      }
      if (gs.some((g) => /Bethesda|FromSoftware|CD Projekt|Mojang/.test(g))) favouriteStudios++;
    }
  }
  const top = Math.max(...devs.values());
  assert.ok(top / n <= 0.12, `one studio had ${top} of ${n}`);
  assert.ok(favouriteStudios / n <= 0.3, `Bethesda/FromSoftware/CD Projekt/Mojang: ${favouriteStudios} of ${n}`);
  assert.ok(games.size >= 40, `${games.size} different games`);
  assert.ok(reasons.size >= 6, [...reasons].join(", "));
});

test("an explicit request still wins: Skyrim means Skyrim, even right after Skyrim was shown", () => {
  const shown = generateIdeas({ inspiration: ["Skyrim"] }, emptyContext(), { count: 3, rng: mulberry32(1) });
  const ctx = { ...emptyContext(), impressions: shown.ideas.map((i) => ({ ideaKey: i.key, shownAt: new Date().toISOString() })) };
  const again = generateIdeas({ inspiration: ["Skyrim"] }, ctx, { count: 3, rng: mulberry32(2) });
  assert.equal(again.ideas.length, 3);
  assert.ok(again.ideas.every((i) => i.games.some((g) => /Skyrim|Enderal/.test(g))), again.ideas.map((i) => i.title).join(" | "));
});

test("your library: games outside the catalog get general formats, labelled honestly", () => {
  const lib = indexLibrary([owned("Forza Horizon 4", { tags: ["racing", "open world"] }), owned("Some Unknown Sim", { playtimeMin: 0, tags: ["simulation"] })]);
  const r = generateIdeas({ genres: ["racing-games"] }, { ...emptyContext(), library: lib }, { count: 3, rng: mulberry32(5) });
  const forza = r.ideas.find((i) => i.games.includes("Forza Horizon 4"));
  assert.ok(forza, r.ideas.map((i) => i.title).join(" | "));
  assert.equal(forza.details.general, true);
  assert.ok(forza.factors.some((f) => /nothing specific is claimed about Forza Horizon 4/.test(f.text)));
  assert.equal(forza.details.access, "In your library");
  // "Why did I buy it?" only for games you own and haven't played.
  const all = batches({ genres: ["simulation-games"] }, 10, { ...emptyContext(), library: lib });
  for (const i of all.filter((x) => x.seedKey === "fmt-forgotten-purchase")) assert.ok(i.games.includes("Some Unknown Sim"), i.title);
});

test("co-op and party games are in the mix; competitive multiplayer only when asked for", () => {
  const coop = batches({ genres: ["coop-games"] }, 6);
  assert.ok(coop.length >= 6 && coop.every((i) => i.subjects.includes("coop-games") || i.subjects.includes("party-games")));
  assert.ok(VARIETY_LIBRARY.filter((s) => s.collab === "friends").length >= 5);
  const solo = batches({ collab: "solo" }, 6);
  assert.ok(solo.every((i) => i.details.collab !== "friends"), "solo means solo");
  const lib = { ...emptyContext(), library: indexLibrary([owned("Arena Shooter X", { tags: [] })]), facts: factsFromMeta([{ canon: "arena shooter x", source: "steam", sourceId: "1", name: "Arena Shooter X", developers: ["X"], publishers: ["X"], genres: ["Action"], tags: ["Multi-player", "Online PvP"], modes: [], releaseYear: 2020, checkedAt: "2026-10-17T00:00:00Z" }]) };
  assert.ok(!batches({}, 10, lib).some((i) => i.games.includes("Arena Shooter X")), "PvP-only games are left out by default");
  assert.ok(batches({ genres: ["competitive-games"] }, 3, lib).some((i) => i.games.includes("Arena Shooter X")), "and appear when you ask");
});

test("Steam details become facts: developer, genres, co-op vs PvP", () => {
  const body = JSON.stringify({
    "1": { success: true, data: { name: "Lethal Company", developers: ["Zeekerss"], publishers: ["Zeekerss"], genres: [{ id: "1", description: "Action" }, { id: "23", description: "Indie" }], categories: [{ id: 2, description: "Single-player" }, { id: 38, description: "Online Co-op" }], release_date: { coming_soon: false, date: "23 Oct, 2023" } } },
  });
  const m = parseMeta(1, body, "lethal company", new Date("2026-10-17T00:00:00Z"))!;
  assert.deepEqual(m.developers, ["Zeekerss"]);
  assert.equal(m.releaseYear, 2023);
  assert.deepEqual(steamSubjects(m.genres, m.tags).sort(), ["coop-games", "indie-games"]);
  assert.deepEqual(steamSubjects(["Action"], ["Multi-player", "Online PvP", "Single-player"]), [], "a game with a campaign isn't 'competitive'");
  assert.equal(parseMeta(2, body, "x"), null, "no guessing for a different app");
  assert.equal(findCatalogGame("Lethal Company")?.dev, "Zeekerss");
});

test("library refresh: one request at a time, misses remembered, stops after repeated errors", async () => {
  const db = memoryDb();
  await migrate(db);
  await repo.saveGames(db, [owned("Lethal Company", { steamAppId: 1966720 }), owned("Nowhere Game"), owned("Zeta A"), owned("Zeta B"), owned("Zeta C"), owned("Zeta D")]);
  const pauses: number[] = [];
  const calls: string[] = [];
  const get = async (url: string) => {
    calls.push(url);
    if (url.includes("appdetails")) return { ok: true, status: 200, text: JSON.stringify({ "1966720": { success: true, data: { name: "Lethal Company", developers: ["Zeekerss"], genres: [], categories: [] } } }) };
    if (url.includes("Nowhere")) return { ok: true, status: 200, text: JSON.stringify({ items: [] }) };
    return { ok: false, status: 503, text: "" };
  };
  const r = await refreshLibraryMeta(db, get, { wait: async (ms) => void pauses.push(ms) });
  assert.equal(r.found, 1);
  assert.equal(r.notFound, 1);
  assert.equal(r.stoppedEarly, true, "three errors in a row stop the run");
  assert.ok(pauses.every((p) => p >= 1000), "pauses between requests");
  const again = await refreshLibraryMeta(db, get, { wait: async () => {} });
  assert.ok(again.checked <= 3, "found and not-found games aren't fetched again");
  assert.ok(!calls.some((c) => !/store\.steampowered\.com/.test(c)), "only the Steam store is contacted");
});

test("Casual Live on request: three different games to just stream", () => {
  for (const rng of [1, 2, 3]) {
    const r = generateIdeas({ destination: "twitch", streamMode: "casual" }, emptyContext(), { count: 3, rng: mulberry32(rng) });
    assert.equal(r.ideas.length, 3, `seed ${rng}`);
    assert.ok(r.ideas.every((i) => i.details.reason === "casual-live"));
    assert.equal(new Set(r.ideas.map((i) => i.games.join())).size, 3, "three different games");
  }
});
