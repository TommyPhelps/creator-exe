// A small built-in catalog of games the idea library refers to, so ideas can
// say what genre and era a game is and whether it costs money.
//
// Honesty rules for this file:
// - "free" only when the game itself is legitimately free to download, with
//   a note saying why we know. Everything else is "paid" or "unknown".
// - No prices, no cover art, no store IDs here. Live prices and covers come
//   from a Steam store lookup at runtime (labelled with the date checked).
// - Ownership is never assumed; it comes from the user's imported library.

import type { Domain } from "../ideas/subjects.ts";

export type Access = "paid" | "free" | "unknown";
export type Era = "retro" | "modern";

export interface CatalogGame {
  title: string;
  aliases?: string[];
  year?: number;
  era: Era;
  /** Subject IDs (gaming genres) this game belongs to. */
  genres: string[];
  access: Access;
  /** Why a game is listed as free, or what else it needs. */
  accessNote?: string;
  /** A placeholder like "a free horror game on itch.io" rather than one specific title. */
  generic?: boolean;
  /** A placeholder that is by definition a game you already have or played ("an old PC game I own"). */
  yours?: boolean;
  /** A free mod or modpack that still needs this (catalog) game to play. */
  requires?: string;
  domain?: Domain;
}

const g = (title: string, year: number | undefined, genres: string[], access: Access, extra: Partial<CatalogGame> = {}): CatalogGame => ({
  title,
  year,
  era: year !== undefined && year < 2008 ? "retro" : "modern",
  genres,
  access,
  ...extra,
});

