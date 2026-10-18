// The recording sheet: the one screen that tells you how to start this video.
// Everything here is editable and saves as you type. Older projects (made
// before v0.1.2) show the same layout with empty spots you can fill in.
// Every older field is still here, under "More notes".
import { useState, type ReactNode } from "react";
import { useAction, useApp, useData } from "../app/context.tsx";
import { addTask, deleteTask, listTasks, renameTask, setTaskDone, updateProject, type ProjectPatch } from "../db/repos.ts";
import type { Approach, Project, ProjectDetails } from "../domain/types.ts";
import { subjectLabel } from "../domain/ideas/subjects.ts";
import { videoTypeLabel } from "../domain/ideas/videoTypes.ts";
import { findCatalogGame } from "../domain/games/catalog.ts";
import { Button, Chip, TextArea, TextInput } from "../ui/kit.tsx";
import { StartGuide } from "./StartGuide.tsx";
import { FromStream, StreamPanel, StreamSide } from "./StreamPanel.tsx";

/** The pre-v0.1.2 project fields, kept in full under "More notes". */
export const MORE_NOTES: { key: keyof ProjectDetails; label: string; hint: string; rows?: number }[] = [
  { key: "research", label: "Research", hint: "What you need to find out, at what depth." },
  { key: "recordingRequirements", label: "Recording requirements", hint: "Screen, voice, camera, real-world footage." },
  { key: "equipment", label: "Equipment", hint: "Hardware, software, props." },
  { key: "locations", label: "Locations (if any)", hint: "Where you need to be, and permissions needed." },
  { key: "questions", label: "Important questions", hint: "What the video should answer or investigate." },
  { key: "thingsToCapture", label: "Things to capture", hint: "Shots, moments, screens you don't want to forget." },
  { key: "references", label: "Reference materials", hint: "Videos, articles, examples you want to look at." },
  { key: "structure", label: "Optional structure", hint: "A loose outline or talking points. Improvise freely; this is not a script.", rows: 5 },
  { key: "assets", label: "Project assets & credits", hint: "Music, images, clips you'll use and where they came from." },
  { key: "thumbnailConcepts", label: "Thumbnail concepts", hint: "Ideas for the thumbnail (design them in Thumbnail Lab)." },
  { key: "uploadInfo", label: "Upload information", hint: "Anything to remember when publishing." },
  { key: "notes", label: "Notes", hint: "Anything else.", rows: 5 },
];

export function StringList(p: { items: string[]; onChange: (v: string[]) => void; placeholder: string; label: string }) {
  const [draft, setDraft] = useState("");
  const add = () => {
    if (!draft.trim()) return;
    p.onChange([...p.items, draft.trim()]);
    setDraft("");
  };
  return (
    <div className="stack tight">
      {p.items.map((it, i) => (
        <div key={`${i}-${it}`} className="row nowrap">
          <span className="bullet" aria-hidden="true">
            ▸
          </span>
          <TextInput className="grow" value={it} onCommit={(v) => p.onChange(v.trim() ? p.items.map((x, j) => (j === i ? v.trim() : x)) : p.items.filter((_, j) => j !== i))} />
          <Button size="small" icon="x" title="Remove" onClick={() => p.onChange(p.items.filter((_, j) => j !== i))} />
        </div>
      ))}
      <div className="row nowrap">
        <input className="input grow" value={draft} placeholder={p.placeholder} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} aria-label={`Add to ${p.label}`} />
        <Button icon="plus" title="Add" onClick={add} />
      </div>
    </div>
  );
}

function Moments({ projectId }: { projectId: string }) {
  const { db } = useApp();
  const act = useAction();
  const { data } = useData(() => listTasks(db, projectId), [projectId]);
  const items = (data ?? []).filter((t) => t.list === "recording");
  const [draft, setDraft] = useState("");
  const add = () => {
    if (!draft.trim()) return;
    void act(() => addTask(db, projectId, "recording", draft.trim()));
    setDraft("");
  };
  return (
    <div className="stack tight">
      {items.length ? null : <p className="dim small">Nothing listed yet. Add the moments you don't want to forget to capture.</p>}
      {items.map((t) => (
        <div key={t.id} className="row nowrap moment">
          <label className="check" title={t.done ? "Captured" : "Not captured yet"}>
            <input type="checkbox" checked={t.done} onChange={(e) => void act(() => setTaskDone(db, t.id, e.target.checked))} aria-label={`Captured: ${t.label}`} />
          </label>
          <TextInput className={`grow ${t.done ? "done" : ""}`} value={t.label} onCommit={(v) => void act(() => (v.trim() ? renameTask(db, t.id, v.trim()) : deleteTask(db, t.id)))} />
          <Button size="small" icon="x" title="Remove" onClick={() => void act(() => deleteTask(db, t.id))} />
        </div>
      ))}
      <div className="row nowrap">
        <input className="input grow" value={draft} placeholder="Add a moment to capture and press Enter" onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} aria-label="Add a moment to capture" />
        <Button icon="plus" title="Add" onClick={add} />
      </div>
      {items.length ? <p className="dim small">{items.filter((t) => t.done).length} of {items.length} captured. Tick them off as you record, or ignore the list and improvise.</p> : null}
    </div>
  );
}

