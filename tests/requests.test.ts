// v0.1.2 Pass 3: asking for a game gets you that game; playtime is respected;
// feedback steers without taking over; unknown games are handled honestly.
import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyContext, expandLibrary, generateIdeas, materialize, type CreatorContext } from "../src/domain/ideas/generator.ts";
import { parseRequest } from "../src/domain/ideas/request.ts";
import { findCatalogGame } from "../src/domain/games/catalog.ts";
import { indexLibrary, type LibraryGame } from "../src/domain/games/library.ts";
import { seed } from "../src/domain/ideas/libraryGaming.ts";
import { mulberry32 } from "../src/lib/util.ts";
import type { IdeaFeedback } from "../src/domain/types.ts";

const MW = "The Elder Scrolls III: Morrowind";
const game = (title: string, canon: string, playtimeMin: number): LibraryGame => ({ title, canon, platform: "PC", ownership: "owned", status: null, rating: null, favorite: false, playtimeMin, steamAppId: null, releaseYear: null, tags: [], source: "test" });
const ask = (names: string[], ctx: CreatorContext = emptyContext(), count = 3, rng = 11) => generateIdeas({ inspiration: names }, ctx, { count, rng: mulberry32(rng) });

test("requests are read the way you'd mean them", () => {
  assert.equal(parseRequest("Warband")?.title, "Mount & Blade: Warband");
  assert.equal(parseRequest("Mount and Blade")?.title, "Mount & Blade: Warband");
  const sky = parseRequest("modded Skyrim")!;
  assert.equal(sky.title, "The Elder Scrolls V: Skyrim");
  assert.equal(sky.mods, true);
  assert.ok(sky.names.has("enderal forgotten stories"), "mods that run on Skyrim count as Skyrim");
  const mc = parseRequest("Minecraft modpacks")!;
  assert.equal(mc.mods, true);
  assert.ok(mc.names.has("rlcraft"));
  assert.equal(parseRequest("Minecraft")?.mods, false, "plain Minecraft isn't only modpacks");
  assert.equal(parseRequest("itch.io horror")?.unknown, false);
  const unknown = parseRequest("Ultrakill")!;
  assert.equal(unknown.unknown, true);
  assert.equal(unknown.title, "Ultrakill");
});

test("asking for Warband gives three different Warband videos", () => {
  const r = ask(["Warband"]);
  assert.equal(r.ideas.length, 3);
  assert.ok(r.ideas.every((i) => i.games.includes("Mount & Blade: Warband")), r.ideas.map((i) => i.title).join(" | "));
  assert.equal(new Set(r.ideas.map((i) => i.seedKey)).size, 3);
  assert.equal(new Set(r.ideas.map((i) => i.videoType)).size, 3, "three different kinds of video");
});

