import { test } from "node:test";
import assert from "node:assert/strict";
import { memoryDb } from "./helpers/sqliteDb.ts";
import { migrate } from "../src/db/migrate.ts";
import { addManualVideo } from "../src/db/repos.ts";
import { loadForensics, paletteFromPixels, saveForensics } from "../src/domain/channel/forensics.ts";
import { parseTranscript, readTimestamp } from "../src/domain/channel/transcript.ts";
import { createBackup, inspectBackup, restoreBackup } from "../src/domain/backup.ts";

test("SRT and VTT timestamps and cues are parsed without inventing moments", () => {
  assert.equal(readTimestamp("00:01:02,500"), 62.5);
  assert.equal(readTimestamp("01:02.500"), 62.5);
  assert.equal(readTimestamp("not time"), null);
  const srt = parseTranscript("1\n00:00:01,000 --> 00:00:03,250\nHello there\n\n2\n00:00:04,000 --> 00:00:05,000\nAnother line\n", "my-video.srt");
  assert.equal(srt.kind, "srt");
  assert.equal(srt.cues.length, 2);
  assert.equal(srt.cues[0]?.text, "Hello there");
  assert.equal(srt.cues[0]?.end, 3.25);
  assert.equal(srt.wordCount, 4);
  const vtt = parseTranscript("WEBVTT\n\n00:01.200 --> 00:02.400\nHi <b>friend</b>\n", "captions.vtt");
  assert.deepEqual(vtt.cues.map(x => x.text), ["Hi friend"]);
  const txt = parseTranscript("My own notes are not timecoded.", "script.txt");
  assert.match(txt.warnings.join(" "), /no reliable timestamps/);
  assert.equal(txt.cues.length, 1);
});
test("Malicious or malformed transcript data does not produce invented timing", () => {
  const bad = parseTranscript("00:00:99 --> 00:00:01\nnot valid", "captions.srt");
  assert.equal(bad.cues.length, 0);
  assert.ok(bad.warnings.length);
  assert.throws(() => parseTranscript("x".repeat(2_000_001), "huge.txt"), /2 MB/);
});
test("Observed thumbnail colors are computed from pixels without semantic claims", () => {
  const pixels = new Uint8ClampedArray(256);
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = 240; pixels[i+1] = 32; pixels[i+2] = 32; pixels[i+3] = 255;
  }
  assert.ok(paletteFromPixels(pixels).some(x => x.startsWith("#")));
  assert.equal(paletteFromPixels(new Uint8ClampedArray(0)).length, 0);
});
test("Video forensics can be partially updated without destroying other evidence", async () => {
  const db = memoryDb();
  const report = await migrate(db);
  assert.equal(report.to, 2);
  const video = await addManualVideo(db, { title: "My own video" });
  await saveForensics(db, video.id, { creatorNotes: "I liked making this.", creatorTags: ["old youtube"] });
  const transcript = parseTranscript("00:00:01,000 --> 00:00:03,000\nhello\n", "test.srt");
  await saveForensics(db, video.id, { transcript, transcriptFilename: "test.srt" });
  const record = await loadForensics(db, video.id);
  assert.equal(record.creatorNotes, "I liked making this.");
  assert.equal(record.transcript?.cues.length, 1);
  assert.deepEqual(record.creatorTags, ["old youtube"]);
  const exported = await createBackup(db, "0.2.0");
  assert.equal(exported.tables.video_forensics?.length, 1);
  const inspected = await inspectBackup(db, JSON.stringify(exported));
  assert.equal(inspected.preview.ok, true);
  await saveForensics(db, video.id, { creatorNotes: "Changed" });
  await restoreBackup(db, exported);
  assert.equal((await loadForensics(db, video.id)).creatorNotes, "I liked making this.");
  db.raw.close();
});
test("Older Phase 1 backup can restore without a video-forensics table", async () => {
  const db = memoryDb(); await migrate(db);
  const version1 = await createBackup(db, "0.1.0");
  version1.schemaVersion = 1; delete version1.tables.video_forensics;
  const { preview, file } = await inspectBackup(db, JSON.stringify(version1));
  assert.equal(preview.ok, true);
  if (file) await restoreBackup(db, file);
  db.raw.close();
});
