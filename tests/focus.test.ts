// v0.1.1: Content Focus, gaming library, ownership, feedback learning,
// channel classification and the schema v2 upgrade.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mulberry32 } from "../src/lib/util.ts";
import { memoryDb } from "./helpers/sqliteDb.ts";
import { migrate } from "../src/db/migrate.ts";
import { MIGRATIONS, LATEST_SCHEMA_VERSION } from "../src/db/migrations.ts";
import * as repo from "../src/db/repos.ts";
import { IDEA_LIBRARY } from "../src/domain/ideas/library.ts";
import { GAMING_LIBRARY } from "../src/domain/ideas/libraryGaming.ts";
import { emptyContext, expandLibrary, generateIdeas, learnFromFeedback, type CreatorContext, type GeneratedIdea, type GeneratorControls, type GenMode, type InterestMode } from "../src/domain/ideas/generator.ts";
import { DEFAULT_FOCUS, FOCUS_PRESETS, allocateDomains, normalizeFocus, presetFocus } from "../src/domain/ideas/focus.ts";
import { GAME_CATALOG, canon, findCatalogGame } from "../src/domain/games/catalog.ts";
import { accessFor, confirmOwned, indexLibrary, noPurchaseNeeded, parseGameLibrary, type LibraryGame } from "../src/domain/games/library.ts";
import { parseDetails, pickSearchResult, lookupSteam } from "../src/domain/games/steam.ts";
import { channelBoilerplate, readVideo, summarizeChannel } from "../src/domain/channel/analyze.ts";
import { loadCreatorContext } from "../src/domain/ideas/context.ts";
import { seedProfileFromBrief } from "../src/domain/brief.ts";
import { upgradeProfileTo011, V011_ADDITIONS } from "../src/domain/upgrade011.ts";
import { DEFAULT_SETTINGS } from "../src/domain/settings.ts";
import { createBackup, inspectBackup, restoreBackup } from "../src/domain/backup.ts";
import type { IdeaFeedback, Video } from "../src/domain/types.ts";

const ctx = (patch: Partial<CreatorContext> = {}): CreatorContext => ({ ...emptyContext(), ...patch });
const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();
const MODES: GenMode[] = ["standard", "tonight", "zero-budget", "deep-dive", "one-off", "series", "random", "curiosity"];
const INTERESTS: (InterestMode | null)[] = [null, "familiar", "adjacent", "new", "surprise"];

/** Runs several batches the way the app does, recording impressions between them. */
function batches(n: number, controls: GeneratorControls, base: CreatorContext, seed: number, count = 3): GeneratedIdea[][] {
  const out: GeneratedIdea[][] = [];
  const impressions: { ideaKey: string; shownAt: string }[] = [];
  const rng = mulberry32(seed);
  for (let i = 0; i < n; i++) {
    const r = generateIdeas(controls, { ...base, impressions: [...impressions].reverse() }, { count, rng, focus: base === undefined ? DEFAULT_FOCUS : undefined });
    out.push(r.ideas);
    for (const g of r.ideas) impressions.push({ ideaKey: g.key, shownAt: new Date(Date.now() - (n - i) * 60_000).toISOString() });
  }
  return out;
}

const libGame = (title: string, ownership: LibraryGame["ownership"] = "owned", extra: Partial<LibraryGame> = {}): LibraryGame => ({
  title,
  canon: canon(title),
  platform: "PC",
  ownership,
  status: null,
  rating: null,
  favorite: false,
  playtimeMin: null,
  steamAppId: null,
  releaseYear: null,
  tags: [],
  source: "test",
  ...extra,
});

// ------------------------------------------------------------------ library & catalog honesty

