// Packaging Lab: assembles upload text from the project's own notes and
// saved sources. It never invents timestamps, sources, sponsors or credits;
// those sections stay empty until the creator fills them in.
import type { PackageContent, Project, ResearchItem } from "./types.ts";
import { subjectLabel } from "./ideas/subjects.ts";

export const DISCLOSURES = [
  { id: "paid_promotion", label: "Contains paid promotion, sponsorship or affiliate links", hint: "Tick 'Paid promotion' in YouTube Studio and say so in the video." },
  { id: "altered_content", label: "Contains realistic altered or synthetic (AI-generated) media", hint: "YouTube requires the 'Altered content' setting for realistic synthetic media." },
  { id: "made_for_kids", label: "Made for kids", hint: "Required audience setting; it disables comments and some features." },
  { id: "third_party_content", label: "Uses music, clips or images you did not make", hint: "List them in credits and check each licence." },
] as const;

export const UPLOAD_CHECKLIST = [
  { id: "final_export", label: "Final video exported and watched start to finish" },
  { id: "title", label: "Title chosen" },
  { id: "thumbnail", label: "Thumbnail exported at 1280x720 (under 2 MB)" },
  { id: "description", label: "Description pasted" },
  { id: "chapters", label: "Chapters checked against the final edit (or skipped)" },
  { id: "tags", label: "Tags and hashtags added" },
  { id: "audience", label: "Audience (made for kids) set" },
  { id: "disclosures", label: "Disclosures reviewed" },
  { id: "endscreen", label: "End screen and cards (optional)" },
  { id: "visibility", label: "Visibility and schedule set" },
  { id: "pinned", label: "Pinned comment posted after publishing (optional)" },
] as const;

export function emptyPackage(title = ""): PackageContent {
  return {
    title,
    description: "",
    summary: "",
    tags: [],
    hashtags: [],
    credits: "",
    sources: "",
    pinnedComment: "",
    chapters: "",
    disclosures: {},
    checklist: {},
  };
}

export function formatSources(items: ResearchItem[]): string {
  return items
    .filter((r) => r.kind === "source" && r.url)
    .map((r) => {
      const meta = [r.publisher, r.publishedAt].filter(Boolean).join(", ");
      return `- ${r.title}${meta ? ` (${meta})` : ""}: ${r.url}`;
    })
    .join("\n");
}

const STOP = new Set("a an the and or but of to in on for with at by from my i me is are was were be it this that how why what when your you vs".split(" "));

export function suggestTags(project: Project, title: string): string[] {
  const out: string[] = [];
  const add = (t: string) => {
    const v = t.trim().toLowerCase();
    if (v && !out.includes(v)) out.push(v);
  };
  for (const s of project.subjects) add(subjectLabel(s));
  const words = `${title} ${project.title}`
    .toLowerCase()
    .replace(/[^a-z0-9' ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
  // Short phrases from the title first, then single words.
  const phrase = words.slice(0, 3).join(" ");
  if (phrase.split(" ").length > 1) add(phrase);
  for (const w of words) add(w);
  // YouTube allows 500 characters of tags in total.
  const limited: string[] = [];
  let total = 0;
  for (const t of out) {
    if (total + t.length + 1 > 500) break;
    limited.push(t);
    total += t.length + 1;
  }
  return limited.slice(0, 15);
}

export function suggestHashtags(project: Project): string[] {
  return project.subjects.slice(0, 3).map((s) => `#${subjectLabel(s).replace(/&/g, "and").replace(/[^A-Za-z0-9]+(.)?/g, (_m, c: string | undefined) => (c ? c.toUpperCase() : "")).replace(/^(.)/, (c) => c.toUpperCase())}`);
}

export function draftDescription(project: Project, sources: ResearchItem[]): string {
  const parts: string[] = [];
  if (project.premise.trim()) parts.push(project.premise.trim());
  const structure = project.details.structure
    .split("\n")
    .map((l) => l.replace(/^[-*\d.)\s]+/, "").trim())
    .filter(Boolean);
  if (structure.length) parts.push(`In this video:\n${structure.map((l) => `- ${l}`).join("\n")}`);
  const src = formatSources(sources);
  if (src) parts.push(`Sources:\n${src}`);
  return parts.join("\n\n");
}

export interface ChapterCheck {
  valid: boolean;
  chapters: { seconds: number; label: string }[];
  problems: string[];
}

/** Validates chapter lines against YouTube's rules: start at 0:00, at least three, ascending, 10s minimum. */
export function checkChapters(text: string): ChapterCheck {
  const problems: string[] = [];
  const chapters: ChapterCheck["chapters"] = [];
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    const m = /^(?:(\d{1,2}):)?(\d{1,2}):(\d{2})\s*[-–—:]?\s*(.+)$/.exec(line);
    if (!m) {
      problems.push(`"${line}" doesn't start with a timestamp like 0:00`);
      continue;
    }
    const seconds = Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]);
    chapters.push({ seconds, label: (m[4] ?? "").trim() });
  }
  if (!lines.length) return { valid: false, chapters, problems: [] };
  if (chapters[0] && chapters[0].seconds !== 0) problems.push("The first chapter must start at 0:00");
  if (chapters.length < 3) problems.push("YouTube needs at least three chapters");
  for (let i = 1; i < chapters.length; i++) {
    const prev = chapters[i - 1];
    const cur = chapters[i];
    if (!prev || !cur) continue;
    if (cur.seconds <= prev.seconds) problems.push(`"${cur.label}" is not after the previous chapter`);
    else if (cur.seconds - prev.seconds < 10) problems.push(`"${prev.label}" is shorter than 10 seconds`);
  }
  return { valid: problems.length === 0, chapters, problems };
}

export function packageToText(p: PackageContent): string {
  const sections: [string, string][] = [
    ["TITLE", p.title],
    ["DESCRIPTION", [p.description, p.chapters ? `Chapters:\n${p.chapters}` : "", p.credits ? `Credits:\n${p.credits}` : "", p.sources ? `Sources:\n${p.sources}` : "", p.hashtags.join(" ")].filter(Boolean).join("\n\n")],
    ["SHORT SUMMARY", p.summary],
    ["TAGS", p.tags.join(", ")],
    ["PINNED COMMENT", p.pinnedComment],
  ];
  return sections
    .filter(([, v]) => v.trim())
    .map(([k, v]) => `=== ${k} ===\n${v.trim()}`)
    .join("\n\n");
}

/** The description exactly as it should be pasted into YouTube. */
export function fullDescription(p: PackageContent): string {
  return [p.description, p.chapters ? `Chapters:\n${p.chapters}` : "", p.credits ? `Credits:\n${p.credits}` : "", p.sources ? `Sources:\n${p.sources}` : "", p.hashtags.join(" ")]
    .map((s) => s.trim())
    .filter(Boolean)
    .join("\n\n");
}
