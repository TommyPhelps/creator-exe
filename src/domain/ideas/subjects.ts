// The content universe: subject areas with links to neighbouring subjects.
// Adjacency drives the "Adjacent interests" mode (old interest -> new
// neighbour). Creators can add their own subjects in Creator Memory; those
// are matched against idea text by keyword.

export interface Subject {
  id: string;
  label: string;
  adjacent: string[];
  keywords: string[];
}

export const SUBJECTS: Subject[] = [
  { id: "retro-computing", label: "Retro computing", adjacent: ["computer-history", "old-os", "strange-software", "unusual-products", "early-internet"], keywords: ["retro", "vintage", "crt", "486", "pentium", "beige", "floppy"] },
  { id: "old-os", label: "Old operating systems", adjacent: ["retro-computing", "linux", "strange-software"], keywords: ["windows 95", "windows 98", "windows xp", "windows me", "vista", "beos", "os/2", "mac os 9"] },
  { id: "linux", label: "Linux experiments", adjacent: ["old-os", "tech-challenges", "strange-software"], keywords: ["linux", "ubuntu", "arch", "debian", "distro", "terminal", "vim"] },
  { id: "early-internet", label: "Early internet culture", adjacent: ["weird-websites", "internet-mysteries", "y2k-culture", "memes"], keywords: ["geocities", "aim", "myspace", "forum", "dial-up", "flash", "newgrounds"] },
  { id: "weird-websites", label: "Weird websites", adjacent: ["early-internet", "internet-mysteries", "absurd-experiments"], keywords: ["website", "web page", "neocities", "webring"] },
  { id: "internet-mysteries", label: "Internet mysteries", adjacent: ["obscure-history", "early-internet", "horror-games"], keywords: ["mystery", "lost media", "unsolved", "arg"] },
  { id: "strange-software", label: "Strange software", adjacent: ["old-os", "retro-computing", "game-dev-tools", "music-projects"], keywords: ["software", "shareware", "freeware", "utility", "program"] },
  { id: "tech-challenges", label: "Technology challenges", adjacent: ["linux", "absurd-experiments", "real-world-challenges", "diy"], keywords: ["only using", "challenge"] },
  { id: "computer-history", label: "Computer history", adjacent: ["retro-computing", "obscure-history", "game-history"], keywords: ["computer history", "invented", "mainframe"] },
  { id: "productivity-tools", label: "Productivity tools & systems", adjacent: ["strange-software", "making-things", "lifestyle-experiments"], keywords: ["notion", "productivity", "planner", "template", "budgeting"] },
  { id: "video-games", label: "Video games", adjacent: ["game-history", "game-mods", "survival-games", "horror-games", "challenge-runs"], keywords: ["game", "gaming", "played", "minecraft", "valorant", "zomboid", "steam", "playthrough"] },
  { id: "game-history", label: "Video game history", adjacent: ["video-games", "nostalgic-games", "game-dev-tools", "computer-history"], keywords: ["game history", "developer", "console", "cartridge"] },
  { id: "nostalgic-games", label: "Nostalgic games", adjacent: ["game-history", "y2k-culture", "retro-computing"], keywords: ["childhood", "ps2", "gamecube", "n64", "flash game", "pc demo"] },
  { id: "game-mods", label: "Unusual game mods", adjacent: ["video-games", "strange-software", "making-things"], keywords: ["mod", "modded", "modding", "workshop"] },
  { id: "survival-games", label: "Survival games", adjacent: ["video-games", "challenge-runs"], keywords: ["survival", "survive", "zomboid", "minecraft", "hunger"] },
  { id: "horror-games", label: "Horror games", adjacent: ["video-games", "internet-mysteries"], keywords: ["horror", "scary", "terrifying", "creepy", "haunted", "escape"] },
  { id: "challenge-runs", label: "Self-imposed game rules", adjacent: ["survival-games", "real-world-challenges", "absurd-experiments"], keywords: ["pacifist", "but i'm", "without", "no hitting", "rules", "all the"] },
  { id: "game-dev-tools", label: "Game-making tools", adjacent: ["strange-software", "game-history", "making-things"], keywords: ["rpg maker", "game maker", "engine", "klik", "game dev"] },
  { id: "y2k-culture", label: "Early-2000s culture", adjacent: ["early-internet", "nostalgic-games", "unusual-products", "film-media"], keywords: ["2000s", "y2k", "2003", "flip phone", "mp3 player", "dvd"] },
  { id: "memes", label: "Internet memes", adjacent: ["early-internet", "absurd-experiments", "weird-websites"], keywords: ["meme", "viral", "copypasta"] },
  { id: "film-media", label: "Film & media", adjacent: ["y2k-culture", "personal-docs", "observational"], keywords: ["movie", "film", "tv", "trailer", "dvd extras"] },
  { id: "learning-skills", label: "Learning something new", adjacent: ["hobby-experiments", "making-things", "lifestyle-experiments"], keywords: ["learn", "learning", "beginner", "lesson"] },
  { id: "hobby-experiments", label: "Hobby experiments", adjacent: ["learning-skills", "diy", "making-things"], keywords: ["hobby", "kit", "craft"] },
  { id: "making-things", label: "Making things", adjacent: ["diy", "game-dev-tools", "music-projects", "drawing"], keywords: ["build", "maker", "handmade", "built"] },
  { id: "music-projects", label: "Music projects", adjacent: ["making-things", "strange-software", "learning-skills"], keywords: ["music", "song", "tracker", "midi", "beat"] },
  { id: "drawing", label: "Drawing projects", adjacent: ["making-things", "learning-skills"], keywords: ["draw", "drawing", "art", "paint", "sketch"] },
  { id: "diy", label: "DIY experiments", adjacent: ["making-things", "unexpected-science", "hobby-experiments"], keywords: ["diy", "repair", "fix", "solder"] },
  { id: "real-world-challenges", label: "Real-world challenges", adjacent: ["low-budget-adventures", "lifestyle-experiments", "absurd-experiments"], keywords: ["in real life", "irl", "real world"] },
  { id: "low-budget-adventures", label: "Low-budget adventures", adjacent: ["real-world-challenges", "observational", "personal-docs"], keywords: ["cheap", "thrift", "dollar store", "budget"] },
  { id: "personal-docs", label: "Personal documentaries", adjacent: ["observational", "film-media", "low-budget-adventures"], keywords: ["documentary", "vlog", "personal story"] },
  { id: "observational", label: "Observational topics", adjacent: ["personal-docs", "unusual-products", "absurd-experiments"], keywords: ["everyday", "noticed", "people watching"] },
  { id: "unusual-products", label: "Unusual products", adjacent: ["y2k-culture", "observational", "retro-computing"], keywords: ["product", "gadget", "infomercial", "as seen on tv"] },
  { id: "obscure-history", label: "Obscure history", adjacent: ["internet-mysteries", "computer-history", "unexpected-science"], keywords: ["forgotten", "obscure", "lost"] },
  { id: "unexpected-science", label: "Unexpected science", adjacent: ["diy", "obscure-history", "observational"], keywords: ["science", "physics", "chemistry"] },
  { id: "lifestyle-experiments", label: "Lifestyle experiments", adjacent: ["real-world-challenges", "learning-skills", "productivity-tools"], keywords: ["30 days", "routine", "habit"] },
  { id: "absurd-experiments", label: "Absurd experiments", adjacent: ["memes", "real-world-challenges", "tech-challenges", "challenge-runs"], keywords: ["absurd", "pointless", "unnecessary", "ridiculous"] },
];

export const SUBJECT_BY_ID = new Map(SUBJECTS.map((s) => [s.id, s]));

export function subjectLabel(id: string): string {
  return SUBJECT_BY_ID.get(id)?.label ?? id;
}

/** Subjects one hop away from any of the given subjects, excluding the inputs. */
export function adjacentTo(ids: Iterable<string>): Set<string> {
  const base = new Set(ids);
  const out = new Set<string>();
  for (const id of base) {
    for (const a of SUBJECT_BY_ID.get(id)?.adjacent ?? []) if (!base.has(a)) out.add(a);
  }
  return out;
}

/** Maps free text (a profile entry like "old Windows stuff") to known subjects. */
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const PATTERNS = SUBJECTS.map((s) => ({
  id: s.id,
  re: new RegExp(`(^|[^a-z0-9])(${[s.label.toLowerCase(), ...s.keywords].map(escape).join("|")})s?(?=$|[^a-z0-9])`, "i"),
}));

export function subjectsForText(text: string): string[] {
  const t = text.toLowerCase();
  return PATTERNS.filter((p) => p.re.test(t)).map((p) => p.id);
}