test("gaming library: every game variant resolves in the catalog and free claims carry a reason", () => {
  for (const s of GAMING_LIBRARY) {
    if (s.game) assert.ok(findCatalogGame(s.game), `${s.key}: fixed game "${s.game}" is in the catalog`);
    if (s.variants?.games) for (const v of s.variants.values) assert.ok(findCatalogGame(v), `${s.key}: "${v}" is in the catalog`);
    for (const list of Object.values(s.variants?.gamesFor ?? {})) for (const v of list) assert.ok(findCatalogGame(v), `${s.key}: "${v}" is in the catalog`);
    assert.ok(s.videoType, `${s.key} has a video type`);
  }
  for (const g of GAME_CATALOG) if (g.access === "free") assert.ok(g.accessNote && g.accessNote.length > 10, `${g.title} says why it's free`);
  const gaming = expandLibrary(GAMING_LIBRARY);
  assert.ok(gaming.length >= 200, `plenty of concrete gaming ideas (${gaming.length})`);
  assert.ok(new Set(gaming.map((c) => c.videoType)).size >= 12, "many different kinds of video");
  assert.ok(gaming.every((c) => c.domain !== "other"), "the gaming library never produces unrelated ideas");
  // Ideas Tommy liked keep their IDs, so his saved feedback still applies.
  const keys = new Set(gaming.map((c) => c.key));
  assert.ok(keys.has("first-time-classic:morrowind"));
  assert.ok(keys.has("horror-game-analysis:a-free-horror-game-on-itch-io"));
});

// ------------------------------------------------------------------ 1. Content Focus enforcement

test("content focus: gaming first means no unrelated ideas and roughly 85/15 over many batches", () => {
  const all = batches(20, {}, ctx(), 101).flat();
  assert.equal(all.length, 60);
  assert.equal(all.filter((i) => i.domain === "other").length, 0, "0% unrelated content");
  const tech = all.filter((i) => i.domain === "gaming-tech").length;
  assert.ok(tech >= 5 && tech <= 14, `tech share follows 15% (${tech}/60)`);
  assert.ok(batches(10, {}, ctx(), 102).flat().every((i) => i.domain === "gaming" || i.domain === "gaming-tech"));
});

test("content focus: gaming only excludes tech; presets normalize; allocation never picks a 0% domain", () => {
  const only = presetFocus("gaming-only");
  for (let s = 0; s < 8; s++) {
    const r = generateIdeas({}, ctx(), { count: 6, rng: mulberry32(200 + s), focus: only });
    assert.ok(r.ideas.every((i) => i.domain === "gaming"));
  }
  assert.deepEqual(normalizeFocus({ gaming: 0, tech: 0, other: 0 }), DEFAULT_FOCUS);
  const n = normalizeFocus({ gaming: 170, tech: 30, other: 0 });
  assert.equal(n.gaming + n.tech + n.other, 100);
  assert.equal(normalizeFocus({ gaming: 85, tech: 15, other: 0 }).preset, "gaming-first");
  assert.equal(normalizeFocus({ gaming: 70, tech: 30, other: 0 }).preset, "custom");
  for (const p of FOCUS_PRESETS) assert.equal(p.gaming + p.tech + p.other, 100, p.id);
  const slots = allocateDomains(DEFAULT_FOCUS, 30, [], { gaming: 100, "gaming-tech": 100, other: 100 }, mulberry32(3));
  assert.equal(slots.filter((d) => d === "other").length, 0);
  assert.ok(Math.abs(slots.filter((d) => d === "gaming-tech").length - 4.5) <= 1.5);
  // Not enough tech ideas: fill with gaming, never with "other".
  const short = allocateDomains(presetFocus("gaming-tech"), 6, [], { gaming: 10, "gaming-tech": 1, other: 50 }, mulberry32(4));
  assert.deepEqual(short.filter((d) => d === "other"), []);
});

test("explore outside my niche is the only thing that lets unrelated ideas in, and it says so", () => {
  const r = batches(6, { explore: true }, ctx(), 103).flat();
  assert.ok(r.some((i) => i.domain === "other"), "explore mode includes unrelated ideas");
  const one = generateIdeas({ explore: true }, ctx(), { count: 3, rng: mulberry32(5) });
  assert.ok(one.notes.some((n) => /outside your niche/i.test(n)));
  assert.equal(one.focus.preset, "explore");
});

// ------------------------------------------------------------------ 2. cross-mode filtering

test("every mode and interest setting stays inside the content focus", () => {
  let seed = 300;
  for (const mode of MODES) {
    for (const interest of INTERESTS) {
      const r = generateIdeas({ mode, interest, curiosity: mode === "curiosity" ? "old linux distros and cooking" : "" }, ctx({ favoriteGames: new Set(["morrowind", "elder scrolls iii morrowind"]) }), { count: 3, rng: mulberry32(seed++) });
      assert.ok(r.ideas.length > 0, `${mode}/${interest ?? "none"} returns ideas`);
      assert.ok(r.ideas.every((i) => i.domain !== "other"), `${mode}/${interest ?? "none"} never leaves gaming`);
    }
  }
});

