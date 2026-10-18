// The stream part of a project (v0.1.3): prepare a session, log when it
// starts and ends, and note moments worth revisiting. Nothing here talks to
// Twitch or OBS; it never decides what was funny or how to edit anything.
// A YouTube video made from a stream is a separate, linked project.
import { useEffect, useState } from "react";
import { useAction, useApp, useData } from "../app/context.tsx";
import { addMoment, addTask, createSession, deleteMoment, deleteTask, getProject, listLinkedProjects, listMoments, listSessions, listTasks, renameTask, setTaskDone, updateMoment, updateSession } from "../db/repos.ts";
import { GO_LIVE_LIMIT, formatOffset, markMoment, parseOffset, sessionState, streamTitleIdeas, youtubeFromStream } from "../domain/streams.ts";
import type { Project, StreamMode, StreamSession } from "../domain/types.ts";
import { Button, Chip, Segmented, TextArea, TextInput } from "../ui/kit.tsx";
import { Section } from "./RecordingSheet.tsx";

const MODES: { id: StreamMode; label: string }[] = [
  { id: "casual", label: "Casual Live" },
  { id: "concept", label: "Concept Stream" },
];

/** A text box with a live character count, for Twitch's 140-character fields. Saves when you leave it. */
function Limited(p: { value: string; limit: number; placeholder: string; label: string; onCommit: (v: string) => void }) {
  const [v, setV] = useState(p.value);
  useEffect(() => setV(p.value), [p.value]);
  const over = v.length > p.limit;
  return (
    <div className="stack tight">
      <div className="row nowrap">
        <input className={`input grow ${over ? "over" : ""}`} value={v} placeholder={p.placeholder} onChange={(e) => setV(e.target.value)} onBlur={() => v !== p.value && p.onCommit(v)} onKeyDown={(e) => e.key === "Enter" && p.onCommit(v)} aria-label={p.label} />
        <span className={`mono small ${over ? "err-text" : "dim"}`}>
          {v.length}/{p.limit}
        </span>
      </div>
    </div>
  );
}

function clock(iso: string | null): string {
  return iso ? new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "";
}

function Session({ s, project, onChanged }: { s: StreamSession; project: Project; onChanged: () => void }) {
  const { db } = useApp();
  const act = useAction();
  const up = (patch: Partial<StreamSession>) => void act(() => updateSession(db, s.id, patch)).then(onChanged);
  const state = sessionState(s);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (state !== "live") return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [state]);
  const ideas = streamTitleIdeas({ game: project.details.game, title: project.title, hook: project.details.hook || project.premise, mode: s.mode });
  const elapsed = s.startedAt ? ((s.endedAt ? Date.parse(s.endedAt) : now) - Date.parse(s.startedAt)) / 1000 : 0;

  return (
    <div className="stream-session stack">
      <div className="row">
        <Segmented value={s.mode} options={MODES} onChange={(v) => v && up({ mode: v })} label="Stream mode" />
        <span className="dim small">{s.mode === "casual" ? "Just stream. No premise, no series, nothing to promise." : "There's a particular thing you want to explore this session."}</span>
      </div>

      <div className="kv-grid">
        <span className="label">Stream title</span>
        <div className="stack tight">
          <Limited value={s.title} limit={140} placeholder="What viewers see on Twitch" label="Stream title" onCommit={(title) => up({ title })} />
          {ideas.filter((t) => t !== s.title).length ? (
            <div className="row small">
              <span className="dim">Starting points:</span>
              {ideas
                .filter((t) => t !== s.title)
                .map((t) => (
                  <button key={t} type="button" className="chip clickable" onClick={() => up({ title: t })} title="Use this, then make it yours">
                    {t}
                  </button>
                ))}
            </div>
          ) : null}
        </div>
        <span className="label">Category</span>
        <TextInput value={s.category} placeholder="The game or Twitch category" onCommit={(category) => up({ category })} />
        <span className="label">Go-live note</span>
        <div className="stack tight">
          <Limited value={s.goLiveNote} limit={GO_LIVE_LIMIT} placeholder="Optional: the short notification followers get" label="Go-live notification" onCommit={(goLiveNote) => up({ goLiveNote })} />
          <span className="dim small">Twitch has no API for this; paste it into your Creator Dashboard's stream info.</span>
        </div>
        <span className="label">{s.mode === "concept" ? "What you want from it" : "Anything in mind? (optional)"}</span>
        <TextArea value={s.goal} rows={2} placeholder={s.mode === "concept" ? "The thing you're exploring this session" : "Nothing is fine"} onCommit={(goal) => up({ goal })} />
        <span className="label">Talking points</span>
        <TextArea value={s.talkingPoints} rows={2} placeholder="Optional: things you might bring up. Not a script." onCommit={(talkingPoints) => up({ talkingPoints })} />
      </div>

      <div className={`lcd stream-clock ${state}`}>
        <div className="lcd-label">
          SESSION :: {state === "planned" ? "NOT STARTED" : state === "live" ? "LIVE" : "ENDED"}
          {s.startedAt ? ` · started ${clock(s.startedAt)}` : ""}
          {s.endedAt ? ` · ended ${clock(s.endedAt)}` : ""}
        </div>
        <div className="lcd-title mono">{formatOffset(elapsed)}</div>
        <div className="row">
          {state === "planned" ? (
            <Button variant="primary" icon="play" onClick={() => up({ startedAt: new Date().toISOString() })} title="Logs the time you went live (it doesn't start anything in OBS or on Twitch)">
              I'm live: start the log
            </Button>
          ) : null}
          {state === "live" ? (
            <>
              <Button variant="primary" icon="star" onClick={() => void act(() => markMoment(db, s), { title: "MOMENT MARKED", body: formatOffset(elapsed) }).then(onChanged)}>
                Mark moment
              </Button>
              <Button icon="check" onClick={() => up({ endedAt: new Date().toISOString() })}>
                Stream ended
              </Button>
            </>
          ) : null}
          {state === "ended" ? (
            <Button size="small" onClick={() => up({ endedAt: null })} title="Undo 'Stream ended'">
              Still live
            </Button>
          ) : null}
        </div>
      </div>

      <div className="kv-grid">
        <span className="label">VOD link</span>
        <TextInput value={s.vodUrl} placeholder="Optional: paste the past-broadcast link (Twitch deletes them after a while)" onCommit={(vodUrl) => up({ vodUrl: vodUrl.trim() })} />
        <span className="label">Session notes</span>
        <TextArea value={s.notes} rows={3} placeholder="How it went, what you'd do differently" onCommit={(notes) => up({ notes })} />
      </div>
    </div>
  );
}

