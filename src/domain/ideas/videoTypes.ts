// What kind of video an idea is, independent of its game or topic. Used for
// "I like this format" feedback, the gameplay/commentary control and to keep
// a batch from being three versions of the same thing.

export type VideoStyle = "gameplay" | "commentary";

export const VIDEO_TYPES = [
  { id: "first-playthrough", label: "First playthrough", style: "gameplay" },
  { id: "revisit", label: "Nostalgic revisit", style: "gameplay" },
  { id: "hidden-gem", label: "Hidden gem", style: "gameplay" },
  { id: "roulette", label: "Game roulette", style: "gameplay" },
  { id: "mod-showcase", label: "Mods & modpacks", style: "gameplay" },
  { id: "challenge", label: "Interesting challenge", style: "gameplay" },
  { id: "mechanics", label: "Mechanics experiment", style: "gameplay" },
  { id: "experiment", label: "Play experiment", style: "gameplay" },
  { id: "diary", label: "Diary series", style: "gameplay" },
  { id: "tech-fix", label: "Making it run", style: "gameplay" },
  { id: "analysis", label: "Design & atmosphere analysis", style: "commentary" },
  { id: "retrospective", label: "Personal retrospective", style: "commentary" },
  { id: "investigation", label: "History & mysteries", style: "commentary" },
  { id: "comparison", label: "Comparison", style: "commentary" },
  { id: "short-take", label: "Short", style: "commentary" },
  { id: "general", label: "General", style: "commentary" },
] as const satisfies readonly { id: string; label: string; style: VideoStyle }[];

export type VideoType = (typeof VIDEO_TYPES)[number]["id"];

const BY_ID = new Map<string, (typeof VIDEO_TYPES)[number]>(VIDEO_TYPES.map((v) => [v.id, v]));

export function videoTypeLabel(id: string): string {
  return BY_ID.get(id)?.label ?? id;
}

export function videoTypeStyle(id: string): VideoStyle {
  return BY_ID.get(id)?.style ?? "commentary";
}