test("filters compose: tonight + genre + era + style all respected or reported as loosened", () => {
  const r = generateIdeas({ mode: "tonight", genres: ["horror-games"], style: "gameplay" }, ctx(), { count: 3, rng: mulberry32(31) });
  for (const i of r.ideas) {
    const ok = i.subjects.includes("horror-games") || r.relaxed.includes("genre");
    assert.ok(ok, "genre kept unless reported");
    assert.ok(["tiny", "small"].includes(i.details.effort) || r.relaxed.includes("small enough to start tonight"));
  }
  const retro = generateIdeas({ era: "retro", genres: ["rpg-classic"] }, ctx(), { count: 3, rng: mulberry32(32) });
  assert.ok(retro.ideas.every((i) => i.era === "retro" && i.subjects.includes("rpg-classic")), "retro classic RPGs");
  const commentary = generateIdeas({ style: "commentary" }, ctx(), { count: 3, rng: mulberry32(33) });
  assert.ok(commentary.ideas.every((i) => ["analysis", "retrospective", "investigation", "comparison", "short-take"].includes(i.videoType)));
  const history = generateIdeas({ angle: "history" }, ctx(), { count: 3, rng: mulberry32(34) });
  assert.ok(history.ideas.every((i) => ["investigation", "retrospective", "comparison", "revisit", "first-playthrough", "short-take"].includes(i.videoType)));
  const shorts = generateIdeas({ format: "short" }, ctx(), { count: 3, rng: mulberry32(35) });
  assert.ok(shorts.ideas.every((i) => i.details.format === "short" || i.details.format === "either"));
});

// ------------------------------------------------------------------ 3. gaming preference defaults

test("defaults: gaming first, and a fresh profile only lets gaming interests steer ideas", async () => {
  assert.deepEqual(DEFAULT_SETTINGS.contentFocus, DEFAULT_FOCUS);
  assert.equal(DEFAULT_FOCUS.gaming, 85);
  assert.equal(DEFAULT_FOCUS.tech, 15);
  assert.equal(DEFAULT_FOCUS.other, 0);
  const db = memoryDb();
  await migrate(db);
  await seedProfileFromBrief(db);
  const report = await upgradeProfileTo011(db);
  assert.ok(report.movedToPersonal.includes("Retro computing"));
  assert.ok(report.movedToPersonal.includes("Linux and old operating systems"));
  assert.ok(report.kept.includes("Video games, when they interest me"));
  assert.equal(report.added.length, V011_ADDITIONS.length);
  const profile = await repo.listProfile(db);
  assert.equal(profile.length, 19 + V011_ADDITIONS.length, "nothing was deleted");
  const c = await loadCreatorContext(db);
  assert.ok(c.favoriteGames.has("elden ring") && c.favoriteGames.has("witcher 3 wild hunt"));
  assert.ok(![...c.favoriteSubjects].some((s) => ["linux", "old-os", "retro-computing"].includes(s)), "personal interests don't steer ideas");
  assert.ok(c.favoriteSubjects.has("rpg-classic") && c.favoriteSubjects.has("modpacks"));
  assert.equal((await upgradeProfileTo011(db)).added.length, 0, "running twice adds nothing");
});

// ------------------------------------------------------------------ 4. unrelated-content exclusion

test("unrelated subjects stay out even when typed as curiosity, with a pointer to explore mode", () => {
  const r = generateIdeas({ mode: "curiosity", curiosity: "drawing and cooking and Linux" }, ctx({ favoriteSubjects: new Set(["linux", "drawing"]) }), { count: 3, rng: mulberry32(41) });
  assert.ok(r.ideas.every((i) => i.domain !== "other"));
  assert.ok(r.notes.some((n) => /Explore outside my niche/.test(n)));
  const banned = /website using only 2003|toaster|drawing an object|strange building/i;
  for (const b of batches(15, {}, ctx(), 42).flat()) assert.ok(!banned.test(b.title), `no rejected direction: ${b.title}`);
});

// ------------------------------------------------------------------ 5. diversity

