// Optional Steam store lookups for game covers and current prices. Only the
// game's name (or Steam app ID from your own library) is sent to Steam.
// A result is used only when Steam's name matches the game exactly; no cover
// or price is ever guessed. Everything is cached with the date it was checked.

import type { GameInfo } from "../../db/repos.ts";
import type { HttpResult } from "../../platform/types.ts";
import { canon, catalogNames, findCatalogGame } from "./catalog.ts";

export type Get = (url: string) => Promise<HttpResult>;

export const STEAM_SOURCE = "Steam store";
const STALE_DAYS = 30;

interface SearchResponse {
  items?: { id?: number; name?: string; type?: string }[];
}

interface DetailsResponse {
  [appId: string]: {
    success?: boolean;
    data?: {
      name?: string;
      steam_appid?: number;
      is_free?: boolean;
      header_image?: string;
      price_overview?: { final_formatted?: string; currency?: string; discount_percent?: number };
    };
  };
}

export function searchUrl(name: string): string {
  return `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(name)}&l=english&cc=US`;
}

export function detailsUrl(appId: number): string {
  return `https://store.steampowered.com/api/appdetails?appids=${appId}&cc=US&l=english`;
}

/** Picks the search result whose name is the same game (after removing edition words), or nothing. */
export function pickSearchResult(name: string, body: string): { id: number; name: string } | null {
  let parsed: SearchResponse;
  try {
    parsed = JSON.parse(body) as SearchResponse;
  } catch {
    return null;
  }
  const cat = findCatalogGame(name);
  const wanted = new Set(cat ? catalogNames(cat) : [canon(name)]);
  for (const it of parsed.items ?? []) {
    if (typeof it.id !== "number" || typeof it.name !== "string") continue;
    if (it.type && it.type !== "app") continue;
    if (wanted.has(canon(it.name))) return { id: it.id, name: it.name };
  }
  return null;
}

/** Reads cover image, free flag and price from an appdetails response. */
export function parseDetails(appId: number, body: string): { name: string | null; imageUrl: string | null; isFree: boolean | null; priceText: string | null } | null {
  let parsed: DetailsResponse;
  try {
    parsed = JSON.parse(body) as DetailsResponse;
  } catch {
    return null;
  }
  const entry = parsed[String(appId)];
  if (!entry?.success || !entry.data) return null;
  const d = entry.data;
  const imageUrl = typeof d.header_image === "string" && /^https:\/\/[a-z0-9.-]+\.(steamstatic\.com|akamaihd\.net)\//i.test(d.header_image) ? d.header_image : null;
  const isFree = typeof d.is_free === "boolean" ? d.is_free : null;
  const price = d.price_overview?.final_formatted;
  const priceText = isFree ? "Free on Steam" : price ? `${price} on Steam (US store)${d.price_overview?.discount_percent ? `, ${d.price_overview.discount_percent}% off right now` : ""}` : null;
  return { name: typeof d.name === "string" ? d.name : null, imageUrl, isFree, priceText };
}

export function isStale(info: GameInfo, now: Date = new Date()): boolean {
  return now.getTime() - Date.parse(info.checkedAt) > STALE_DAYS * 86_400_000;
}

/** Looks a game up on the Steam store. Network errors return status "error" and should not be cached. */
export async function lookupSteam(get: Get, name: string, knownAppId: number | null = null, now: Date = new Date()): Promise<GameInfo> {
  const key = canon(name);
  const base: GameInfo = { canon: key, query: name, status: "not_found", steamAppId: null, steamName: null, imageUrl: null, isFree: null, priceText: null, source: STEAM_SOURCE, checkedAt: now.toISOString() };
  try {
    let appId = knownAppId;
    let steamName: string | null = null;
    if (appId === null) {
      const res = await get(searchUrl(name));
      if (!res.ok) return { ...base, status: "error" };
      const hit = pickSearchResult(name, res.text);
      if (!hit) return base;
      appId = hit.id;
      steamName = hit.name;
    }
    const det = await get(detailsUrl(appId));
    if (!det.ok) return { ...base, status: "error" };
    const parsed = parseDetails(appId, det.text);
    if (!parsed) return { ...base, steamAppId: appId, steamName };
    return { ...base, status: "found", steamAppId: appId, steamName: parsed.name ?? steamName, imageUrl: parsed.imageUrl, isFree: parsed.isFree, priceText: parsed.priceText };
  } catch {
    return { ...base, status: "error" };
  }
}