function Approaches({ p, save }: { p: Project; save: (patch: ProjectPatch) => void }) {
  const [editing, setEditing] = useState(false);
  const list = p.details.approaches;
  const setList = (approaches: Approach[], chosen = p.details.chosenApproach) =>
    save({ details: { approaches, chosenApproach: chosen !== null && chosen < approaches.length ? chosen : null } });
  return (
    <div className="stack tight">
      {list.map((a, i) =>
        editing ? (
          <div key={i} className="approach editing">
            <TextInput value={a.name} placeholder="Name this take" onCommit={(v) => setList(list.map((x, j) => (j === i ? { ...x, name: v } : x)))} />
            <TextArea value={a.how} rows={2} placeholder="How it would go" onCommit={(v) => setList(list.map((x, j) => (j === i ? { ...x, how: v } : x)))} />
            <Button size="small" icon="trash" onClick={() => setList(list.filter((_, j) => j !== i), p.details.chosenApproach === i ? null : p.details.chosenApproach)}>
              Remove
            </Button>
          </div>
        ) : (
          <button
            key={i}
            type="button"
            className={`approach ${p.details.chosenApproach === i ? "on" : ""}`}
            aria-pressed={p.details.chosenApproach === i}
            onClick={() => save({ details: { chosenApproach: p.details.chosenApproach === i ? null : i } })}
          >
            <span className="approach-mark" aria-hidden="true">
              {p.details.chosenApproach === i ? "◉" : "○"}
            </span>
            <span>
              <b>{a.name}</b>
              {a.how ? <span className="approach-how">{a.how}</span> : null}
            </span>
          </button>
        ),
      )}
      {!list.length && !editing ? <p className="dim small">No approaches yet. Add a couple of different ways this video could go.</p> : null}
      <div className="row">
        <Button size="small" onClick={() => setEditing(!editing)}>
          {editing ? "Done editing" : "Edit approaches"}
        </Button>
        {editing ? (
          <Button size="small" icon="plus" onClick={() => setList([...list, { name: "Another take", how: "" }])}>
            Add one
          </Button>
        ) : list.length ? (
          <span className="dim small">Pick the one you're going with (or none: change your mind any time).</span>
        ) : null}
      </div>
    </div>
  );
}

/** Commits on Enter or when you leave the box, so the field doesn't vanish mid-typing. */
function GameField({ onSet }: { onSet: (v: string) => void }) {
  const [v, setV] = useState("");
  const commit = () => v.trim() && onSet(v.trim());
  return <input className="input grow" value={v} placeholder="Which game is this about? (optional, press Enter)" onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === "Enter" && commit()} aria-label="Game" />;
}

export function Section(p: { title: string; children: ReactNode; hint?: string; className?: string }) {
  return (
    <section className={`sheet-section ${p.className ?? ""}`}>
      <h4>{p.title}</h4>
      {p.hint ? <p className="dim small">{p.hint}</p> : null}
      {p.children}
    </section>
  );
}

