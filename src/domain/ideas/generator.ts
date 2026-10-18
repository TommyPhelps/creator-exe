// Rule-based, explainable idea generation. No AI: concepts come from the
// curated library and are filtered, scored and diversified using the
// creator's controls, Content Focus, profile, game library, channel history
// and past feedback. Every score change is recorded as a readable factor.
//
// Order of operations (so modes and filters compose predictably):
// 1. Expand the library into concrete candidates (concept x game).
// 2. Hard gates that never relax: Content Focus domains, budget and
//    no-purchase rules, time cap, avoid-list, blocked feedback, taken ideas.
// 3. Soft filters (genre, era, style, recording...) relaxed one at a time,
//    and only ever within the gates above.
// 4. Scoring: taste, interest direction, mode shaping, variety.
// 5. Slots are assigned to domains to follow the focus over several batches,
//    then filled greedily with a diversity check (no repeated concept, game
//    or video type in one batch).

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
import { IDEA_LIBRARY, type IdeaSeed, type SeedDetail } from "./library.ts";
import { FOCUS_GAMES, HAND_DETAILS } from "./libraryGames.ts";
import { adjacentTo, subjectDomain, subjectLabel, subjectsForText, type Domain } from "./subjects.ts";
import { DEFAULT_FOCUS, allocateDomains, isExploring, presetFocus, share, type ContentFocus } from "./focus.ts";
import { videoTypeLabel, videoTypeStyle, type VideoType } from "./videoTypes.ts";
import { canon, catalogNames, findCatalogGame, type CatalogGame, type Era } from "../games/catalog.ts";
import { accessFor, accessLabel, indexLibrary, noPurchaseNeeded, type AccessStatus, type LibraryIndex } from "../games/library.ts";

export type InterestMode = "familiar" | "adjacent" | "new" | "surprise";
export type GenMode = "standard" | "tonight" | "zero-budget" | "deep-dive" | "one-off" | "series" | "random" | "curiosity";

export interface GeneratorControls {
  mode?: GenMode;
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
  /** Gaming genres (subject IDs) to stay within. */
  genres?: string[] | null;
  familiarity?: "known" | "unfamiliar" | null;
  /** free = only free games; owned = games you own or free ones; buy = willing to buy. */
  access?: "free" | "owned" | "buy" | null;
  era?: Era | null;
  angle?: "game" | "history" | null;
  style?: "gameplay" | "commentary" | null;
  shape?: "one-off" | "series" | null;
  /** Game names to use as inspiration. */
  inspiration?: string[] | null;
  /** One-off "Explore outside my niche" for this batch only. */
  explore?: boolean;
}

export interface CreatorContext {
  /** Subjects found in the creator's past uploads (keyword evidence, medium confidence or better). */
  familiarSubjects: Set<string>;
  /** Channel-scope favorite subjects (personal interests are kept out on purpose). */
  favoriteSubjects: Set<string>;
  tiredSubjects: Set<string>;
  /** Free text from channel-scope "current interest" entries. */
  currentInterests: string[];
  /** Canonical names of games you said you like (channel scope). */
  favoriteGames: Set<string>;
  /** Terms the creator never wants suggested. */
  avoidTerms: string[];
  onCameraNotes: string[];
  voiceoverNotes: string[];
  feedback: IdeaFeedback[];
  impressions: { ideaKey: string; shownAt: string }[];
  /** Library keys already saved, started or done. */
  takenKeys: Set<string>;
  /** Subject scores derived from how the creator felt about past videos. */
  satisfaction: Map<string, number>;
  /** Your imported game library (empty when nothing was imported). */
  library: LibraryIndex;
  /** Canonical names of library games you've actually spent time with or rated highly. */
  playedGames: Set<string>;
}

