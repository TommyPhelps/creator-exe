// Keyword-based reading of the channel archive. This is deliberately simple
// and transparent: every label carries the exact words that produced it, so
// it is evidence ("title contains 'Minecraft'"), not an AI judgement.

import type { FeedbackFlag, Video, VideoFeedback, VideoMetric } from "../types.ts";
import { SUBJECTS, subjectLabel } from "../ideas/subjects.ts";

export interface Evidence {
  label: string;
  because: string;
}

export interface VideoReading {
  videoId: string;
  subjects: (Evidence & { id: string })[];
  formats: Evidence[];
}

const FORMAT_RULES: { label: string; re: RegExp }[] = [
  { label: "Self-imposed rule", re: /\bbut i'?m\b|\bbut i\b|\bwithout\b|\bno (?:shoving|hitting|killing|jumping)\b|\bpacifist\b/i },
  { label: "Attempt / experiment", re: /\bi tried\b|\btrying\b|\battempt/i },
  { label: "First impressions", re: /\bfirst time\b|\bfirst impression/i },
  { label: "Reaction / scare", re: /\bterrifying\b|\bscary\b|\bomg\b|\bnightmare\b/i },
  { label: "Completion goal", re: /\ball the\b|\bevery\b|\b100%/i },
  { label: "Tutorial / how-to", re: /\bhow to\b|\btutorial\b|\bguide\b|\bsetup\b/i },
  { label: "Review / ranking", re: /\breview\b|\branked\b|\btier list\b|\bvs\.?\b/i },
  { label: "Short", re: /#shorts?\b/i },
];

function wordRe(term: string): RegExp {
  return new RegExp(`(^|[^a-z0-9])${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}s?(?=$|[^a-z0-9])`, "i");
}

const SUBJECT_RULES = SUBJECTS.map((s) => ({ id: s.id, terms: s.keywords.map((k) => ({ k, re: wordRe(k) })) }));

export function readVideo(v: Video): VideoReading {
  const title = v.title;
  const text = `${v.title}\n${v.description}`;
  const subjects: VideoReading["subjects"] = [];
  for (const rule of SUBJECT_RULES) {
    const titleHit = rule.terms.find((t) => t.re.test(title));
    const hit = titleHit ?? rule.terms.find((t) => t.re.test(text));
    if (hit) subjects.push({ id: rule.id, label: subjectLabel(rule.id), because: `${titleHit ? "title" : "description"} contains "${hit.k}"` });
  }
  const formats: Evidence[] = [];
  for (const f of FORMAT_RULES) {
    const m = f.re.exec(title);
    if (m) formats.push({ label: f.label, because: `title contains "${m[0].trim()}"` });
  }
  if (v.durationSeconds !== null && v.durationSeconds <= 60 && !formats.some((f) => f.label === "Short")) {
    formats.push({ label: "Short", because: `duration is ${v.durationSeconds}s` });
  }
  if (v.userCategory) subjects.push({ id: `user:${v.userCategory}`, label: v.userCategory, because: "your own category" });
  if (v.userFormat) formats.push({ label: v.userFormat, because: "your own format label" });
  return { videoId: v.id, subjects, formats };
}

export interface ChannelSummary {
  videoCount: number;
  datedCount: number;
  firstUpload: string | null;
  lastUpload: string | null;
  gapDays: number | null;
  medianDurationSeconds: number | null;
  subjects: { id: string; label: string; count: number; videoIds: string[] }[];
  formats: { label: string; count: number; videoIds: string[] }[];
  byYear: { year: string; count: number; topSubjects: string[] }[];
  metricCoverage: { metric: string; source: string; videos: number }[];
  readings: Map<string, VideoReading>;
}

export function summarizeChannel(videos: Video[], metrics: VideoMetric[], now: Date = new Date()): ChannelSummary {
  const readings = new Map(videos.map((v) => [v.id, readVideo(v)]));
  const subj = new Map<string, { id: string; label: string; videoIds: string[] }>();
  const fmt = new Map<string, string[]>();
  const years = new Map<string, { count: number; subjects: Map<string, number> }>();
  for (const v of videos) {
    const r = readings.get(v.id);
    if (!r) continue;
    for (const s of r.subjects) {
      const cur = subj.get(s.id) ?? { id: s.id, label: s.label, videoIds: [] };
      cur.videoIds.push(v.id);
      subj.set(s.id, cur);
    }
    for (const f of r.formats) fmt.set(f.label, [...(fmt.get(f.label) ?? []), v.id]);
    if (v.publishedAt) {
      const y = v.publishedAt.slice(0, 4);
      const e = years.get(y) ?? { count: 0, subjects: new Map() };
      e.count++;
      for (const s of r.subjects) e.subjects.set(s.label, (e.subjects.get(s.label) ?? 0) + 1);
      years.set(y, e);
    }
  }
  const dated = videos.filter((v) => v.publishedAt).map((v) => v.publishedAt as string).sort();
  const durations = videos.map((v) => v.durationSeconds).filter((d): d is number => d !== null).sort((a, b) => a - b);
  const median = durations.length ? (durations[Math.floor((durations.length - 1) / 2)] ?? null) : null;
  const coverage = new Map<string, Set<string>>();
  for (const m of metrics) {
    const k = `${m.metric}|${m.source}`;
    const set = coverage.get(k) ?? new Set();
    set.add(m.videoId);
    coverage.set(k, set);
  }
  const last = dated[dated.length - 1] ?? null;
  return {
    videoCount: videos.length,
    datedCount: dated.length,
    firstUpload: dated[0] ?? null,
    lastUpload: last,
    gapDays: last ? Math.floor((now.getTime() - Date.parse(last)) / 86_400_000) : null,
    medianDurationSeconds: median,
    subjects: [...subj.values()].map((s) => ({ ...s, count: s.videoIds.length })).sort((a, b) => b.count - a.count),
    formats: [...fmt.entries()].map(([label, ids]) => ({ label, count: ids.length, videoIds: ids })).sort((a, b) => b.count - a.count),
    byYear: [...years.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([year, e]) => ({
        year,
        count: e.count,
        topSubjects: [...e.subjects.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([l]) => l),
      })),
    metricCoverage: [...coverage.entries()].map(([k, set]) => {
      const [metric = "", source = ""] = k.split("|");
      return { metric, source, videos: set.size };
    }),
    readings,
  };
}

const FLAG_WEIGHT: Record<FeedbackFlag, number> = {
  loved_making: 2,
  enjoyed_recording: 1,
  enjoyed_editing: 1,
  proud: 1,
  would_repeat: 1.5,
  no_repeat: -2,
  exhausting: -1.5,
  concept_not_execution: 0.5,
};

/** Turns the creator's own feelings about past videos into subject scores for the Idea Advisor. */
export function satisfactionBySubject(videos: Video[], feedback: VideoFeedback[]): Map<string, number> {
  const byVideo = new Map(feedback.map((f) => [f.videoId, f]));
  const totals = new Map<string, { sum: number; n: number }>();
  for (const v of videos) {
    const fb = byVideo.get(v.id);
    if (!fb) continue;
    let score = fb.flags.reduce((s, f) => s + (FLAG_WEIGHT[f] ?? 0), 0);
    if (fb.enjoyOverall !== null) score += (fb.enjoyOverall - 3) * 0.75;
    if (score === 0) continue;
    for (const s of readVideo(v).subjects) {
      if (s.id.startsWith("user:")) continue;
      const t = totals.get(s.id) ?? { sum: 0, n: 0 };
      t.sum += score;
      t.n++;
      totals.set(s.id, t);
    }
  }
  const out = new Map<string, number>();
  for (const [k, t] of totals) out.set(k, Math.max(-3, Math.min(3, t.sum / t.n)));
  return out;
}
