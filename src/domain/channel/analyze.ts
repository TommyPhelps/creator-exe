// Keyword-based reading of the channel archive. This is deliberately simple
// and transparent: every label carries the exact words that produced it, so
// it is evidence ("title contains 'Minecraft'"), not an AI judgement.

import type { FeedbackFlag, Video, VideoFeedback, VideoMetric } from "../types.ts";
import { SUBJECTS, subjectLabel } from "../ideas/subjects.ts";

export interface Evidence {
  label: string;
  because: string;
}

export type Confidence = "high" | "medium" | "low";

export interface VideoReading {
  videoId: string;
  subjects: (Evidence & { id: string; confidence: Confidence })[];
  formats: Evidence[];
  /** No topic with at least medium confidence: shown as "Unknown" instead of guessing. */
  unknown: boolean;
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
  // A keyword must stand alone: not part of a word, a domain name (twitch.tv) or a path.
  return new RegExp(`(^|[^a-z0-9./@#_-])${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}s?(?=$|[^a-z0-9_])`, "i");
}

const SUBJECT_RULES = SUBJECTS.map((s) => ({
  id: s.id,
  strong: s.keywords.map((k) => ({ k, re: wordRe(k) })),
  weak: (s.weak ?? []).map((k) => ({ k, re: wordRe(k) })),
}));

const URL_RE = /\bhttps?:\/\/\S+|\bwww\.\S+|\b[\w-]+(?:\.[\w-]+)*\.(?:com|tv|gg|net|org|io|co|me|ly|be|link)\b\S*/gi;

const lineKey = (l: string) => l.toLowerCase().replace(URL_RE, "").replace(/\s+/g, " ").trim();

/** Description lines repeated across most videos (sign-offs, social links, music credits). */
export function channelBoilerplate(videos: Pick<Video, "description">[]): Set<string> {
  const out = new Set<string>();
  if (videos.length < 3) return out;
  const counts = new Map<string, number>();
  for (const v of videos) {
    const seen = new Set(v.description.split(/\r?\n/).map(lineKey).filter((l) => l.length > 2));
    for (const l of seen) counts.set(l, (counts.get(l) ?? 0) + 1);
  }
  for (const [l, n] of counts) if (n >= Math.max(3, Math.ceil(videos.length * 0.5))) out.add(l);
  return out;
}

/** The description with links and channel-wide boilerplate removed: what's left is about this video. */
export function cleanDescription(description: string, boilerplate: Set<string> = new Set()): string {
  return description
    .split(/\r?\n/)
    .filter((l) => !boilerplate.has(lineKey(l)))
    .join("\n")
    .replace(URL_RE, " ");
}

/**
 * Reads a video's topics from its title and description. Titles are strong
 * evidence; descriptions only count after links and boilerplate are removed,
 * generic words ("tv", "music") count only in titles, and a single
 * description hit is marked low confidence (shown, but not counted).
 */
export function readVideo(v: Video, opts: { boilerplate?: Set<string> } = {}): VideoReading {
  const title = v.title;
  const desc = cleanDescription(v.description, opts.boilerplate);
  const subjects: VideoReading["subjects"] = [];
  if (v.userSubjects?.length) {
    for (const id of v.userSubjects) subjects.push({ id, label: subjectLabel(id), because: "you set this topic", confidence: "high" });
  } else {
    for (const rule of SUBJECT_RULES) {
      const titleHit = rule.strong.find((t) => t.re.test(title)) ?? rule.weak.find((t) => t.re.test(title));
      if (titleHit) {
        subjects.push({ id: rule.id, label: subjectLabel(rule.id), because: `title contains "${titleHit.k}"`, confidence: "high" });
        continue;
      }
      const descHits = rule.strong.filter((t) => t.re.test(desc));
      if (descHits.length >= 2) subjects.push({ id: rule.id, label: subjectLabel(rule.id), because: `description mentions "${descHits[0]?.k}" and "${descHits[1]?.k}"`, confidence: "medium" });
      else if (descHits.length === 1) subjects.push({ id: rule.id, label: subjectLabel(rule.id), because: `description mentions "${descHits[0]?.k}" once (weak evidence)`, confidence: "low" });
    }
  }
  const formats: Evidence[] = [];
  for (const f of FORMAT_RULES) {
    const m = f.re.exec(title);
    if (m) formats.push({ label: f.label, because: `title contains "${m[0].trim()}"` });
  }
  if (v.durationSeconds !== null && v.durationSeconds <= 60 && !formats.some((f) => f.label === "Short")) {
    formats.push({ label: "Short", because: `duration is ${v.durationSeconds}s` });
  }
  if (v.userCategory) subjects.push({ id: `user:${v.userCategory}`, label: v.userCategory, because: "your own category", confidence: "high" });
  if (v.userFormat) formats.push({ label: v.userFormat, because: "your own format label" });
  return { videoId: v.id, subjects, formats, unknown: !subjects.some((s) => s.confidence !== "low") };
}

export interface ChannelSummary {
  videoCount: number;
  datedCount: number;
  firstUpload: string | null;
  lastUpload: string | null;
  gapDays: number | null;
  medianDurationSeconds: number | null;
  subjects: { id: string; label: string; count: number; videoIds: string[] }[];
  /** Videos without a confident topic. */
  unknownIds: string[];
  formats: { label: string; count: number; videoIds: string[] }[];
  byYear: { year: string; count: number; topSubjects: string[] }[];
  metricCoverage: { metric: string; source: string; videos: number }[];
  readings: Map<string, VideoReading>;
}

export function summarizeChannel(videos: Video[], metrics: VideoMetric[], now: Date = new Date()): ChannelSummary {
  const boilerplate = channelBoilerplate(videos);
  const readings = new Map(videos.map((v) => [v.id, readVideo(v, { boilerplate })]));
  const subj = new Map<string, { id: string; label: string; videoIds: string[] }>();
  const fmt = new Map<string, string[]>();
  const years = new Map<string, { count: number; subjects: Map<string, number> }>();
  for (const v of videos) {
    const r = readings.get(v.id);
    if (!r) continue;
    for (const s of r.subjects) {
      if (s.confidence === "low") continue;
      const cur = subj.get(s.id) ?? { id: s.id, label: s.label, videoIds: [] };
      cur.videoIds.push(v.id);
      subj.set(s.id, cur);
    }
    for (const f of r.formats) fmt.set(f.label, [...(fmt.get(f.label) ?? []), v.id]);
    if (v.publishedAt) {
      const y = v.publishedAt.slice(0, 4);
      const e = years.get(y) ?? { count: 0, subjects: new Map() };
      e.count++;
      for (const s of r.subjects) if (s.confidence !== "low") e.subjects.set(s.label, (e.subjects.get(s.label) ?? 0) + 1);
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
    unknownIds: videos.filter((v) => readings.get(v.id)?.unknown).map((v) => v.id),
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
  const boilerplate = channelBoilerplate(videos);
  const totals = new Map<string, { sum: number; n: number }>();
  for (const v of videos) {
    const fb = byVideo.get(v.id);
    if (!fb) continue;
    let score = fb.flags.reduce((s, f) => s + (FLAG_WEIGHT[f] ?? 0), 0);
    if (fb.enjoyOverall !== null) score += (fb.enjoyOverall - 3) * 0.75;
    if (score === 0) continue;
    for (const s of readVideo(v, { boilerplate }).subjects) {
      if (s.id.startsWith("user:") || s.confidence === "low") continue;
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
