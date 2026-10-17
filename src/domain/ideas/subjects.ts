// The content universe: subject areas with links to neighbouring subjects.
// Adjacency drives the "Adjacent interests" mode (old interest -> new
// neighbour). Creators can add their own subjects in Creator Memory; those
// are matched against idea text by keyword.

export type Domain = "gaming" | "gaming-tech" | "other";

export interface Subject {
  id: string;
  label: string;
  /** Which part of the channel this subject belongs to; Content Focus works on domains. */
  domain: Domain;
  adjacent: string[];
  keywords: string[];
  /** Generic words that only count as evidence in a video title, never in a description (e.g. "tv", "music"). */
  weak?: string[];
}

export const SUBJECTS: Subject[] = [
  // ---------------------------------------------------------------- gaming
  { id: "video-games", label: "Video games", domain: "gaming", adjacent: ["game-history", "game-mods", "indie-games", "horror-games", "challenge-runs"], keywords: ["gaming", "played", "playthrough", "steam", "gameplay", "minecraft", "valorant", "zomboid"], weak: ["game"] },
  { id: "rpg-classic", label: "Classic RPGs", domain: "gaming", adjacent: ["open-world-rpg", "immersive-sims", "retro-pc-games", "game-worlds", "fan-projects"], keywords: ["morrowind", "daggerfall", "gothic", "arcanum", "baldur's gate", "planescape", "fallout 2", "crpg", "older rpg", "old rpg", "classic rpg", "ultima", "might and magic"] },
  { id: "open-world-rpg", label: "Open-world RPGs", domain: "gaming", adjacent: ["rpg-classic", "soulslike", "game-worlds", "game-mods"], keywords: ["witcher", "skyrim", "oblivion", "new vegas", "open world", "open-world"] },
  { id: "soulslike", label: "Soulslikes", domain: "gaming", adjacent: ["open-world-rpg", "game-mechanics", "challenge-runs", "game-worlds"], keywords: ["dark souls", "elden ring", "soulslike", "souls-like", "fromsoftware", "bloodborne", "sekiro", "demon's souls", "king's field"] },
  { id: "immersive-sims", label: "Immersive sims", domain: "gaming", adjacent: ["rpg-classic", "game-mechanics", "retro-pc-games", "fan-projects"], keywords: ["deus ex", "thief", "system shock", "immersive sim", "dishonored", "arx fatalis", "the dark mod"] },
  { id: "retro-pc-games", label: "Retro PC games", domain: "gaming", adjacent: ["nostalgic-games", "rpg-classic", "game-history", "retro-compat", "game-preservation"], keywords: ["dos game", "retro pc", "old pc game", "90s pc", "shareware", "big box", "cd-rom game", "doom"] },
  { id: "indie-games", label: "Indie games", domain: "gaming", adjacent: ["free-games", "bizarre-games", "horror-games", "game-mechanics"], keywords: ["indie", "itch.io", "solo developer", "game jam"] },
  { id: "free-games", label: "Free & freeware games", domain: "gaming", adjacent: ["indie-games", "fan-projects", "retro-pc-games"], keywords: ["freeware", "free game", "itch.io", "free to play"] },
  { id: "horror-games", label: "Horror games", domain: "gaming", adjacent: ["indie-games", "game-worlds", "game-mysteries"], keywords: ["horror", "scary", "terrifying", "creepy", "haunted", "night factory"] },
  { id: "survival-games", label: "Survival games", domain: "gaming", adjacent: ["video-games", "modpacks", "challenge-runs"], keywords: ["survival", "survive", "zomboid", "hunger"] },
  { id: "game-mods", label: "Game mods", domain: "gaming", adjacent: ["modpacks", "fan-projects", "open-world-rpg", "game-engines"], keywords: ["mod", "modded", "modding", "workshop", "nexus"] },
  { id: "modpacks", label: "Minecraft & modpacks", domain: "gaming", adjacent: ["game-mods", "survival-games", "simulation-games"], keywords: ["minecraft", "modpack", "curseforge", "feed the beast"] },
  { id: "game-history", label: "Video game history", domain: "gaming", adjacent: ["game-mysteries", "nostalgic-games", "retro-pc-games", "game-preservation"], keywords: ["game history", "developer", "console", "cartridge", "history of"] },
  { id: "nostalgic-games", label: "Gaming nostalgia", domain: "gaming", adjacent: ["game-history", "retro-pc-games", "y2k-culture"], keywords: ["childhood", "ps2", "gamecube", "n64", "flash game", "pc demo", "nostalgia", "nostalgic"] },
  { id: "game-mysteries", label: "Game mysteries & dev history", domain: "gaming", adjacent: ["game-history", "horror-games", "fan-projects"], keywords: ["cut content", "lost build", "prototype", "unreleased", "cancelled game", "beta build", "lost media"] },
  { id: "challenge-runs", label: "Interesting challenge runs", domain: "gaming", adjacent: ["soulslike", "game-mechanics", "survival-games"], keywords: ["pacifist", "but i'm", "no hitting", "challenge run"], weak: ["rules", "all the", "without"] },
  { id: "simulation-games", label: "Simulation games", domain: "gaming", adjacent: ["game-mechanics", "bizarre-games", "strategy-games"], keywords: ["simulator", "simulation", "tycoon"] },
  { id: "strategy-games", label: "Strategy games", domain: "gaming", adjacent: ["simulation-games", "retro-pc-games", "game-mechanics"], keywords: ["strategy game", "rts", "4x"], weak: ["strategy", "tactics"] },
  { id: "adventure-games", label: "Adventure & puzzle games", domain: "gaming", adjacent: ["retro-pc-games", "game-worlds", "indie-games"], keywords: ["point-and-click", "point and click", "adventure game", "myst", "puzzle game"] },
  { id: "fan-projects", label: "Fan projects & remakes", domain: "gaming", adjacent: ["game-mods", "game-preservation", "game-mysteries"], keywords: ["fan game", "fan remake", "total conversion", "fan project", "demake", "fan-made"] },
  { id: "game-worlds", label: "Fascinating game worlds", domain: "gaming", adjacent: ["rpg-classic", "open-world-rpg", "adventure-games", "horror-games"], keywords: ["lore", "worldbuilding", "game world", "atmospheric", "discovery"] },
  { id: "game-mechanics", label: "Unusual game mechanics", domain: "gaming", adjacent: ["immersive-sims", "simulation-games", "bizarre-games", "challenge-runs"], keywords: ["game mechanic", "mechanics", "game physics", "game design"] },
  { id: "bizarre-games", label: "Bizarre & experimental games", domain: "gaming", adjacent: ["indie-games", "game-mechanics", "free-games"], keywords: ["weird game", "bizarre", "experimental game", "strange game", "surreal"] },
  // ---------------------------------------------------------------- gaming-adjacent tech
  { id: "game-dev-tools", label: "Game-making tools", domain: "gaming-tech", adjacent: ["game-engines", "game-history", "fan-projects"], keywords: ["rpg maker", "game maker", "klik", "game dev", "pico-8"] },
  { id: "game-preservation", label: "Emulation & preservation", domain: "gaming-tech", adjacent: ["retro-compat", "game-history", "retro-pc-games"], keywords: ["emulation", "emulator", "preservation", "abandonware", "dosbox", "scummvm"] },
  { id: "retro-compat", label: "Old games on modern PCs", domain: "gaming-tech", adjacent: ["game-preservation", "game-engines", "retro-pc-games"], keywords: ["source port", "compatibility", "widescreen fix", "windows 11", "dgvoodoo", "openmw", "daggerfall unity"] },
  { id: "linux-gaming", label: "Linux gaming", domain: "gaming-tech", adjacent: ["retro-compat", "gaming-hardware"], keywords: ["proton", "steam deck", "linux gaming"], weak: ["wine"] },
  { id: "gaming-hardware", label: "Unusual gaming hardware", domain: "gaming-tech", adjacent: ["linux-gaming", "retro-compat", "retro-computing"], keywords: ["handheld", "3dfx", "voodoo", "sound blaster"], weak: ["crt", "controller"] },
  { id: "game-engines", label: "How game engines work", domain: "gaming-tech", adjacent: ["game-dev-tools", "retro-compat", "game-mods"], keywords: ["game engine", "idtech", "id tech", "source engine", "unreal engine", "gamebryo"] },
  // ---------------------------------------------------------------- everything else (only with Content Focus set to include it)
  { id: "retro-computing", label: "Retro computing", domain: "other", adjacent: ["computer-history", "old-os", "strange-software", "gaming-hardware"], keywords: ["retro computer", "vintage computer", "486", "pentium", "beige", "floppy"] },
  { id: "old-os", label: "Old operating systems", domain: "other", adjacent: ["retro-computing", "linux", "strange-software"], keywords: ["windows 95", "windows 98", "windows xp", "windows me", "vista", "beos", "os/2", "mac os 9"] },
  { id: "linux", label: "Linux experiments", domain: "other", adjacent: ["old-os", "tech-challenges", "linux-gaming"], keywords: ["linux", "ubuntu", "arch", "debian", "distro", "terminal", "vim"] },
  { id: "early-internet", label: "Early internet culture", domain: "other", adjacent: ["weird-websites", "internet-mysteries", "y2k-culture", "memes"], keywords: ["internet history", "geocities", "aim", "myspace", "forum", "dial-up", "newgrounds"] },
  { id: "weird-websites", label: "Weird websites", domain: "other", adjacent: ["early-internet", "internet-mysteries", "absurd-experiments"], keywords: ["website", "web page", "neocities", "webring"] },
  { id: "internet-mysteries", label: "Internet mysteries", domain: "other", adjacent: ["obscure-history", "early-internet", "game-mysteries"], keywords: ["mystery", "unsolved", "arg"] },
  { id: "strange-software", label: "Strange software", domain: "other", adjacent: ["old-os", "retro-computing", "game-dev-tools"], keywords: ["software", "shareware app", "freeware app", "utility", "program"] },
  { id: "tech-challenges", label: "Technology challenges", domain: "other", adjacent: ["linux", "absurd-experiments", "real-world-challenges", "diy"], keywords: ["only using", "technology experiment", "tech experiment"], weak: ["challenge"] },
  { id: "computer-history", label: "Computer history", domain: "other", adjacent: ["retro-computing", "obscure-history", "game-history"], keywords: ["computer history", "invented", "mainframe"] },
  { id: "productivity-tools", label: "Productivity tools & systems", domain: "other", adjacent: ["strange-software", "making-things", "lifestyle-experiments"], keywords: ["notion", "productivity", "planner", "template", "budgeting"] },
  { id: "y2k-culture", label: "Early-2000s culture", domain: "other", adjacent: ["early-internet", "nostalgic-games", "unusual-products", "film-media"], keywords: ["2000s", "y2k", "2003", "flip phone", "mp3 player"] },
  { id: "memes", label: "Internet memes", domain: "other", adjacent: ["early-internet", "absurd-experiments", "weird-websites"], keywords: ["meme", "viral", "copypasta"] },
  { id: "film-media", label: "Film & media", domain: "other", adjacent: ["y2k-culture", "personal-docs", "observational"], keywords: ["movie", "film", "trailer", "dvd extras"], weak: ["tv"] },
  { id: "learning-skills", label: "Learning something new", domain: "other", adjacent: ["hobby-experiments", "making-things", "lifestyle-experiments"], keywords: ["beginner", "lesson"], weak: ["learn", "learning"] },
  { id: "hobby-experiments", label: "Hobby experiments", domain: "other", adjacent: ["learning-skills", "diy", "making-things"], keywords: ["hobby", "kit", "craft"] },
  { id: "making-things", label: "Making things", domain: "other", adjacent: ["diy", "game-dev-tools", "music-projects", "drawing"], keywords: ["maker", "handmade"], weak: ["build", "built"] },
  { id: "music-projects", label: "Music projects", domain: "other", adjacent: ["making-things", "strange-software", "learning-skills"], keywords: ["midi", "beat", "music tracker"], weak: ["music", "song"] },
  { id: "drawing", label: "Drawing projects", domain: "other", adjacent: ["making-things", "learning-skills"], keywords: ["draw", "drawing", "sketch"], weak: ["art", "paint"] },
  { id: "diy", label: "DIY experiments", domain: "other", adjacent: ["making-things", "unexpected-science", "hobby-experiments"], keywords: ["diy", "repair", "solder"], weak: ["fix"] },
  { id: "real-world-challenges", label: "Real-world challenges", domain: "other", adjacent: ["low-budget-adventures", "lifestyle-experiments", "absurd-experiments"], keywords: ["in real life", "irl", "real world", "real-world"] },
  { id: "low-budget-adventures", label: "Low-budget adventures", domain: "other", adjacent: ["real-world-challenges", "observational", "personal-docs"], keywords: ["thrift", "dollar store"], weak: ["cheap", "budget"] },
  { id: "personal-docs", label: "Personal documentaries", domain: "other", adjacent: ["observational", "film-media", "low-budget-adventures"], keywords: ["documentary", "vlog", "personal story"] },
  { id: "observational", label: "Observational topics", domain: "other", adjacent: ["personal-docs", "unusual-products", "absurd-experiments"], keywords: ["people watching", "noticed"], weak: ["everyday"] },
  { id: "unusual-products", label: "Unusual products", domain: "other", adjacent: ["y2k-culture", "observational", "retro-computing"], keywords: ["gadget", "infomercial", "as seen on tv"], weak: ["product"] },
  { id: "obscure-history", label: "Obscure history", domain: "other", adjacent: ["internet-mysteries", "computer-history", "unexpected-science"], keywords: ["forgotten", "obscure", "fascinating"], weak: ["lost"] },
  { id: "unexpected-science", label: "Unexpected science", domain: "other", adjacent: ["diy", "obscure-history", "observational"], keywords: ["science", "physics", "chemistry"] },
  { id: "lifestyle-experiments", label: "Lifestyle experiments", domain: "other", adjacent: ["real-world-challenges", "learning-skills", "productivity-tools"], keywords: ["30 days", "routine", "habit"] },
  { id: "absurd-experiments", label: "Absurd experiments", domain: "other", adjacent: ["memes", "real-world-challenges", "tech-challenges", "bizarre-games"], keywords: ["absurd", "pointless", "unnecessary", "ridiculous", "weird"] },
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
  re: new RegExp(`(^|[^a-z0-9])(${[s.label.toLowerCase(), ...s.keywords, ...(s.weak ?? [])].map(escape).join("|")})s?(?=$|[^a-z0-9])`, "i"),
}));

export function subjectsForText(text: string): string[] {
  const t = text.toLowerCase();
  return PATTERNS.filter((p) => p.re.test(t)).map((p) => p.id);
}

export function subjectDomain(id: string): Domain {
  return SUBJECT_BY_ID.get(id)?.domain ?? "other";
}

/** Gaming and gaming-tech subjects, in display order. */
export const GAMING_SUBJECTS = SUBJECTS.filter((s) => s.domain === "gaming");
export const GAMING_TECH_SUBJECTS = SUBJECTS.filter((s) => s.domain === "gaming-tech");
