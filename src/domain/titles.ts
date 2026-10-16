// Title Lab: builds candidate titles only from facts the creator supplies,
// then checks them for clarity. Templates that need an outcome are only
// offered when an outcome has been entered, so no title invents an event.

export interface TitleSlots {
  /** The subject, e.g. "Windows 98". */
  topic: string;
  /** What you did or do, first person, e.g. "I used Windows 98 for a week". */
  did: string;
  /** Optional constraint, e.g. "for a week" or "with $5". */
  constraint: string;
  /** Optional, only if it really happened, e.g. "it fixed my old laptop". */
  outcome: string;
}

export const TITLE_STYLES = [
  "direct",
  "curious",
  "funny",
  "understated",
  "absurd",
  "nostalgic",
  "story",
  "experimental",
  "informative",
  "minimal",
] as const;
export type TitleStyle = (typeof TITLE_STYLES)[number];

interface Template {
  style: TitleStyle;
  needs: (keyof TitleSlots)[];
  build: (s: TitleSlots) => string;
}

const cap = (s: string) => (s ? s[0]!.toUpperCase() + s.slice(1) : s);
const lowerFirst = (s: string) => (s && !/^I\b/.test(s) && !/^[A-Z]{2}/.test(s) ? s[0]!.toLowerCase() + s.slice(1) : s);
const stripI = (did: string) => did.replace(/^I\s+/i, "");

const TEMPLATES: Template[] = [
  { style: "direct", needs: ["did"], build: (s) => cap(s.did) },
  { style: "direct", needs: ["topic", "did"], build: (s) => `${s.topic}: ${lowerFirst(stripI(s.did))}` },
  { style: "direct", needs: ["did", "outcome"], build: (s) => `${cap(s.did)}, and ${lowerFirst(s.outcome)}` },
  { style: "curious", needs: ["topic"], build: (s) => `What is ${s.topic} actually like?` },
  { style: "curious", needs: ["topic", "constraint"], build: (s) => `Can you survive on ${s.topic} ${s.constraint}?` },
  { style: "curious", needs: ["did"], build: (s) => `What happens when ${lowerFirst(s.did)}?` },
  { style: "funny", needs: ["did"], build: (s) => `${cap(s.did)} (nobody asked me to)` },
  { style: "funny", needs: ["topic"], build: (s) => `I have questions about ${s.topic}` },
  { style: "understated", needs: ["did"], build: (s) => `${cap(s.did)}.` },
  { style: "understated", needs: ["topic"], build: (s) => `Some thoughts on ${s.topic}` },
  { style: "absurd", needs: ["did"], build: (s) => `${cap(s.did)} for no reason` },
  { style: "absurd", needs: ["topic"], build: (s) => `${s.topic}, but taken far too seriously` },
  { style: "nostalgic", needs: ["topic"], build: (s) => `Remember ${s.topic}?` },
  { style: "nostalgic", needs: ["topic"], build: (s) => `Going back to ${s.topic}` },
  { style: "story", needs: ["did"], build: (s) => `The time ${lowerFirst(s.did)}` },
  { style: "story", needs: ["did", "outcome"], build: (s) => `${cap(s.did)}. ${cap(s.outcome)}.` },
  { style: "experimental", needs: ["topic"], build: (s) => `Testing ${s.topic}` },
  { style: "experimental", needs: ["topic", "constraint"], build: (s) => `${s.topic} ${s.constraint}: an experiment` },
  { style: "informative", needs: ["topic"], build: (s) => `${s.topic}, explained` },
  { style: "informative", needs: ["topic", "did"], build: (s) => `What I learned when ${lowerFirst(s.did)}` },
  { style: "minimal", needs: ["topic"], build: (s) => s.topic },
  { style: "minimal", needs: ["topic", "constraint"], build: (s) => `${s.topic}, ${s.constraint}` },
];

export interface TitleSuggestion {
  style: TitleStyle;
  text: string;
}

