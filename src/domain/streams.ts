// v0.1.3: practical stream preparation. Nothing here talks to Twitch or OBS;
// it helps you get ready, log the session and note moments worth revisiting.
// It never decides what was funny or how anything should be edited.

import type { Db } from "../platform/types.ts";
import { addMoment, addTask, createProject, createSession, getProject, listMoments, listSessions, logProjectEvent } from "../db/repos.ts";
import type { Idea, Moment, Project, StreamMode, StreamSession } from "./types.ts";

/** Twitch's limit for the go-live notification text. */
export const GO_LIVE_LIMIT = 140;

/** A short, editable pre-stream checklist. Yours to change. */
export const STREAM_CHECKLIST = [
  "OBS scenes and sources look right",
  "Game audio and mic levels checked",
  "Stream title and category set on Twitch",
  "Go-live notification text set (optional)",
  "Recording a local copy too, in case it becomes a video",
  "Phone and desktop notifications off",
];

/** Starting points for a stream title, built from the idea itself. You write the real one. */
export function streamTitleIdeas(input: { game: string; title: string; hook: string; mode: StreamMode }): string[] {
  const game = input.game.split(" + ")[0]?.trim() ?? "";
  const out = input.mode === "casual" ? [game ? `Playing ${game}` : "Just playing something", game ? `${game}, no plan` : "No plan tonight"] : [input.hook, input.title.replace(/^Casual Live: /, "")];
  return [...new Set(out.map((t) => t.trim()).filter(Boolean).map((t) => (t.length > 140 ? `${t.slice(0, 139).trimEnd()}…` : t)))];
}

/** "1:02:03" for 3723 seconds. */
export function formatOffset(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

/** Reads "1:02:03", "62:03" or "1h2m3s" as seconds; null when it isn't a timestamp. */
export function parseOffset(text: string): number | null {
  const t = text.trim();
  const hms = /^(\d+)h(?:(\d+)m)?(?:(\d+)s)?$/i.exec(t);
  if (hms) return Number(hms[1]) * 3600 + Number(hms[2] ?? 0) * 60 + Number(hms[3] ?? 0);
  const parts = t.split(":").map((x) => (/^\d+$/.test(x) ? Number(x) : NaN));
  if (parts.some((x) => Number.isNaN(x)) || parts.length < 2 || parts.length > 3) return null;
  return parts.reduce((acc, x) => acc * 60 + x, 0);
}

export function sessionState(s: StreamSession): "planned" | "live" | "ended" {
  return s.endedAt ? "ended" : s.startedAt ? "live" : "planned";
}

/** Plans the first session of a stream project, with the default checklist. */
export async function planStream(db: Db, project: Project, mode: StreamMode, idea: Idea | null = null): Promise<StreamSession> {
  const d = project.details;
  const titles = streamTitleIdeas({ game: d.game, title: project.title, hook: d.hook || project.premise, mode });
  for (const label of STREAM_CHECKLIST) await addTask(db, project.id, "stream", label);
  return createSession(db, project.id, {
    mode,
    title: titles[0] ?? "",
    category: d.game.split(" + ")[0] ?? "",
    goal: mode === "concept" ? (idea?.details?.hook ?? d.hook ?? "") : "",
  });
}

/** "Mark moment": stores the time since the session started, as a VOD-style timestamp. */
export async function markMoment(db: Db, session: StreamSession, note = "", now: Date = new Date()): Promise<Moment> {
  const offset = session.startedAt ? Math.max(0, Math.round((now.getTime() - Date.parse(session.startedAt)) / 1000)) : null;
  return addMoment(db, session.projectId, { sessionId: session.id, offsetSeconds: offset, atText: offset === null ? "" : formatOffset(offset), note });
}

/**
 * Makes a separate YouTube project from a stream. The stream's notes, VOD
 * links and moments are copied into the new project's notes, and the two
 * stay linked; each is tracked on its own.
 */
export async function youtubeFromStream(db: Db, streamProjectId: string, title?: string): Promise<Project> {
  const stream = await getProject(db, streamProjectId);
  if (!stream) throw new Error("That stream project no longer exists.");
  const [sessions, moments] = await Promise.all([listSessions(db, stream.id), listMoments(db, stream.id)]);
  const lines: string[] = [`From the stream project "${stream.title}".`];
  for (const s of sessions) {
    const when = s.startedAt ? new Date(s.startedAt).toLocaleString() : "planned";
    lines.push("", `Session (${s.mode === "casual" ? "Casual Live" : "Concept Stream"}, ${when})${s.vodUrl ? `: ${s.vodUrl}` : ""}`);
    if (s.notes.trim()) lines.push(s.notes.trim());
  }
  if (moments.length) {
    lines.push("", "Moments worth revisiting:");
    for (const m of moments) lines.push(`- ${m.atText || "(no time)"}  ${m.note}`.trimEnd());
  }
  const p = await createProject(db, {
    title: title?.trim() || `Video from: ${stream.title}`,
    premise: "",
    destination: "youtube",
    sourceProjectId: stream.id,
    stage: "idea",
    nextAction: "Decide which moment from the stream this video is about.",
    details: { game: stream.details.game, videoType: stream.details.videoType, myNotes: lines.join("\n"), source: null },
  });
  await logProjectEvent(db, stream.id, "linked", `YouTube project made from this stream: ${p.title}`);
  return p;
}
