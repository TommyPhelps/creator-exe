// v0.1.2 Pass 1: idea -> project carries everything once, never duplicates, and old projects still open.
import { test } from "node:test";
import assert from "node:assert/strict";
import { memoryDb } from "./helpers/sqliteDb.ts";
import { migrate } from "../src/db/migrate.ts";
import { MIGRATIONS } from "../src/db/migrations.ts";
import * as repo from "../src/db/repos.ts";
import { startProjectFromIdea } from "../src/domain/handoff.ts";
import { approachesFor } from "../src/domain/projects.ts";
import { emptyContext, generateIdeas } from "../src/domain/ideas/generator.ts";
import { indexLibrary } from "../src/domain/games/library.ts";
import { mulberry32 } from "../src/lib/util.ts";
import type { IdeaDetails } from "../src/domain/types.ts";

async function freshDb() {
  const db = memoryDb();
  await migrate(db);
  return db;
}

test("starting an idea carries game, hook, approaches, moments, needs, ownership, why, notes and source", async () => {
  const db = await freshDb();
  const lib = indexLibrary([{ title: "Morrowind", canon: "morrowind", platform: "PC", ownership: "owned", status: null, rating: null, favorite: false, playtimeMin: 0, steamAppId: null, releaseYear: null, tags: [], source: "test" }]);
  const g = generateIdeas({ inspiration: ["Morrowind"] }, { ...emptyContext(), library: lib }, { count: 3, rng: mulberry32(1) }).ideas.find((i) => i.games.some((x) => /Morrowind/.test(x)))!;
  assert.ok(g, "a Morrowind idea to start from");
  const details: IdeaDetails = {
    ...g.details,
    hook: "A test hook",
    approaches: [
      { name: "First night", how: "Raw reactions" },
      { name: "Paper map week", how: "No guides" },
    ],
    moments: ["First fight", "Meeting Fargoth"],
    visualBeats: ["A long miss streak"],
    startingSituation: "Start at character creation",
  };
  const idea = await repo.saveIdea(db, { origin: "library", libraryKey: g.key, title: g.title, premise: g.premise, details, subjects: g.subjects, status: "saved" });
  await repo.updateIdea(db, idea.id, { notes: "Try the OpenMW comparison" });
  const withNotes = (await repo.getIdea(db, idea.id))!;
  assert.equal(withNotes.notes, "Try the OpenMW comparison");

  const { project: p, existed } = await startProjectFromIdea(db, withNotes);
  assert.equal(existed, false);
  const d = p.details;
  assert.match(d.game, /Morrowind/);
  assert.equal(d.videoType, g.videoType);
  assert.equal(d.access, "In your library");
  assert.equal(d.hook, "A test hook");
  assert.deepEqual(d.approaches.map((a) => a.name), ["First night", "Paper map week"]);
  assert.equal(d.chosenApproach, null);
  assert.equal(d.startingSituation, "Start at character creation");
  assert.deepEqual(d.visualBeats, ["A long miss streak"]);
  assert.deepEqual(d.needs, g.details.requirements);
  assert.ok(d.whySuits.length > 0);
  assert.equal(d.firstFive, g.details.firstStep);
  assert.equal(d.myNotes, "Try the OpenMW comparison");
  assert.equal(d.source?.ideaId, idea.id);
  assert.equal(d.source?.ideaKey, g.key);
  assert.equal(p.nextAction, g.details.firstStep);

  const tasks = await repo.listTasks(db, p.id);
  assert.deepEqual(tasks.filter((t) => t.list === "recording").map((t) => t.label), ["First fight", "Meeting Fargoth"], "moments become the recording checklist");
  assert.equal(tasks.filter((t) => t.list === "prep").length, 0, "needs aren't duplicated into a checklist");
  assert.equal(d.equipment, "", "needs aren't duplicated into the Equipment text either");
  assert.equal((await repo.getIdea(db, idea.id))?.status, "started");
});

test("starting the same idea twice opens the existing project instead of making a second one", async () => {
  const db = await freshDb();
  const idea = await repo.saveIdea(db, { origin: "capture", title: "Warband mod night", premise: "Try a famous mod", status: "inbox" });
  const a = await startProjectFromIdea(db, idea);
  const b = await startProjectFromIdea(db, idea);
  assert.equal(b.existed, true);
  assert.equal(b.project.id, a.project.id);
  assert.equal((await repo.listProjects(db, true)).length, 1);
  assert.equal(a.project.details.hook, "Try a famous mod", "a captured idea's premise becomes the hook");
});

test("ideas without hand-written approaches still get usable ones", () => {
  const g = generateIdeas({}, emptyContext(), { count: 12, rng: mulberry32(3) }).ideas.find((i) => !i.details.approaches)!;
  assert.ok(g, "a template idea without hand-written approaches");
  const list = approachesFor(g.details);
  assert.ok(list.length >= 1);
  assert.equal(list[0]?.how, g.details.whatYouDo);
});

test("projects made before v0.1.2 open with every old field and empty sheet fields", async () => {
  const db = memoryDb();
  await migrate(db, MIGRATIONS.slice(0, 2));
  const t = "2026-10-17T12:00:00.000Z";
  await db.execute("INSERT INTO ideas (id, origin, title, created_at, updated_at) VALUES ('i1','capture','Old idea',?,?)", [t, t]);
  await db.execute(
    "INSERT INTO projects (id, title, premise, stage, next_action, details, created_at, updated_at) VALUES ('pr1','Old video','An old premise','recording','Record part 2',?,?,?)",
    [JSON.stringify({ equipment: "- OBS", notes: "keep this", origin: "What you'd actually do: x" }), t, t],
  );
  await migrate(db);
  const p = (await repo.getProject(db, "pr1"))!;
  assert.equal(p.details.equipment, "- OBS");
  assert.equal(p.details.notes, "keep this");
  assert.deepEqual(p.details.approaches, []);
  assert.equal(p.details.chosenApproach, null);
  assert.equal(p.details.myNotes, "");
  assert.equal(p.details.source, null);
  assert.equal((await repo.getIdea(db, "i1"))?.notes, "", "v4 adds idea notes with an empty default");
  // Editing a sheet field keeps the old ones.
  await repo.updateProject(db, "pr1", { details: { hook: "New hook", chosenApproach: null } });
  const q = (await repo.getProject(db, "pr1"))!;
  assert.equal(q.details.hook, "New hook");
  assert.equal(q.details.notes, "keep this");
});
