// Parses the "Table data.csv" file from YouTube Studio > Analytics > Advanced
// mode > Export current view. Column names vary by what the creator selected,
// so every numeric column is kept and the common ones get stable names.
import { parseCsv } from "./csv.ts";
import type { ImportBatch, ImportedVideo } from "./types.ts";

const KNOWN: { metric: string; match: RegExp }[] = [
  { metric: "views", match: /^views$/i },
  { metric: "watch_time_hours", match: /^watch time \(hours\)$/i },
  { metric: "subscribers_gained_net", match: /^subscribers$/i },
  { metric: "subscribers_gained", match: /^subscribers gained$/i },
  { metric: "subscribers_lost", match: /^subscribers lost$/i },
  { metric: "impressions", match: /^impressions$/i },
  { metric: "ctr_percent", match: /^impressions click-through rate \(%\)$/i },
  { metric: "avg_view_duration_seconds", match: /^average view duration$/i },
  { metric: "avg_percent_viewed", match: /^average percentage viewed \(%\)$/i },
  { metric: "likes", match: /^likes$/i },
  { metric: "dislikes", match: /^dislikes$/i },
  { metric: "comments", match: /^comments added$/i },
  { metric: "shares", match: /^shares$/i },
  { metric: "unique_viewers", match: /^unique viewers$/i },
];

const ID_HEADERS = /^(content|video|video id)$/i;
const TITLE_HEADERS = /^video title$/i;
const PUBLISHED_HEADERS = /^video publish time$/i;
const DURATION_HEADERS = /^duration$/i;

function slug(h: string): string {
  return h
    .toLowerCase()
    .replace(/%/g, "percent")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

/** Accepts "1:02:03", "12:19", or plain seconds. */
export function parseClock(v: string): number | null {
  const t = v.trim();
  if (t === "") return null;
  if (/^\d+(\.\d+)?$/.test(t)) return Number(t);
  const parts = t.split(":").map(Number);
  if (parts.some((p) => !Number.isFinite(p))) return null;
  return parts.reduce((acc, p) => acc * 60 + p, 0);
}

function parseNumber(v: string): number | null {
  const t = v.trim().replace(/,/g, "").replace(/%$/, "");
  if (t === "" || t === "-") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function parseDate(v: string): string | null {
  const t = v.trim();
  if (!t) return null;
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function parseStudioCsv(text: string, fileName = "Studio export"): ImportBatch {
  const rows = parseCsv(text);
  const header = rows[0];
  if (!header) throw new Error("The file is empty.");
  const idCol = header.findIndex((h) => ID_HEADERS.test(h.trim()));
  if (idCol < 0) throw new Error('This does not look like a YouTube Studio export: no "Content" (video ID) column was found.');
  const titleCol = header.findIndex((h) => TITLE_HEADERS.test(h.trim()));
  const pubCol = header.findIndex((h) => PUBLISHED_HEADERS.test(h.trim()));
  const durCol = header.findIndex((h) => DURATION_HEADERS.test(h.trim()));
  const metricCols = header
    .map((h, i) => ({ h: h.trim(), i }))
    .filter(({ i }) => ![idCol, titleCol, pubCol, durCol].includes(i))
    .map(({ h, i }) => ({ i, metric: KNOWN.find((k) => k.match.test(h))?.metric ?? slug(h), isClock: /duration/i.test(h) }));

  const videos: ImportedVideo[] = [];
  const warnings: string[] = [];
  let skipped = 0;
  for (const r of rows.slice(1)) {
    const id = (r[idCol] ?? "").trim();
    if (!/^[\w-]{11}$/.test(id)) {
      skipped++;
      continue;
    }
    const metrics: Record<string, number> = {};
    for (const m of metricCols) {
      const raw = r[m.i] ?? "";
      const n = m.isClock ? parseClock(raw) : parseNumber(raw);
      if (n !== null && m.metric) metrics[m.metric] = n;
    }
    videos.push({
      id,
      title: titleCol >= 0 ? (r[titleCol] ?? "").trim() || "(untitled)" : "(untitled)",
      publishedAt: pubCol >= 0 ? parseDate(r[pubCol] ?? "") : null,
      durationSeconds: durCol >= 0 ? parseClock(r[durCol] ?? "") : null,
      thumbnailUrl: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      metrics,
    });
  }
  if (skipped) warnings.push(`${skipped} row(s) without a video ID were skipped (for example the "Total" row).`);
  return { source: "studio_export", label: `YouTube Studio export: ${fileName} (${videos.length} videos)`, videos, warnings };
}
