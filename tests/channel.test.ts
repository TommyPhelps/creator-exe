import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { memoryDb } from "./helpers/sqliteDb.ts";
import { migrate } from "../src/db/migrate.ts";
import * as repo from "../src/db/repos.ts";
import { parseChannelFeed } from "../src/domain/channel/feed.ts";
import { parseStudioCsv, parseClock } from "../src/domain/channel/studioCsv.ts";
import { parseCsv, toCsv } from "../src/domain/channel/csv.ts";
import { importChannelViaApi, parseIsoDuration, parseChannelInput, YouTubeApiError } from "../src/domain/channel/dataApi.ts";
import { applyMerge, extractVideoId, planMerge } from "../src/domain/channel/merge.ts";
import { readVideo, summarizeChannel, satisfactionBySubject } from "../src/domain/channel/analyze.ts";
import type { HttpResult } from "../src/platform/types.ts";

const fixture = (n: string) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), "utf8");

test("parses the public channel feed with entities and CDATA", () => {
  const b = parseChannelFeed(fixture("feed.xml"));
  assert.equal(b.source, "public_feed");
  assert.equal(b.channel?.id, "UCGnpORs6LGRRb1b7y39wumw");
  assert.equal(b.channel?.title, "Tamster");
  assert.equal(b.videos.length, 2);
  const [a, c] = b.videos;
  assert.equal(a?.title, "Project Zomboid but I'm a Pacifist");
  assert.equal(a?.description, "No shoving & no hitting.");
  assert.equal(a?.metrics.views, 337);
  assert.equal(a?.durationSeconds, undefined, "the feed has no durations; never invent one");
  assert.equal(c?.description, "Horror <b>game</b>");
  assert.ok(b.warnings[0]?.includes("15"));
});

test("rejects non-feed responses", () => {
  assert.throws(() => parseChannelFeed("<html>consent page</html>"), /not a YouTube channel feed/);
});

test("CSV parser handles quotes, commas, CRLF and BOM", () => {
  const rows = parseCsv('﻿a,b\r\n"x, y","say ""hi"""\r\n');
  assert.deepEqual(rows, [["a", "b"], ["x, y", 'say "hi"']]);
  assert.deepEqual(parseCsv(toCsv([["a,b", 'q"', null, 3]])), [["a,b", 'q"', "", "3"]]);
});

test("parses a YouTube Studio export and skips the Total row", () => {
  const b = parseStudioCsv(fixture("studio.csv"), "Table data.csv");
  assert.equal(b.videos.length, 2);
  const z = b.videos[0]!;
  assert.equal(z.id, "AAAAAAAAAA1");
  assert.equal(z.durationSeconds, 813);
  assert.equal(z.metrics.views, 337);
  assert.equal(z.metrics.ctr_percent, 4.5);
  assert.equal(z.metrics.avg_view_duration_seconds, 105);
  assert.equal(z.metrics.impressions, 4200);
  assert.ok(b.warnings.some((w) => w.includes("Total")));
  assert.equal(parseClock("1:02:03"), 3723);
  assert.throws(() => parseStudioCsv("a,b\n1,2"), /no "Content"/);
});

test("ISO durations and channel inputs", () => {
  assert.equal(parseIsoDuration("PT16M54S"), 1014);
  assert.equal(parseIsoDuration("PT1H"), 3600);
  assert.equal(parseIsoDuration("P1DT1S"), 86401);
  assert.equal(parseIsoDuration("garbage"), null);
  assert.deepEqual(parseChannelInput("https://www.youtube.com/channel/UCGnpORs6LGRRb1b7y39wumw"), { channelId: "UCGnpORs6LGRRb1b7y39wumw" });
  assert.deepEqual(parseChannelInput("https://www.youtube.com/@TamsterCo"), { handle: "@TamsterCo" });
  assert.deepEqual(parseChannelInput("nonsense"), {});
  assert.equal(extractVideoId("https://www.youtube.com/watch?v=AAAAAAAAAA1&t=3"), "AAAAAAAAAA1");
  assert.equal(extractVideoId("https://youtu.be/BBBBBBBBBB2"), "BBBBBBBBBB2");
  assert.equal(extractVideoId("https://youtube.com/shorts/CCCCCCCCCC3"), "CCCCCCCCCC3");
  assert.equal(extractVideoId("hello"), null);
});

