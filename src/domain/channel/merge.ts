// Merges an import batch into the local archive. Imported metadata updates
// public facts (title, duration, metrics); the creator's own annotations and
// feedback are never touched.
import type { Db, Statement } from "../../platform/types.ts";
import { nowIso } from "../../lib/util.ts";
import type { Video } from "../types.ts";
import type { ImportBatch, ImportedVideo } from "./types.ts";

export type ChangeField = "title" | "description" | "publishedAt" | "durationSeconds" | "thumbnailUrl" | "availability";

export interface PlannedUpdate {
  video: ImportedVideo;
  existing: Video;
  changes: ChangeField[];
  metricChanges: string[];
}

export interface MergePlan {
  source: ImportBatch["source"];
  label: string;
  added: ImportedVideo[];
  updated: PlannedUpdate[];
  unchanged: ImportedVideo[];
  /** Local videos the source did not return. They are kept, never deleted. */
  notReturned: Video[];
  duplicatesInBatch: number;
  warnings: string[];
}

/** Extracts a YouTube video ID from an ID, watch URL, short URL or Shorts URL. */
export function extractVideoId(input: string): string | null {
  const t = input.trim();
  if (/^[\w-]{11}$/.test(t)) return t;
  const m = /(?:v=|youtu\.be\/|shorts\/|embed\/|live\/)([\w-]{11})/.exec(t);
  return m?.[1] ?? null;
}

function same(a: unknown, b: unknown): boolean {
  return (a ?? null) === (b ?? null);
}

function sameInstant(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return !a && !b;
  return Date.parse(a) === Date.parse(b);
}

/** Normalizes any parseable date to ISO 8601 UTC. */
export function normalizeDate(s: string | null | undefined): string | null {
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

export function planMerge(existing: Video[], batch: ImportBatch, existingMetrics: Map<string, Record<string, number>> = new Map()): MergePlan {
  const byId = new Map(existing.map((v) => [v.id, v]));
  const seen = new Set<string>();
  const plan: MergePlan = {
    source: batch.source,
    label: batch.label,
    added: [],
    updated: [],
    unchanged: [],
    notReturned: [],
    duplicatesInBatch: 0,
    warnings: [...batch.warnings],
  };
  for (const v of batch.videos) {
    if (seen.has(v.id)) {
      plan.duplicatesInBatch++;
      continue;
    }
    seen.add(v.id);
    const cur = byId.get(v.id);
    if (!cur) {
      plan.added.push(v);
      continue;
    }
    const changes: ChangeField[] = [];
    // Studio exports carry date-only publish times and sometimes shortened
    // titles, so they only fill gaps; they never replace richer data.
    const partial = batch.source === "studio_export";
    // A source that does not provide a field never blanks it out.
    if (v.title && v.title !== "(untitled)" && v.title !== "(unavailable video)" && !same(v.title, cur.title) && (!partial || !cur.title)) changes.push("title");
    if (v.description !== undefined && v.description !== "" && !same(v.description, cur.description)) changes.push("description");
    if (v.publishedAt && !sameInstant(v.publishedAt, cur.publishedAt) && (!partial || !cur.publishedAt)) changes.push("publishedAt");
    if (v.durationSeconds !== undefined && v.durationSeconds !== null && !same(v.durationSeconds, cur.durationSeconds)) changes.push("durationSeconds");
    if (v.thumbnailUrl && !cur.thumbnailUrl) changes.push("thumbnailUrl");
    else if (v.thumbnailUrl && batch.source !== "studio_export" && !same(v.thumbnailUrl, cur.thumbnailUrl)) changes.push("thumbnailUrl");
    if (v.availability && !same(v.availability, cur.availability)) changes.push("availability");
    const prev = existingMetrics.get(`${v.id}|${batch.source}`) ?? {};
    const metricChanges = Object.entries(v.metrics)
      .filter(([k, val]) => prev[k] !== val)
      .map(([k]) => k);
    if (changes.length || metricChanges.length) plan.updated.push({ video: v, existing: cur, changes, metricChanges });
    else plan.unchanged.push(v);
  }
  if (batch.source === "public_feed" || batch.source === "public_api") {
    plan.notReturned = existing.filter((v) => !seen.has(v.id) && !v.id.startsWith("manual-"));
  }
  if (plan.duplicatesInBatch) plan.warnings.push(`${plan.duplicatesInBatch} duplicate row(s) in the import were ignored.`);
  return plan;
}

function metricStatements(v: ImportedVideo, source: string, t: string): Statement[] {
  return Object.entries(v.metrics).map(([metric, value]) => ({
    sql: `INSERT INTO video_metrics (video_id, metric, source, value, captured_at) VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(video_id, metric, source) DO UPDATE SET value = excluded.value, captured_at = excluded.captured_at`,
    params: [v.id, metric, source, value, t],
  }));
}

export function planStatements(plan: MergePlan, t: string = nowIso()): Statement[][] {
  const groups: Statement[][] = [];
  for (const v of plan.added) {
    groups.push([
      {
        sql: `INSERT INTO videos (id, title, description, published_at, duration_seconds, thumbnail_url, availability, first_source, last_synced_at, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        params: [v.id, v.title, v.description ?? "", normalizeDate(v.publishedAt), v.durationSeconds ?? null, v.thumbnailUrl ?? null, v.availability ?? "unknown", plan.source, t, t, t],
      },
      ...metricStatements(v, plan.source, t),
    ]);
  }
  for (const u of plan.updated) {
    const v = u.video;
    const e = u.existing;
    const pick = <K extends ChangeField>(f: K, next: unknown, cur: unknown) => (u.changes.includes(f) ? next : cur);
    groups.push([
      {
        sql: `UPDATE videos SET title = ?, description = ?, published_at = ?, duration_seconds = ?, thumbnail_url = ?, availability = ?, last_synced_at = ?, updated_at = ? WHERE id = ?`,
        params: [
          pick("title", v.title, e.title),
          pick("description", v.description, e.description),
          pick("publishedAt", normalizeDate(v.publishedAt), e.publishedAt),
          pick("durationSeconds", v.durationSeconds, e.durationSeconds),
          pick("thumbnailUrl", v.thumbnailUrl, e.thumbnailUrl),
          pick("availability", v.availability, e.availability),
          t,
          t,
          v.id,
        ],
      },
      ...metricStatements(v, plan.source, t),
    ]);
  }
  for (const v of plan.unchanged) {
    groups.push([{ sql: "UPDATE videos SET last_synced_at = ? WHERE id = ?", params: [t, v.id] }]);
  }
  return groups;
}

export interface ApplyResult {
  added: number;
  updated: number;
  unchanged: number;
  cancelled: boolean;
}

/** Applies the plan in chunks so the UI can show progress and cancel. Each chunk is atomic. */
export async function applyMerge(
  db: Db,
  plan: MergePlan,
  opts: { signal?: AbortSignal; onProgress?: (done: number, total: number) => void; chunkSize?: number } = {},
): Promise<ApplyResult> {
  const groups = planStatements(plan);
  const size = opts.chunkSize ?? 25;
  let done = 0;
  for (let i = 0; i < groups.length; i += size) {
    if (opts.signal?.aborted) {
      return { added: Math.min(done, plan.added.length), updated: Math.max(0, Math.min(done - plan.added.length, plan.updated.length)), unchanged: 0, cancelled: true };
    }
    const chunk = groups.slice(i, i + size);
    await db.batch(chunk.flat());
    done += chunk.length;
    opts.onProgress?.(done, groups.length);
  }
  return { added: plan.added.length, updated: plan.updated.length, unchanged: plan.unchanged.length, cancelled: false };
}
