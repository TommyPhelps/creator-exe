// v0.1.3 Pass A: schema v5 (destinations, stream sessions, moments, game metadata).
import { test } from "node:test";
import assert from "node:assert/strict";
import { memoryDb } from "./helpers/sqliteDb.ts";
import { migrate } from "../src/db/migrate.ts";
import { MIGRATIONS, LATEST_SCHEMA_VERSION, addStreamsAndMeta } from "../src/db/migrations.ts";
import * as repo from "../src/db/repos.ts";
import { createBackup, inspectBackup, restoreBackup } from "../src/domain/backup.ts";

const t = "2026-10-17T12:00:00.000Z";

async function v012Db() {
  const db = memoryDb();
  await migrate(db, MIGRATIONS.slice(0, 4));
  await db.execute("INSERT INTO projects (id, title, stage, next_action, details, created_at, updated_at) VALUES ('p1','Tarhiel video','recording','Record the scrolls','{\"hook\":\"A wizard died\",\"myNotes\":\"keep\"}',?,?)", [t, t]);
  await db.execute("INSERT INTO project_tasks (id, project_id, list, label, done, position, created_at) VALUES ('t1','p1','recording','Tarhiel landing',1,0,?)", [t]);
  await db.execute("INSERT INTO games (canon, title, ownership, playtime_min, source, imported_at) VALUES ('morrowind','Morrowind','owned',900,'rewind',?)", [t]);
  return db;
}

test("a v0.1.2 database upgrades to v5: every project stays a YouTube project, nothing changes", async () => {
  const db = await v012Db();
  const r = await migrate(db);
  assert.equal(r.from, 4);
  assert.equal(r.to, LATEST_SCHEMA_VERSION);
  const v5 = r.applied.find((a) => a.startsWith("5:")) ?? "";
  for (const part of ["projects.destination", "projects.source_project_id", "table stream_sessions", "table moments", "table game_meta"]) assert.ok(v5.includes(part), v5);
  const p = (await repo.getProject(db, "p1"))!;
  assert.equal(p.destination, "youtube");
  assert.equal(p.sourceProjectId, null);
  assert.equal(p.details.hook, "A wizard died");
  assert.equal(p.details.myNotes, "keep");
  assert.equal((await repo.listTasks(db, "p1"))[0]?.done, true);
  assert.equal((await repo.listGames(db))[0]?.playtimeMin, 900);
  assert.deepEqual(await addStreamsAndMeta(db), [], "running v5 again does nothing");
  assert.deepEqual((await migrate(db)).applied, []);
});

test("the 0.2.0 preview layout and v0.1.0 also reach v5", async () => {
  const db = memoryDb();
  await migrate(db, MIGRATIONS.slice(0, 1));
  await db.execute(`CREATE TABLE video_forensics (video_id TEXT PRIMARY KEY, media_json TEXT NOT NULL DEFAULT 'null', transcript_json TEXT NOT NULL DEFAULT 'null', transcript_filename TEXT NOT NULL DEFAULT '', thumbnail_palette TEXT NOT NULL DEFAULT '[]', thumbnail_filename TEXT NOT NULL DEFAULT '', creator_notes TEXT NOT NULL DEFAULT '', creator_tags TEXT NOT NULL DEFAULT '[]', updated_at TEXT NOT NULL)`);
  await db.execute("INSERT INTO schema_migrations (version, name, applied_at) VALUES (2, 'local video forensics and creator-controlled evidence', ?)", [t]);
  const r = await migrate(db);
  assert.equal(r.to, LATEST_SCHEMA_VERSION);
  const cols = new Set((await db.select<{ name: string }>("SELECT name FROM pragma_table_info('projects')")).map((x) => x.name));
  assert.ok(cols.has("destination") && cols.has("source_project_id"));
});