function MomentList({ project, sessions, onChanged }: { project: Project; sessions: StreamSession[]; onChanged: () => void }) {
  const { db } = useApp();
  const act = useAction();
  const { data, reload } = useData(() => listMoments(db, project.id), [project.id, sessions.length]);
  const [at, setAt] = useState("");
  const [note, setNote] = useState("");
  const last = sessions[sessions.length - 1] ?? null;
  const add = () => {
    if (!at.trim() && !note.trim()) return;
    const secs = parseOffset(at);
    void act(() => addMoment(db, project.id, { sessionId: last?.id ?? null, atText: at.trim(), offsetSeconds: secs, note: note.trim() })).then(() => {
      setAt("");
      setNote("");
      reload();
      onChanged();
    });
  };
  const list = data ?? [];
  return (
    <div className="stack tight">
      {list.length ? null : <p className="dim small">Moments you mark while live, or VOD times you type in later, land here. Only you decide what's worth revisiting.</p>}
      {list.map((m) => (
        <div key={m.id} className="row nowrap moment">
          <TextInput className="mono stamp" value={m.atText} placeholder="time" onCommit={(v) => void act(() => updateMoment(db, m.id, { atText: v.trim() })).then(reload)} />
          <TextInput className="grow" value={m.note} placeholder="What happened" onCommit={(v) => void act(() => updateMoment(db, m.id, { note: v })).then(reload)} />
          <Button size="small" icon="x" title="Remove" onClick={() => void act(() => deleteMoment(db, m.id)).then(reload)} />
        </div>
      ))}
      <div className="row nowrap">
        <input className="input mono stamp" value={at} placeholder="1:23:45" onChange={(e) => setAt(e.target.value)} aria-label="VOD time" />
        <input className="input grow" value={note} placeholder="A moment worth revisiting, and press Enter" onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} aria-label="Moment note" />
        <Button icon="plus" title="Add" onClick={add} />
      </div>
    </div>
  );
}