test("asking for Morrowind gives Morrowind, and respects your playtime", () => {
  const fresh = ask(["Morrowind"]);
  assert.ok(fresh.ideas.every((i) => i.games.includes(MW)));
  assert.ok(fresh.ideas.every((i) => i.details.specific), "all hand-written for Morrowind");
  assert.ok(!fresh.ideas.some((i) => i.videoType === "revisit"), "no 'going back' without evidence you've played it");

  const lib = indexLibrary([game(MW, "elder scrolls iii morrowind", 600)]);
  const ctx = { ...emptyContext(), library: lib, playedGames: new Set(["elder scrolls iii morrowind"]) };
  for (const rng of [1, 2, 3, 4, 5]) {
    const r = ask(["Morrowind"], ctx, 3, rng);
    assert.ok(r.ideas.every((i) => i.videoType !== "first-playthrough"), `seed ${rng}: no first-time video after 10 hours`);
    assert.ok(r.notes.some((n) => /you've played The Elder Scrolls III: Morrowind/.test(n)));
  }
  const six = ask(["Morrowind"], ctx, 6);
  const back = six.ideas.find((i) => i.videoType === "revisit");
  assert.ok(back, "a return visit is offered instead");
  assert.ok(back.factors.some((f) => /10 h in your library/.test(f.text)));
  // Not only when asked: a normal batch never suggests a first time either.
  for (const rng of [6, 7, 8]) {
    const any = generateIdeas({ genres: ["rpg-classic"] }, ctx, { count: 6, rng: mulberry32(rng) });
    assert.ok(!any.ideas.some((i) => i.videoType === "first-playthrough" && i.games.includes(MW)));
  }
});

test("modded Skyrim gives Skyrim mod ideas, not plain Skyrim", () => {
  const r = ask(["modded Skyrim"]);
  assert.equal(r.ideas.length, 3);
  for (const i of r.ideas) {
    assert.ok(i.games.some((g) => /Skyrim|Enderal/.test(g)), i.title);
    assert.ok(i.subjects.includes("game-mods") || i.details.requirements.some((x) => /mod|Wabbajack|Enderal/i.test(x)), i.title);
  }
  assert.ok(!r.ideas.some((i) => i.seedKey === "sky-survival-one-life"), "Survival Mode is built in, not a mod");
});

test("a Minecraft modpack request returns several different modpack ideas", () => {
  for (const rng of [1, 2, 3]) {
    const r = ask(["Minecraft modpacks"], emptyContext(), 3, rng);
    assert.equal(r.ideas.length, 3);
    assert.ok(r.ideas.every((i) => i.subjects.includes("modpacks")), r.ideas.map((i) => i.title).join(" | "));
    assert.ok(new Set(r.ideas.map((i) => i.games.join())).size >= 2, "more than one pack");
  }
  const genre = generateIdeas({ genres: ["modpacks"] }, emptyContext(), { count: 3, rng: mulberry32(4) });
  assert.equal(genre.ideas.length, 3, "the modpack genre no longer stops at one idea");
});

test("two games asked for are both covered", () => {
  const r = ask(["Elden Ring", "Thief"]);
  assert.ok(r.ideas.some((i) => i.games.includes("Elden Ring")));
  assert.ok(r.ideas.some((i) => i.games.includes("Thief")));
  assert.ok(!r.notes.some((n) => /Only \d/.test(n)), "no false shortage note when the batch is simply full");
});

test("an unknown game gets neutral formats, clearly labelled, with nothing claimed about it", () => {
  const r = ask(["Ultrakill"]);
  assert.equal(r.ideas.length, 3);
  assert.ok(r.notes.some((n) => /no notes on "Ultrakill"/.test(n)));
  for (const i of r.ideas) {
    assert.ok(i.games.includes("Ultrakill"));
    assert.equal(i.details.hook, undefined);
    assert.equal(i.details.specific, undefined);
    assert.ok(i.factors.some((f) => /general format/.test(f.text)));
  }
  const played = { ...emptyContext(), library: indexLibrary([game("ULTRAKILL", "ultrakill", 900)]), playedGames: new Set(["ultrakill"]) };
  const back = ask(["Ultrakill"], played);
  assert.ok(!back.ideas.some((i) => i.videoType === "first-playthrough"));
  assert.ok(back.ideas.some((i) => i.seedKey === "any-return"));
});

test("likes steer a batch without reshaping it: at most a third shifts toward them", () => {
  const now = new Date("2026-10-17T12:00:00Z");
  const fb: IdeaFeedback[] = Array.from({ length: 10 }, (_, i) => ({
    id: `f${i}`,
    ideaKey: "mw-icarian-flight",
    reaction: i % 2 ? "love" : "like_format",
    subjects: ["rpg-classic", "game-mechanics"],
    detail: { seedKey: "mw-icarian-flight", videoType: "mechanics", games: [MW] },
    createdAt: now.toISOString(),
  }));
  const liked = (i: { subjects: string[] }) => i.subjects.includes("rpg-classic") || i.subjects.includes("game-mechanics");
  for (const rng of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const base = generateIdeas({}, emptyContext(), { count: 6, rng: mulberry32(rng), now });
    const after = generateIdeas({}, { ...emptyContext(), feedback: fb }, { count: 6, rng: mulberry32(rng), now });
    const shift = after.ideas.filter(liked).length - base.ideas.filter(liked).length;
    assert.ok(shift <= 2, `seed ${rng}: ${shift} more ideas lean toward the likes`);
    assert.ok(after.ideas.filter((i) => i.videoType === "mechanics").length <= 2, "liking a format doesn't fill the batch with it");
  }
});

test("game names read naturally", () => {
  const s = seed({ key: "t-poss", title: "What {game}'s first hour teaches", premise: "About {game}'s first hour.", why: "x".repeat(12), whatYouDo: "x".repeat(12), worthExploring: "x".repeat(12), audience: "x".repeat(12), requirements: ["{game}"], effort: "small", time: "1h", thumbnail: "x".repeat(12), firstStep: "x".repeat(12), subjects: ["video-games"], videoType: "analysis", variants: { slot: "game", games: true, values: ["Outer Wilds", "Thief"] } });
  const [wilds, thief] = expandLibrary([s]);
  assert.equal(materialize(wilds!).title, "What Outer Wilds' first hour teaches");
  assert.equal(materialize(thief!).title, "What Thief's first hour teaches");
  assert.equal(findCatalogGame("Doom (shareware episode)")?.title, "Doom", "old name still resolves, shown as Doom");
});