test("diversity: no repeated concept, game or video type in a batch, and many distinct concepts over time", () => {
  const all = batches(12, {}, ctx({ favoriteGames: new Set(["morrowind", "elder scrolls iii morrowind"]) }), 51);
  for (const b of all) {
    assert.equal(new Set(b.map((i) => i.seedKey)).size, b.length, "unique concepts");
    assert.equal(new Set(b.map((i) => i.videoType)).size, b.length, "unique video types");
    const named = b.flatMap((i) => i.games.filter((g) => !findCatalogGame(g)?.generic));
    assert.equal(new Set(named).size, named.length, "unique games");
  }
  const flat = all.flat();
  assert.ok(new Set(flat.map((i) => i.seedKey)).size >= 25, `variety across batches (${new Set(flat.map((i) => i.seedKey)).size} concepts in 36 ideas)`);
  const morrowind = flat.filter((i) => i.games.some((g) => /morrowind/i.test(g))).length;
  assert.ok(morrowind <= 6, `a favorite game doesn't take over (${morrowind}/36)`);
  const horror = flat.filter((i) => i.subjects[0] === "horror-games" || i.subjects.includes("horror-games")).length;
  assert.ok(horror <= 12, `horror is one genre among many (${horror}/36)`);
});

// ------------------------------------------------------------------ 6. no-purchase constraints

test("zero budget never needs a purchase; ownership comes only from your library", () => {
  for (let s = 0; s < 10; s++) {
    const r = generateIdeas({ mode: "zero-budget" }, ctx(), { count: 6, rng: mulberry32(600 + s) });
    for (const i of r.ideas) {
      assert.ok(noPurchaseNeeded(i.access), `${i.title}: ${i.access.kind}`);
      assert.equal(i.details.budgetUsd, 0);
    }
  }
  const noLib = generateIdeas({ mode: "zero-budget" }, ctx(), { count: 3, rng: mulberry32(61) });
  assert.ok(noLib.notes.some((n) => /Import your game library/.test(n)));
  // With Morrowind in the library, Morrowind ideas become zero-budget eligible.
  const lib = indexLibrary([libGame("The Elder Scrolls III: Morrowind Game of the Year Edition")]);
  assert.equal(accessFor("Morrowind", lib).kind, "owned");
  assert.equal(accessFor("Deus Ex", lib).kind, "not_owned", "a library without it means you'd need to buy it");
  assert.equal(accessFor("Deus Ex", indexLibrary([])).kind, "unknown", "no library means unknown, never assumed");
  assert.equal(accessFor("Cave Story", indexLibrary([])).kind, "free");
  assert.equal(accessFor("Night Factory", indexLibrary([])).kind, "unknown", "uncertain prices stay unknown");
  const withLib = batches(8, { mode: "zero-budget", genres: ["rpg-classic"] }, ctx({ library: lib }), 62).flat();
  assert.ok(withLib.every((i) => noPurchaseNeeded(i.access)));
  assert.ok(withLib.some((i) => i.games.some((g) => /morrowind/i.test(g))), "owned games are used");
  const freeOnly = generateIdeas({ access: "free" }, ctx({ library: lib }), { count: 6, rng: mulberry32(63) });
  assert.ok(freeOnly.ideas.every((i) => i.access.kind === "none" || i.access.kind === "free"));
  const tonight = batches(5, { mode: "tonight" }, ctx({ library: lib }), 64).flat();
  assert.ok(tonight.every((i) => i.access.kind !== "not_owned"), "tonight never needs a game you don't own");
});

// ------------------------------------------------------------------ 7. duplicate avoidance

test("rerolls are fresh: no repeated idea, concept or game right after a batch", () => {
  const first = generateIdeas({}, ctx(), { count: 3, rng: mulberry32(71) });
  const impressions = first.ideas.map((i) => ({ ideaKey: i.key, shownAt: new Date().toISOString() }));
  for (let s = 0; s < 5; s++) {
    const second = generateIdeas({}, ctx({ impressions }), { count: 3, rng: mulberry32(72 + s) });
    assert.ok(!second.ideas.some((i) => first.ideas.some((f) => f.key === i.key)), "no repeated idea");
    assert.ok(!second.ideas.some((i) => first.ideas.some((f) => f.seedKey === i.seedKey)), "no repeated concept");
    const firstGames = new Set(first.ideas.flatMap((i) => i.games.filter((g) => !findCatalogGame(g)?.generic)));
    assert.ok(!second.ideas.some((i) => i.games.some((g) => firstGames.has(g))), "no repeated game");
  }
});

// ------------------------------------------------------------------ 8. channel classification

