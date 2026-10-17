// Starting Creator Memory taken from Tommy's own CREATOR.EXE brief, so the
// first ideas are personal instead of "enjoyment: unknown". Every entry is
// marked with where it came from and can be edited or deleted in Creator
// Memory. It is only added once, and only to an empty profile.
import type { Db } from "../platform/types.ts";
import type { Durability, ProfileKind } from "./types.ts";
import { addProfileItem, listProfile } from "../db/repos.ts";

export const BRIEF_NOTE = "From your CREATOR.EXE brief (Oct 2026). Edit or delete freely.";

export const BRIEF_ENTRIES: { kind: ProfileKind; value: string; durability: Durability }[] = [
  { kind: "favorite_subject", value: "Retro computing", durability: "enduring" },
  { kind: "favorite_subject", value: "Linux and old operating systems", durability: "enduring" },
  { kind: "favorite_subject", value: "Early-2000s culture", durability: "enduring" },
  { kind: "favorite_subject", value: "Strange software", durability: "enduring" },
  { kind: "favorite_subject", value: "Technology experiments", durability: "enduring" },
  { kind: "favorite_subject", value: "Internet history", durability: "enduring" },
  { kind: "favorite_subject", value: "Internet memes", durability: "enduring" },
  { kind: "favorite_subject", value: "Absurd and unconventional humor", durability: "enduring" },
  { kind: "favorite_subject", value: "Weird or fascinating subjects", durability: "enduring" },
  { kind: "favorite_subject", value: "Movies and entertainment", durability: "enduring" },
  { kind: "favorite_subject", value: "Video games, when they interest me", durability: "enduring" },
  { kind: "favorite_subject", value: "Learning skills and trying new hobbies", durability: "enduring" },
  { kind: "favorite_subject", value: "Making things and creative projects", durability: "enduring" },
  { kind: "favorite_subject", value: "Unexpected real-world experiences", durability: "enduring" },
  { kind: "current_interest", value: "Documentary-style videos", durability: "temporary" },
  { kind: "current_interest", value: "Real-world experiments", durability: "temporary" },
  { kind: "current_interest", value: "Humorous commentary", durability: "temporary" },
  { kind: "current_interest", value: "Retro technology videos", durability: "temporary" },
  { kind: "current_interest", value: "Creative challenges", durability: "temporary" },
];

/** Adds the brief's entries if the profile is empty. Returns how many were added. */
export async function seedProfileFromBrief(db: Db): Promise<number> {
  if ((await listProfile(db)).length > 0) return 0;
  for (const e of BRIEF_ENTRIES) await addProfileItem(db, e.kind, e.value, e.durability, BRIEF_NOTE);
  return BRIEF_ENTRIES.length;
}
