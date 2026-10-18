// v0.1.2 Pass 2: hand-written, game-specific ideas for the games Tommy named.
import { test } from "node:test";
import assert from "node:assert/strict";
import { candidateByKey, emptyContext, expandLibrary, generateIdeas, materialize } from "../src/domain/ideas/generator.ts";
import { FOCUS_GAMES, GAME_SPECIFIC_LIBRARY, HAND_DETAILS } from "../src/domain/ideas/libraryGames.ts";
import { canon, findCatalogGame } from "../src/domain/games/catalog.ts";
import { accessFor, accessLabel, indexLibrary } from "../src/domain/games/library.ts";
import { mulberry32 } from "../src/lib/util.ts";
import type { LibraryGame } from "../src/domain/games/library.ts";

const offered = expandLibrary().filter((c) => !c.retired);
const isFor = (game: string) => (c: (typeof offered)[number]) => c.gameNames.some((n) => canon(n) === canon(game));

const GROUPS: Record<string, string[]> = {
  Morrowind: ["The Elder Scrolls III: Morrowind"],
  "itch.io horror": ["a free horror game on itch.io", "Haunted PS1 Demo Disc 2020"],
  Warband: ["Mount & Blade: Warband"],
  "Skyrim and mods": ["The Elder Scrolls V: Skyrim", "Enderal: Forgotten Stories"],
  "Older PC RPGs": ["The Elder Scrolls II: Daggerfall", "Arcanum: Of Steamworks and Magick Obscura", "Gothic", "Might and Magic VI: The Mandate of Heaven"],
  "Thief and immersive sims": ["Thief", "Arx Fatalis", "Deus Ex", "The Dark Mod"],
  "Minecraft modpacks": ["Minecraft", "RLCraft", "Create: Above and Beyond", "SkyFactory 4", "GregTech: New Horizons"],
  "Elden Ring": ["Elden Ring"],
  "Dark Souls": ["Dark Souls"],
  "The Witcher 3": ["The Witcher 3: Wild Hunt"],
};

test("every requested game has at least three hand-written ideas of different kinds", () => {
  for (const [group, games] of Object.entries(GROUPS)) {
    const hand = offered.filter((c) => c.hand && games.some((g) => isFor(g)(c)));
    assert.ok(hand.length >= 3, `${group}: ${hand.length} hand-written ideas`);
    const types = new Set(hand.map((c) => c.videoType));
    assert.ok(types.size >= 3, `${group}: only ${[...types].join(", ")}`);
  }
});

test("hand-written ideas are complete: hook, real choices, a starting point and moments to capture", () => {
  for (const s of GAME_SPECIFIC_LIBRARY) {
    assert.ok((s.hook ?? "").length > 15, `${s.key} hook`);
    assert.ok((s.watchAppeal ?? "").length > 15, `${s.key} watch appeal`);
    assert.ok((s.approaches ?? []).length >= 1, `${s.key} approaches`);
    for (const a of s.approaches ?? []) assert.ok(a.name.length > 2 && a.how.length > 8, `${s.key} approach ${a.name}`);
    assert.ok((s.startingSituation ?? "").length > 10, `${s.key} starting situation`);
    assert.ok((s.moments ?? []).length >= 3, `${s.key} moments`);
    assert.ok((s.visualBeats ?? []).length <= 3, `${s.key} keeps visual beats optional and few`);
    assert.ok(s.game || s.games?.length, `${s.key} names its game`);
    for (const g of s.games ?? [s.game!]) assert.ok(findCatalogGame(g), `${s.key}: ${g} is in the catalog`);
  }
});

test("no overproduced formats: no 'underrated', 'in 2026' or 'still worth it' titles", () => {
  for (const s of GAME_SPECIFIC_LIBRARY) {
    assert.ok(!/underrated|in 20\d\d|still worth|you need to play|best game ever/i.test(s.title + " " + s.hook), s.key);
  }
});

test("the overproduced 'overlooked classic' and 'still worth playing' formats are no longer suggested", () => {
  for (const c of offered) assert.ok(!/overlooked classic|still worth playing|underrated/i.test(materialize(c).title), c.key);
});

