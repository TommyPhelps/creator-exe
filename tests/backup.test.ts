import { test } from "node:test";
import assert from "node:assert/strict";
import { memoryDb } from "./helpers/sqliteDb.ts";
import { migrate } from "../src/db/migrate.ts";
import * as repo from "../src/db/repos.ts";
import { createBackup, inspectBackup, restoreBackup } from "../src/domain/backup.ts";

async function seeded() {
  const db = memoryDb();
  await migrate(db);
  await repo.setSetting(db, "app", { theme: "crt-amber" });
  await repo.setSetting(db, "youtube_api_key", "SHOULD-NOT-LEAK");
  await repo.addProfileItem(db, "favorite_subject", "Retro computing");
  const p = await repo.createProject(db, { title: "Backup me", tasks: [{ list: "prep", label: "Task" }] });
  await repo.saveResearch(db, { projectId: p.id, title: "Src", url: "https://example.com" });
  await repo.addManualVideo(db, { id: "AAAAAAAAAA1", title: "Old video" });
  await repo.saveVideoFeedback(db, { videoId: "AAAAAAAAAA1", flags: ["proud"], enjoyOverall: 4, enjoyRecording: null, enjoyEditing: null, pride: 5, effort: null, revisit: null });
  await repo.saveThumbnail(db, { projectId: p.id, name: "Thumb", doc: "{}", preview: "" });
  return { db, p };
}

test("backup -> restore round-trips every table and excludes secrets", async () => {
  const { db, p } = await seeded();
  const backup = await createBackup(db, "0.1.0");
  const text = JSON.stringify(backup);
  assert.ok(!text.includes("SHOULD-NOT-LEAK"));
  assert.equal(backup.tables.projects?.length, 1);

  const fresh = memoryDb();
  await migrate(fresh);
  await repo.createProject(fresh, { title: "Will be replaced" });
  const { preview, file } = await inspectBackup(fresh, text);
  assert.equal(preview.ok, true, preview.problems.join("; "));
  assert.equal(preview.counts.projects, 1);
  await restoreBackup(fresh, file!);
  const projects = await repo.listProjects(fresh);
  assert.deepEqual(projects.map((x) => x.title), ["Backup me"]);
  assert.equal((await repo.listTasks(fresh, p.id)).length, 1);
  assert.equal((await repo.listResearch(fresh, p.id)).length, 1);
  assert.equal((await repo.listVideoFeedback(fresh))[0]?.pride, 5);
  assert.equal((await repo.getSetting(fresh, "app", {} as { theme?: string })).theme, "crt-amber");
});

test("malformed or foreign backups are rejected before anything changes", async () => {
  const { db } = await seeded();
  const bad = [
    "not json",
    JSON.stringify({ format: "something-else" }),
    JSON.stringify({ format: "creator-exe-backup", formatVersion: 99, tables: {} }),
    JSON.stringify({ format: "creator-exe-backup", formatVersion: 1, schemaVersion: 1, tables: { users: [] } }),
    JSON.stringify({ format: "creator-exe-backup", formatVersion: 1, schemaVersion: 1, tables: { projects: [{ id: "x", evil: 1 }] } }),
    JSON.stringify({ format: "creator-exe-backup", formatVersion: 1, schemaVersion: 1, tables: { projects: "nope" } }),
  ];
  for (const t of bad) {
    const { preview, file } = await inspectBackup(db, t);
    assert.equal(preview.ok, false, t);
    assert.equal(file, null);
  }
  assert.equal((await repo.listProjects(db)).length, 1);
});

test("a restore that fails midway leaves the database untouched", async () => {
  const { db } = await seeded();
  const backup = await createBackup(db, "0.1.0");
  // Two tasks pointing at a project that is not in the backup violate a foreign key.
  backup.tables.project_tasks = [{ id: "t", project_id: "missing", list: "prep", label: "x", done: 0, position: 0, created_at: "now" }];
  await assert.rejects(() => restoreBackup(db, backup));
  assert.equal((await repo.listProjects(db)).length, 1, "original data still present");
});