export function emptyContext(): CreatorContext {
  return {
    familiarSubjects: new Set(),
    favoriteSubjects: new Set(),
    tiredSubjects: new Set(),
    currentInterests: [],
    favoriteGames: new Set(),
    avoidTerms: [],
    onCameraNotes: [],
    voiceoverNotes: [],
    feedback: [],
    impressions: [],
    takenKeys: new Set(),
    satisfaction: new Map(),
    library: indexLibrary([]),
    playedGames: new Set(),
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
  domain: Domain;
  videoType: VideoType;
  /** Display names of the game(s) involved, if any. */
  games: string[];
  era: Era | null;
  access: AccessStatus;
  /** Set when this slot was the batch's deliberate "something new". */
  novelty: boolean;
}

export interface GenerationResult {
  ideas: GeneratedIdea[];
  relaxed: string[];
  notes: string[];
  poolSize: number;
  focus: ContentFocus;
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
  /** Catalog entries (or bare names) of the games this idea needs. */
  gameNames: string[];
  catalog: (CatalogGame | null)[];
  subjects: string[];
  domain: Domain;
  videoType: VideoType;
  era: Era | null;
  /** Hand-written specifics: the seed's own (game-specific ideas) or HAND_DETAILS for a template variant. */
  hand: SeedDetail | null;
  /** Kept so old feedback still resolves, but no longer suggested (see libraryGames.ts). */
  retired: boolean;
}

/** Template ideas a hand-written game idea now covers. */
const SUPERSEDED = new Set(["every-way-one-level:deus-ex", "mechanic-tested:thief-s-light-and-sound-stealth", "mechanic-tested:morrowind-s-alchemy", "npc-directions:morrowind", "map-by-hand:morrowind"]);
const FOCUS = new Set(FOCUS_GAMES.map((t) => canon(t)));
/** Whole concepts no longer suggested (v0.1.2): "Is X an overlooked classic?" and "Is X still worth playing?" formats. */
const RETIRED_SEEDS = new Set(["overlooked-pc-game", "free-classic-tested"]);

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function deriveDomain(seed: IdeaSeed): Domain {
  if (seed.domain) return seed.domain;
  const ds = seed.subjects.map(subjectDomain);
  if (ds.includes("gaming")) return "gaming";
  if (ds.includes("gaming-tech")) return "gaming-tech";
  return "other";
}

function candidateFor(seed: IdeaSeed, variant: string | null): Candidate {
  let gameNames: string[] = [];
  if (variant !== null && seed.variants?.gamesFor?.[variant]) gameNames = seed.variants.gamesFor[variant] ?? [];
  else if (variant !== null && seed.variants?.games) gameNames = [variant];
  else if (seed.games?.length) gameNames = seed.games;
  else if (seed.game) gameNames = [seed.game];
  const catalog = gameNames.map((n) => findCatalogGame(n));
  const subjects = [...new Set([...seed.subjects, ...catalog.flatMap((c) => c?.genres ?? [])])];
  const era = catalog.find((c) => c)?.era ?? null;
  const key = variant === null ? seed.key : `${seed.key}:${slugify(variant)}`;
  const own = seed.hook || seed.approaches || seed.moments ? seed : null;
  const hand: SeedDetail | null = HAND_DETAILS[key] ?? own;
  const names = catalog.map((c, i) => c?.title ?? gameNames[i] ?? "");
  // A template that slots in one of the focus games, with nothing written for that game: retire it.
  const genericFocus = !hand && variant !== null && names.length === 1 && FOCUS.has(canon(names[0] ?? ""));
  return {
    key,
    hand,
    retired: SUPERSEDED.has(key) || RETIRED_SEEDS.has(seed.key) || genericFocus,
    seed,
    variant,
    gameNames: names,
    catalog,
    subjects,
    domain: deriveDomain(seed),
    videoType: seed.videoType ?? "general",
    era,
  };
}

export function expandLibrary(lib: IdeaSeed[] = IDEA_LIBRARY): Candidate[] {
  const out: Candidate[] = [];
  for (const seed of lib) {
    if (seed.variants && seed.variants.values.length) {
      for (const v of seed.variants.values) out.push(candidateFor(seed, v));
    } else out.push(candidateFor(seed, null));
  }
  return out;
}

let CANDIDATE_INDEX: Map<string, Candidate> | null = null;
/** Looks up a candidate by idea key in the built-in library (used to learn from older feedback). */
export function candidateByKey(key: string): Candidate | null {
  if (!CANDIDATE_INDEX) CANDIDATE_INDEX = new Map(expandLibrary().map((c) => [c.key, c]));
  return CANDIDATE_INDEX.get(key) ?? null;
}

/** Content domain of an idea key; unknown keys (old or custom ideas) count as "other". */
export function domainOfKey(key: string): Domain {
  return candidateByKey(key)?.domain ?? "other";
}

function fill(text: string, c: Candidate): string {
  if (!c.seed.variants || c.variant === null) return text;
  return text.split(`{${c.seed.variants.slot}}`).join(c.variant);
}

function derivedTonight(seed: IdeaSeed, c: Candidate): TonightPlan {
  return {
    needs: seed.requirements.map((r) => fill(r, c)),
    firstFive: fill(seed.firstStep, c),
    // No made-up "smallest video" text: only hand-written plans fill these.
    minimumVideo: "",
    expansion: seed.alternatives?.[0] ? fill(seed.alternatives[0], c) : "",
  };
}

function accessOf(c: Candidate, lib: LibraryIndex): AccessStatus {
  if (c.seed.ownedByDefinition) return { kind: "owned", via: "yours" };
  if (!c.gameNames.length) return { kind: "none" };
  const all = c.gameNames.map((n) => accessFor(n, lib));
  const worst = (k: AccessStatus["kind"]) => all.find((a) => a.kind === k);
  return worst("not_owned") ?? worst("unknown") ?? worst("owned") ?? worst("free") ?? { kind: "none" };
}

export function materialize(c: Candidate, reasons: string[] = [], forTonight = false, access: AccessStatus = { kind: "none" }): { title: string; premise: string; details: IdeaDetails } {
  // Hand-written specifics win over the template's generic text.
  const s: IdeaSeed = { ...c.seed, ...(c.hand ?? {}) };
  const f = (t: string) => fill(t, c);
  const tonight = s.tonight
    ? { needs: s.tonight.needs.map(f), firstFive: f(s.tonight.firstFive), minimumVideo: f(s.tonight.minimumVideo), expansion: f(s.tonight.expansion) }
    : forTonight
      ? derivedTonight(s, c)
      : null;
  const budgetNote = s.budgetNote ? f(s.budgetNote) : s.budgetUsd === 0 ? (c.gameNames.length ? "Nothing to buy besides the game itself (see ownership)." : "No purchase needed.") : `Up to about $${s.budgetUsd}.`;
  const specific = !!c.hand;
  return {
    title: f(s.title),
    premise: f(s.premise),
    details: {
      premise: f(s.premise),
      why: f(s.why),
      whatYouDo: f(s.whatYouDo),
      worthExploring: f(s.worthExploring),
      audience: f(s.audience),
      requirements: s.requirements.map(f),
      budgetUsd: s.budgetUsd,
      budgetNote,
      effort: s.effort,
      time: s.time,
      energy: s.energy,
      recording: s.recording,
      format: s.format ?? "long",
      collab: s.collab ?? "solo",
      research: s.research,
      direction: s.direction,
      thumbnail: f(s.thumbnail),
      firstStep: f(s.firstStep),
      alternatives: (s.alternatives ?? []).map(f),
      series: s.series ?? false,
      originality: s.originality ?? "uncommon",
      tonight,
      reasons,
      videoType: c.videoType,
      domain: c.domain,
      games: c.gameNames,
      access: accessLabel(access),
      ...(s.hook ? { hook: f(s.hook) } : {}),
      ...(s.watchAppeal ? { watchAppeal: f(s.watchAppeal) } : {}),
      ...(s.approaches?.length ? { approaches: s.approaches.map((a) => ({ name: f(a.name), how: f(a.how) })) } : {}),
      ...(s.startingSituation ? { startingSituation: f(s.startingSituation) } : {}),
      ...(s.moments?.length ? { moments: s.moments.map(f) } : {}),
      ...(s.visualBeats?.length ? { visualBeats: s.visualBeats.map(f) } : {}),
      ...(specific ? { specific } : {}),
    },
  };
}

// ------------------------------------------------------------ learning from feedback

interface Weights {
  subj?: number;
  game?: number;
  type?: number;
  seed?: number;
  /** Days for the signal to halve; default 45. */
  halfLife?: number;
}

/** What each reaction teaches. A liked game doesn't mean "this exact concept again", and vice versa. */
export const REACTION_WEIGHTS: Record<Reaction, Weights> = {
  love: { subj: 1, game: 0.8, type: 0.6 },
  save: { subj: 0.6, game: 0.4, type: 0.3 },
  maybe: { subj: 0.2 },
  not_interested: { seed: -2, subj: -0.4, type: -0.3 },
  too_similar: { seed: -1.5, type: -0.4 },
  too_expensive: {},
  too_complicated: {},
  not_in_mood: { seed: -0.3 },
  already_done: {},
  like_game: { game: 2, subj: 0.3 },
  like_format: { type: 2 },
  like_topic: { subj: 1.2, game: 0.8, seed: -1 },
  more_like: { subj: 0.8, type: 0.8, game: 0.3 },
  less_like: { seed: -1.5, type: -0.5, subj: -0.3 },
  not_this_type: { type: -2.5, halfLife: 120 },
};

/** How long a reaction blocks the exact same idea from coming back. */
const REACTION_BLOCK_DAYS: Partial<Record<Reaction, number>> = {
  already_done: Infinity,
  not_interested: 60,
  too_similar: 30,
  too_expensive: 45,
  too_complicated: 45,
  not_in_mood: 3,
  less_like: 21,
  like_topic: 30,
  not_this_type: 120,
};

export interface Learned {
  subjects: Map<string, number>;
  games: Map<string, number>;
  types: Map<string, number>;
  seeds: Map<string, number>;
}

const clampMap = (m: Map<string, number>) => {
  for (const [k, v] of m) m.set(k, Math.max(-3, Math.min(3, v)));
  return m;
};

/** Preferences learned from feedback. Everything fades over time so no taste becomes permanent. */
export function learnFromFeedback(feedback: IdeaFeedback[], now: Date = new Date()): Learned {
  const out: Learned = { subjects: new Map(), games: new Map(), types: new Map(), seeds: new Map() };
  const bump = (m: Map<string, number>, k: string | undefined, v: number) => {
    if (k) m.set(k, (m.get(k) ?? 0) + v);
  };
  for (const fb of feedback) {
    const w = REACTION_WEIGHTS[fb.reaction];
    if (!w) continue;
    const age = Math.max(0, daysBetween(fb.createdAt, now));
    const decay = Math.pow(0.5, age / (w.halfLife ?? 45));
    const c = candidateByKey(fb.ideaKey);
    const det = fb.detail ?? {};
    const seedKey = det.seedKey ?? c?.seed.key ?? fb.ideaKey.split(":")[0];
    const type = det.videoType ?? c?.videoType;
    const games = (det.games ?? c?.gameNames ?? []).map(canon);
    if (w.subj) for (const s of fb.subjects) bump(out.subjects, s, w.subj * decay);
    if (w.game) for (const g of games) bump(out.games, g, w.game * decay);
    if (w.type) bump(out.types, type, w.type * decay);
    if (w.seed) bump(out.seeds, seedKey, w.seed * decay);
  }
  clampMap(out.subjects);
  clampMap(out.games);
  clampMap(out.types);
  clampMap(out.seeds);
  return out;
}

/** Back-compat helper: subject weights only. */
export function learnedSubjectWeights(feedback: IdeaFeedback[], now: Date = new Date()): Map<string, number> {
  return learnFromFeedback(feedback, now).subjects;
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

// ------------------------------------------------------------ main entry point

interface Scored {
  c: Candidate;
  access: AccessStatus;
  score: number;
  factors: Factor[];
  enjoymentSignal: number | null;
  novelty: boolean;
}

export interface GenerateOptions {
  count?: number;
  rng?: () => number;
  library?: IdeaSeed[];
  now?: Date;
  focus?: ContentFocus;
  /** "More like this": an idea to find relatives of (different game or concept). */
  likeThis?: { key: string; seedKey: string; videoType: string; subjects: string[]; games: string[] } | null;
}

export function generateIdeas(controls: GeneratorControls, ctx: CreatorContext, opts: GenerateOptions = {}): GenerationResult {
  const count = opts.count ?? 3;
  const rng = opts.rng ?? Math.random;
  const now = opts.now ?? new Date();
  const mode: GenMode = controls.mode ?? "standard";
  const focus: ContentFocus = controls.explore ? presetFocus("explore") : (opts.focus ?? DEFAULT_FOCUS);
  const all = expandLibrary(opts.library ?? IDEA_LIBRARY).filter((c) => !c.retired);
  const notes: string[] = [];
  const blocked = blockedKeys(ctx.feedback, now);
  const learned = learnFromFeedback(ctx.feedback, now);
  const lib = ctx.library;
  const libraryImported = lib.size > 0;

  // What "known" means for Familiar / Adjacent / New: your channel interests,
  // your past videos, and games you like or have played.
  const knownGames = new Set([...ctx.favoriteGames, ...ctx.playedGames]);
  const knownSubjects = new Set([...ctx.familiarSubjects, ...ctx.favoriteSubjects]);
  for (const name of ctx.favoriteGames) for (const s of findCatalogGame(name)?.genres ?? []) knownSubjects.add(s);
  const adjacent = adjacentTo(knownSubjects);
  const inspiration = (controls.inspiration ?? []).map((n) => n.trim()).filter(Boolean);
  const inspirationCanon = new Set(inspiration.flatMap((n) => {
    const cat = findCatalogGame(n);
    return cat ? catalogNames(cat) : [canon(n)];
  }));
  const inspirationGenres = new Set(inspiration.flatMap((n) => findCatalogGame(n)?.genres ?? []));
  const curiosityText = (controls.curiosity ?? "").trim();
  const curiositySubjects = new Set(subjectsForText([curiosityText, ...ctx.currentInterests].join(" ")));
  const curiosityWords = new Set(words(curiosityText).filter((w) => w.length > 3));
  const avoid = ctx.avoidTerms.map((t) => t.toLowerCase().trim()).filter(Boolean);
  const cameraShy = negative(ctx.onCameraNotes);
  const voiceShy = negative(ctx.voiceoverNotes);
  const gameKnown = (c: Candidate) => c.catalog.some((cat, i) => {
    const names = cat ? catalogNames(cat) : [canon(c.gameNames[i] ?? "")];
    return names.some((n) => knownGames.has(n));
  });

  if ((controls.interest === "familiar" || controls.interest === "adjacent") && knownSubjects.size === 0 && knownGames.size === 0) {
    notes.push("Familiar and Adjacent need something to compare with. Add games you like in Creator Memory, Import your channel in Channel DNA, or import your game library.");
  }
  if (mode === "curiosity" && !curiosityText && ctx.currentInterests.length === 0) {
    notes.push("Type something you are curious about to steer Curiosity mode.");
  }

  // ---------------------------------------------------------------- 2. hard gates
  const zeroBudget = mode === "zero-budget" || controls.budgetUsd === 0;
  const budgetCap = zeroBudget ? 0 : (controls.budgetUsd ?? null);
  const timeCap = mode === "tonight" ? (controls.time && rank(TIME_ORDER, controls.time) < rank(TIME_ORDER, "afternoon") ? controls.time : "afternoon") : (controls.time ?? null);
  const accessRule = zeroBudget ? "owned" : (controls.access ?? null);
  let outsideFocus = 0;
  let needsPurchase = 0;
  const gated: { c: Candidate; access: AccessStatus }[] = [];
  for (const c of all) {
    const s = c.seed;
    if (share(focus, c.domain) <= 0) {
      outsideFocus++;
      continue;
    }
    if (ctx.takenKeys.has(c.key) || blocked.has(c.key)) continue;
    if (budgetCap !== null && s.budgetUsd > budgetCap) continue;
    if (timeCap && rank(TIME_ORDER, s.time) > rank(TIME_ORDER, timeCap)) continue;
    if (mode === "series" && !s.series) continue;
    const access = accessOf(c, lib);
    if (accessRule === "owned" && !noPurchaseNeeded(access)) {
      needsPurchase++;
      continue;
    }
    if (accessRule === "free" && !(access.kind === "none" || access.kind === "free")) {
      needsPurchase++;
      continue;
    }
    if (mode === "tonight" && access.kind === "not_owned") continue;
    if (avoid.length) {
      const text = `${fill(s.title, c)} ${fill(s.premise, c)} ${c.subjects.map(subjectLabel).join(" ")} ${c.gameNames.join(" ")}`.toLowerCase();
      if (avoid.some((a) => text.includes(a))) continue;
    }
    if (opts.likeThis) {
      if (c.key === opts.likeThis.key) continue;
      const sharesType = c.videoType === opts.likeThis.videoType;
      const sharesSubject = c.subjects.some((x) => opts.likeThis?.subjects.includes(x));
      if (!sharesType && !sharesSubject) continue;
    }
    gated.push({ c, access });
  }
  if (zeroBudget && needsPurchase && !libraryImported) {
    notes.push("Zero budget only shows free games and ideas that need no game. Import your game library (Creator Memory) to include games you already own.");
  }
  if (curiosityText && outsideFocus) {
    const outside = all.filter((c) => share(focus, c.domain) <= 0 && c.subjects.some((x) => curiositySubjects.has(x)));
    if (outside.length) notes.push(`Some ideas about "${curiosityText}" are outside your Content Focus. Use "Explore outside my niche" to see them.`);
  }

  // ---------------------------------------------------------------- 3. soft filters
  type Soft = { name: string; test: (c: Candidate) => boolean; keep: number };
  const soft: Soft[] = [];
  if (mode === "tonight") soft.push({ name: "small enough to start tonight", keep: 9, test: (c) => rank(EFFORT_ORDER, c.seed.effort) <= rank(EFFORT_ORDER, "small") });
  if (controls.size) soft.push({ name: "project size", keep: 8, test: (c) => rank(EFFORT_ORDER, c.seed.effort) <= rank(EFFORT_ORDER, controls.size as Effort) });
  if (controls.format && controls.format !== "either") {
    soft.push({ name: "content format", keep: 7, test: (c) => (c.seed.format ?? "long") === controls.format || (c.seed.format ?? "long") === "either" });
  }
  if (controls.collab && controls.collab !== "either") {
    soft.push({ name: "collaboration", keep: 1, test: (c) => (c.seed.collab ?? "solo") === controls.collab || (c.seed.collab ?? "solo") === "either" });
  }
  if (controls.recording && controls.recording !== "anything") {
    const r = controls.recording;
    soft.push({ name: "recording style", keep: 3, test: (c) => (r === "mixed" ? c.seed.recording.length > 1 : c.seed.recording.includes(r)) });
  }
  if (controls.energy) soft.push({ name: "energy level", keep: 2, test: (c) => rank(ENERGY_ORDER, c.seed.energy) <= rank(ENERGY_ORDER, controls.energy as Energy) });
  if (controls.research) soft.push({ name: "research depth", keep: 2, test: (c) => rank(DEPTH_ORDER, c.seed.research) <= rank(DEPTH_ORDER, controls.research as Depth) });
  if (controls.shape) soft.push({ name: controls.shape === "series" ? "series potential" : "one-off", keep: 5, test: (c) => (controls.shape === "series" ? !!c.seed.series : !c.seed.series) });
  if (controls.style) soft.push({ name: "gameplay vs commentary", keep: 5, test: (c) => videoTypeStyle(c.videoType) === controls.style });
  if (controls.angle) soft.push({ name: "game vs history focus", keep: 4, test: (c) => (c.seed.angle ?? "game") === controls.angle });
  if (controls.era) soft.push({ name: "era", keep: 6, test: (c) => c.era === controls.era });
  if (controls.familiarity) soft.push({ name: "known vs unfamiliar games", keep: 6, test: (c) => (c.gameNames.length > 0) && (controls.familiarity === "known" ? gameKnown(c) || c.seed.ownedByDefinition === true : !gameKnown(c)) });
  if (controls.genres?.length) {
    const g = new Set(controls.genres);
    soft.push({ name: "genre", keep: 10, test: (c) => c.subjects.some((x) => g.has(x)) });
  }

  let pool = gated.filter((x) => soft.every((f) => f.test(x.c)));
  const relaxed: string[] = [];
  // Relax the least important filters first; your explicit genre choice is kept longest.
  const active = [...soft].sort((a, b) => b.keep - a.keep);
  while (pool.length < count && active.length) {
    const dropped = active.pop();
    if (!dropped) break;
    relaxed.push(dropped.name);
    pool = gated.filter((x) => active.every((f) => f.test(x.c)));
  }

  // ---------------------------------------------------------------- variety bookkeeping
  const recentKeys = new Map<string, number[]>();
  const recentSeeds = new Map<string, number>();
  const recentGames = new Map<string, number>();
  const recentTypes = new Map<string, number>();
  const recentDomains: Domain[] = [];
  for (const imp of ctx.impressions) {
    const d = daysBetween(imp.shownAt, now);
    if (d > 14) continue;
    if (recentDomains.length < 30) recentDomains.push(domainOfKey(imp.ideaKey));
    const arr = recentKeys.get(imp.ideaKey) ?? [];
    arr.push(d);
    recentKeys.set(imp.ideaKey, arr);
    if (d > 3) continue;
    const c = candidateByKey(imp.ideaKey);
    const sk = c?.seed.key ?? imp.ideaKey.split(":")[0] ?? imp.ideaKey;
    recentSeeds.set(sk, (recentSeeds.get(sk) ?? 0) + 1);
    if (c) {
      for (const g of c.gameNames) if (!findCatalogGame(g)?.generic) recentGames.set(canon(g), (recentGames.get(canon(g)) ?? 0) + 1);
      if (d < 1) recentTypes.set(c.videoType, (recentTypes.get(c.videoType) ?? 0) + 1);
    }
  }

  // ---------------------------------------------------------------- 4. scoring
  const scored: Scored[] = pool.map(({ c, access }) => {
    const s = c.seed;
    const factors: Factor[] = [];
    let score = 0;
    let enjoy = 0;
    let enjoyEvidence = 0;
    let learnedPlus = 0;
    const add = (n: number, text: string) => {
      score += n;
      factors.push({ text, effect: n > 0 ? "plus" : n < 0 ? "minus" : "note" });
    };
    const gameCanon = c.catalog.flatMap((cat, i) => (cat ? catalogNames(cat) : [canon(c.gameNames[i] ?? "")]));
    const mainGame = c.gameNames[0] ?? null;

    // Your taste (channel interests only).
    const fav = c.subjects.filter((x) => ctx.favoriteSubjects.has(x));
    if (fav.length) {
      add(Math.min(3, 1.5 * fav.length), `Matches what you want to make videos about: ${fav.slice(0, 3).map(subjectLabel).join(", ")}`);
      enjoy += 2;
      enjoyEvidence++;
    }
    const favGame = gameCanon.some((n) => ctx.favoriteGames.has(n));
    if (favGame && mainGame) {
      add(2.5, `${mainGame} is one of your favorite games`);
      enjoy += 2;
      enjoyEvidence++;
    }
    const tired = c.subjects.filter((x) => ctx.tiredSubjects.has(x));
    if (tired.length) {
      add(-3 * tired.length, `Touches something you're tired of: ${tired.map(subjectLabel).join(", ")}`);
      enjoy -= 3;
      enjoyEvidence++;
    }

    // Learned from your reactions (capped so feedback never crowds out novelty).
    const lw = c.subjects.map((x) => learned.subjects.get(x) ?? 0).filter((v) => v !== 0);
    const lAvg = lw.length ? lw.reduce((a, b) => a + b, 0) / lw.length : 0;
    const lGame = Math.max(0, ...gameCanon.map((n) => learned.games.get(n) ?? 0)) + Math.min(0, ...gameCanon.map((n) => learned.games.get(n) ?? 0));
    const lType = learned.types.get(c.videoType) ?? 0;
    const lSeed = learned.seeds.get(s.key) ?? 0;
    const learnedParts: [number, string, string][] = [
      [lAvg * 1.2, "Similar topics to ideas you reacted well to", "Similar topics to ideas you passed on"],
      [lGame * 1.2, `You said you like ${mainGame ?? "this game"}`, `You passed on ideas about ${mainGame ?? "this game"}`],
      [lType * 1.2, `You like ${videoTypeLabel(c.videoType).toLowerCase()} videos`, `You said you don't want ${videoTypeLabel(c.videoType).toLowerCase()} videos`],
      [lSeed * 1.5, "A concept you liked before", "A concept you asked to see less of"],
    ];
    for (const [v, plus, minus] of learnedParts) {
      if (Math.abs(v) < 0.3) continue;
      const capped = v > 0 ? Math.min(v, Math.max(0, 3 - learnedPlus)) : v;
      if (v > 0) learnedPlus += capped;
      if (Math.abs(capped) >= 0.3) add(capped, v > 0 ? plus : minus);
      enjoy += Math.max(-3, Math.min(3, v));
      enjoyEvidence++;
    }
    const sat = c.subjects.map((x) => ctx.satisfaction.get(x) ?? 0).filter((v) => v !== 0);
    if (sat.length) {
      const avg = sat.reduce((a, b) => a + b, 0) / sat.length;
      add(avg, avg > 0 ? "Related to past videos you enjoyed making" : "Related to past videos you did not enjoy making");
      enjoy += avg;
      enjoyEvidence++;
    }

    if (c.hand && c.gameNames.length) add(1, `Written specifically for ${mainGame}`);

    // Your games.
    if (access.kind === "owned" && access.via === "library") add(1, `${mainGame} is in your library`);
    if (access.kind === "free") add(0.5, "The game is free");
    if (access.kind === "not_owned" && controls.access !== "buy") add(-1, `You'd need to buy ${mainGame}`);
    if (inspirationCanon.size) {
      if (gameCanon.some((n) => inspirationCanon.has(n))) add(4, `Uses ${mainGame}, which you asked for`);
      else {
        const g = c.subjects.filter((x) => inspirationGenres.has(x));
        if (g.length) add(2, `Shares ${g.map(subjectLabel).slice(0, 2).join(", ")} with your inspiration games`);
      }
    }

    // Interest direction, always inside Content Focus.
    const known = gameKnown(c);
    const touchesKnown = c.subjects.some((x) => knownSubjects.has(x));
    const adj = c.subjects.filter((x) => adjacent.has(x));
    switch (controls.interest) {
      case "familiar":
        if (known) add(3, `A game you know: ${mainGame}`);
        else if (touchesKnown) add(2, `Familiar ground: ${c.subjects.filter((x) => knownSubjects.has(x)).slice(0, 2).map(subjectLabel).join(", ")}`);
        else if ((lType > 0)) add(1, "A kind of video you've liked");
        else add(-3, "Not a game or genre you know yet");
        break;
      case "adjacent":
        if (!known && adj.length) add(3, `Next door to your interests: ${adj.slice(0, 2).map(subjectLabel).join(", ")}`);
        else if (known && adj.length) add(0.5, `A new angle on ${mainGame}`);
        else if (touchesKnown && !known) add(1, "Related to games you like");
        else add(-2, known ? "Too close to what you already know" : "Too far from your interests for Adjacent");
        break;
      case "new":
        if (!known && !touchesKnown) add(3, mainGame ? `New to you: ${mainGame}` : "Something you haven't covered");
        else if (known) add(-4, "You already know this game");
        else add(-1, "Overlaps genres you already know");
        if ((s.originality ?? "uncommon") === "rare") add(1, "An unusual concept you rarely see on YouTube");
        break;
      case "surprise":
        add(rng() * 3, "Surprise pick");
        if ((s.originality ?? "uncommon") === "rare") add(1.5, "An unusual concept you rarely see on YouTube");
        break;
      default:
        break;
    }

    // Curiosity.
    const curHits = c.subjects.filter((x) => curiositySubjects.has(x));
    if (curHits.length) add(mode === "curiosity" ? 5 : 2.5, `Connects to what you're curious about: ${curHits.map(subjectLabel).join(", ")}`);
    if (curiosityWords.size) {
      const text = new Set(words(`${fill(s.title, c)} ${fill(s.premise, c)} ${c.gameNames.join(" ")}`));
      const overlap = [...curiosityWords].filter((w) => text.has(w));
      if (overlap.length) add(Math.min(3, overlap.length) * (mode === "curiosity" ? 2 : 1), `Mentions "${overlap.slice(0, 3).join('", "')}"`);
    }

    // Mode shaping.
    if (mode === "tonight") {
      if (s.tonight) add(2, "Has a ready-made first-five-minutes plan");
      if (s.energy === "low") add(1, "Low energy needed");
      if ((s.setup ?? "install") === "none") add(1.5, "Nothing to set up first");
      else if (s.setup === "mods" || s.setup === "hardware") add(-1.5, s.setup === "mods" ? "Needs mods installed first" : "Needs hardware set up first");
      if (access.kind === "unknown" && access.why === "no_library") add(-0.5, "Not sure you own the game");
    }
    if (mode === "deep-dive") {
      if (s.research === "deep" || rank(EFFORT_ORDER, s.effort) >= 2) add(3, "Substantial enough for a deep dive");
      else add(-3, "Probably too light for a deep dive");
    }
    if (mode === "one-off") add(s.series ? -1 : 1.5, s.series ? "Works better as a series" : "Self-contained one-off video");
    if (mode === "series" && s.series) add(1, "Could become a recurring format");
    if (mode === "random") add(rng() * 8, "Random pick");
    if (zeroBudget) factors.push({ text: "No purchases needed", effect: "plus" });

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

    // Variety: penalize repeats of the idea, the concept, the game and the video type.
    const shows = recentKeys.get(c.key);
    if (shows?.length) {
      const today = shows.filter((d) => d < 1).length;
      add(-Math.min(8, today * 4 + (shows.length - today)), "Shown to you recently");
    }
    const seedShows = recentSeeds.get(s.key) ?? 0;
    if (seedShows && !shows?.length) add(-Math.min(5, seedShows * 2), "A version of this concept was shown recently");
    const gameShows = Math.max(0, ...gameCanon.map((n) => recentGames.get(n) ?? 0));
    if (gameShows) add(-Math.min(4, gameShows * 1.5), `${mainGame} came up recently`);
    const typeShows = recentTypes.get(c.videoType) ?? 0;
    if (typeShows >= 2) add(-1, "Lots of this video type today");

    // Small jitter so repeated runs feel different.
    score += rng() * 1.2;
    return { c, access, score, factors, enjoymentSignal: enjoyEvidence ? enjoy / enjoyEvidence : null, novelty: false };
  });

  scored.sort((a, b) => b.score - a.score);

  // ---------------------------------------------------------------- 5. domain slots + diverse selection
  const available: Record<Domain, number> = { gaming: 0, "gaming-tech": 0, other: 0 };
  for (const x of scored) available[x.c.domain]++;
  const slots = allocateDomains(focus, count, recentDomains, available, rng);
  const chosen: Scored[] = [];
  const usedSeeds = new Set<string>();
  const usedGames = new Set<string>();
  const usedTypes = new Map<string, number>();
  const usedPrimary = new Map<string, number>();
  const typeCap = count <= 3 ? 1 : count <= 6 ? 2 : Infinity;
  const remaining = [...scored];
  const wantNovelty = count >= 3 && !opts.likeThis && !controls.interest && mode !== "random";

  const fits = (r: Scored) => {
    if (usedSeeds.has(r.c.seed.key)) return false;
    if (r.c.gameNames.some((g) => !findCatalogGame(g)?.generic && usedGames.has(canon(g)))) return false;
    if ((usedTypes.get(r.c.videoType) ?? 0) >= typeCap) return false;
    return true;
  };
  const pickFor = (domain: Domain | null, novelty: boolean): Scored | null => {
    let bestIdx = -1;
    let bestVal = -Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const r = remaining[i];
      if (!r || (domain && r.c.domain !== domain) || !fits(r)) continue;
      const overlap = chosen.reduce((n, ch) => n + r.c.subjects.filter((x) => ch.c.subjects.includes(x)).length, 0);
      const primary = r.c.subjects[0] ?? "";
      let val = r.score - overlap * 1.5 - (usedPrimary.get(primary) ?? 0) * 2;
      if (novelty) {
        const fresh = !gameKnown(r.c) && !r.c.subjects.some((x) => knownSubjects.has(x)) && !r.factors.some((f) => f.text.startsWith("Similar") || f.text.startsWith("You like"));
        val += fresh ? 3 : -2;
      }
      if (val > bestVal) {
        bestVal = val;
        bestIdx = i;
      }
    }
    if (bestIdx < 0) return null;
    const [pick] = remaining.splice(bestIdx, 1);
    return pick ?? null;
  };
  let fellBack = false;
  slots.forEach((domain, i) => {
    const novelty = wantNovelty && i === slots.length - 1;
    let pick = pickFor(domain, novelty);
    if (!pick) {
      // Not enough ideas in this domain: stay inside the focus, never outside it.
      pick = pickFor(null, novelty);
      if (pick) fellBack = true;
    }
    if (!pick) return;
    pick.novelty = novelty && !gameKnown(pick.c) && !pick.c.subjects.some((x) => knownSubjects.has(x));
    if (pick.novelty) pick.factors.push({ text: "Something new for you, to keep suggestions from narrowing", effect: "note" });
    chosen.push(pick);
    usedSeeds.add(pick.c.seed.key);
    for (const g of pick.c.gameNames) if (!findCatalogGame(g)?.generic) usedGames.add(canon(g));
    usedTypes.set(pick.c.videoType, (usedTypes.get(pick.c.videoType) ?? 0) + 1);
    const primary = pick.c.subjects[0] ?? "";
    usedPrimary.set(primary, (usedPrimary.get(primary) ?? 0) + 1);
  });
  if (fellBack) notes.push("Not enough ideas fit one part of your Content Focus with these filters, so the batch was filled from the other part you allow.");
  if (isExploring(focus)) notes.push(controls.explore ? "Exploring outside your niche for this batch: ideas outside gaming are included on purpose." : `Your Content Focus includes ${focus.other}% ideas outside gaming.`);

  const ideas = chosen.map((p): GeneratedIdea => {
    const s = p.c.seed;
    const reasons = p.factors.filter((f) => f.effect === "plus").map((f) => f.text);
    const m = materialize(p.c, reasons, mode === "tonight", p.access);
    const feas: Level = s.effort === "tiny" || s.effort === "small" ? "high" : s.effort === "medium" ? "medium" : "low";
    const enjoyment: Level = p.enjoymentSignal === null ? "unknown" : p.enjoymentSignal > 1 ? "high" : p.enjoymentSignal > -0.5 ? "medium" : "low";
    return {
      key: p.c.key,
      seedKey: s.key,
      title: m.title,
      premise: m.premise,
      subjects: p.c.subjects,
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
      domain: p.c.domain,
      videoType: p.c.videoType,
      games: p.c.gameNames,
      era: p.c.era,
      access: p.access,
      novelty: p.novelty,
    };
  });

  if (!ideas.length) notes.push(opts.likeThis ? "No close relatives of that idea are left right now. Try again after reacting to a few more ideas." : "Nothing fits those limits inside your Content Focus. Try fewer filters, a bigger budget, or more time.");
  return { ideas, relaxed, notes, poolSize: pool.length, focus };
}