function fakeApi(responses: Record<string, unknown>, calls: string[] = []) {
  return async (url: string): Promise<HttpResult> => {
    calls.push(url);
    for (const [k, v] of Object.entries(responses)) {
      if (url.includes(k)) {
        if (v instanceof Error) throw v;
        const status = (v as { __status?: number }).__status ?? 200;
        return { status, ok: status < 400, text: JSON.stringify(v) };
      }
    }
    return { status: 404, ok: false, text: "{}" };
  };
}

test("Data API import pages through uploads and reports hidden videos honestly", async () => {
  const calls: string[] = [];
  const get = fakeApi(
    {
      "/channels?": { items: [{ id: "UCGnpORs6LGRRb1b7y39wumw", snippet: { title: "Tamster" }, contentDetails: { relatedPlaylists: { uploads: "UUx" } }, statistics: { videoCount: "37", subscriberCount: "45" } }] },
      "pageToken=P2": { items: [{ contentDetails: { videoId: "CCCCCCCCCC3" } }] },
      "/playlistItems?": { nextPageToken: "P2", items: [{ contentDetails: { videoId: "AAAAAAAAAA1" } }, { contentDetails: { videoId: "BBBBBBBBBB2" } }] },
      "/videos?": {
        items: [
          { id: "AAAAAAAAAA1", snippet: { title: "Zomboid", publishedAt: "2021-06-01T00:00:00Z", thumbnails: { high: { url: "https://i.ytimg.com/vi/AAAAAAAAAA1/hqdefault.jpg" } } }, contentDetails: { duration: "PT13M33S" }, statistics: { viewCount: "337" }, status: { privacyStatus: "public" } },
          { id: "BBBBBBBBBB2", snippet: { title: "Night Factory" }, contentDetails: { duration: "PT9M" }, statistics: {}, status: { privacyStatus: "unlisted" } },
        ],
      },
    },
    calls,
  );
  const progress: string[] = [];
  const b = await importChannelViaApi(get, "KEY", "@TamsterCo", { onProgress: (_d, _t, m) => progress.push(m) });
  assert.ok(calls[0]?.includes("forHandle=%40TamsterCo"));
  assert.equal(b.videos.length, 3);
  assert.equal(b.videos.find((v) => v.id === "AAAAAAAAAA1")?.durationSeconds, 813);
  assert.equal(b.videos.find((v) => v.id === "BBBBBBBBBB2")?.availability, "unlisted");
  assert.equal(b.videos.find((v) => v.id === "CCCCCCCCCC3")?.availability, "deleted");
  assert.equal(b.channel?.subscriberCount, 45);
  assert.ok(b.warnings.some((w) => w.includes("37")));
  assert.ok(progress.length > 0);
});

test("Data API errors become actionable messages", async () => {
  const bad = fakeApi({ "/channels?": { __status: 400, error: { message: "API key not valid. Please pass a valid API key.", errors: [{ reason: "badRequest" }] } } });
  await assert.rejects(() => importChannelViaApi(bad, "nope", "UCGnpORs6LGRRb1b7y39wumw"), (e: unknown) => e instanceof YouTubeApiError && /rejected/.test(e.message));
  const quota = fakeApi({ "/channels?": { __status: 403, error: { message: "quota", errors: [{ reason: "quotaExceeded" }] } } });
  await assert.rejects(() => importChannelViaApi(quota, "k", "UCGnpORs6LGRRb1b7y39wumw"), /quota/);
  const offline = fakeApi({ "/channels?": new Error("network unreachable") });
  await assert.rejects(() => importChannelViaApi(offline, "k", "UCGnpORs6LGRRb1b7y39wumw"), /network/);
  const ctrl = new AbortController();
  ctrl.abort();
  const ok = fakeApi({ "/channels?": { items: [{ id: "UCx", contentDetails: { relatedPlaylists: { uploads: "UUx" } } }] } });
  await assert.rejects(() => importChannelViaApi(ok, "k", "UCGnpORs6LGRRb1b7y39wumw", { signal: ctrl.signal }));
});

