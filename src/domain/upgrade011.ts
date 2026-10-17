// One-time v0.1.1 upgrade of an existing profile: separates personal
// interests from channel content interests and records the gaming-first
// direction Tommy asked for. Nothing is deleted; every change can be undone
// in Creator Memory (flip an entry back to "Channel", or delete an addition).
import type { Db } from "../platform/types.ts";
import { addProfileItem, listProfile, updateProfileItem } from "../db/repos.ts";
import { subjectDomain, subjectsForText } from "./ideas/subjects.ts";
import type { Durability, ProfileKind } from "./types.ts";

export const V011_NOTE = "From your v0.1.1 feedback (Oct 2026): gaming first. Edit or delete freely.";

/** Kinds that describe what to make; these are the ones split into channel vs personal. */
const INTEREST_KINDS: ProfileKind[] = ["favorite_subject", "current_interest", "format_enjoyed", "production_style"];

export const V011_ADDITIONS: { kind: ProfileKind; value: string; durability: Durability }[] = [
  { kind: "favorite_game", value: "The Witcher 3", durability: "enduring" },
  { kind: "favorite_game", value: "Elden Ring", durability: "enduring" },
  { kind: "favorite_game", value: "Dark Souls", durability: "enduring" },
  { kind: "favorite_subject", value: "Older RPGs (Morrowind and its era)", durability: "enduring" },
  { kind: "favorite_subject", value: "Retro PC games", durability: "enduring" },
  { kind: "favorite_subject", value: "Atmospheric RPGs with strong worlds and discovery", durability: "enduring" },
  { kind: "favorite_subject", value: "Unusual indie games", durability: "enduring" },
  { kind: "favorite_subject", value: "Gaming nostalgia", durability: "enduring" },
  { kind: "favorite_subject", value: "Minecraft modpacks and game mods", durability: "enduring" },
  { kind: "favorite_subject", value: "Interesting game mechanics", durability: "enduring" },
  { kind: "favorite_subject", value: "Bizarre and experimental games", durability: "enduring" },
  { kind: "favorite_subject", value: "Gaming-related tech: old games on modern PCs, game engines", durability: "enduring" },
  { kind: "avoid", value: "competitive multiplayer", durability: "enduring" },
  { kind: "avoid", value: "endless grind", durability: "enduring" },
];

/** True when a profile entry is about gaming or gaming-adjacent tech. */
export function isGamingInterest(value: string): boolean {
  return subjectsForText(value).some((s) => subjectDomain(s) !== "other");
}

export interface UpgradeReport {
  movedToPersonal: string[];
  kept: string[];
  added: string[];
}

export async function upgradeProfileTo011(db: Db): Promise<UpgradeReport> {
  const profile = await listProfile(db);
  const report: UpgradeReport = { movedToPersonal: [], kept: [], added: [] };
  for (const p of profile) {
    if (!INTEREST_KINDS.includes(p.kind) || p.scope !== "channel") continue;
    if (isGamingInterest(p.value)) report.kept.push(p.value);
    else {
      await updateProfileItem(db, p.id, { scope: "personal" });
      report.movedToPersonal.push(p.value);
    }
  }
  const have = new Set(profile.map((p) => `${p.kind}|${p.value.trim().toLowerCase()}`));
  for (const a of V011_ADDITIONS) {
    if (have.has(`${a.kind}|${a.value.toLowerCase()}`)) continue;
    await addProfileItem(db, a.kind, a.value, a.durability, V011_NOTE, "channel");
    report.added.push(a.value);
  }
  return report;
}