test("stream sessions and moments belong to a project, and go with it", async () => {
  const db = memoryDb();
  await migrate(db);
  const p = await repo.createProject(db, { title: "Weird indie night", destination: "twitch" });
  assert.equal(p.destination, "twitch");
  const s = await repo.createSession(db, p.id, { mode: "casual", title: "Playing something strange", goLiveNote: "Weird game, come hang out" });
  assert.equal(s.startedAt, null, "planned until you press Start");
  const live = await repo.updateSession(db, s.id, { startedAt: t });
  assert.equal(live?.startedAt, t);
  const m1 = await repo.addMoment(db, p.id, { sessionId: s.id, offsetSeconds: 3723, atText: "1:02:03", note: "the door thing" });
  await repo.addMoment(db, p.id, { atText: "0:10:00", note: "typed by hand" });
  assert.equal(m1.offsetSeconds, 3723);
  assert.equal((await repo.listMoments(db, p.id)).length, 2);
  await repo.deleteSession(db, s.id);
  assert.equal((await repo.listMoments(db, p.id)).find((m) => m.id === m1.id)?.sessionId, null, "deleting a session keeps its moments");
  await repo.deleteProject(db, p.id);
  assert.equal((await db.select("SELECT * FROM moments")).length, 0);
  assert.equal((await db.select("SELECT * FROM stream_sessions")).length, 0);
});

test("a YouTube project made from a stream links back to it, and both stay separate", async () => {
  const db = memoryDb();
  await migrate(db);
  const stream = await repo.createProject(db, { title: "Stream: strange indie", destination: "twitch" });
  await repo.addMoment(db, stream.id, { atText: "0:42:10", note: "game crashed into a menu" });
  const video = await repo.createProject(db, { title: "The game that crashed into a menu", destination: "youtube", sourceProjectId: stream.id });
  assert.deepEqual((await repo.listLinkedProjects(db, stream.id)).map((x) => x.id), [video.id]);
  await repo.updateProject(db, video.id, { stage: "editing" });
  assert.equal((await repo.getProject(db, stream.id))?.stage, "idea", "progress is tracked separately");
  await repo.updateProject(db, stream.id, { destination: "both" });
  assert.equal((await repo.getProject(db, stream.id))?.destination, "both");
});

test("game metadata is stored per source and updated in place", async () => {
  const db = memoryDb();
  await migrate(db);
  const base = { canon: "morrowind", source: "steam", sourceId: "22320", name: "The Elder Scrolls III: Morrowind", developers: ["Bethesda Game Studios"], publishers: ["Bethesda Softworks"], genres: ["RPG"], tags: [], modes: ["Single-player"], releaseYear: 2002, checkedAt: t };
  await repo.saveGameMeta(db, base);
  await repo.saveGameMeta(db, { ...base, genres: ["RPG", "Adventure"] });
  const all = await repo.listGameMeta(db);
  assert.equal(all.length, 1);
  assert.deepEqual(all[0]?.genres, ["RPG", "Adventure"]);
});

test("backups from v0.1.2 restore into v5, and v5 backups keep streams and moments", async () => {
  const old = await v012Db();
  const oldBackup = await createBackup(old, "0.1.2");
  const dst = memoryDb();
  await migrate(dst);
  const a = await inspectBackup(dst, JSON.stringify(oldBackup));
  assert.ok(a.preview.ok, a.preview.problems.join("; "));
  await restoreBackup(dst, a.file!);
  assert.equal((await repo.getProject(dst, "p1"))?.destination, "youtube");

  const p = await repo.createProject(dst, { title: "Stream", destination: "both" });
  const s = await repo.createSession(dst, p.id, { mode: "concept", goal: "find the secret room" });
  await repo.addMoment(dst, p.id, { sessionId: s.id, atText: "2:00:00", note: "found it" });
  const backup = await createBackup(dst, "0.1.3");
  const again = memoryDb();
  await migrate(again);
  const b = await inspectBackup(again, JSON.stringify(backup));
  assert.ok(b.preview.ok, b.preview.problems.join("; "));
  await restoreBackup(again, b.file!);
  assert.equal((await repo.listSessions(again, p.id))[0]?.goal, "find the secret room");
  assert.equal((await repo.listMoments(again, p.id))[0]?.note, "found it");
  assert.equal((await repo.getProject(again, p.id))?.destination, "both");
});

// ---------------------------------------------------------------- Pass B: stream preparation and stream -> video
import { startProjectFromIdea } from "../src/domain/handoff.ts";
import { formatOffset, markMoment, parseOffset, streamTitleIdeas, STREAM_CHECKLIST, youtubeFromStream, GO_LIVE_LIMIT } from "../src/domain/streams.ts";
import { emptyContext, generateIdeas } from "../src/domain/ideas/generator.ts";
import { mulberry32 } from "../src/lib/util.ts";