const video = (id: string, title: string, description: string, extra: Partial<Video> = {}): Video => ({
  id,
  title,
  description,
  publishedAt: "2021-06-01T00:00:00Z",
  durationSeconds: 700,
  thumbnailUrl: null,
  availability: "public",
  firstSource: "public_feed",
  lastSyncedAt: null,
  userCategory: "",
  userFormat: "",
  userEffort: null,
  userNotes: "",
  userSubjects: [],
  relatedProjectId: null,
  createdAt: "",
  updatedAt: "",
  ...extra,
});

test("channel classification ignores links, boilerplate and generic words; unknown beats guessing", () => {
  const sign = "Follow me on twitch.tv/tamster and twitter!\nMusic: song by someone\nThanks for watching";
  const vids = [
    video("a", "I tried to eat all the food in Minecraft! It was a nightmare.", `Every food item.\n${sign}`),
    video("b", "Project Zomboid but I'm a Pacifist", `No shoving & no hitting.\n${sign}`),
    video("c", "I played Valorant for the FIRST TIME in 2021", sign),
    video("d", "Night Factory is TERRIFYING | Escape", sign),
    video("e", "A video about my week", `I watched a movie on tv.\n${sign}`),
  ];
  const bp = channelBoilerplate(vids);
  assert.ok(bp.size >= 2, "repeated sign-off lines are detected");
  const s = summarizeChannel(vids, []);
  const ids = new Set(s.subjects.map((x) => x.id));
  assert.ok(!ids.has("film-media"), "a 'tv' link is not a film topic");
  assert.ok(!ids.has("music-projects"), "a music credit is not a music topic");
  assert.ok(ids.has("modpacks") && ids.has("survival-games") && ids.has("horror-games"));
  const eReading = s.readings.get("e")!;
  assert.ok(eReading.unknown, "one description mention is not enough to label a video");
  assert.ok(eReading.subjects.some((x) => x.id === "film-media" && x.confidence === "low"), "it's kept as a weak hint");
  assert.ok(s.unknownIds.includes("e"));
  assert.equal(readVideo(vids[0]!, { boilerplate: bp }).subjects.find((x) => x.id === "modpacks")?.confidence, "high");
  const fixed = readVideo(video("f", "Some title", "", { userSubjects: ["horror-games"] }));
  assert.deepEqual(fixed.subjects.map((x) => x.id), ["horror-games"], "your own topics replace the automatic ones");
});

// ------------------------------------------------------------------ 9. feedback learning

const fb = (ideaKey: string, reaction: IdeaFeedback["reaction"], days = 0, subjects: string[] = []): IdeaFeedback => ({ id: `${ideaKey}-${reaction}`, ideaKey, reaction, subjects, detail: {}, createdAt: daysAgo(days) });

test("feedback learns the right thing: game vs format vs concept", () => {
  const morrowindIdea = "first-time-classic:morrowind";
  const likeGame = learnFromFeedback([fb(morrowindIdea, "like_game")]);
  assert.ok((likeGame.games.get(canon("The Elder Scrolls III: Morrowind")) ?? 0) > 1, "liking the game boosts the game");
  assert.equal(likeGame.seeds.get("first-time-classic") ?? 0, 0, "...not the concept");
  const likeType = learnFromFeedback([fb(morrowindIdea, "like_format")]);
  assert.ok((likeType.types.get("first-playthrough") ?? 0) > 1);
  assert.equal(likeType.games.size, 0);
  const topic = learnFromFeedback([fb(morrowindIdea, "like_topic", 0, ["rpg-classic"])]);
  assert.ok((topic.subjects.get("rpg-classic") ?? 0) > 0 && (topic.seeds.get("first-time-classic") ?? 0) < 0, "topic yes, execution no");
  const notType = learnFromFeedback([fb("weird-mods:minecraft", "not_this_type")]);
  assert.ok((notType.types.get("mod-showcase") ?? 0) < -2);
  const old = learnFromFeedback([fb("weird-mods:minecraft", "not_this_type", 120)]);
  assert.ok(Math.abs(old.types.get("mod-showcase") ?? 0) < 1.5, "even strong dislikes fade");

  // "Don't want this type" pushes that type out of the top results without banning a genre.
  const after = batches(6, {}, ctx({ feedback: [fb("weird-mods:minecraft", "not_this_type"), fb("unknown-modpack:a-magic-modpack", "not_this_type")] }), 91).flat();
  assert.ok(after.filter((i) => i.videoType === "mod-showcase").length <= 1);

  // Liking a Morrowind idea doesn't produce a wall of Morrowind.
  const liked = batches(5, {}, ctx({ feedback: [fb(morrowindIdea, "love", 0, ["rpg-classic"]), fb(morrowindIdea, "like_game")] }), 92).flat();
  const mw = liked.filter((i) => i.games.some((g) => /morrowind/i.test(g))).length;
  assert.ok(mw >= 1 && mw <= 4, `Morrowind shows up but doesn't dominate (${mw}/15)`);
});

