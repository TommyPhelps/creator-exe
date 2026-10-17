import type { Db } from "../../platform/types.ts";
import type { ParsedTranscript } from "./transcript.ts";

export interface SilenceRange { start: number; end: number; }
export interface LocalMediaAnalysis {
  path: string;
  fileName: string;
  durationSeconds: number;
  inspectedSeconds: number;
  width: number | null;
  height: number | null;
  sceneSeconds: number[];
  silenceRanges: SilenceRange[];
  notes: string[];
}
export interface VideoForensics {
  videoId: string;
  media: LocalMediaAnalysis | null;
  transcript: ParsedTranscript | null;
  transcriptFilename: string;
  thumbnailPalette: string[];
  thumbnailFilename: string;
  creatorNotes: string;
  creatorTags: string[];
  updatedAt: string;
}
export type ForensicsChange = Partial<Pick<VideoForensics, "media" | "transcript" | "transcriptFilename" | "thumbnailPalette" | "thumbnailFilename" | "creatorNotes" | "creatorTags">>;

const str = (v: unknown) => typeof v === "string" ? v : "";
function parse<T>(value: unknown, fallback: T): T {
  try { return JSON.parse(str(value)) as T; } catch { return fallback; }
}
const empty = (videoId: string): VideoForensics => ({
  videoId, media: null, transcript: null, transcriptFilename: "",
  thumbnailPalette: [], thumbnailFilename: "", creatorNotes: "", creatorTags: [], updatedAt: "",
});

export async function loadForensics(db: Db, videoId: string): Promise<VideoForensics> {
  const rows = await db.select<Record<string, unknown>>("SELECT * FROM video_forensics WHERE video_id = ?", [videoId]);
  const row = rows[0];
  if (!row) return empty(videoId);
  return {
    videoId,
    media: parse<LocalMediaAnalysis | null>(row.media_json, null),
    transcript: parse<ParsedTranscript | null>(row.transcript_json, null),
    transcriptFilename: str(row.transcript_filename),
    thumbnailPalette: parse<string[]>(row.thumbnail_palette, []),
    thumbnailFilename: str(row.thumbnail_filename),
    creatorNotes: str(row.creator_notes),
    creatorTags: parse<string[]>(row.creator_tags, []),
    updatedAt: str(row.updated_at),
  };
}

/** Merge a single analysis or annotation. Never erase other evidence types. */
export async function saveForensics(db: Db, videoId: string, patch: ForensicsChange): Promise<VideoForensics> {
  const current = await loadForensics(db, videoId);
  const next: VideoForensics = { ...current, ...patch, videoId, updatedAt: new Date().toISOString() };
  await db.execute(
    `INSERT INTO video_forensics (video_id, media_json, transcript_json, transcript_filename, thumbnail_palette, thumbnail_filename, creator_notes, creator_tags, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(video_id) DO UPDATE SET media_json = excluded.media_json, transcript_json = excluded.transcript_json,
      transcript_filename = excluded.transcript_filename, thumbnail_palette = excluded.thumbnail_palette,
      thumbnail_filename = excluded.thumbnail_filename, creator_notes = excluded.creator_notes,
      creator_tags = excluded.creator_tags, updated_at = excluded.updated_at`,
    [next.videoId, JSON.stringify(next.media), JSON.stringify(next.transcript), next.transcriptFilename,
      JSON.stringify(next.thumbnailPalette), next.thumbnailFilename, next.creatorNotes,
      JSON.stringify(next.creatorTags), next.updatedAt],
  );
  return next;
}

/** Pixel colors are observed colors only, NOT inferred thumbnail design intent. */
export function paletteFromPixels(rgba: Uint8ClampedArray, maxColors = 5): string[] {
  const counts = new Map<string, number>();
  for (let i = 0; i + 3 < rgba.length; i += 64) {
    if ((rgba[i + 3] ?? 0) < 150) continue;
    const r = ((rgba[i] ?? 0) >> 5) << 5;
    const g = ((rgba[i + 1] ?? 0) >> 5) << 5;
    const b = ((rgba[i + 2] ?? 0) >> 5) << 5;
    const rgb = [r + 16, g + 16, b + 16].map(x => Math.min(255, x));
    const hex = "#" + rgb.map(x => x.toString(16).padStart(2, "0")).join("");
    counts.set(hex, (counts.get(hex) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a,b) => b[1] - a[1]).slice(0, Math.max(1, maxColors)).map(([color]) => color);
}