export const GAME_CATALOG: CatalogGame[] = [
  // ------------------------------------------------ games you named
  g("The Witcher 3: Wild Hunt", 2015, ["open-world-rpg", "game-worlds"], "paid", { aliases: ["The Witcher 3", "Witcher 3"] }),
  g("Elden Ring", 2022, ["soulslike", "open-world-rpg", "game-worlds"], "paid"),
  g("Dark Souls", 2011, ["soulslike", "game-worlds"], "paid", { aliases: ["Dark Souls Remastered", "Dark Souls: Prepare to Die Edition"] }),
  g("Dark Souls II", 2014, ["soulslike"], "paid", { aliases: ["Dark Souls II: Scholar of the First Sin"] }),
  g("Dark Souls III", 2016, ["soulslike", "game-worlds"], "paid"),
  g("The Elder Scrolls III: Morrowind", 2002, ["rpg-classic", "open-world-rpg", "game-worlds"], "paid", { aliases: ["Morrowind"] }),
  g("Minecraft", 2011, ["modpacks", "survival-games"], "paid", { aliases: ["Minecraft: Java Edition"] }),
  g("Project Zomboid", 2013, ["survival-games"], "paid"),
  g("Mount & Blade: Warband", 2010, ["strategy-games", "open-world-rpg", "game-worlds"], "paid", { aliases: ["Warband", "Mount and Blade: Warband", "Mount & Blade Warband"] }),
  // ------------------------------------------------ free Minecraft modpacks (need Minecraft: Java Edition)
  g("RLCraft", undefined, ["modpacks", "survival-games"], "free", { requires: "Minecraft", accessNote: "Free modpack by Shivaxi (Minecraft 1.12.2)." }),
  g("SkyFactory 4", undefined, ["modpacks", "survival-games"], "free", { requires: "Minecraft", accessNote: "Free skyblock modpack (Minecraft 1.12.2)." }),
  g("Create: Above and Beyond", undefined, ["modpacks", "game-mechanics"], "free", { requires: "Minecraft", aliases: ["Create Above and Beyond", "CABIN"], accessNote: "Free quest-driven Create modpack (Minecraft 1.16.5)." }),
  g("GregTech: New Horizons", undefined, ["modpacks", "game-mechanics"], "free", { requires: "Minecraft", aliases: ["GT New Horizons", "GTNH"], accessNote: "Free modpack (Minecraft 1.7.10)." }),
  // ------------------------------------------------ classic RPGs / immersive sims / retro PC
  g("The Elder Scrolls IV: Oblivion", 2006, ["open-world-rpg", "rpg-classic"], "paid", { aliases: ["Oblivion"] }),
  g("The Elder Scrolls: Arena", 1994, ["rpg-classic", "retro-pc-games"], "free", { aliases: ["Arena"], accessNote: "Bethesda released it as a free download in 2004." }),
  g("The Elder Scrolls II: Daggerfall", 1996, ["rpg-classic", "retro-pc-games", "game-worlds"], "free", { aliases: ["Daggerfall"], accessNote: "Bethesda released it as a free download in 2009." }),
  g("Gothic", 2001, ["rpg-classic", "game-worlds"], "paid"),
  g("Gothic II", 2002, ["rpg-classic", "game-worlds"], "paid", { aliases: ["Gothic II: Gold Edition", "Gothic 2"] }),
  g("Arcanum: Of Steamworks and Magick Obscura", 2001, ["rpg-classic", "game-worlds"], "paid", { aliases: ["Arcanum"] }),
  g("Planescape: Torment", 1999, ["rpg-classic", "game-worlds"], "paid", { aliases: ["Planescape: Torment: Enhanced Edition"] }),
  g("Baldur's Gate", 1998, ["rpg-classic"], "paid", { aliases: ["Baldur's Gate: Enhanced Edition"] }),
  g("Fallout 2", 1998, ["rpg-classic", "retro-pc-games"], "paid"),
  g("Vampire: The Masquerade - Bloodlines", 2004, ["rpg-classic", "immersive-sims", "game-worlds"], "paid", { aliases: ["Vampire Bloodlines", "VTMB"] }),
  g("Star Wars: Knights of the Old Republic", 2003, ["rpg-classic"], "paid", { aliases: ["KOTOR"] }),
  g("Deus Ex", 2000, ["immersive-sims", "retro-pc-games"], "paid", { aliases: ["Deus Ex: Game of the Year Edition"] }),
  g("System Shock 2", 1999, ["immersive-sims", "horror-games", "retro-pc-games"], "paid"),
  g("Thief II: The Metal Age", 2000, ["immersive-sims", "retro-pc-games"], "paid", { aliases: ["Thief 2"] }),
  g("Thief", 1998, ["immersive-sims", "retro-pc-games"], "paid", { aliases: ["Thief Gold", "Thief: The Dark Project"] }),
  g("Arx Fatalis", 2002, ["immersive-sims", "rpg-classic"], "paid"),
  g("Ultima Underworld: The Stygian Abyss", 1992, ["rpg-classic", "immersive-sims", "retro-pc-games"], "paid", { aliases: ["Ultima Underworld"] }),
  g("Might and Magic VI: The Mandate of Heaven", 1998, ["rpg-classic", "retro-pc-games"], "paid", { aliases: ["Might and Magic VI"] }),
  g("Half-Life", 1998, ["retro-pc-games", "game-history"], "paid"),
  g("Severance: Blade of Darkness", 2001, ["retro-pc-games", "soulslike"], "paid", { aliases: ["Blade of Darkness"] }),
  g("King's Field: The Ancient City", 2001, ["soulslike", "game-history"], "paid", { aliases: ["King's Field IV"] }),
  g("Outcast", 1999, ["retro-pc-games", "game-worlds"], "paid", { aliases: ["Outcast 1.1"] }),
  g("Anachronox", 2001, ["rpg-classic", "bizarre-games"], "paid"),
  g("Dungeon Keeper", 1997, ["strategy-games", "retro-pc-games"], "paid"),
  g("Myst", 1993, ["adventure-games", "retro-pc-games", "game-worlds"], "paid"),
  g("Riven", 1997, ["adventure-games", "game-worlds"], "paid"),
  g("Grim Fandango", 1998, ["adventure-games", "game-worlds"], "paid", { aliases: ["Grim Fandango Remastered"] }),
  g("The Longest Journey", 1999, ["adventure-games", "game-worlds"], "paid"),
  g("S.T.A.L.K.E.R.: Shadow of Chernobyl", 2007, ["survival-games", "game-worlds", "immersive-sims"], "paid", { aliases: ["STALKER Shadow of Chernobyl"] }),
  g("Pathologic", 2005, ["game-worlds", "bizarre-games", "survival-games"], "paid", { aliases: ["Pathologic Classic HD"] }),
  g("Doom (shareware episode)", 1993, ["retro-pc-games", "game-history"], "free", { aliases: ["Doom"], accessNote: "The first episode, Knee-Deep in the Dead, was distributed free as shareware." }),
  // ------------------------------------------------ modern RPGs / worlds / mechanics
  g("The Witcher", 2007, ["rpg-classic", "game-worlds"], "paid", { aliases: ["The Witcher: Enhanced Edition"] }),
  g("The Elder Scrolls V: Skyrim", 2011, ["open-world-rpg", "game-mods"], "paid", { aliases: ["Skyrim", "Skyrim Special Edition", "Skyrim Anniversary Edition", "The Elder Scrolls V: Skyrim Special Edition"] }),
  g("Enderal: Forgotten Stories", 2021, ["game-mods", "fan-projects", "open-world-rpg"], "free", { requires: "The Elder Scrolls V: Skyrim", aliases: ["Enderal", "Enderal: Forgotten Stories (Special Edition)"], accessNote: "Free on Steam, but needs Skyrim Special Edition owned on Steam." }),
  g("Fallout: New Vegas", 2010, ["open-world-rpg", "game-mods"], "paid", { aliases: ["New Vegas"] }),
  g("Kingdom Come: Deliverance", 2018, ["open-world-rpg", "game-mechanics"], "paid"),
  g("Disco Elysium", 2019, ["rpg-classic", "game-worlds"], "paid", { aliases: ["Disco Elysium - The Final Cut"] }),
  g("Outer Wilds", 2019, ["game-worlds", "game-mechanics"], "paid"),
  g("Return of the Obra Dinn", 2018, ["adventure-games", "game-mechanics"], "paid"),
  g("Pentiment", 2022, ["adventure-games", "game-worlds"], "paid"),
  g("Hollow Knight", 2017, ["indie-games", "game-worlds"], "paid"),
  g("Rain World", 2017, ["indie-games", "game-mechanics", "game-worlds"], "paid"),
  g("Noita", 2020, ["indie-games", "game-mechanics"], "paid"),
  g("Baba Is You", 2019, ["indie-games", "game-mechanics"], "paid"),
  g("Caves of Qud", 2024, ["rpg-classic", "bizarre-games", "game-worlds"], "paid"),
  g("Hylics", 2015, ["bizarre-games", "indie-games"], "paid"),
  g("Cruelty Squad", 2021, ["bizarre-games", "immersive-sims"], "paid"),
  g("Inscryption", 2021, ["bizarre-games", "indie-games", "horror-games"], "paid"),
  // ------------------------------------------------ horror
  g("Signalis", 2022, ["horror-games", "indie-games"], "paid"),
  g("Iron Lung", 2022, ["horror-games", "bizarre-games", "indie-games"], "paid"),
  g("Darkwood", 2017, ["horror-games", "survival-games"], "paid"),
  g("Dredge", 2023, ["horror-games", "indie-games"], "paid"),
  g("Night Factory", undefined, ["horror-games", "indie-games"], "unknown", { era: "modern" }),
  g("Haunted PS1 Demo Disc 2020", 2020, ["horror-games", "indie-games", "free-games"], "free", { aliases: ["Haunted PS1 Demo Disc"], accessNote: "Free Windows download on itch.io: 17 short PS1-style horror demos." }),
  g("Cry of Fear", 2013, ["horror-games", "fan-projects"], "free", { accessNote: "Released free on Steam as a standalone game." }),
  g("Doki Doki Literature Club", 2017, ["horror-games", "bizarre-games"], "free", { accessNote: "The original is free on Steam (the Plus edition is paid)." }),
  // ------------------------------------------------ legitimately free games and fan projects
  g("Cave Story", 2004, ["indie-games", "free-games", "game-history"], "free", { accessNote: "The original 2004 PC version is freeware (Cave Story+ is the paid re-release)." }),
  g("Spelunky Classic", 2008, ["indie-games", "free-games"], "free", { accessNote: "The original 2008 version was released free by its creator." }),
  g("Yume Nikki", 2004, ["bizarre-games", "free-games", "game-worlds"], "free", { accessNote: "Freeware RPG Maker game, also free on Steam." }),
  g("OFF", 2008, ["bizarre-games", "free-games", "rpg-classic"], "free", { accessNote: "Freeware RPG Maker game." }),
  g("Iji", 2008, ["indie-games", "free-games"], "free", { accessNote: "Freeware by its solo developer." }),
  g("Knytt", 2006, ["indie-games", "free-games", "game-worlds"], "free", { accessNote: "Freeware by its solo developer." }),
  g("Dwarf Fortress (Classic)", 2006, ["simulation-games", "free-games", "bizarre-games"], "free", { accessNote: "The classic version stays a free download from Bay 12 Games; the Steam edition is paid." }),
  g("The Dark Mod", 2013, ["immersive-sims", "fan-projects", "free-games"], "free", { accessNote: "Free standalone stealth game that began as a Doom 3 total conversion." }),
  g("S.T.A.L.K.E.R. Anomaly", 2018, ["fan-projects", "survival-games", "game-mods", "free-games"], "free", { accessNote: "Free standalone mod; doesn't need the original games." }),
  g("OpenTTD", 2004, ["simulation-games", "fan-projects", "free-games"], "free", { accessNote: "Free open-source remake that runs with free graphics sets." }),
  // ------------------------------------------------ placeholders (you pick the actual game)
  g("a free horror game on itch.io", undefined, ["horror-games", "indie-games", "free-games"], "free", { era: "modern", generic: true, accessNote: "Pick one marked free on itch.io." }),
  g("a free game on itch.io", undefined, ["indie-games", "free-games"], "free", { era: "modern", generic: true, accessNote: "Pick one marked free on itch.io." }),
  g("an indie horror game under $5", undefined, ["horror-games", "indie-games"], "paid", { era: "modern", generic: true }),
  g("a game jam winner on itch.io", undefined, ["indie-games", "free-games", "bizarre-games"], "free", { era: "modern", generic: true, accessNote: "Most jam entries are free; pick one marked free." }),
  g("an old PC game I own", undefined, ["retro-pc-games"], "unknown", { era: "retro", generic: true, yours: true }),
  g("a game I played as a kid", undefined, ["nostalgic-games"], "unknown", { era: "retro", generic: true, yours: true }),
  g("a game that stayed with me", undefined, ["video-games"], "unknown", { era: "modern", generic: true, yours: true }),
  g("a game I have never played", undefined, ["video-games"], "unknown", { era: "modern", generic: true }),
  g("a strange simulator game", undefined, ["simulation-games", "bizarre-games"], "unknown", { era: "modern", generic: true }),
  // ------------------------------------------------ game-making tools (gaming-adjacent tech)
  g("Bitsy", 2017, ["game-dev-tools"], "free", { domain: "gaming-tech", accessNote: "Free browser-based game maker." }),
  g("Twine", 2009, ["game-dev-tools"], "free", { domain: "gaming-tech", accessNote: "Free and open source." }),
  g("GB Studio", 2019, ["game-dev-tools"], "free", { domain: "gaming-tech", accessNote: "Free and open source." }),
  g("PICO-8", 2015, ["game-dev-tools"], "paid", { domain: "gaming-tech" }),
  g("RPG Maker", 2015, ["game-dev-tools"], "paid", { domain: "gaming-tech", aliases: ["RPG Maker MV", "RPG Maker MZ", "RPG Maker 2003"] }),
];

/** Lower-case title with punctuation, articles and edition suffixes removed, for matching. */
export function canon(title: string): string {
  return title
    .toLowerCase()
    .replace(/[™®©]/g, "")
    .replace(/&/g, " and ")
    .replace(/\b(game of the year|goty|enhanced|definitive|complete|classic hd|remastered|special|anniversary|gold|ultimate|deluxe|final cut)( edition)?\b/g, " ")
    .replace(/\bedition\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/^the /, "")
    .trim()
    .replace(/\s+/g, " ");
}

const BY_CANON = new Map<string, CatalogGame>();
for (const game of GAME_CATALOG) {
  for (const name of [game.title, ...(game.aliases ?? [])]) {
    const k = canon(name);
    if (!BY_CANON.has(k)) BY_CANON.set(k, game);
  }
}

export function findCatalogGame(name: string): CatalogGame | null {
  return BY_CANON.get(canon(name)) ?? null;
}

/** All canonical names (title and aliases) of a catalog game. */
export function catalogNames(game: CatalogGame): string[] {
  return [game.title, ...(game.aliases ?? [])].map(canon);
}
