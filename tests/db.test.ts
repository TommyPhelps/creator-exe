import { test } from "node:test";
import assert from "node:assert/strict";
import { memoryDb } from "./helpers/sqliteDb.ts";
import { migrate, currentSchemaVersion } from "../src/db/migrate.ts";
import { LATEST_SCHEMA_VERSION, MIGRATIONS } from "../src/db/migrations.ts";
import * as repo from "../src/db/repos.ts";

test("migrations apply once and are idempotent", async () => {
  const db = memoryDb();
  const first = await migrate(db);
  assert.equal(first.from, 0);
  assert.equal(first.to, LATEST_SCHEMA_VERSION);
  assert.equal(first.applied.length, MIGRATIONS.length);
  const second = await migrate(db);
  assert.equal(second.applied.length, 0);
  assert.equal(await currentSchemaVersion(db), LATEST_SCHEMA_VERSION);
});

test("a later migration upgrades an existing database without losing data", async () => {
  const db = memoryDb();
  await migrate(db);
  await repo.createProject(db, { title: "Keep me" });
  const next = [...MIGRATIONS, { version: LATEST_SCHEMA_VERSION + 1, name: "add column", statements: ["ALTER TABLE projects ADD COLUMN mood TEXT NOT NULL DEFAULT ''"] }];
  const r = await migrate(db, next);
  assert.deepEqual(r.applied, [`${LATEST_SCHEMA_VERSION + 1}: add column`]);
  const rows = await db.select<{ title: string; mood: string }>("SELECT title, mood FROM projects");
  assert.equal(rows[0]?.title, "Keep me");
  assert.equal(rows[0]?.mood, "");
});

test("refuses to run against a database from a newer version", async () => {
  const db = memoryDb();
  await migrate(db);
  await db.execute("INSERT INTO schema_migrations (version, name, applied_at) VALUES (999, 'future', 'x')");
  await assert.rejects(() => migrate(db), /newer/);
});

test("failed migration rolls back completely", async () => {
  const db = memoryDb();
  await migrate(db);
  const bad = [...MIGRATIONS, { version: 50, name: "broken", statements: ["CREATE TABLE half (id TEXT)", "THIS IS NOT SQL"] }];
  await assert.rejects(() => migrate(db, bad));
  const t = await db.select("SELECT name FROM sqlite_master WHERE name = 'half'");
  assert.equal(t.length, 0);
  assert.equal(await currentSchemaVersion(db), LATEST_SCHEMA_VERSION);
});

test("settings persist and round-trip JSON", async () => {
  const db = memoryDb();
  await migrate(db);
  assert.deepEqual(await repo.getSetting(db, "app", { a: 1 }), { a: 1 });
  await repo.setSetting(db, "app", { theme: "crt-amber", n: [1, 2] });
  await repo.setSetting(db, "app", { theme: "phosphor-green", n: [3] });
  assert.deepEqual(await repo.getSetting(db, "app", {}), { theme: "phosphor-green", n: [3] });
});

test("projects: create with tasks, update stage, history and cascade delete", async () => {
  const db = memoryDb();
  await migrate(db);
  const idea = await repo.saveIdea(db, { origin: "manual", title: "Idea", status: "saved" });
  const p = await repo.createProject(db, {
    title: "Using Windows 98 for a week",
    premise: "p",
    ideaId: idea.id,
    tasks: [
      { list: "prep", label: "Install VM" },
      { list: "recording", label: "Record boot" },
    ],
  });
  assert.equal(p.stage, "idea");
  assert.equal((await repo.getIdea(db, idea.id))?.status, "started");
  const tasks = await repo.listTasks(db, p.id);
  assert.equal(tasks.length, 2);
  await repo.setTaskDone(db, tasks[0]!.id, true);
  const updated = await repo.updateProject(db, p.id, { stage: "recording", details: { notes: "hello" }, nextAction: "Record intro" });
  assert.equal(updated?.stage, "recording");
  assert.equal(updated?.details.notes, "hello");
  assert.equal(updated?.details.equipment, "", "unpatched detail fields keep their defaults");
  const events = await repo.listProjectEvents(db, p.id);
  assert.ok(events.some((e) => e.kind === "stage" && e.detail === "idea -> recording"));
  await repo.saveResearch(db, { projectId: p.id, title: "Source", url: "https://example.com" });
  await repo.deleteProject(db, p.id);
  assert.equal((await repo.listTasks(db, p.id)).length, 0);
  const orphan = await repo.listResearch(db, null);
  assert.equal(orphan.length, 1, "research survives project deletion");
});

test("archived projects are hidden by default", async () => {
  const db = memoryDb();
  await migrate(db);
  const p = await repo.createProject(db, { title: "A" });
  await repo.updateProject(db, p.id, { archived: true });
  assert.equal((await repo.listProjects(db)).length, 0);
  assert.equal((await repo.listProjects(db, true)).length, 1);
});

test("research items record when a link was checked", async () => {
  const db = memoryDb();
  await migrate(db);
  const withUrl = await repo.saveResearch(db, { title: "Doc", url: "https://example.org/a" });
  const note = await repo.saveResearch(db, { title: "Thought", kind: "note" });
  assert.ok(withUrl.checkedAt);
  assert.equal(note.checkedAt, null);
  const edited = await repo.saveResearch(db, { id: withUrl.id, title: "Doc", verification: "verified" });
  assert.equal(edited.verification, "verified");
  assert.equal(edited.url, "https://example.org/a");
});

test("ideas saved from the library are deduplicated by key", async () => {
  const db = memoryDb();
  await migrate(db);
  const a = await repo.saveIdea(db, { origin: "library", libraryKey: "k1", title: "T", status: "inbox" });
  const b = await repo.saveIdea(db, { origin: "library", libraryKey: "k1", title: "T", status: "saved" });
  assert.equal(a.id, b.id);
  assert.equal(b.status, "saved");
  assert.equal((await repo.listIdeas(db)).length, 1);
});

test("impressions are trimmed so the table stays small", async () => {
  const db = memoryDb();
  await migrate(db);
  await repo.recordImpressions(db, Array.from({ length: 450 }, (_, i) => `k${i}`));
  assert.equal((await repo.listImpressions(db)).length, 400);
});
