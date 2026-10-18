import { test } from "node:test";
import assert from "node:assert/strict";
import { checkTitle, suggestTitles, TITLE_STYLES } from "../src/domain/titles.ts";
import { checkChapters, draftDescription, emptyPackage, formatSources, fullDescription, packageToText, suggestHashtags, suggestTags } from "../src/domain/packaging.ts";
import { EMPTY_DETAILS } from "../src/db/repos.ts";
import type { Project, ResearchItem } from "../src/domain/types.ts";

const now = new Date().toISOString();
const project: Project = {
  id: "p",
  title: "Using Windows 98 as my only computer for a week",
  premise: "I tried to do a normal week of tasks on Windows 98.",
  why: "",
  stage: "packaging",
  complexity: "standard",
  priority: 0,
  nextAction: "",
  folderPath: null,
  ideaId: null,
  subjects: ["old-os", "retro-computing"],
  details: { ...EMPTY_DETAILS, structure: "1. Setup\n2. Daily tasks\n- Verdict" },
  archived: false,
  createdAt: now,
  updatedAt: now,
  openedAt: null,
  destination: "youtube",
  sourceProjectId: null,
};
const source = (patch: Partial<ResearchItem>): ResearchItem => ({
  id: "r",
  projectId: "p",
  kind: "source",
  title: "Windows 98 - Wikipedia",
  url: "https://en.wikipedia.org/wiki/Windows_98",
  publisher: "Wikipedia",
  publishedAt: "",
  checkedAt: now,
  sourceType: "article",
  verification: "verified",
  summary: "",
  myNotes: "",
  createdAt: now,
  updatedAt: now,
  ...patch,
});

test("title suggestions only use supplied facts", () => {
  const without = suggestTitles({ topic: "Windows 98", did: "I used Windows 98 for a week", constraint: "for a week", outcome: "" });
  assert.ok(without.length >= 10);
  assert.ok(new Set(without.map((t) => t.style)).size >= 8, "covers most styles");
  assert.ok(without.every((t) => !t.text.includes("undefined") && !t.text.includes("{")));
  assert.ok(!without.some((t) => /, and |\. [A-Z]/.test(t.text)), "no outcome-based titles without an outcome");
  const withOutcome = suggestTitles({ topic: "Windows 98", did: "I used Windows 98 for a week", constraint: "", outcome: "it fixed my old laptop" });
  assert.ok(withOutcome.some((t) => t.text.includes("it fixed my old laptop")));
  assert.equal(suggestTitles({ topic: "", did: "", constraint: "", outcome: "" }).length, 0);
  assert.equal(TITLE_STYLES.length, 10);
});

test("title checks flag length, shouting, clickbait, claims and missing subject", () => {
  const long = checkTitle("x".repeat(80), "");
  assert.ok(long.notes.some((n) => n.level === "warn" && n.text.includes("cut off")));
  assert.ok(checkTitle("I USED WINDOWS 98 FOR A WEEK", "").notes.some((n) => n.text.includes("shouting")));
  assert.ok(checkTitle("You won't believe this", "").notes.some((n) => n.text.includes("clickbait")));
  assert.ok(checkTitle("The best operating system ever", "").notes.some((n) => n.text.includes("claim")));
  assert.ok(checkTitle("A week of retro computing", "Windows 98").notes.some((n) => n.text.includes("Doesn't mention")));
  assert.ok(checkTitle("Windows 98 for a week", "Windows 98").notes.some((n) => n.level === "ok" && n.text.includes("early")));
});

test("description drafts come from project notes and saved sources only", () => {
  const d = draftDescription(project, [source({}), source({ kind: "note", url: "" })]);
  assert.ok(d.startsWith(project.premise));
  assert.ok(d.includes("- Setup") && d.includes("- Verdict"));
  assert.ok(d.includes("https://en.wikipedia.org/wiki/Windows_98"));
  assert.ok(!/\d:\d\d/.test(d), "no invented timestamps");
  assert.equal(formatSources([source({ url: "" })]), "", "sources without links are not listed as sources");
  const empty = draftDescription({ ...project, premise: "", details: { ...EMPTY_DETAILS } }, []);
  assert.equal(empty, "");
});

test("tags and hashtags stay within YouTube limits", () => {
  const tags = suggestTags(project, "Windows 98 for a week");
  assert.ok(tags.includes("old operating systems"));
  assert.ok(tags.join(",").length <= 500);
  assert.ok(tags.length <= 15);
  const h = suggestHashtags(project);
  assert.deepEqual(h, ["#OldOperatingSystems", "#RetroComputing"]);
});

test("chapters are validated against YouTube's rules", () => {
  assert.equal(checkChapters("0:00 Intro\n0:45 Setup\n3:10 Verdict").valid, true);
  assert.ok(checkChapters("0:30 Intro\n1:00 A\n2:00 B").problems.some((p) => p.includes("0:00")));
  assert.ok(checkChapters("0:00 Intro\n0:05 A\n2:00 B").problems.some((p) => p.includes("10 seconds")));
  assert.ok(checkChapters("0:00 Intro\n1:00 A").problems.some((p) => p.includes("three")));
  assert.ok(checkChapters("Intro\n1:00 A\n2:00 B").problems.some((p) => p.includes("timestamp")));
  assert.equal(checkChapters("1:02:03 Late\n").chapters[0]?.seconds, 3723);
});

test("package export contains only filled sections", () => {
  const p = { ...emptyPackage("Windows 98 for a week"), description: "Desc", tags: ["a", "b"], hashtags: ["#RetroComputing"] };
  const t = packageToText(p);
  assert.ok(t.includes("=== TITLE ===\nWindows 98 for a week"));
  assert.ok(t.includes("=== TAGS ===\na, b"));
  assert.ok(!t.includes("PINNED COMMENT"));
  assert.equal(fullDescription(p), "Desc\n\n#RetroComputing");
});

test("guesses the searchable subject from a working title", async () => {
  const { guessTopic } = await import("../src/domain/titles.ts");
  assert.equal(guessTopic("Using Windows 98 as my only computer for a week"), "Windows 98");
  assert.equal(guessTopic("Following a webring until it ends"), "");
  assert.equal(guessTopic("I played Valorant for the FIRST TIME"), "Valorant");
});
