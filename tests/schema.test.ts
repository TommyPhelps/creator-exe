// v0.1.2 Pass 0: the two schema v2 layouts converge safely, and the channel identity is kept exactly.
import { test } from "node:test";
import assert from "node:assert/strict";
import { memoryDb } from "./helpers/sqliteDb.ts";
import { migrate } from "../src/db/migrate.ts";
import { MIGRATIONS, convergeSchema, LATEST_SCHEMA_VERSION } from "../src/db/migrations.ts";
import * as repo from "../src/db/repos.ts";
import { createBackup, inspectBackup, restoreBackup } from "../src/domain/backup.ts";
import { DEFAULT_SETTINGS, TAMSTER_IDENTITY, loadSettings, saveSettings } from "../src/domain/settings.ts";
import { upgradeProfileTo011 } from "../src/domain/upgrade011.ts";
import { loadCreatorContext } from "../src/domain/ideas/context.ts";
import type { Db } from "../src/platform/types.ts";

/** The 0.2.0 Phase 2 dev preview's v2, copied verbatim from feature/phase2-tamster-dna. */
const PHASE2_V2 = {
  version: 2,
  name: "local video forensics and creator-controlled evidence",
  statements: [
    `CREATE TABLE video_forensics (
        video_id TEXT PRIMARY KEY REFERENCES videos(id) ON DELETE CASCADE,
        media_json TEXT NOT NULL DEFAULT 'null',
        transcript_json TEXT NOT NULL DEFAULT 'null',
        transcript_filename TEXT NOT NULL DEFAULT '',
        thumbnail_palette TEXT NOT NULL DEFAULT '[]',
        thumbnail_filename TEXT NOT NULL DEFAULT '',
        creator_notes TEXT NOT NULL DEFAULT '',
        creator_tags TEXT NOT NULL DEFAULT '[]',
        updated_at TEXT NOT NULL
      )`,
  ],
};

const t = "2026-10-17T12:00:00.000Z";

/** Rows a real user would have after v0.1.0: profile, a video, feedback, a project with a task, a thumbnail. */
async function seedV1Data(db: Db) {
  await db.execute("INSERT INTO profile_items (id, kind, value, durability, note, created_at, updated_at) VALUES ('p1','favorite_subject','Retro computing','enduring','',?,?)", [t, t]);
  await db.execute("INSERT INTO profile_items (id, kind, value, durability, note, created_at, updated_at) VALUES ('p2','favorite_subject','Horror games','enduring','',?,?)", [t, t]);
  await db.execute("INSERT INTO videos (id, title, description, first_source, user_notes, created_at, updated_at) VALUES ('vid00000001','Project Zomboid but I''m a Pacifist','No shoving.','public_feed','my note',?,?)", [t, t]);
  await db.execute("INSERT INTO video_feedback (video_id, flags, enjoy_overall, updated_at) VALUES ('vid00000001','[\"loved_making\"]',5,?)", [t]);
  await db.execute("INSERT INTO idea_feedback (id, idea_key, reaction, subjects, created_at) VALUES ('f1','first-time-classic:morrowind','love','[]',?)", [t]);
  await db.execute("INSERT INTO projects (id, title, stage, next_action, details, created_at, updated_at) VALUES ('pr1','My video','recording','Record part 2','{\"notes\":\"keep this\"}',?,?)", [t, t]);
  await db.execute("INSERT INTO project_tasks (id, project_id, list, label, done, position, created_at) VALUES ('t1','pr1','prep','Install OBS',1,0,?)", [t]);
  await db.execute("INSERT INTO thumbnails (id, project_id, name, doc, created_at, updated_at) VALUES ('th1','pr1','Thumb','{\"layers\":[]}',?,?)", [t, t]);
}

async function counts(db: Db) {
  const out: Record<string, number> = {};
  for (const tbl of ["profile_items", "videos", "video_feedback", "idea_feedback", "projects", "project_tasks", "thumbnails"]) {
    out[tbl] = (await db.select<{ n: number }>(`SELECT COUNT(*) AS n FROM ${tbl}`))[0]?.n ?? -1;
  }
  return out;
}

async function cols(db: Db, table: string) {
  return new Set((await db.select<{ name: string }>(`SELECT name FROM pragma_table_info('${table}')`)).map((r) => r.name));
}