test("starting a Twitch idea plans a session and the pre-stream checklist; YouTube ideas don't", async () => {
  const db = memoryDb();
  await migrate(db);
  const g = generateIdeas({ destination: "twitch" }, emptyContext(), { count: 1, rng: mulberry32(3) }).ideas[0]!;
  const idea = await repo.saveIdea(db, { origin: "library", libraryKey: g.key, title: g.title, premise: g.premise, details: g.details, subjects: g.subjects, status: "saved" });
  const { project } = await startProjectFromIdea(db, idea);
  assert.equal(project.destination, "twitch");
  const [s] = await repo.listSessions(db, project.id);
  assert.ok(s, "a planned session");
  assert.equal(s.startedAt, null);
  assert.equal(s.mode, "concept");
  assert.ok(s.title.length > 0 && s.title.length <= 140);
  assert.deepEqual((await repo.listTasks(db, project.id)).filter((t) => t.list === "stream").map((t) => t.label), STREAM_CHECKLIST);

  const casual = generateIdeas({ destination: "twitch", streamMode: "casual" }, emptyContext(), { count: 1, rng: mulberry32(4) }).ideas[0]!;
  const ci = await repo.saveIdea(db, { origin: "library", libraryKey: casual.key, title: casual.title, premise: casual.premise, details: casual.details, subjects: casual.subjects, status: "saved" });
  const c = await startProjectFromIdea(db, ci);
  assert.equal((await repo.listSessions(db, c.project.id))[0]?.mode, "casual");

  const yt = generateIdeas({}, emptyContext(), { count: 1, rng: mulberry32(5) }).ideas[0]!;
  const yi = await repo.saveIdea(db, { origin: "library", libraryKey: yt.key, title: yt.title, premise: yt.premise, details: yt.details, subjects: yt.subjects, status: "saved" });
  const y = await startProjectFromIdea(db, yi);
  assert.equal(y.project.destination, "youtube");
  assert.equal((await repo.listSessions(db, y.project.id)).length, 0);
});

test("marking a moment stores the time since going live; timestamps read both ways", async () => {
  const db = memoryDb();
  await migrate(db);
  const p = await repo.createProject(db, { title: "Stream", destination: "twitch" });
  const s = (await repo.updateSession(db, (await repo.createSession(db, p.id)).id, { startedAt: "2026-10-17T20:00:00.000Z" }))!;
  const m = await markMoment(db, s, "the floor vanished", new Date("2026-10-17T21:02:03.000Z"));
  assert.equal(m.offsetSeconds, 3723);
  assert.equal(m.atText, "1:02:03");
  assert.equal(formatOffset(59), "0:00:59");
  assert.equal(parseOffset("1:02:03"), 3723);
  assert.equal(parseOffset("62:03"), 3723);
  assert.equal(parseOffset("1h2m3s"), 3723);
  assert.equal(parseOffset("around the start"), null);
  assert.equal(GO_LIVE_LIMIT, 140);
  assert.deepEqual(streamTitleIdeas({ game: "Euro Truck Simulator 2", title: "x", hook: "y", mode: "casual" }), ["Playing Euro Truck Simulator 2", "Euro Truck Simulator 2, no plan"]);
});

test("a YouTube video from a stream is a separate, linked project that keeps the stream's notes and moments", async () => {
  const db = memoryDb();
  await migrate(db);
  const stream = await repo.createProject(db, { title: "Weird indie night", destination: "twitch", details: { game: "WEBFISHING" } });
  const s = await repo.createSession(db, stream.id, { mode: "casual", startedAt: "2026-10-17T20:00:00.000Z", vodUrl: "https://www.twitch.tv/videos/123", notes: "Lobby got strange around the guitar." });
  await repo.addMoment(db, stream.id, { sessionId: s.id, atText: "0:42:10", note: "everyone played the same song" });
  const video = await youtubeFromStream(db, stream.id, "The night a fishing lobby formed a band");
  assert.equal(video.destination, "youtube");
  assert.equal(video.sourceProjectId, stream.id);
  assert.match(video.details.myNotes, /https:\/\/www\.twitch\.tv\/videos\/123/);
  assert.match(video.details.myNotes, /0:42:10\s+everyone played the same song/);
  assert.match(video.details.myNotes, /Lobby got strange/);
  assert.equal((await repo.listMoments(db, stream.id)).length, 1, "the stream keeps its own moments");
  assert.equal((await repo.getProject(db, stream.id))?.destination, "twitch", "the stream stays a stream");
});
