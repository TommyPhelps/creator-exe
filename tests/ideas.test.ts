import { test } from "node:test";
import assert from "node:assert/strict";
import { mulberry32 } from "../src/lib/util.ts";
import { IDEA_LIBRARY } from "../src/domain/ideas/library.ts";
import { SUBJECTS, SUBJECT_BY_ID, adjacentTo, subjectsForText } from "../src/domain/ideas/subjects.ts";
import { emptyContext, expandLibrary, generateIdeas, learnedSubjectWeights, type CreatorContext } from "../src/domain/ideas/generator.ts";
import { projectFromIdea } from "../src/domain/projects.ts";
import { memoryDb } from "./helpers/sqliteDb.ts";
import { migrate } from "../src/db/migrate.ts";
import * as repo from "../src/db/repos.ts";
import { loadCreatorContext } from "../src/domain/ideas/context.ts";
import type { IdeaFeedback } from "../src/domain/types.ts";

const ctx = (patch: Partial<CreatorContext> = {}): CreatorContext => ({ ...emptyContext(), ...patch });
const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();

test("library entries are complete and reference real subjects", () => {
  const keys = new Set<string>();
  for (const s of IDEA_LIBRARY) {
    assert.ok(!keys.has(s.key), `duplicate key ${s.key}`);
    keys.add(s.key);
    for (const f of ["title", "premise", "why", "whatYouDo", "worthExploring", "audience", "thumbnail", "firstStep"] as const) {
      assert.ok(s[f].trim().length > 10, `${s.key}.${f} is too short`);
    }
    assert.ok(s.requirements.length > 0, `${s.key} needs requirements`);
    for (const sub of s.subjects) assert.ok(SUBJECT_BY_ID.has(sub), `${s.key} uses unknown subject ${sub}`);
    if (s.variants) {
      const slot = `{${s.variants.slot}}`;
      assert.ok(s.title.includes(slot) || s.premise.includes(slot), `${s.key} declares a slot it never uses`);
    } else {
      assert.ok(!/\{[a-z]+\}/.test(s.title + s.premise), `${s.key} has an unfilled slot`);
    }
    assert.ok(!/views guaranteed|go viral|million views/i.test(JSON.stringify(s)), `${s.key} promises performance`);
  }
  for (const sub of SUBJECTS) for (const a of sub.adjacent) assert.ok(SUBJECT_BY_ID.has(a), `${sub.id} -> ${a}`);
  assert.ok(expandLibrary().length > IDEA_LIBRARY.length);
});

test("subject text matching uses whole words", () => {
  assert.deepEqual(subjectsForText("I love old Linux distros"), ["linux"]);
  assert.ok(!subjectsForText("archive photography").includes("linux"));
  assert.ok(adjacentTo(["video-games"]).has("game-history"));
});

test("generates three distinct, fully described ideas with no setup at all", () => {
  const r = generateIdeas({}, ctx(), { rng: mulberry32(1) });
  assert.equal(r.ideas.length, 3);
  assert.equal(new Set(r.ideas.map((i) => i.seedKey)).size, 3, "never two variants of the same concept");
  for (const i of r.ideas) {
    assert.ok(!i.title.includes("{"), "slots are filled");
    assert.ok(i.details.firstStep && i.details.whatYouDo && i.details.requirements.length);
    assert.ok(["low", "medium", "high"].includes(i.ratings.feasibility));
    assert.equal(i.ratings.enjoyment, "unknown", "no preference data means no fake enjoyment rating");
  }
});

test("hard limits (budget, time, avoid list) are always respected", () => {
  const r = generateIdeas({ budgetUsd: 0, time: "1h" }, ctx({ avoidTerms: ["windows"] }), { count: 6, rng: mulberry32(2) });
  for (const i of r.ideas) {
    assert.equal(i.details.budgetUsd, 0);
    assert.ok(["30m", "1h"].includes(i.details.time));
    assert.ok(!/windows/i.test(i.title + i.premise));
  }
  const zero = generateIdeas({ mode: "zero-budget" }, ctx(), { count: 10, rng: mulberry32(3) });
  assert.ok(zero.ideas.every((i) => i.details.budgetUsd === 0));
});

