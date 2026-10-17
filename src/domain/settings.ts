// Application settings stored in the settings table (never secrets).
import type { Db } from "../platform/types.ts";
import { getSetting, setSetting } from "../db/repos.ts";
import type { GeneratorControls } from "./ideas/generator.ts";

export const THEMES = [
  { id: "midnight-2003", label: "Midnight 2003" },
  { id: "phosphor-green", label: "Phosphor Green" },
  { id: "crt-amber", label: "CRT Amber" },
  { id: "gothic-terminal", label: "Gothic Terminal" },
  { id: "classic-dark", label: "Classic Windows Dark" },
  { id: "monochrome-studio", label: "Monochrome Studio" },
] as const;
export type ThemeId = (typeof THEMES)[number]["id"];
export type Density = "compact" | "comfortable" | "spacious";

export interface AppSettings {
  theme: ThemeId;
  density: Density;
  textScale: number;
  channelInput: string;
  projectRoot: string;
  folderTemplate: string[];
  editorPath: string;
  generator: GeneratorControls;
  navCollapsed: boolean;
  onboarded: boolean;
  /** True once the starting profile from the brief was offered (never re-added after you delete it). */
  briefSeeded: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  theme: "midnight-2003",
  density: "comfortable",
  textScale: 1,
  channelInput: "UCGnpORs6LGRRb1b7y39wumw",
  projectRoot: "",
  folderTemplate: ["Research", "Recordings", "Audio", "Images", "Thumbnails", "Assets", "Exports", "Notes"],
  editorPath: "",
  generator: {},
  navCollapsed: false,
  onboarded: false,
  briefSeeded: false,
};

export const SECRET_YOUTUBE_KEY = "youtube_api_key";

export async function loadSettings(db: Db): Promise<AppSettings> {
  const stored = await getSetting<Partial<AppSettings>>(db, "app", {});
  return { ...DEFAULT_SETTINGS, ...stored, generator: { ...(stored.generator ?? {}) } };
}

export async function saveSettings(db: Db, s: AppSettings): Promise<void> {
  await setSetting(db, "app", s);
}
