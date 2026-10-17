import { test } from "node:test";
import assert from "node:assert/strict";
import { allowedByFocus, emptyContext, generateIdeas, ideaDomain } from "../src/domain/ideas/generator.ts";
import { DEFAULT_SETTINGS } from "../src/domain/settings.ts";
import { readVideo } from "../src/domain/channel/analyze.ts";
import type { Video } from "../src/domain/types.ts";

test("Tamster identity and the exact description are initial defaults", () => {
  assert.equal(DEFAULT_SETTINGS.channelIdentity.displayName, "Tamster");
  assert.match(DEFAULT_SETTINGS.channelIdentity.description, /weird shit/);
  assert.match(DEFAULT_SETTINGS.channelIdentity.description, /always low quality :\)/);
  assert.equal(DEFAULT_SETTINGS.generator.contentFocus, "gaming-first");
});
test("Channel focus is a boundary, not just a ranking bonus", () => {
  assert.equal(allowedByFocus(["personal-docs"], "gaming-first"), false);
  assert.equal(allowedByFocus(["horror-games"], "gaming-first"), true);
  assert.equal(allowedByFocus(["linux"], "gaming-first"), true);
  assert.equal(allowedByFocus(["linux"], "gaming-only"), false);
  assert.equal(ideaDomain(["video-games", "old-os"]), "gaming");
});
test("Gaming focus remains active in all modes", () => {
  for (const mode of ["standard", "tonight", "zero-budget", "random", "curiosity"] as const) {
    for (const focus of ["gaming-only", "gaming-first"] as const) {
      const r = generateIdeas({ mode, contentFocus: focus, interest: "new" }, emptyContext(), { count: 3 });
      assert.ok(r.ideas.length > 0, mode);
      assert.ok(r.ideas.every(i => allowedByFocus(i.subjects, focus)), mode);
      if (mode === "zero-budget") assert.ok(r.ideas.every(i => i.details.budgetUsd === 0));
    }
  }
});
test("Generic TV boilerplate in description is not evidence of film content", () => {
  const video: Video = {
    id: "video-id-11", title: "Project Zomboid but I'm a Pacifist",
    description: "Watch on a TV. Gaming content.", publishedAt: null,
    durationSeconds: null, thumbnailUrl: null, availability: "public",
    firstSource: "manual", lastSyncedAt: null, userCategory: "", userFormat: "",
    userEffort: null, userNotes: "", relatedProjectId: null, createdAt: "", updatedAt: "",
  };
  const subjects = readVideo(video).subjects.map(s => s.id);
  assert.ok(subjects.includes("video-games") || subjects.includes("survival-games"));
  assert.ok(!subjects.includes("film-media"));
});