test("visual beats point at situations; they never script a joke", () => {
  const all = [...GAME_SPECIFIC_LIBRARY.flatMap((s) => s.visualBeats ?? []), ...Object.values(HAND_DETAILS).flatMap((d) => d.visualBeats ?? [])];
  for (const v of all) assert.ok(!/joke|punchline|funny|hilarious|say:|caption:|meme text/i.test(v), v);
});

test("no boilerplate: the same sentence isn't reused across games", () => {
  // Hooks and moments are per game. Templates still on offer for these games
  // may share their generic premise with at most three of the focus games.
  const seen = new Map<string, string>();
  for (const s of GAME_SPECIFIC_LIBRARY) {
    for (const line of [s.hook ?? "", ...(s.moments ?? [])]) {
      const prev = seen.get(line);
      assert.ok(!prev || prev === s.key, `"${line}" appears in ${prev} and ${s.key}`);
      seen.set(line, s.key);
    }
  }
  const focus = new Set(FOCUS_GAMES.map(canon));
  const byPremise = new Map<string, Set<string>>();
  for (const c of offered) {
    const g = c.gameNames.find((n) => focus.has(canon(n)));
    if (!g) continue;
    const premise = materialize(c).premise.split(g).join("GAME");
    byPremise.set(premise, (byPremise.get(premise) ?? new Set()).add(canon(g)));
  }
  for (const [premise, games] of byPremise) assert.ok(games.size <= 3, `${games.size} focus games share: ${premise}`);
});

test("generic templates no longer slot in these games, but old feedback on them still resolves", () => {
  const old = candidateByKey("first-time-classic:morrowind");
  assert.ok(old, "Tommy's liked idea from v0.1.1 is still known");
  assert.equal(old.retired, true);
  assert.ok(!offered.some((c) => c.key === "first-time-classic:morrowind"));
  assert.equal(candidateByKey("economy-exploit:morrowind")?.retired, false, "kept, because it now has Morrowind specifics");
  const morrowind = offered.filter(isFor("The Elder Scrolls III: Morrowind"));
  assert.ok(morrowind.every((c) => c.hand), `every Morrowind idea on offer is specific: ${morrowind.filter((c) => !c.hand).map((c) => c.key).join(", ")}`);
});

test("materialized ideas carry the hand-written details, with slots filled", () => {
  const c = offered.find((x) => x.key === "wb-big-mod:prophesy-of-pendor")!;
  const m = materialize(c);
  assert.match(m.title, /Prophesy of Pendor/);
  assert.equal(m.details.specific, true);
  assert.ok(m.details.requirements.some((r) => r.startsWith("Prophesy of Pendor")));
  assert.ok(!JSON.stringify(m).includes("{mod}"));
  const overlay = materialize(candidateByKey("economy-exploit:morrowind")!);
  assert.match(overlay.details.hook ?? "", /merchants/);
  assert.ok(overlay.details.moments?.includes("Meeting Creeper"));
});

test("free modpacks and mods depend on owning the game they run on", () => {
  const lib = (games: Partial<LibraryGame>[]) =>
    indexLibrary(games.map((g) => ({ title: "", canon: "", platform: "PC", ownership: "owned", status: null, rating: null, favorite: false, playtimeMin: 0, steamAppId: null, releaseYear: null, tags: [], source: "test", ...g }) as LibraryGame));
  const withMc = lib([{ title: "Minecraft", canon: "minecraft" }]);
  const withoutMc = lib([{ title: "Morrowind", canon: "morrowind" }]);
  assert.equal(accessFor("RLCraft", withMc).kind, "free");
  assert.match(accessLabel(accessFor("RLCraft", withMc)), /Runs on Minecraft, which you have/);
  const no = accessFor("RLCraft", withoutMc);
  assert.equal(no.kind, "not_owned");
  assert.match(accessLabel(no), /Free itself, but needs Minecraft/);
  assert.equal(accessFor("Enderal", lib([{ title: "The Elder Scrolls V: Skyrim Special Edition", canon: "elder scrolls v skyrim" }])).kind, "free");
});

test("asking for Warband gives Warband ideas", () => {
  assert.ok(findCatalogGame("Warband"));
  const r = generateIdeas({ inspiration: ["Mount & Blade: Warband"] }, emptyContext(), { count: 3, rng: mulberry32(7) });
  assert.ok(r.ideas.some((i) => i.games.includes("Mount & Blade: Warband")), r.ideas.map((i) => i.title).join(" | "));
});
