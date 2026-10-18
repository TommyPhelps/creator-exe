// v0.1.2 Pass 4: four steps over the eleven detailed stages.
import { test } from "node:test";
import assert from "node:assert/strict";
import { PHASES, phaseOf, stageForPhase } from "../src/domain/projects.ts";
import { STAGES } from "../src/domain/types.ts";

test("every stage except Archived belongs to exactly one of the four steps, in order", () => {
  assert.deepEqual(PHASES.map((p) => p.label), ["Plan", "Record", "Edit", "Publish"]);
  const flat = PHASES.flatMap((p) => [...p.stages]);
  assert.deepEqual(flat, STAGES.map((s) => s.id).filter((s) => s !== "archived"), "no stage lost or reordered");
  assert.equal(phaseOf("archived"), null);
  assert.equal(phaseOf("thumbnail"), "edit");
  assert.equal(stageForPhase("researching", "plan"), "researching", "staying in a step keeps the exact stage");
  assert.equal(stageForPhase("ready_to_record", "record"), "recording");
  assert.equal(stageForPhase("recording", "publish"), "packaging");
});