export function RecordingSheet({ project: p, next }: { project: Project; next: string }) {
  const { db } = useApp();
  const act = useAction();
  const save = (patch: ProjectPatch) => void act(() => updateProject(db, p.id, patch));
  const d = p.details;
  const games = d.game ? d.game.split(" + ") : [];
  const cat = games[0] ? findCatalogGame(games[0]) : null;
  const filled = MORE_NOTES.filter((s) => String(d[s.key] ?? "").trim()).length;

  return (
    <div className="sheet">
      <div className="sheet-main">
        <div className="sheet-game">
          <span className="label">{games.length > 1 ? "Games" : "Game"}</span>
          {d.game ? <b className="sheet-game-name">{d.game}</b> : null}
          {cat?.year ? <span className="dim">{cat.year}</span> : null}
          {cat?.genres.length ? <span className="dim">{cat.genres.slice(0, 2).map(subjectLabel).join(" · ")}</span> : null}
          {d.videoType ? <Chip>{videoTypeLabel(d.videoType)}</Chip> : null}
          {d.access ? <Chip kind={/library|already have|^Free|No game/.test(d.access) ? "ok" : /buy|wishlist|Not in/.test(d.access) ? "warn" : undefined}>{d.access}</Chip> : null}
          {!d.game ? <GameField onSet={(game) => save({ details: { game } })} /> : null}
        </div>

        {p.sourceProjectId ? <FromStream sourceId={p.sourceProjectId} /> : null}
        {p.destination !== "youtube" ? <StreamPanel project={p} /> : null}

        <Section title={p.destination === "twitch" ? "The idea (optional for Casual Live)" : "The hook"}>
          <TextArea className="hook" value={d.hook || p.premise} rows={2} placeholder="The situation that makes this video interesting, in a sentence." onCommit={(v) => save({ details: { hook: v } })} />
          {d.watchAppeal ? (
            <p className="watch">
              <span className="label">Why someone watches</span> {d.watchAppeal}
            </p>
          ) : null}
        </Section>

        <Section title="Your take" hint={d.approaches.length > 1 ? "Different ways this could go. These are directions, not scripts." : undefined}>
          <Approaches p={p} save={save} />
        </Section>

        <Section title="Where it starts" hint="A natural place to start recording. Not an intro to read out.">
          <TextArea value={d.startingSituation} rows={2} placeholder="e.g. start at the character creator and answer honestly" onCommit={(v) => save({ details: { startingSituation: v } })} />
        </Section>

        {p.destination !== "twitch" ? <StartGuide project={p} /> : null}

        <Section title="My notes">
          <TextArea value={d.myNotes} rows={5} placeholder="Anything: bits you want to try, things you noticed, what you'd do differently." onCommit={(v) => save({ details: { myNotes: v } })} />
        </Section>
      </div>

      <div className="sheet-side">
        <div className="lcd sheet-next">
          <div className="lcd-label">NEXT STEP</div>
          <TextInput className="lcd-input" value={p.nextAction} placeholder={next} onCommit={(v) => save({ nextAction: v })} />
        </div>

        {d.firstFive && d.firstFive.trim() !== p.nextAction.trim() ? (
          <Section title="First five minutes" className="accent">
            <p className="selectable">
              <b>{d.firstFive}</b>
            </p>
          </Section>
        ) : null}

        {p.destination !== "youtube" ? <StreamSide project={p} /> : null}

        {p.destination !== "twitch" ? (
          <Section title="Moments to capture">
            <Moments projectId={p.id} />
          </Section>
        ) : null}

        <Section title="You need">
          <StringList items={d.needs} label="You need" placeholder="Add something you need" onChange={(needs) => save({ details: { needs } })} />
        </Section>

        <details className="sheet-section" open={d.visualBeats.length > 0}>
          <summary>
            <h4>Visual beats (optional)</h4>
          </summary>
          <p className="dim small">Spots where a caption, freeze-frame or cut might land. Pointers to situations only: whether and how it's funny is your call.</p>
          <StringList items={d.visualBeats} label="Visual beats" placeholder="e.g. the moment the bridge collapses" onChange={(visualBeats) => save({ details: { visualBeats } })} />
        </details>

        {p.destination !== "twitch" && (d.smallestVideo || d.ifItGoesWell) ? (
          <Section title="Size it">
            <dl className="kv">
              {d.smallestVideo ? (
                <>
                  <dt>Smallest video</dt>
                  <dd>{d.smallestVideo}</dd>
                </>
              ) : null}
              {d.ifItGoesWell ? (
                <>
                  <dt>If it goes well</dt>
                  <dd>{d.ifItGoesWell}</dd>
                </>
              ) : null}
            </dl>
          </Section>
        ) : null}

        {d.whySuits.length ? (
          <Section title="Why it suits you">
            <ul className="plain small">
              {d.whySuits.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </Section>
        ) : null}
      </div>

      <div className="sheet-more">
        <details>
          <summary>
            <h4>
              More notes{" "}
              <span className="dim small">
                · title, premise, research, equipment, structure, upload info and the other planning fields ({filled} of {MORE_NOTES.length} filled)
              </span>
            </h4>
          </summary>
          <div className="grid cols-2">
            <label className="field">
              <span>Project title</span>
              <TextInput value={p.title} onCommit={(v) => v.trim() && save({ title: v.trim() })} />
            </label>
            <div className="field">
              <span>Subjects</span>
              <div className="row">
                {p.subjects.length ? p.subjects.map((s) => <Chip key={s} onRemove={() => save({ subjects: p.subjects.filter((x) => x !== s) })}>{subjectLabel(s)}</Chip>) : <span className="dim small">None yet</span>}
              </div>
            </div>
            <label className="field">
              <span>Core premise</span>
              <TextArea value={p.premise} rows={3} onCommit={(v) => save({ premise: v })} />
            </label>
            <label className="field">
              <span>Why I want to make it</span>
              <TextArea value={p.why} rows={3} onCommit={(v) => save({ why: v })} />
            </label>
            {MORE_NOTES.map((s) => (
              <label key={s.key} className="field">
                <span>
                  {s.label} <span className="dim small">{s.hint}</span>
                </span>
                <TextArea rows={s.rows ?? 3} value={String(d[s.key] ?? "")} onCommit={(v) => save({ details: { [s.key]: v } as Partial<ProjectDetails> })} />
              </label>
            ))}
          </div>
          {d.origin ? (
            <details>
              <summary className="dim">Where this idea came from</summary>
              <pre className="inset small selectable" style={{ whiteSpace: "pre-wrap", fontFamily: "var(--font-ui)" }}>
                {d.origin}
              </pre>
            </details>
          ) : null}
        </details>
      </div>
    </div>
  );
}
