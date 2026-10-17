// Rule-based, explainable idea generation. No AI: concepts come from the
// curated library and are filtered, scored and diversified using the
// creator's controls, profile, channel history and past feedback. Every
// score change is recorded as a human-readable factor.

import { daysBetween, words } from "../../lib/util.ts";
import type {
  Collab,
  ContentFormat,
  Depth,
  Direction,
  Effort,
  Energy,
  IdeaDetails,
  IdeaFeedback,
  Reaction,
  RecordingStyle,
  TimeBox,
  TonightPlan,
} from "../types.ts";
import { IDEA_LIBRARY, type IdeaSeed } from "./library.ts";
import { adjacentTo, subjectLabel, subjectsForText } from "./subjects.ts";

export type InterestMode = "familiar" | "adjacent" | "new" | "surprise";
export type ContentFocus = "gaming-only" | "gaming-first" | "gaming-tech" | "variety" | "explore";
export type GenMode = "standard" | "tonight" | "zero-budget" | "deep-dive" | "one-off" | "series" | "random" | "curiosity";

export interface GeneratorControls {
  mode?: GenMode;
  contentFocus?: ContentFocus;
  interest?: InterestMode | null;
  energy?: Energy | null;
  time?: TimeBox | null;
  budgetUsd?: number | null;
  recording?: RecordingStyle | "mixed" | "anything" | null;
  size?: Effort | null;
  format?: ContentFormat | null;
  collab?: Collab | null;
  research?: Depth | null;
  direction?: Direction | null;
  curiosity?: string;
}

export interface CreatorContext {
  /** Subjects found in the creator's past uploads (keyword evidence). */
  familiarSubjects: Set<string>;
  favoriteSubjects: Set<string>;
  tiredSubjects: Set<string>;
  /** Free text from "current interest" profile entries. */
  currentInterests: string[];
  /** Terms the creator never wants suggested. */
  avoidTerms: string[];
  /** Profile notes about being on camera / using their voice. */
  onCameraNotes: string[];
  voiceoverNotes: string[];
  feedback: IdeaFeedback[];
  impressions: { ideaKey: string; shownAt: string }[];
  /** Library keys already saved, started or done. */
  takenKeys: Set<string>;
  /** Subject scores derived from how the creator felt about past videos. */
  satisfaction: Map<string, number>;
}

export function emptyContext(): CreatorContext {
  return {
    familiarSubjects: new Set(),
    favoriteSubjects: new Set(),
    tiredSubjects: new Set(),
    currentInterests: [],
    avoidTerms: [],
    onCameraNotes: [],
    voiceoverNotes: [],
    feedback: [],
    impressions: [],
    takenKeys: new Set(),
    satisfaction: new Map(),
  };
}

export type Level = "low" | "medium" | "high" | "unknown";

export interface Factor {
  text: string;
  effect: "plus" | "minus" | "note";
}

export interface IdeaRatings {
  enjoyment: Level;
  feasibility: Level;
  originality: Level;
  research: Level;
  audience: string;
  time: string;
}

export interface GeneratedIdea {
  key: string;
  seedKey: string;
  title: string;
  premise: string;
  subjects: string[];
  details: IdeaDetails;
  ratings: IdeaRatings;
  factors: Factor[];
  score: number;
}

export interface GenerationResult {
  ideas: GeneratedIdea[];
  relaxed: string[];
  notes: string[];
  poolSize: number;
}

// ------------------------------------------------------------ ordering helpers

const TIME_ORDER: TimeBox[] = ["30m", "1h", "afternoon", "day", "weekend", "long"];
const EFFORT_ORDER: Effort[] = ["tiny", "small", "medium", "ambitious"];
const ENERGY_ORDER: Energy[] = ["low", "medium", "high"];
const DEPTH_ORDER: Depth[] = ["light", "moderate", "deep"];
export const TIME_LABEL: Record<TimeBox, string> = {
  "30m": "About 30 minutes",
  "1h": "About an hour",
  afternoon: "An afternoon",
  day: "A full day",
  weekend: "A weekend",
  long: "Long-term project",
};

const rank = <T,>(order: T[], v: T) => order.indexOf(v);

// ------------------------------------------------------------ expansion

