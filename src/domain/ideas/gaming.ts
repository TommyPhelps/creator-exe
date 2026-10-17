import type { IdeaSeed } from "./library.ts";

/** Film actual gaming experiences; never invent game ownership or licensing. */
const base: Omit<IdeaSeed, "key" | "title" | "premise" | "firstStep" | "whatYouDo" | "subjects"> = {
  why: "A real game experience gives your own reactions and observations space to develop naturally.",
  worthExploring: "Find out what makes an unfamiliar game, mechanic, or mod interesting to play.",
  audience: "People who enjoy genuine gaming discoveries and overlooked PC titles.",
  requirements: ["OBS or another screen recorder", "A game you own or can legally access; verify availability before filming"],
  budgetUsd: 0,
  budgetNote: "Zero extra cost only if you own the game or select a genuinely free release; ownership is not assumed.",
  effort: "small",
  time: "afternoon",
  energy: "medium",
  recording: ["screen", "voiceover"],
  research: "light",
  direction: ["curious", "lighthearted"],
  thumbnail: "One real game screenshot, short rough text and an optional photo you took yourself.",
  originality: "uncommon",
  series: false,
};

const data: Array<Pick<IdeaSeed, "key" | "title" | "premise" | "firstStep" | "whatYouDo" | "subjects"> & { variants?: IdeaSeed["variants"]; research?: IdeaSeed["research"]; time?: IdeaSeed["time"] }> = [
  { key:"old-rpg-blind", title:"Playing {game} for the first time, years late", premise:"Try a classic role-playing game without pretending to have nostalgic memories of it.", firstStep:"Check that you own {game}; write down your expectations before you boot it.", whatYouDo:"Record your authentic first session, exploring unfamiliar systems and world design.", subjects:["nostalgic-games","video-games"], variants:{slot:"game",values:["Morrowind","Gothic","Arx Fatalis","Deus Ex","Vampire: The Masquerade - Bloodlines"]}},
  { key:"itch-horror-underrated", title:"This tiny itch.io horror game does something weird", premise:"Find a legitimate free indie horror game with an unusual premise instead of relying on jumpscares.", firstStep:"Browse itch.io's free horror section and verify the actual game page.", whatYouDo:"Play one short unfamiliar game and discover whether its atmosphere works.", subjects:["horror-games","video-games"] },
  { key:"old-rpg-mechanic", title:"One old RPG mechanic I wish games still had", premise:"Explore one overlooked mechanic from an older PC RPG that affects how you really play.", firstStep:"Choose a game you already own and write down its most surprising mechanic.", whatYouDo:"Capture gameplay examples, experiment, and explain your own experience.", subjects:["game-history","video-games"] },
  { key:"surprising-old-games", title:"I expected {game} to age badly", premise:"Actually play a classic PC game and discover whether it holds up without nostalgia.", firstStep:"Check that you own {game} and note what you expect to be outdated.", whatYouDo:"Play a focused session; compare your predictions with how the game genuinely feels.", subjects:["nostalgic-games","video-games"], variants:{slot:"game",values:["Dark Messiah of Might and Magic","Thief Gold","Max Payne 3","Knights of the Old Republic","Mount & Blade: Warband"]}},
  { key:"minecraft-questpack", title:"Can a quest-driven Minecraft modpack keep me interested?", premise:"Find a reputable Minecraft pack with clear progression and see whether its quest book actually helps.", firstStep:"Check a pack's version, reputation, quest system, and compatibility before installing.", whatYouDo:"Record a clear early goal and see if the game rewards you for following it.", subjects:["game-mods","video-games"], time:"weekend" },
  { key:"warband-actual-mod", title:"Is a famous Warband mod any good today?", premise:"Test one widely discussed Warband mod on its own merits without promising a Bannerlord makeover.", firstStep:"Identify a stable mod and confirm it matches your Warband version.", whatYouDo:"Play a genuine first session, noting how the experience differs from vanilla.", subjects:["game-mods","nostalgic-games"] },
  { key:"indie-genre-nobody-mentioned", title:"I found a game genre I'd never tried", premise:"Discover an obscure PC gaming subgenre and try one real example with no pretense.", firstStep:"Find two real games in the same unfamiliar niche and check how to access them.", whatYouDo:"Give the genre a fair shot and figure out what people see in it.", subjects:["video-games","game-history"] },
  { key:"pc-game-forgotten", title:"A forgotten PC game I wish I'd known about", premise:"Search your already-owned PC library for a neglected title with an unusual concept.", firstStep:"Sort your Steam library for games with little or no playtime.", whatYouDo:"Play the neglected game and document the interesting surprises, good or bad.", subjects:["game-history","nostalgic-games"] },
  { key:"one-weird-mod", title:"One mod changed how {game} feels", premise:"Try one specific, compatible mod rather than rebuilding an entire modded installation.", firstStep:"Back up your save and verify compatibility with the correct game version.", whatYouDo:"Capture honest before-and-after examples and decide whether to keep the mod.", subjects:["game-mods","video-games"], variants:{slot:"game",values:["Skyrim","Morrowind","Oblivion","Fallout: New Vegas"]}},
  { key:"old-demo-disc", title:"Old PC demos were their own weird games", premise:"Explore legally accessible classic PC demos and find an unexpectedly good or bad one.", firstStep:"Find discs you own or a legally distributed archive of game demos.", whatYouDo:"Try a few demos, then follow whichever one earns a longer look.", subjects:["game-history","nostalgic-games"] },
  { key:"solo-skyrim-save", title:"Can I finally stick with one Skyrim character?", premise:"Instead of restarting the opening, give an existing save a meaningful chance.", firstStep:"Back up your save and choose one quest to play to completion.", whatYouDo:"Record a real session and see whether commitment changes how the game feels.", subjects:["video-games","nostalgic-games"] },
  { key:"linux-gaming-once", title:"Does an old favorite actually work on Linux?", premise:"Test one game you already own on Linux without turning the whole video into a tutorial.", firstStep:"Check the game's Proton compatibility and DRM restrictions before installing.", whatYouDo:"Document setup, launch, and actual gameplay, including surprises and frustration.", subjects:["video-games","linux"] },
  { key:"forgotten-game-fan-project", title:"A fan-made game I almost missed", premise:"Find a genuinely playable and lawfully distributed fan project with an interesting backstory.", firstStep:"Locate the official fan-project page, download instructions, and compatibility notes.", whatYouDo:"Try the project and discover why its creators made it.", subjects:["game-history","video-games"] },
  { key:"first-hour-pc-classic", title:"Can a PC classic hook me in just an hour?", premise:"Give an unfamiliar older title a focused session and decide whether you'd return.", firstStep:"Pick a game you own and document what you know going in.", whatYouDo:"Play the first hour and give an unforced personal verdict, without pretending it is a review.", subjects:["nostalgic-games","video-games"] },
  { key:"why-indie-horror-works", title:"A horror game with almost nothing happening", premise:"Look for an atmospheric low-budget horror game and examine the dread it creates through playing.", firstStep:"Find a real downloadable or already-owned game and avoid plot spoilers.", whatYouDo:"Play it honestly; see whether the quiet moments are actually unsettling.", subjects:["horror-games","video-games"] },
  { key:"minecraft-weird-world", title:"A Minecraft mod that makes the world feel unfamiliar", premise:"Explore a well-maintained world-generation or dimension mod to rediscover the sense of discovery.", firstStep:"Find an up-to-date mod with legitimate downloads and compatible loader.", whatYouDo:"Enter a genuinely changed world and record your first discoveries.", subjects:["game-mods","video-games"] },
];

export const GAMING_IDEAS: IdeaSeed[] = data.map(({ variants, time, research, ...item }) => ({
  ...base, ...item, ...(variants ? { variants } : {}),
  time: time ?? base.time, research: research ?? base.research,
  worthExploring: item.premise,
}));