test("merge dedupes by video ID and never overwrites the creator's annotations", async () => {
  const db = memoryDb();
  await migrate(db);
  const feed = parseChannelFeed(fixture("feed.xml"));
  const plan1 = planMerge(await repo.listVideos(db), feed);
  assert.equal(plan1.added.length, 2);
  await applyMerge(db, plan1);
  await repo.updateVideoAnnotations(db, "AAAAAAAAAA1", { userNotes: "loved this one", userCategory: "survival" });
  await repo.saveVideoFeedback(db, { videoId: "AAAAAAAAAA1", flags: ["loved_making"], enjoyOverall: 5, enjoyRecording: null, enjoyEditing: null, pride: null, effort: null, revisit: null });

  const studio = parseStudioCsv(fixture("studio.csv"));
  const plan2 = planMerge(await repo.listVideos(db), studio);
  assert.equal(plan2.added.length, 1, "the Minecraft video is new");
  assert.equal(plan2.updated.length, 1);
  assert.ok(plan2.updated[0]?.changes.includes("durationSeconds"));
  assert.equal(plan2.notReturned.length, 0, "studio exports are partial; nothing is flagged missing");
  await applyMerge(db, plan2);

  const v = await repo.getVideo(db, "AAAAAAAAAA1");
  assert.equal(v?.userNotes, "loved this one");
  assert.equal(v?.userCategory, "survival");
  assert.equal(v?.durationSeconds, 813);
  assert.equal(v?.description, "No shoving & no hitting.", "a source without descriptions does not blank them");
  assert.equal((await repo.listVideoFeedback(db))[0]?.enjoyOverall, 5);
  const metrics = await repo.listMetrics(db, "AAAAAAAAAA1");
  assert.ok(metrics.some((m) => m.source === "public_feed" && m.metric === "views"));
  assert.ok(metrics.some((m) => m.source === "studio_export" && m.metric === "ctr_percent"));

  const again = planMerge(await repo.listVideos(db), parseChannelFeed(fixture("feed.xml")), new Map([["AAAAAAAAAA1|public_feed", { views: 337, ratings: 12 }], ["BBBBBBBBBB2|public_feed", { views: 18 }]]));
  assert.equal(again.added.length, 0);
  assert.equal(again.unchanged.length, 2);
  assert.equal(again.notReturned.length, 1, "videos missing from the feed are reported, not deleted");
  assert.equal((await repo.listVideos(db)).length, 3);
});

test("duplicate rows in one import are ignored", () => {
  const b = parseChannelFeed(fixture("feed.xml"));
  b.videos.push({ ...b.videos[0]! });
  const plan = planMerge([], b);
  assert.equal(plan.added.length, 2);
  assert.equal(plan.duplicatesInBatch, 1);
});

test("applying a merge can be cancelled between atomic chunks", async () => {
  const db = memoryDb();
  await migrate(db);
  const many = { source: "manual" as const, label: "x", warnings: [], videos: Array.from({ length: 60 }, (_, i) => ({ id: `vid${String(i).padStart(8, "0")}`, title: `V${i}`, metrics: {} })) };
  const ctrl = new AbortController();
  const r = await applyMerge(db, planMerge([], many), { chunkSize: 25, signal: ctrl.signal, onProgress: (d) => d >= 25 && ctrl.abort() });
  assert.equal(r.cancelled, true);
  assert.equal((await repo.listVideos(db)).length, 25);
});

test("channel reading labels come with evidence", () => {
  const now = new Date().toISOString();
  const v = { id: "x", title: "Project Zomboid but I'm a Pacifist", description: "", publishedAt: "2021-06-01T00:00:00Z", durationSeconds: 813, thumbnailUrl: null, availability: "public" as const, firstSource: "manual" as const, lastSyncedAt: null, userCategory: "", userFormat: "", userEffort: null, userNotes: "", relatedProjectId: null, createdAt: now, updatedAt: now };
  const r = readVideo(v);
  assert.ok(r.subjects.some((s) => s.id === "video-games" && s.because.includes("zomboid")));
  assert.ok(r.subjects.some((s) => s.id === "challenge-runs"));
  assert.ok(r.formats.some((f) => f.label === "Self-imposed rule"));
  const summary = summarizeChannel([v, { ...v, id: "y", title: "Night Factory is TERRIFYING", publishedAt: "2021-03-01T00:00:00Z", durationSeconds: 45 }], []);
  assert.equal(summary.videoCount, 2);
  assert.ok(summary.formats.some((f) => f.label === "Short"));
  assert.equal(summary.byYear[0]?.year, "2021");
  const sat = satisfactionBySubject([v], [{ videoId: "x", flags: ["no_repeat", "exhausting"], enjoyOverall: 1, enjoyRecording: null, enjoyEditing: null, pride: null, effort: null, revisit: null, updatedAt: now }]);
  assert.ok((sat.get("survival-games") ?? 0) < 0);
});
