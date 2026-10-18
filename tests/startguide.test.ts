// v0.1.3: "Where do I start?" is guidance, not a rule: it challenges the idea that a video needs the whole playthrough.
import { test } from "node:test";
import assert from "node:assert/strict";
import { EMPTY_START_PLAN, startAdvice } from "../src/domain/startGuide.ts";
import { memoryDb } from "./helpers/sqliteDb.ts";
import { migrate } from "../src/db/migrate.ts";
import * as repo from "../src/db/repos.ts";

test("fifteen hours into Morrowind: start where the experiment begins, no need to show the hours", () => {
  const a = startAdvice({ ...EMPTY_START_PLAN, save: "existing", context: "little" }, { hoursPlayed: 15, game: "The Elder Scrolls III: Morrowind" });
  assert.equal(a.suggested, "mid-save");
  assert.match(a.headline, /don't need to show the 15 hours/);
  assert.match(a.headline, /start recording where the interesting part begins/);
  assert.ok(a.viewersNeed[0]?.includes("The Elder Scrolls III: Morrowind"));
});

test("lots of context or earlier choices: a short recap, with the right footage to grab", () => {
  const a = startAdvice({ ...EMPTY_START_PLAN, save: "existing", context: "lots", dependsOnChoices: true });
  assert.equal(a.suggested, "recap");
  assert.match(a.headline, /short recap/);
  assert.ok(a.capture.some((c) => /recap/.test(c)));
  assert.ok(a.capture.some((c) => /choices/.test(c)));
});

test("a new game only when the idea is about the beginning", () => {
  assert.equal(startAdvice({ ...EMPTY_START_PLAN, about: "beginning" }).suggested, "new-run");
  assert.equal(startAdvice(EMPTY_START_PLAN, { startFrom: "new" }).suggested, "new-run");
  const noSave = startAdvice({ ...EMPTY_START_PLAN, save: "fresh", about: "middle" });
  assert.notEqual(noSave.suggested, "new-run", "no save yet still doesn't mean recording from the start");
  assert.match(noSave.headline, /off camera/);
  assert.ok(startAdvice(EMPTY_START_PLAN).notes.some((n) => /only necessary when/.test(n)));
});

test("your own 'viewers need to know' lines are kept, and the plan is stored on the project", async () => {
  const a = startAdvice({ ...EMPTY_START_PLAN, viewerNeeds: ["I'm a vampire now", "  "] });
  assert.ok(a.viewersNeed.includes("I'm a vampire now"));
  const db = memoryDb();
  await migrate(db);
  const p = await repo.createProject(db, { title: "x" });
  assert.deepEqual(p.details.startPlan, EMPTY_START_PLAN, "older and new projects start with an empty plan");
  await repo.updateProject(db, p.id, { details: { startPlan: { ...EMPTY_START_PLAN, save: "existing", choice: "mid-save" } } });
  assert.equal((await repo.getProject(db, p.id))?.details.startPlan.choice, "mid-save");
});
