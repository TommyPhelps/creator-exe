// Content Focus: what share of ideas comes from gaming, gaming-adjacent tech
// and everything else. It is enforced as eligibility (a 0% domain is never
// suggested), and the shares are met over several batches by tracking what
// was recently shown, so a batch of three never needs "0.45 of a tech idea".

import type { Domain } from "./subjects.ts";

export interface ContentFocus {
  preset: FocusPresetId | "custom";
  gaming: number;
  tech: number;
  other: number;
}

export const FOCUS_PRESETS = [
  { id: "gaming-only", label: "Gaming only", gaming: 100, tech: 0, other: 0, hint: "Only gaming ideas." },
  { id: "gaming-first", label: "Gaming first", gaming: 85, tech: 15, other: 0, hint: "Mostly gaming, now and then gaming-related tech." },
  { id: "gaming-tech", label: "Gaming + tech", gaming: 60, tech: 40, other: 0, hint: "Gaming with regular gaming-related tech." },
  { id: "variety", label: "Variety channel", gaming: 50, tech: 20, other: 30, hint: "Gaming-led, with some unrelated subjects mixed in." },
  { id: "explore", label: "Explore outside my niche", gaming: 25, tech: 15, other: 60, hint: "Deliberately outside gaming. Use when you want to try something different." },
] as const;

export type FocusPresetId = (typeof FOCUS_PRESETS)[number]["id"];

export const DEFAULT_FOCUS: ContentFocus = { preset: "gaming-first", gaming: 85, tech: 15, other: 0 };

export const DOMAIN_LABEL: Record<Domain, string> = {
  gaming: "Gaming",
  "gaming-tech": "Gaming-adjacent tech",
  other: "Outside gaming",
};

export function presetFocus(id: FocusPresetId): ContentFocus {
  const p = FOCUS_PRESETS.find((x) => x.id === id) ?? FOCUS_PRESETS[1];
  return { preset: p.id, gaming: p.gaming, tech: p.tech, other: p.other };
}

/** Clamps to whole percentages that add up to 100; all-zero falls back to the default. */
export function normalizeFocus(f: Partial<ContentFocus> | null | undefined): ContentFocus {
  const clamp = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(100, Math.round(v))) : 0);
  const g = clamp(f?.gaming);
  const t = clamp(f?.tech);
  const o = clamp(f?.other);
  const sum = g + t + o;
  if (sum === 0) return { ...DEFAULT_FOCUS };
  let gaming = Math.round((g / sum) * 100);
  let tech = Math.round((t / sum) * 100);
  let other = 100 - gaming - tech;
  if (other < 0) {
    tech += other;
    other = 0;
  }
  if (tech < 0) {
    gaming += tech;
    tech = 0;
  }
  const preset = FOCUS_PRESETS.find((p) => p.gaming === gaming && p.tech === tech && p.other === other)?.id ?? "custom";
  return { preset, gaming, tech, other };
}

export function share(f: ContentFocus, d: Domain): number {
  return d === "gaming" ? f.gaming : d === "gaming-tech" ? f.tech : f.other;
}

export function allowedDomains(f: ContentFocus): Domain[] {
  return (["gaming", "gaming-tech", "other"] as Domain[]).filter((d) => share(f, d) > 0);
}

/** Whether ideas outside gaming are switched on (shown as a banner so it's always a visible choice). */
export function isExploring(f: ContentFocus): boolean {
  return f.other > 0;
}

/**
 * Picks the domain of each slot in a batch. Uses the domains of recently
 * shown ideas so the long-run mix follows the focus: each slot goes to the
 * allowed domain furthest below its target share. Domains with no remaining
 * candidates are skipped; a 0% domain is never chosen.
 */
export function allocateDomains(
  f: ContentFocus,
  count: number,
  recent: Domain[],
  available: Record<Domain, number>,
  rng: () => number = Math.random,
): Domain[] {
  const counts: Record<Domain, number> = { gaming: 0, "gaming-tech": 0, other: 0 };
  for (const d of recent) counts[d]++;
  let total = recent.length;
  const left = { ...available };
  const out: Domain[] = [];
  for (let i = 0; i < count; i++) {
    let best: Domain | null = null;
    let bestDeficit = -Infinity;
    for (const d of allowedDomains(f)) {
      if (left[d] <= 0) continue;
      const deficit = (share(f, d) / 100) * (total + 1) - counts[d] + rng() * 0.01;
      if (deficit > bestDeficit) {
        bestDeficit = deficit;
        best = d;
      }
    }
    if (!best) break;
    out.push(best);
    counts[best]++;
    left[best]--;
    total++;
  }
  return out;
}
