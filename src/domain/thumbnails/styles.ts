// Thumbnail styles found in Tamster's real uploads (Channel DNA, Oct 2026).
// Each style lists the uploads it was seen in, so "why" is always traceable
// to your own thumbnails. Nothing here is a generic YouTube template.

export type StyleId = "reaction" | "reaction-arrow" | "caption" | "rules" | "big-word" | "question" | "error" | "wordart" | "tilted" | "split";

export interface ThumbStyle {
  id: StyleId;
  name: string;
  /** What it looks like, in a sentence. */
  look: string;
  /** Your uploads that use it (titles as they appear on the channel). */
  seenIn: string[];
  /** Your older styles and one-offs are "experimental" here: offered when you ask for something different. */
  experimental: boolean;
  needs: { background: boolean; face: "required" | "optional" | "none"; lines?: boolean };
}

export const THUMB_STYLES: ThumbStyle[] = [
  {
    id: "reaction",
    name: "Reaction + caption",
    look: "Gameplay screenshot full-bleed, your face cut out large on one side, two to four words in bold white with a thick black outline on the other.",
    seenIn: ["Project Zomboid but I can't leave my house", "Night Factory is TERRIFYING", "Dark Souls is hard and I love it!", "How I Survived For 4 Days In Project Zomboid"],
    experimental: false,
    needs: { background: true, face: "required" },
  },
  {
    id: "reaction-arrow",
    name: "Reaction + arrow",
    look: "Like Reaction, with a red curved arrow (black outline) pointing at something in the game. Works without your face too.",
    seenIn: ["I tried to eat all the food in Minecraft!", "Project Zomboid but I can't leave my house", "Night Factory is TERRIFYING"],
    experimental: false,
    needs: { background: true, face: "optional" },
  },
  {
    id: "caption",
    name: "Words over gameplay",
    look: "No face: your words big and outlined over the screenshot, the way your Pacifist thumbnail lets the words be the picture.",
    seenIn: ["Project Zomboid but I'm a Pacifist"],
    experimental: false,
    needs: { background: true, face: "none" },
  },
  {
    id: "rules",
    name: "Rules list",
    look: "Three to five short lines stacked down one side over gameplay, white with a black outline.",
    seenIn: ["Project Zomboid but I'm a Pacifist"],
    experimental: false,
    needs: { background: true, face: "optional", lines: true },
  },
  {
    id: "big-word",
    name: "One big word",
    look: "One huge word across a darkened screenshot, your face beside it.",
    seenIn: ["I played Valorant for the FIRST TIME in 2021"],
    experimental: false,
    needs: { background: true, face: "optional" },
  },
  {
    id: "question",
    name: "Question",
    look: "A short question in big letters, next to your face when there is one.",
    seenIn: ["Small Brain Plays Project Zomboid"],
    experimental: false,
    needs: { background: true, face: "optional" },
  },
  {
    id: "error",
    name: "System message",
    look: "A fake error box over the game (\"stopped working\"), your face reacting to it.",
    seenIn: ["My GAME CRASHED In The Middle Of A BOSS FIGHT | Hollow Knight"],
    experimental: false,
    needs: { background: true, face: "optional" },
  },
  {
    id: "wordart",
    name: "2018 WordArt",
    look: "Bent, outlined meme lettering with a colour gradient, from your 2018 era.",
    seenIn: ["WHY DOES THIS GAME EXIST | Realm Royale", "WHY ARE CHICKENS SO HARD TO HIT!!!", "Dead by Daylight | Stream Highlights"],
    experimental: true,
    needs: { background: true, face: "optional" },
  },
  {
    id: "tilted",
    name: "Tilted banner",
    look: "The caption on a tilted colour band, for something louder than usual.",
    seenIn: [],
    experimental: true,
    needs: { background: true, face: "optional" },
  },
  {
    id: "split",
    name: "Split screen",
    look: "Two screenshots side by side with a label on each, for comparisons and before/after.",
    seenIn: [],
    experimental: true,
    needs: { background: true, face: "none" },
  },
];

export const STYLE_BY_ID = new Map(THUMB_STYLES.map((s) => [s.id, s]));

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Which style one of your uploads uses, when it is one the styles were taken from. */
export function styleForTitle(title: string): ThumbStyle | null {
  const t = norm(title);
  return THUMB_STYLES.find((s) => s.seenIn.some((x) => norm(x) === t)) ?? null;
}