test("soft filters relax with an explanation instead of returning nothing", () => {
  const r = generateIdeas({ format: "short", collab: "friends", recording: "real-world", energy: "low", research: "light" }, ctx(), { count: 3, rng: mulberry32(4) });
  assert.equal(r.ideas.length, 3);
  assert.ok(r.relaxed.length > 0);
});

test("Make Something Tonight returns small ideas with a first-five-minutes plan", () => {
  const r = generateIdeas({ mode: "tonight" }, ctx(), { count: 3, rng: mulberry32(5) });
  assert.equal(r.ideas.length, 3);
  for (const i of r.ideas) {
    assert.ok(i.details.tonight, "tonight plan present");
    assert.ok(i.details.tonight?.firstFive.length);
    assert.ok(["30m", "1h", "afternoon"].includes(i.details.time));
  }
});

test("familiar, adjacent and new modes steer within gaming", () => {
  const history = ctx({ familiarSubjects: new Set(["video-games", "survival-games", "horror-games", "challenge-runs"]), favoriteGames: new Set(["elder scrolls iii morrowind", "morrowind"]) });
  const fam = generateIdeas({ interest: "familiar" }, history, { count: 3, rng: mulberry32(6) });
  assert.ok(fam.ideas.every((i) => i.domain !== "other"));
  assert.ok(fam.ideas.every((i) => i.subjects.some((s) => history.familiarSubjects.has(s)) || i.games.some((g) => /morrowind/i.test(g))));
  const adj = generateIdeas({ interest: "adjacent" }, history, { count: 3, rng: mulberry32(7) });
  assert.ok(adj.ideas.every((i) => i.domain !== "other"), "adjacent stays inside the focus");
  assert.ok(adj.ideas.every((i) => !i.games.some((g) => /morrowind/i.test(g))), "adjacent avoids the games you already know");
  const fresh = generateIdeas({ interest: "new" }, history, { count: 3, rng: mulberry32(8) });
  assert.ok(fresh.ideas.every((i) => i.domain !== "other"));
  assert.ok(fresh.ideas.every((i) => !i.subjects.some((s) => history.familiarSubjects.has(s))));
  const noHistory = generateIdeas({ interest: "familiar" }, ctx(), { rng: mulberry32(9) });
  assert.ok(noHistory.notes.some((n) => n.includes("Import your channel")));
});

test("feedback blocks rejected ideas for a while and fades over time", () => {
  const single = IDEA_LIBRARY.filter((x) => x.key === "dwarf-fortress-diary");
  const target = generateIdeas({}, ctx(), { count: 1, rng: mulberry32(10), library: single }).ideas[0]!;
  assert.ok(target, "the concept is suggested before any feedback");
  const fb: IdeaFeedback[] = [{ id: "1", ideaKey: target.key, reaction: "not_interested", subjects: target.subjects, detail: {}, createdAt: daysAgo(1) }];
  assert.equal(generateIdeas({}, ctx({ feedback: fb }), { count: 1, rng: mulberry32(10), library: single }).ideas.length, 0, "rejected idea is blocked");
  const later = generateIdeas({}, ctx({ feedback: [{ ...fb[0]!, createdAt: daysAgo(90) }] }), { count: 1, rng: mulberry32(10), library: single });
  assert.equal(later.ideas[0]?.key, target.key, "block expires");
  const done: IdeaFeedback[] = [{ id: "2", ideaKey: target.key, reaction: "already_done", subjects: [], detail: {}, createdAt: daysAgo(400) }];
  assert.equal(generateIdeas({}, ctx({ feedback: done }), { count: 1, rng: mulberry32(10), library: single }).ideas.length, 0);

  const w1 = learnedSubjectWeights([{ id: "a", ideaKey: "x", reaction: "love", subjects: ["linux"], detail: {}, createdAt: daysAgo(0) }]);
  const w2 = learnedSubjectWeights([{ id: "a", ideaKey: "x", reaction: "love", subjects: ["linux"], detail: {}, createdAt: daysAgo(90) }]);
  assert.ok((w1.get("linux") ?? 0) > (w2.get("linux") ?? 0) * 3, "45-day half-life");
});