test("more like this finds relatives with a different concept or game", () => {
  const base = generateIdeas({}, ctx(), { count: 1, rng: mulberry32(93), library: IDEA_LIBRARY.filter((s) => s.key === "horror-game-analysis") }).ideas[0]!;
  const r = generateIdeas({}, ctx(), { count: 3, rng: mulberry32(94), likeThis: { key: base.key, seedKey: base.seedKey, videoType: base.videoType, subjects: base.subjects, games: base.games } });
  assert.ok(r.ideas.length >= 2);
  for (const i of r.ideas) {
    assert.notEqual(i.key, base.key);
    assert.ok(i.videoType === base.videoType || i.subjects.some((s) => base.subjects.includes(s)), `${i.title} is related`);
    assert.ok(i.domain !== "other");
  }
});

// ------------------------------------------------------------------ library import

test("game library import: REWIND backups, artifact backups, CSV and plain lists", () => {
  const rewind = parseGameLibrary(
    JSON.stringify({
      format: "rewind-backup",
      schemaVersion: 3,
      data: {
        games: [
          { id: "g1", title: "The Elder Scrolls III: Morrowind", ownership: "owned", status: "completed", rating: 5, favorite: 1, imported_playtime_min: 3000, steam_app_id: 22320 },
          { id: "g2", title: "Deus Ex", ownership: "wishlist" },
          { id: "g3", title: "Cave Story", ownership: "unknown" },
        ],
        game_tags: [{ game_id: "g1", tag: "rpg" }],
      },
    }),
  );
  assert.equal(rewind.source, "rewind-backup");
  assert.ok(rewind.hasOwnership);
  const mw = rewind.games.find((g) => g.title.includes("Morrowind"))!;
  assert.equal(mw.ownership, "owned");
  assert.equal(mw.steamAppId, 22320);
  assert.deepEqual(mw.tags, ["rpg"]);
  assert.equal(rewind.games.find((g) => g.title === "Deus Ex")?.ownership, "wishlist");

  const art = parseGameLibrary(JSON.stringify({ state: {}, lib0: { g: [{ id: "x", n: "Elden Ring", p: 120 }, { id: "y", n: "Dark Souls" }] } }));
  assert.equal(art.source, "rewind-artifact");
  assert.ok(!art.hasOwnership);
  assert.ok(art.games.every((g) => g.ownership === "unknown"), "nothing assumed");
  assert.ok(confirmOwned(art).games.every((g) => g.ownership === "owned"), "until you confirm the list is yours");
  assert.equal(art.games.find((g) => g.title === "Elden Ring")?.playtimeMin, 7200);

  const csv = parseGameLibrary("Name,Owned,Hours\nThief Gold,yes,12\nGothic,no,\n", "games.csv");
  assert.equal(csv.source, "csv");
  assert.equal(csv.games.find((g) => g.title === "Thief Gold")?.ownership, "owned");
  assert.equal(csv.games.find((g) => g.title === "Gothic")?.ownership, "not_owned");
  const text = parseGameLibrary("Morrowind\n- Elden Ring\n\n# comment\nMorrowind\n");
  assert.equal(text.games.length, 2, "duplicates merged");
  assert.throws(() => parseGameLibrary("{oops"), /couldn't be read/);
  assert.throws(() => parseGameLibrary("title\n", "x.csv") && parseGameLibrary("foo,bar\n1,2", "x.csv"), /title, name or game/);
});

test("steam lookups only trust exact name matches and keep the date checked", async () => {
  const search = JSON.stringify({ total: 2, items: [{ type: "app", name: "Morrowind Rebirth Soundtrack", id: 1 }, { type: "app", name: "The Elder Scrolls III: Morrowind® Game of the Year Edition", id: 22320 }] });
  assert.deepEqual(pickSearchResult("Morrowind", search), { id: 22320, name: "The Elder Scrolls III: Morrowind® Game of the Year Edition" });
  assert.equal(pickSearchResult("Thief", JSON.stringify({ items: [{ type: "app", name: "Thief Simulator", id: 5 }] })), null, "a similar name is not the same game");
  assert.equal(pickSearchResult("x", "not json"), null);
  const details = JSON.stringify({ "22320": { success: true, data: { name: "Morrowind GOTY", is_free: false, header_image: "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/22320/header.jpg", price_overview: { final_formatted: "$14.99", discount_percent: 0 } } } });
  const d = parseDetails(22320, details)!;
  assert.equal(d.priceText, "$14.99 on Steam (US store)");
  assert.match(d.imageUrl ?? "", /steamstatic\.com/);
  assert.equal(parseDetails(1, JSON.stringify({ "1": { success: true, data: { header_image: "https://evil.example.com/x.jpg" } } }))?.imageUrl, null, "only Steam's own image hosts");
  const calls: string[] = [];
  const info = await lookupSteam(async (u) => {
    calls.push(u);
    return { ok: true, status: 200, text: u.includes("storesearch") ? search : details };
  }, "Morrowind");
  assert.equal(info.status, "found");
  assert.equal(info.steamAppId, 22320);
  assert.ok(info.checkedAt);
  assert.equal(calls.length, 2);
  const err = await lookupSteam(async () => ({ ok: false, status: 503, text: "" }), "Morrowind");
  assert.equal(err.status, "error");
});

// ------------------------------------------------------------------ 10. database migration

test("schema v1 -> v2 keeps every row, adds defaults, and old backups still restore", async () => {
  const db = memoryDb();
  await migrate(db, MIGRATIONS.slice(0, 1));
  const t = new Date().toISOString();
  await db.execute("INSERT INTO profile_items (id, kind, value, durability, note, created_at, updated_at) VALUES ('p1','favorite_subject','Retro computing','enduring','',?,?)", [t, t]);
  await db.execute("INSERT INTO profile_items (id, kind, value, durability, note, created_at, updated_at) VALUES ('p2','favorite_subject','Horror games','enduring','',?,?)", [t, t]);
  await db.execute("INSERT INTO videos (id, title, first_source, created_at, updated_at) VALUES ('v1','Project Zomboid but I''m a Pacifist','public_feed',?,?)", [t, t]);
  await db.execute("INSERT INTO idea_feedback (id, idea_key, reaction, subjects, created_at) VALUES ('f1','first-time-classic:morrowind','love','[]',?)", [t]);
  await db.execute("INSERT INTO projects (id, title, created_at, updated_at) VALUES ('pr1','My project',?,?)", [t, t]);
  const v1Backup = await createBackup(db, "0.1.0");

  const report = await migrate(db);
  assert.equal(report.from, 1);
  assert.equal(report.to, LATEST_SCHEMA_VERSION, "v2 plus later repairs");
  const profile = await repo.listProfile(db);
  assert.equal(profile.length, 2);
  assert.ok(profile.every((p) => p.scope === "channel"), "existing entries default to channel until the upgrade step");
  assert.deepEqual((await repo.listVideos(db))[0]?.userSubjects, []);
  assert.deepEqual((await repo.listIdeaFeedback(db))[0]?.detail, {});
  assert.equal((await repo.listProjects(db)).length, 1);
  assert.deepEqual(await repo.listGames(db), []);

  const up = await upgradeProfileTo011(db);
  assert.deepEqual(up.movedToPersonal, ["Retro computing"]);
  assert.deepEqual(up.kept, ["Horror games"]);

  await repo.saveGames(db, [libGame("Morrowind", "owned", { playtimeMin: 600 })]);
  await repo.saveGames(db, [libGame("Morrowind", "unknown")]);
  assert.equal((await repo.listGames(db))[0]?.ownership, "owned", "re-importing without ownership doesn't erase it");

  const preview = await inspectBackup(db, JSON.stringify(v1Backup));
  assert.ok(preview.preview.ok, preview.preview.problems.join("; "));
  await restoreBackup(db, preview.file!);
  assert.equal((await repo.listProfile(db)).length, 2, "a v0.1.0 backup restores into v0.1.1");
  const v2Backup = await createBackup(db, "0.1.1");
  assert.ok("games" in v2Backup.tables && "game_info" in v2Backup.tables);
});