export function suggestTitles(slots: TitleSlots, styles: TitleStyle[] = [...TITLE_STYLES]): TitleSuggestion[] {
  const s: TitleSlots = {
    topic: slots.topic.trim(),
    did: slots.did.trim().replace(/[.!?]+$/, ""),
    constraint: slots.constraint.trim(),
    outcome: slots.outcome.trim().replace(/[.!?]+$/, ""),
  };
  const seen = new Set<string>();
  const out: TitleSuggestion[] = [];
  for (const t of TEMPLATES) {
    if (!styles.includes(t.style)) continue;
    if (t.needs.some((n) => !s[n])) continue;
    const text = t.build(s).replace(/\s+/g, " ").trim();
    const k = text.toLowerCase();
    if (!text || seen.has(k)) continue;
    seen.add(k);
    out.push({ style: t.style, text });
  }
  return out;
}

const CLICKBAIT = [
  "you won't believe",
  "you wont believe",
  "shocking",
  "gone wrong",
  "not clickbait",
  "must watch",
  "insane",
  "will blow your mind",
  "doctors hate",
  "emotional",
  "at 3am",
];
const CLAIMS = ["best", "worst", "first ever", "only", "never", "always", "everyone", "nobody", "secret", "banned", "illegal"];
const STOP = new Set(["the", "a", "an", "of", "and", "or", "to", "in", "on", "for", "with", "my", "i", "is", "it", "this", "that"]);

export interface TitleCheck {
  length: number;
  notes: { level: "ok" | "warn"; text: string }[];
}

export function checkTitle(title: string, topic = ""): TitleCheck {
  const t = title.trim();
  const notes: TitleCheck["notes"] = [];
  const len = [...t].length;
  if (len === 0) return { length: 0, notes: [{ level: "warn", text: "Empty title" }] };
  if (len > 100) notes.push({ level: "warn", text: "YouTube titles are limited to 100 characters" });
  else if (len > 70) notes.push({ level: "warn", text: `${len} characters: likely cut off in search results and on phones` });
  else if (len > 55) notes.push({ level: "warn", text: `${len} characters: may be cut off on some screens` });
  else notes.push({ level: "ok", text: `${len} characters: fits on most screens` });
  if (len < 12) notes.push({ level: "warn", text: "Very short: the thumbnail will need to carry the context" });

  const letters = t.replace(/[^A-Za-z]/g, "");
  const upper = t.replace(/[^A-Z]/g, "");
  if (letters.length >= 8 && upper.length / letters.length > 0.6) notes.push({ level: "warn", text: "Mostly capital letters reads as shouting" });
  if (/[!?]{3,}/.test(t)) notes.push({ level: "warn", text: "Repeated punctuation tends to look spammy" });
  const lower = t.toLowerCase();
  const bait = CLICKBAIT.filter((p) => lower.includes(p));
  if (bait.length) notes.push({ level: "warn", text: `"${bait[0]}" often reads as clickbait` });
  const claims = CLAIMS.filter((c) => new RegExp(`\\b${c}\\b`, "i").test(t));
  if (claims.length) notes.push({ level: "warn", text: `Makes a claim ("${claims[0]}"): make sure the video backs it up` });
  if (/^(this|it|that|they)\b/i.test(t)) notes.push({ level: "warn", text: `Starts with "${t.split(/\s/)[0]}", which is unclear without the thumbnail` });

  const topicWords = topic
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1 && !STOP.has(w));
  if (topicWords.length) {
    const hit = topicWords.some((w) => lower.includes(w));
    if (!hit) notes.push({ level: "warn", text: `Doesn't mention "${topic}": people searching for it won't match this title` });
    else {
      const pos = Math.min(...topicWords.map((w) => (lower.indexOf(w) < 0 ? Infinity : lower.indexOf(w))));
      notes.push({ level: "ok", text: pos <= 40 ? "Subject appears early, good for search and skimming" : "Subject appears late; consider moving it earlier" });
    }
  }
  return { length: len, notes };
}

/** Guesses the searchable subject from a working title: the first run of capitalised words or numbers after the first word. */
export function guessTopic(title: string): string {
  const tokens = title.trim().split(/\s+/);
  let run: string[] = [];
  for (let i = 1; i < tokens.length; i++) {
    const t = tokens[i] ?? "";
    if (/^[A-Z0-9]/.test(t) && !/^(I|I'm|A|An|The)$/.test(t)) run.push(t.replace(/[,.:!?]+$/, ""));
    else if (run.length) break;
  }
  return run.join(" ");
}