test("loved subjects rise but do not take over every slot", () => {
  const fb: IdeaFeedback[] = Array.from({ length: 6 }, (_, i) => ({ id: String(i), ideaKey: `k${i}`, reaction: "love" as const, subjects: ["horror-games"], detail: {}, createdAt: daysAgo(1) }));
  const r = generateIdeas({}, ctx({ feedback: fb }), { count: 3, rng: mulberry32(11) });
  assert.ok(r.ideas.some((i) => i.subjects.includes("horror-games")));
  assert.ok(r.ideas.some((i) => !i.subjects.includes("horror-games")), "diversity keeps other subjects in the mix");
});

test("ideas shown recently are pushed back so repeated runs vary", () => {
  const first = generateIdeas({}, ctx(), { count: 3, rng: mulberry32(12) });
  const impressions = first.ideas.map((i) => ({ ideaKey: i.key, shownAt: new Date().toISOString() }));
  const second = generateIdeas({}, ctx({ impressions }), { count: 3, rng: mulberry32(12) });
  const overlap = second.ideas.filter((i) => first.ideas.some((f) => f.key === i.key));
  assert.equal(overlap.length, 0);
});

test("camera-shy creators are not pushed toward face-only ideas", () => {
  const r = generateIdeas({}, ctx({ onCameraNotes: ["I'd rather not show my face"] }), { count: 30, rng: mulberry32(13) });
  const top = r.ideas.slice(0, 10);
  assert.ok(top.every((i) => !(i.details.recording.length === 1 && i.details.recording[0] === "face")));
});

test("context loads from the database and idea -> project prefills the workshop", async () => {
  const db = memoryDb();
  await migrate(db);
  await repo.addProfileItem(db, "favorite_subject", "Old Linux distros");
  await repo.addProfileItem(db, "tired_of", "horror games");
  const c = await loadCreatorContext(db);
  assert.ok(c.favoriteSubjects.has("linux"));
  assert.ok(c.tiredSubjects.has("horror-games"));
  const g = generateIdeas({ mode: "tonight" }, c, { rng: mulberry32(14) }).ideas[0]!;
  const idea = await repo.saveIdea(db, { origin: "library", libraryKey: g.key, title: g.title, premise: g.premise, details: g.details, subjects: g.subjects, status: "saved" });
  const p = await repo.createProject(db, projectFromIdea(idea, { tonight: true }));
  assert.equal(p.complexity, "quick");
  assert.equal(p.stage, "preparing");
  assert.equal(p.nextAction, g.details.tonight?.firstFive);
  assert.ok(p.details.origin.includes("What you'd actually do"));
  assert.ok((await repo.listTasks(db, p.id)).length > 0);
  const c2 = await loadCreatorContext(db);
  assert.ok(c2.takenKeys.has(g.key), "started ideas are not suggested again");
});

test("brief seeding fills an empty profile once, never over existing entries, and makes enjoyment known", async () => {
  const { seedProfileFromBrief, BRIEF_ENTRIES } = await import("../src/domain/brief.ts");
  const db = memoryDb();
  await migrate(db);
  assert.equal(await seedProfileFromBrief(db), BRIEF_ENTRIES.length);
  assert.equal(await seedProfileFromBrief(db), 0, "second run adds nothing");
  const items = await repo.listProfile(db);
  assert.equal(items.length, BRIEF_ENTRIES.length);
  assert.ok(items.every((i) => i.note.includes("brief")), "every entry says where it came from");
  for (const i of items.filter((x) => x.kind === "favorite_subject")) {
    assert.ok(subjectsForText(i.value).length > 0, `"${i.value}" maps to at least one subject`);
  }
  const res = generateIdeas({}, await loadCreatorContext(db), { count: 6, rng: mulberry32(7) });
  assert.ok(res.ideas.some((g) => g.ratings.enjoyment !== "unknown"), "seeded interests produce enjoyment estimates");

  const other = memoryDb();
  await migrate(other);
  await repo.addProfileItem(other, "tired_of", "horror games");
  assert.equal(await seedProfileFromBrief(other), 0, "a profile you already filled in is left alone");
});