function Checklist({ projectId }: { projectId: string }) {
  const { db } = useApp();
  const act = useAction();
  const { data } = useData(() => listTasks(db, projectId), [projectId]);
  const items = (data ?? []).filter((t) => t.list === "stream");
  const [draft, setDraft] = useState("");
  return (
    <div className="stack tight">
      {items.map((t) => (
        <div key={t.id} className="row nowrap moment">
          <label className="check">
            <input type="checkbox" checked={t.done} onChange={(e) => void act(() => setTaskDone(db, t.id, e.target.checked))} aria-label={`Done: ${t.label}`} />
          </label>
          <TextInput className={`grow ${t.done ? "done" : ""}`} value={t.label} onCommit={(v) => void act(() => (v.trim() ? renameTask(db, t.id, v.trim()) : deleteTask(db, t.id)))} />
          <Button size="small" icon="x" title="Remove" onClick={() => void act(() => deleteTask(db, t.id))} />
        </div>
      ))}
      <div className="row nowrap">
        <input
          className="input grow"
          value={draft}
          placeholder="Add a setup step and press Enter"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && draft.trim()) {
              void act(() => addTask(db, projectId, "stream", draft.trim()));
              setDraft("");
            }
          }}
          aria-label="Add a setup step"
        />
      </div>
      {items.length ? <p className="dim small">Untick everything for the next session from the list itself; it's yours to change.</p> : null}
    </div>
  );
}

/** Main column: the session itself. */
export function StreamPanel({ project }: { project: Project }) {
  const { db, go } = useApp();
  const act = useAction();
  const { data: sessions, reload } = useData(() => listSessions(db, project.id), [project.id]);
  const { data: linked } = useData(() => listLinkedProjects(db, project.id), [project.id]);
  const list = sessions ?? [];
  const [idx, setIdx] = useState<number | null>(null);
  const current = list[idx ?? list.length - 1] ?? null;
  const ended = list.some((s) => s.endedAt);

  const newSession = () =>
    void act(() => createSession(db, project.id, { mode: current?.mode ?? "casual", category: current?.category ?? project.details.game.split(" + ")[0] ?? "", title: current?.title ?? "" }), { title: "SESSION PLANNED" }).then(() => {
      setIdx(null);
      reload();
    });

  return (
    <Section title="Stream" hint="Prepare, go live in OBS as usual, and log it here. Nothing on this sheet touches Twitch or OBS.">
      <div className="row">
        {list.length > 1
          ? list.map((s, i) => (
              <button key={s.id} type="button" className={`chip clickable ${current?.id === s.id ? "accent" : ""}`} onClick={() => setIdx(i)}>
                Session {i + 1}
                {s.startedAt ? ` · ${new Date(s.startedAt).toLocaleDateString()}` : ""}
              </button>
            ))
          : null}
        <Button size="small" icon="plus" onClick={newSession}>
          {list.length ? "Another session" : "Plan a session"}
        </Button>
      </div>
      {current ? <Session key={current.id} s={current} project={project} onChanged={reload} /> : <p className="dim small">No session planned yet.</p>}
      {ended && project.destination !== "youtube" ? (
        <div className="row stream-to-video">
          <Button
            icon="projects"
            onClick={() =>
              void act(() => youtubeFromStream(db, project.id), { title: "LINKED PROJECT MADE", body: "The stream's notes and moments are in its notes." }).then((p) => {
                if (p) go({ section: "workshop", projectId: p.id });
              })
            }
            title="Only if something from the stream deserves its own video. Raw streams aren't videos."
          >
            Make a YouTube video from this stream
          </Button>
          <span className="dim small">Optional. A separate project about something that happened, not the raw stream.</span>
        </div>
      ) : null}
      {linked?.length ? (
        <p className="small">
          <span className="label">Videos from this stream</span>{" "}
          {linked.map((l) => (
            <button key={l.id} type="button" className="linklike" onClick={() => go({ section: "workshop", projectId: l.id })}>
              {l.title}
            </button>
          ))}
        </p>
      ) : null}
    </Section>
  );
}

/** Side column: checklist and moments. */
export function StreamSide({ project }: { project: Project }) {
  const { db } = useApp();
  const { data: sessions, reload } = useData(() => listSessions(db, project.id), [project.id]);
  return (
    <>
      <Section title="Before going live">
        <Checklist projectId={project.id} />
      </Section>
      <Section title="Moments worth revisiting">
        <MomentList project={project} sessions={sessions ?? []} onChanged={reload} />
      </Section>
    </>
  );
}

/** On a YouTube project made from a stream: where it came from. */
export function FromStream({ sourceId }: { sourceId: string }) {
  const { db, go } = useApp();
  const { data } = useData(() => getProject(db, sourceId), [sourceId]);
  if (!data) return null;
  return (
    <p className="small">
      <Chip>From a stream</Chip>{" "}
      <button type="button" className="linklike" onClick={() => go({ section: "workshop", projectId: data.id })}>
        {data.title}
      </button>{" "}
      <span className="dim">· the stream's notes and moments are under My notes</span>
    </p>
  );
}
