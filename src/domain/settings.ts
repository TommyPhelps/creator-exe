// Application settings stored in the settings table (never secrets).
import type { Db } from "../platform/types.ts";
import { getSetting, setSetting } from "../db/repos.ts";
import type { GeneratorControls } from "./ideas/generator.ts";
import { DEFAULT_FOCUS, normalizeFocus, type ContentFocus } from "./ideas/focus.ts";

/** 0.2.0: one near-black look; the theme only picks the accent colour. */
export const THEMES = [
  { id: "ember", label: "Black / ember accent" },
  { id: "ice", label: "Black / ice accent" },
  { id: "rose", label: "Black / rose accent" },
  { id: "mono", label: "Black / no colour" },
] as const;
export type ThemeId = (typeof THEMES)[number]["id"];

/** Themes from 0.1.x map onto the new accents so nobody lands on a missing theme. */
export function normalizeTheme(v: unknown): ThemeId {
  if (THEMES.some((t) => t.id === v)) return v as ThemeId;
  if (v === "monochrome-studio" || v === "classic-dark") return "mono";
  if (v === "gothic-terminal") return "rose";
  if (v === "midnight-2003") return "ice";
  return "ember";
}
export type Density = "compact" | "comfortable" | "spacious";

export interface AppSettings {
  theme: ThemeId;
  density: Density;
  textScale: number;
  channelInput: string;
  /** Creator-owned branding, written by you. Never replaced by imported YouTube data. (Same key and shape as the 0.2.0 preview.) */
  channelIdentity: ChannelIdentity;
  projectRoot: string;
  folderTemplate: string[];
  editorPath: string;
  generator: GeneratorControls;
  navCollapsed: boolean;
  onboarded: boolean;
  /** True once the starting profile from the brief was offered (never re-added after you delete it). */
  briefSeeded: boolean;
  /** What share of ideas comes from gaming, gaming-adjacent tech and other subjects. */
  contentFocus: ContentFocus;
  /** Look up game covers and prices on the Steam store (sends only game names). */
  gameCovers: boolean;
  /** True once the v0.1.1 personal/channel interest split has run. */
  v011Upgraded: boolean;
  /** 0.2.0: show cover art on idea cards (off gives every card the same plain header). */
  ideaCovers: boolean;
  /** 0.2.0: width of the section list, in pixels (drag its edge). */
  navWidth: number;
}

export interface ChannelIdentity {
  displayName: string;
  description: string;
  avatarNote: string;
  bannerNote: string;
  visualStyle: string;
}

/** Tamster's channel as Tommy described it on 2026-10-17 (issue #1). The description is kept exactly as written. */
export const TAMSTER_IDENTITY: ChannelIdentity = {
  displayName: "Tamster",
  description: "Just a guy who likes games, old computers, and weird shit.\n\nI mostly do gaming videos with the occasional tech stuff thrown in.\n\nMy videos are never on schedule and always low quality :)",
  avatarNote: "Gray meme cat with red laser eyes (made by me)",
  bannerNote: "Pink-tinted retro collage: cats, a small vintage computer, and a Windows-style TAMSTER / LOW QUALITY GAMING VIDEOS dialog box (made by me)",
  visualStyle: "Old YouTube / Y2K handmade, slightly chaotic meme look. Not MrBeast-style packaging, not glossy or corporate. Graphics are made by hand, not AI-generated.",
};

export const DEFAULT_SETTINGS: AppSettings = {
  theme: "ember",
  density: "comfortable",
  textScale: 1,
  channelInput: "UCGnpORs6LGRRb1b7y39wumw",
  channelIdentity: TAMSTER_IDENTITY,
  projectRoot: "",
  folderTemplate: ["Research", "Recordings", "Audio", "Images", "Thumbnails", "Assets", "Exports", "Notes"],
  editorPath: "",
  generator: {},
  navCollapsed: false,
  onboarded: false,
  briefSeeded: false,
  contentFocus: DEFAULT_FOCUS,
  gameCovers: true,
  v011Upgraded: false,
  ideaCovers: true,
  navWidth: 236,
};

export const SECRET_YOUTUBE_KEY = "youtube_api_key";

export async function loadSettings(db: Db): Promise<AppSettings> {
  const stored = await getSetting<Partial<AppSettings>>(db, "app", {});
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    theme: normalizeTheme(stored.theme),
    navWidth: Math.max(180, Math.min(420, Number(stored.navWidth) || DEFAULT_SETTINGS.navWidth)),
    channelIdentity: { ...TAMSTER_IDENTITY, ...(stored.channelIdentity ?? {}) },
    generator: { ...(stored.generator ?? {}) },
    contentFocus: normalizeFocus(stored.contentFocus ?? DEFAULT_FOCUS),
  };
}

export async function saveSettings(db: Db, s: AppSettings): Promise<void> {
  await setSetting(db, "app", s);
}