export interface Candidate {
  key: string;
  seed: IdeaSeed;
  variant: string | null;
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function expandLibrary(lib: IdeaSeed[] = IDEA_LIBRARY): Candidate[] {
  const out: Candidate[] = [];
  for (const seed of lib) {
    if (seed.variants && seed.variants.values.length) {
      for (const v of seed.variants.values) out.push({ key: `${seed.key}:${slugify(v)}`, seed, variant: v });
    } else out.push({ key: seed.key, seed, variant: null });
  }
  return out;
}

function fill(text: string, c: Candidate): string {
  if (!c.seed.variants || c.variant === null) return text;
  return text.split(`{${c.seed.variants.slot}}`).join(c.variant);
}

function derivedTonight(seed: IdeaSeed, c: Candidate): TonightPlan {
  return {
    needs: seed.requirements.map((r) => fill(r, c)),
    firstFive: fill(seed.firstStep, c),
    minimumVideo: `Keep it small: one focused part of the plan (${fill(seed.whatYouDo, c).split(/[,.;]/)[0]?.toLowerCase() ?? "the core idea"}) in under ten minutes.`,
    expansion: seed.alternatives?.[0] ? fill(seed.alternatives[0], c) : "Expand it later if you enjoyed making the short version.",
  };
}

export function materialize(c: Candidate, reasons: string[] = [], forTonight = false): { title: string; premise: string; details: IdeaDetails } {
  const s = c.seed;
  const tonight = s.tonight
    ? { needs: s.tonight.needs.map((n) => fill(n, c)), firstFive: fill(s.tonight.firstFive, c), minimumVideo: fill(s.tonight.minimumVideo, c), expansion: fill(s.tonight.expansion, c) }
    : forTonight
      ? derivedTonight(s, c)
      : null;
  return {
    title: fill(s.title, c),
    premise: fill(s.premise, c),
    details: {
      premise: fill(s.premise, c),
      why: fill(s.why, c),
      whatYouDo: fill(s.whatYouDo, c),
      worthExploring: fill(s.worthExploring, c),
      audience: fill(s.audience, c),
      requirements: s.requirements.map((r) => fill(r, c)),
      budgetUsd: s.budgetUsd,
      budgetNote: s.budgetNote ? fill(s.budgetNote, c) : s.budgetUsd === 0 ? "No purchase needed." : `Up to about $${s.budgetUsd}.`,
      effort: s.effort,
      time: s.time,
      energy: s.energy,
      recording: s.recording,
      format: s.format ?? "long",
      collab: s.collab ?? "solo",
      research: s.research,
      direction: s.direction,
      thumbnail: fill(s.thumbnail, c),
      firstStep: fill(s.firstStep, c),
      alternatives: (s.alternatives ?? []).map((a) => fill(a, c)),
      series: s.series ?? false,
      originality: s.originality ?? "uncommon",
      tonight,
      reasons,
    },
  };
}

// ------------------------------------------------------------ learning from feedback

const REACTION_WEIGHT: Record<Reaction, number> = {
  love: 1.5,
  save: 1,
  maybe: 0.3,
  not_interested: -1,
  too_similar: -0.6,
  too_expensive: 0,
  too_complicated: 0,
  not_in_mood: -0.2,
  already_done: 0,
};

/** How long a reaction blocks the exact same idea from coming back. */
const REACTION_BLOCK_DAYS: Partial<Record<Reaction, number>> = {
  already_done: Infinity,
  not_interested: 60,
  too_similar: 30,
  too_expensive: 45,
  too_complicated: 45,
  not_in_mood: 3,
};

/** Subject preferences learned from feedback, fading with a 45-day half-life so no taste is permanent. */
export function learnedSubjectWeights(feedback: IdeaFeedback[], now: Date = new Date()): Map<string, number> {
  const m = new Map<string, number>();
  for (const fb of feedback) {
    const w = REACTION_WEIGHT[fb.reaction] ?? 0;
    if (!w) continue;
    const age = Math.max(0, daysBetween(fb.createdAt, now));
    const decayed = w * Math.pow(0.5, age / 45);
    for (const s of fb.subjects) m.set(s, (m.get(s) ?? 0) + decayed);
  }
  for (const [k, v] of m) m.set(k, Math.max(-3, Math.min(3, v)));
  return m;
}

function blockedKeys(feedback: IdeaFeedback[], now: Date): Map<string, Reaction> {
  const out = new Map<string, Reaction>();
  for (const fb of feedback) {
    const days = REACTION_BLOCK_DAYS[fb.reaction];
    if (days === undefined) continue;
    if (daysBetween(fb.createdAt, now) <= days) out.set(fb.ideaKey, fb.reaction);
  }
  return out;
}

const negative = (notes: string[]) =>
  notes.some((n) => /\b(no|not|never|avoid|don't|dont|rather not|uncomfortable|hate)\b/i.test(n));

// A hard channel-topic boundary, distinct from personally enjoying a subject.
const GAMING = new Set(["video-games","game-history","nostalgic-games","game-mods","survival-games","horror-games","challenge-runs"]);
const TECH = new Set(["game-dev-tools","retro-computing","old-os","linux","strange-software","computer-history","tech-challenges"]);
export type IdeaDomain = "gaming" | "gaming-tech" | "other";
export function ideaDomain(subjects: string[]): IdeaDomain {
  if (subjects.some(s => GAMING.has(s))) return "gaming";
  if (subjects.some(s => TECH.has(s))) return "gaming-tech";
  return "other";
}
export function allowedByFocus(subjects: string[], focus: ContentFocus): boolean {
  const d = ideaDomain(subjects);
  if (focus === "gaming-only") return d === "gaming";
  if (focus === "gaming-first" || focus === "gaming-tech") return d !== "other";
  return true;
}
// ------------------------------------------------------------ main entry point

interface Scored {
  c: Candidate;
  score: number;
  factors: Factor[];
  enjoymentSignal: number | null;
}

export function generateIdeas(
  controls: GeneratorControls,
  ctx: CreatorContext,
  opts: { count?: number; rng?: () => number; library?: IdeaSeed[]; now?: Date } = {},
): GenerationResult {
  const count = opts.count ?? 3;
  const rng = opts.rng ?? Math.random;
  const now = opts.now ?? new Date();
  const mode: GenMode = controls.mode ?? "standard";
  const focus: ContentFocus = controls.contentFocus ?? "gaming-first";
  const all = expandLibrary(opts.library ?? IDEA_LIBRARY);
  const notes: string[] = [];
  const blocked = blockedKeys(ctx.feedback, now);
  const learned = learnedSubjectWeights(ctx.feedback, now);
  const known = new Set([...ctx.familiarSubjects, ...ctx.favoriteSubjects]);
  const adjacent = adjacentTo(known);
  const curiosityText = (controls.curiosity ?? "").trim();
  const curiositySubjects = new Set(subjectsForText([curiosityText, ...ctx.currentInterests].join(" ")));
  const curiosityWords = new Set(words(curiosityText).filter((w) => w.length > 3));
  const avoid = ctx.avoidTerms.map((t) => t.toLowerCase().trim()).filter(Boolean);
  const cameraShy = negative(ctx.onCameraNotes);
  const voiceShy = negative(ctx.voiceoverNotes);

  if ((controls.interest === "familiar" || controls.interest === "adjacent") && known.size === 0) {
    notes.push("There is no channel history or favorite subject yet, so Familiar and Adjacent cannot be personalized. Import your channel in Channel DNA or add favorite subjects in Creator Memory.");
  }
  if (mode === "curiosity" && !curiosityText && ctx.currentInterests.length === 0) {
    notes.push("Type something you are curious about to steer Personal Curiosity mode.");
  }

  // Hard filters that never relax: budget, time, avoid-list, blocked feedback, already taken.
  const budgetCap = mode === "zero-budget" ? 0 : controls.budgetUsd ?? null;
  const timeCap = mode === "tonight" ? (controls.time && rank(TIME_ORDER, controls.time) < rank(TIME_ORDER, "afternoon") ? controls.time : "afternoon") : controls.time ?? null;

  const base = all.filter((c) => {
    const s = c.seed;
    if (!allowedByFocus(c.seed.subjects, focus)) return false;
    if (ctx.takenKeys.has(c.key)) return false;
    if (blocked.has(c.key)) return false;
    if (budgetCap !== null && s.budgetUsd > budgetCap) return false;
    if (timeCap && rank(TIME_ORDER, s.time) > rank(TIME_ORDER, timeCap)) return false;
    if (mode === "series" && !s.series) return false;
    if (avoid.length) {
      const text = `${fill(s.title, c)} ${fill(s.premise, c)} ${s.subjects.map(subjectLabel).join(" ")}`.toLowerCase();
      if (avoid.some((a) => text.includes(a))) return false;
    }
    return true;
  });

  // Soft filters, relaxed in order if they leave too few ideas.
  type Soft = { name: string; test: (c: Candidate) => boolean };
  const soft: Soft[] = [];
  if (mode === "tonight") soft.push({ name: "small enough to start tonight", test: (c) => rank(EFFORT_ORDER, c.seed.effort) <= rank(EFFORT_ORDER, "small") });
  if (controls.size) soft.push({ name: "project size", test: (c) => rank(EFFORT_ORDER, c.seed.effort) <= rank(EFFORT_ORDER, controls.size as Effort) });
  if (controls.format && controls.format !== "either") {
    soft.push({ name: "content format", test: (c) => (c.seed.format ?? "long") === controls.format || (c.seed.format ?? "long") === "either" });
  }
  if (controls.collab && controls.collab !== "either") {
    soft.push({ name: "collaboration", test: (c) => (c.seed.collab ?? "solo") === controls.collab || (c.seed.collab ?? "solo") === "either" });
  }
  if (controls.recording && controls.recording !== "anything") {
    const r = controls.recording;
    soft.push({ name: "recording style", test: (c) => (r === "mixed" ? c.seed.recording.length > 1 : c.seed.recording.includes(r)) });
  }
  if (controls.energy) soft.push({ name: "energy level", test: (c) => rank(ENERGY_ORDER, c.seed.energy) <= rank(ENERGY_ORDER, controls.energy as Energy) });
  if (controls.research) soft.push({ name: "research depth", test: (c) => rank(DEPTH_ORDER, c.seed.research) <= rank(DEPTH_ORDER, controls.research as Depth) });

  let pool = base.filter((c) => soft.every((f) => f.test(c)));
  const relaxed: string[] = [];
  const active = [...soft];
  while (pool.length < count && active.length) {
    const dropped = active.pop();
    if (!dropped) break;
    relaxed.push(dropped.name);
    pool = base.filter((c) => active.every((f) => f.test(c)));
  }

  const recentShows = new Map<string, number[]>();
  const recentSeeds = new Set<string>();
  for (const imp of ctx.impressions) {
    const d = daysBetween(imp.shownAt, now);
    if (d > 14) continue;
    const arr = recentShows.get(imp.ideaKey) ?? [];
    arr.push(d);
    recentShows.set(imp.ideaKey, arr);
    if (d < 1) recentSeeds.add(imp.ideaKey.split(":")[0] ?? imp.ideaKey);
  }

  const scored: Scored[] = pool.map((c) => {
    const s = c.seed;
    const factors: Factor[] = [];
    let score = 0;
    let enjoy = 0;
    let enjoyEvidence = 0;
    const add = (n: number, text: string) => {
      score += n;
      factors.push({ text, effect: n > 0 ? "plus" : n < 0 ? "minus" : "note" });
    };

    // Personal taste.
    const fav = s.subjects.filter((x) => ctx.favoriteSubjects.has(x));
    if (fav.length) {
      add(Math.min(3, 2 * fav.length), `Matches your favorite subject${fav.length > 1 ? "s" : ""}: ${fav.map(subjectLabel).join(", ")}`);
      enjoy += 2;
      enjoyEvidence++;
    }
    const tired = s.subjects.filter((x) => ctx.tiredSubjects.has(x));
    if (tired.length) {
      add(-3 * tired.length, `Touches a subject you said you're tired of: ${tired.map(subjectLabel).join(", ")}`);
      enjoy -= 3;
      enjoyEvidence++;
    }
    const lw = s.subjects.map((x) => learned.get(x) ?? 0);
    const learnedAvg = lw.reduce((a, b) => a + b, 0) / Math.max(1, lw.length);
    if (Math.abs(learnedAvg) >= 0.25) {
      add(learnedAvg * 1.5, learnedAvg > 0 ? "Similar to ideas you reacted well to recently" : "Similar to ideas you passed on recently");
      enjoy += learnedAvg;
      enjoyEvidence++;
    }
    const sat = s.subjects.map((x) => ctx.satisfaction.get(x) ?? 0).filter((v) => v !== 0);
    if (sat.length) {
      const avg = sat.reduce((a, b) => a + b, 0) / sat.length;
      add(avg, avg > 0 ? "Related to past videos you enjoyed making" : "Related to past videos you did not enjoy making");
      enjoy += avg;
      enjoyEvidence++;
    }

    // Interest direction.
    const touchesKnown = s.subjects.some((x) => known.has(x));
    const primary = s.subjects[0] ?? "";
    switch (controls.interest) {
      case "familiar":
        if (known.size) {
          if (touchesKnown) add(3, `Familiar territory: ${s.subjects.filter((x) => known.has(x)).map(subjectLabel).join(", ")}`);
          else add(-4, "Outside the subjects you have covered before");
        }
        break;
      case "adjacent":
        if (known.size) {
          const adj = s.subjects.filter((x) => adjacent.has(x));
          if (adj.length && !known.has(primary)) add(3, `A step sideways from your past work into ${adj.map(subjectLabel).join(", ")}`);
          else if (adj.length) add(1, `Connects to ${adj.map(subjectLabel).join(", ")}`);
          else add(-3, touchesKnown ? "Too close to what you already made" : "Too far from your existing interests for Adjacent mode");
        }
        break;
      case "new":
        if (!touchesKnown && !s.subjects.some((x) => adjacent.has(x))) add(3, "Completely outside your previous content");
        else if (touchesKnown) add(-4, "Overlaps your past or favorite subjects");
        break;
      case "surprise":
        add(rng() * 3, "Surprise pick");
        if ((s.originality ?? "uncommon") === "rare") add(1.5, "An unusual concept you rarely see on YouTube");
        break;
      default:
        break;
    }

    // Curiosity.
    const curHits = s.subjects.filter((x) => curiositySubjects.has(x));
    if (curHits.length) add((mode === "curiosity" ? 5 : 2.5), `Connects to what you're curious about: ${curHits.map(subjectLabel).join(", ")}`);
    if (curiosityWords.size) {
      const text = new Set(words(`${fill(s.title, c)} ${fill(s.premise, c)}`));
      const overlap = [...curiosityWords].filter((w) => text.has(w));
      if (overlap.length) add(Math.min(3, overlap.length) * (mode === "curiosity" ? 2 : 1), `Mentions "${overlap.slice(0, 3).join('", "')}"`);
    }

    // Mode shaping.
    if (mode === "tonight") {
      if (s.tonight) add(2, "Has a ready-made first-five-minutes plan");
      if (s.energy === "low") add(1, "Low energy needed");
    }
    if (mode === "deep-dive") {
      if (s.research === "deep" || rank(EFFORT_ORDER, s.effort) >= 2) add(3, "Substantial enough for a deep dive");
      else add(-3, "Probably too light for a deep dive");
    }
    if (mode === "one-off") add(s.series ? -1 : 1.5, s.series ? "Works better as a series" : "Self-contained one-off video");
    if (mode === "series" && s.series) add(1, "Could become a recurring format");
    if (mode === "random") add(rng() * 8, "Random experiment");
    if (mode === "zero-budget") factors.push({ text: "No purchases needed", effect: "plus" });

    if (controls.direction) {
      if (s.direction.includes(controls.direction)) add(1.5, `Fits a ${controls.direction} direction`);
      else add(-0.5, `Not especially ${controls.direction}`);
    }
    if (controls.size && s.effort === controls.size) add(1, `Matches the ${controls.size} project size you asked for`);
    if (controls.research === "deep" && s.research === "deep") add(1, "Research-heavy, as requested");

    // Comfort.
    if (cameraShy && s.recording.length === 1 && s.recording[0] === "face") add(-3, "Requires being on camera, which you noted you'd rather avoid");
    else if (cameraShy && s.recording.includes("face")) factors.push({ text: "Can be done without showing your face", effect: "note" });
    if (voiceShy && s.recording.every((r) => r === "voiceover" || r === "face")) add(-2, "Depends heavily on your voice, which you noted you'd rather avoid");

    // Variety.
    const shows = recentShows.get(c.key);
    if (shows?.length) {
      const recent = shows.filter((d) => d < 1).length;
      add(-Math.min(6, recent * 3 + (shows.length - recent)), "Shown to you recently");
    } else if (recentSeeds.has(s.key)) {
      add(-2, "A variation of this was shown to you today");
    }

    // Small jitter so repeated runs feel different.
    score += rng() * 1.2;

    return { c, score, factors, enjoymentSignal: enjoyEvidence ? enjoy / enjoyEvidence : null };
  });

  scored.sort((a, b) => b.score - a.score);

  // Greedy diverse selection: never two variants of one concept, and
  // penalize subject overlap with ideas already chosen.
  const chosen: Scored[] = [];
  // Distribute occasional tech across batches, not one out of every three.
  const domains = new Map(all.map(c => [c.key, ideaDomain(c.seed.subjects)]));
  const prev = ctx.impressions.filter(i => daysBetween(i.shownAt, now) <= 30 && domains.has(i.ideaKey));
  let nGaming = prev.filter(i => domains.get(i.ideaKey) === "gaming").length;
  let nTotal = prev.length;
  const usedSeeds = new Set<string>();
  const remaining = [...scored];
  while (chosen.length < count && remaining.length) {
    let bestIdx = -1;
    let bestVal = -Infinity;
    const target = focus === "gaming-first" ? 0.85 : focus === "gaming-tech" ? 0.65 : null;
    const preferred = target === null ? null : nGaming < Math.ceil((nTotal + 1) * target) ? "gaming" : "gaming-tech";
    const hasPreferred = preferred !== null && remaining.some(r => !usedSeeds.has(r.c.seed.key) && ideaDomain(r.c.seed.subjects) === preferred);
    for (let i = 0; i < remaining.length; i++) {
      const r = remaining[i];
      if (!r || usedSeeds.has(r.c.seed.key)) continue;
      if (hasPreferred && ideaDomain(r.c.seed.subjects) !== preferred) continue;
      const overlap = chosen.reduce((n, ch) => n + r.c.seed.subjects.filter((x) => ch.c.seed.subjects.includes(x)).length, 0);
      const val = r.score - overlap * 2.5;
      if (val > bestVal) {
        bestVal = val;
        bestIdx = i;
      }
    }
    if (bestIdx < 0) break;
    const [pick] = remaining.splice(bestIdx, 1);
    if (!pick) break;
    chosen.push(pick);
    usedSeeds.add(pick.c.seed.key);
    if (ideaDomain(pick.c.seed.subjects) === "gaming") nGaming++;
    nTotal++;
  }

  const ideas = chosen.map((p): GeneratedIdea => {
    const s = p.c.seed;
    const reasons = p.factors.filter((f) => f.effect === "plus").map((f) => f.text);
    const m = materialize(p.c, reasons, mode === "tonight");
    const feas: Level = s.effort === "tiny" || s.effort === "small" ? "high" : s.effort === "medium" ? "medium" : "low";
    const enjoyment: Level = p.enjoymentSignal === null ? "unknown" : p.enjoymentSignal > 1 ? "high" : p.enjoymentSignal > -0.5 ? "medium" : "low";
    return {
      key: p.c.key,
      seedKey: s.key,
      title: m.title,
      premise: m.premise,
      subjects: s.subjects,
      details: m.details,
      ratings: {
        enjoyment,
        feasibility: controls.energy === "low" && s.energy === "high" ? "low" : feas,
        originality: s.originality === "rare" ? "high" : s.originality === "well-trodden" ? "low" : "medium",
        research: s.research === "deep" ? "high" : s.research === "moderate" ? "medium" : "low",
        audience: m.details.audience,
        time: TIME_LABEL[s.time],
      },
      factors: p.factors,
      score: p.score,
    };
  });

  if (!ideas.length) notes.push("No ideas match these limits and your Content Focus. Try adjusting time or budget; the chosen channel focus is not silently ignored.");
  return { ideas, relaxed, notes, poolSize: pool.length };
}