async function tables(db: Db) {
  return new Set((await db.select<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table'")).map((r) => r.name));
}

async function assertConverged(db: Db) {
  const tb = await tables(db);
  for (const name of ["games", "game_info", "video_forensics"]) assert.ok(tb.has(name), `table ${name} exists`);
  assert.ok((await cols(db, "profile_items")).has("scope"));
  assert.ok((await cols(db, "videos")).has("user_subjects"));
  assert.ok((await cols(db, "idea_feedback")).has("detail"));
}

test("a database the 0.2.0 Phase 2 preview touched is repaired, keeping every row and its forensics data", async () => {
  const db = memoryDb();
  await migrate(db, [MIGRATIONS[0]!, PHASE2_V2]);
  await seedV1Data(db);
  await db.execute("INSERT INTO video_forensics (video_id, creator_notes, creator_tags, updated_at) VALUES ('vid00000001','great pacing','[\"zomboid\"]',?)", [t]);
  const before = await counts(db);
  assert.ok(!(await tables(db)).has("games"), "precondition: the preview's v2 lacks v0.1.1's tables");

  const report = await migrate(db);
  assert.equal(report.from, 2);
  assert.equal(report.to, LATEST_SCHEMA_VERSION);
  assert.ok(report.applied.some((a) => a.includes("added table games") && a.includes("added profile_items.scope")), report.applied.join("; "));
  await assertConverged(db);
  assert.deepEqual(await counts(db), before, "no row lost");
  const f = await db.select<{ creator_notes: string }>("SELECT creator_notes FROM video_forensics WHERE video_id = 'vid00000001'");
  assert.equal(f[0]?.creator_notes, "great pacing", "Phase 2 notes kept");
  // The app works on it: profile split, context, library.
  await upgradeProfileTo011(db);
  const ctx = await loadCreatorContext(db);
  assert.equal(ctx.library.size, 0);
  assert.equal((await repo.listVideos(db))[0]?.userNotes, "my note");
  assert.equal((await repo.getProject(db, "pr1"))?.details.notes, "keep this");
});

test("a v0.1.1 database gains only the preview's table; a fresh one gets everything", async () => {
  const db = memoryDb();
  await migrate(db, MIGRATIONS.slice(0, 2));
  await seedV1Data(db);
  await repo.saveGames(db, [{ title: "Morrowind", canon: "morrowind", platform: "PC", ownership: "owned", status: null, rating: null, favorite: false, playtimeMin: 600, steamAppId: 22320, releaseYear: 2002, tags: [], source: "test" }]);
  const before = await counts(db);
  const report = await migrate(db);
  assert.equal(report.from, 2);
  assert.ok(report.applied[0]?.includes("added table video_forensics"));
  assert.ok(!report.applied[0]?.includes("games"), "nothing of v0.1.1 is re-added");
  await assertConverged(db);
  assert.deepEqual(await counts(db), before);
  assert.equal((await repo.listGames(db))[0]?.playtimeMin, 600, "game library untouched");

  const fresh = memoryDb();
  const r = await migrate(fresh);
  assert.equal(r.from, 0);
  assert.equal(r.to, 3);
  await assertConverged(fresh);
});

test("the repair is idempotent: running it again changes nothing", async () => {
  const db = memoryDb();
  await migrate(db, [MIGRATIONS[0]!, PHASE2_V2]);
  await seedV1Data(db);
  await migrate(db);
  const schemaBefore = await db.select<{ sql: string }>("SELECT sql FROM sqlite_master ORDER BY name");
  assert.deepEqual(await convergeSchema(db), [], "second run has nothing to do");
  assert.deepEqual(await convergeSchema(db), []);
  assert.deepEqual(await db.select<{ sql: string }>("SELECT sql FROM sqlite_master ORDER BY name"), schemaBefore);
  const again = await migrate(db);
  assert.deepEqual(again.applied, []);
});

test("backups from v0.1.0, v0.1.1 and the 0.2.0 preview all restore into v0.1.2", async () => {
  for (const layout of ["v0.1.0", "v0.1.1", "0.2.0-preview"] as const) {
    const src = memoryDb();
    await migrate(src, layout === "v0.1.0" ? MIGRATIONS.slice(0, 1) : layout === "v0.1.1" ? MIGRATIONS.slice(0, 2) : [MIGRATIONS[0]!, PHASE2_V2]);
    await seedV1Data(src);
    if (layout === "0.2.0-preview") await src.execute("INSERT INTO video_forensics (video_id, creator_notes, updated_at) VALUES ('vid00000001','kept',?)", [t]);
    const backup = await createBackup(src, layout);

    const dst = memoryDb();
    await migrate(dst);
    const { preview, file } = await inspectBackup(dst, JSON.stringify(backup));
    assert.ok(preview.ok, `${layout}: ${preview.problems.join("; ")}`);
    await restoreBackup(dst, file!);
    assert.deepEqual(await counts(dst), await counts(src), `${layout}: every row restored`);
    if (layout === "0.2.0-preview") {
      assert.equal((await dst.select<{ creator_notes: string }>("SELECT creator_notes FROM video_forensics"))[0]?.creator_notes, "kept");
    }
  }
});

test("Tamster's channel description is kept byte for byte, and a user edit is never replaced", async () => {
  assert.equal(
    DEFAULT_SETTINGS.channelIdentity.description,
    "Just a guy who likes games, old computers, and weird shit.\n\nI mostly do gaming videos with the occasional tech stuff thrown in.\n\nMy videos are never on schedule and always low quality :)",
  );
  assert.equal(DEFAULT_SETTINGS.channelIdentity.displayName, "Tamster");
  const db = memoryDb();
  await migrate(db);
  assert.deepEqual((await loadSettings(db)).channelIdentity, TAMSTER_IDENTITY);
  const mine = { ...TAMSTER_IDENTITY, description: "  My own words.\n\n  With spacing :) " };
  await saveSettings(db, { ...(await loadSettings(db)), channelIdentity: mine });
  assert.equal((await loadSettings(db)).channelIdentity.description, "  My own words.\n\n  With spacing :) ");
  // The 0.2.0 preview stored the same key with the same shape; a partial value is completed, not replaced.
  await db.execute("UPDATE settings SET value = ? WHERE key = 'app'", [JSON.stringify({ channelIdentity: { displayName: "Tamster", avatarNote: "new cat" }, generator: { contentFocus: "gaming-first" } })]);
  const s = await loadSettings(db);
  assert.equal(s.channelIdentity.avatarNote, "new cat");
  assert.equal(s.channelIdentity.description, TAMSTER_IDENTITY.description);
  assert.equal(s.contentFocus.gaming, 85, "the preview's focus string doesn't break v0.1.1's focus object");
});
