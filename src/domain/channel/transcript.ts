/**
 * Parses locally supplied subtitle/transcript files. The app does not claim
 * YouTube gave us transcripts, and no file is uploaded.
 */
export interface TranscriptCue {
  start: number;
  end: number;
  text: string;
}
export interface ParsedTranscript {
  kind: "srt" | "vtt" | "txt";
  cues: TranscriptCue[];
  wordCount: number;
  warnings: string[];
}

export function readTimestamp(input: string): number | null {
  const text = input.trim().replace(",", ".");
  const parts = text.split(":");
  if (parts.length < 2 || parts.length > 3 || parts.some(p => !/^\d+(?:\.\d+)?$/.test(p))) return null;
  const seconds = parts.reduce((v, part) => v * 60 + Number(part), 0);
  return Number.isFinite(seconds) ? seconds : null;
}

function cleanCueText(lines: string[]): string {
  return lines.join(" ")
    .replace(/<[^>]*>/g, "")
    .replace(/\{\\an\d+\}/g, "")
    .replace(/[ \t]+/g, " ")
    .trim();
}

export function parseTranscript(source: string, filename: string): ParsedTranscript {
  if (source.length > 2_000_000) throw new Error("Transcript is over 2 MB. Import a smaller subtitle or text file.");
  const name = filename.toLowerCase();
  const kind: ParsedTranscript["kind"] = name.endsWith(".srt") ? "srt" : name.endsWith(".vtt") ? "vtt" : "txt";
  const text = source.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  if (kind === "txt") {
    const value = text.trim();
    return { kind, cues: value ? [{ start: 0, end: 0, text: value }] : [], wordCount: value ? value.split(/\s+/).length : 0, warnings: ["Plain text has no reliable timestamps."] };
  }
  const cues: TranscriptCue[] = [];
  let discarded = 0;
  const blocks = text.split(/\n\s*\n/);
  for (const block of blocks) {
    const lines = block.split("\n").map(x => x.trim()).filter(Boolean);
    const index = lines.findIndex(l => l.includes("-->"));
    if (index < 0) continue;
    const parts = (lines[index] ?? "").split("-->");
    const start = readTimestamp(parts[0] ?? "");
    const end = readTimestamp((parts[1] ?? "").trim().split(/\s+/)[0] ?? "");
    const content = cleanCueText(lines.slice(index + 1));
    if (start === null || end === null || end < start || !content) { discarded++; continue; }
    cues.push({ start, end, text: content });
    if (cues.length >= 20_000) break;
  }
  const warnings = [];
  if (discarded) warnings.push(`Skipped ${discarded} malformed subtitle blocks.`);
  if (!cues.length) warnings.push("No timed cues were found; check that the file is valid SRT or WebVTT.");
  if (cues.length >= 20_000) warnings.push("Import capped at 20,000 cues.");
  return { kind, cues, wordCount: cues.reduce((n,c) => n + c.text.split(/\s+/).length, 0), warnings };
}

export function durationFromCues(cues: TranscriptCue[]): number {
  return cues.reduce((max, cue) => Math.max(max, cue.end), 0);
}