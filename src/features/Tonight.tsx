import { useEffect, useState } from "react";
import { useApp, useData } from "../app/context.tsx";
import { listProjects, listTasks, recordImpressions } from "../db/repos.ts";
import { PHASES, isUnfinished, phaseOf, suggestedNextAction } from "../domain/projects.ts";
import { generateIdeas, type GeneratedIdea } from "../domain/ideas/generator.ts";
import { loadCreatorContext } from "../domain/ideas/context.ts";
import { DESTINATIONS, type Destination, type Energy, type RecordingStyle, type TimeBox } from "../domain/types.ts";
import { Button, Note, PageHead, Segmented, Win } from "../ui/kit.tsx";
import { IdeaCard, useIdeaActions } from "./ideaActions.tsx";

const TIMES = [
  { id: "30m", label: "30 min" },
  { id: "1h", label: "1 hour" },
  { id: "afternoon", label: "A few hours" },
] as const;
const ENERGY = [
  { id: "low", label: "Low" },
  { id: "medium", label: "Medium" },
  { id: "high", label: "High" },
] as const;
const REC = [
  { id: "screen", label: "Screen" },
  { id: "voiceover", label: "Voice" },
  { id: "face", label: "On camera" },
  { id: "real-world", label: "Out and about" },
] as const;

export function Tonight() {
  const { db, toast, settings, go, updateSettings } = useApp();
  const [destination, setDestination] = useState<Destination>(settings.generator.destination ?? "youtube");
  const inProgress = useData(async () => {
    const [projects, tasks] = await Promise.all([listProjects(db), listTasks(db)]);
    return projects
      .filter(isUnfinished)
      .sort((a, b) => (b.openedAt ?? b.updatedAt).localeCompare(a.openedAt ?? a.updatedAt))
      .slice(0, 4)
      .map((p) => ({ p, next: suggestedNextAction(p, tasks) }));
  }, []);
  const actions = useIdeaActions();
  const [time, setTime] = useState<TimeBox | null>(null);
  const [energy, setEnergy] = useState<Energy | null>(null);
  const [rec, setRec] = useState<RecordingStyle | null>(null);
  const [ideas, setIdeas] = useState<GeneratedIdea[]>([]);
  const [notes, setNotes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [seed, setSeed] = useState(0);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
    let alive = true;
    setBusy(true);
    (async () => {
      const ctx = await loadCreatorContext(db);
      const r = generateIdeas({ mode: "tonight", time, energy, recording: rec, destination }, ctx, { count: 3, focus: settings.contentFocus });
      if (!alive) return;
      setIdeas(r.ideas);
      setNotes([...r.notes, ...(r.relaxed.length ? [`Loosened: ${r.relaxed.join(", ")}, to find three options.`] : [])]);
      setDismissed(new Set());
      await recordImpressions(db, r.ideas.map((i) => i.key));
    })()
      .catch((e: unknown) => toast("ERROR", e instanceof Error ? e.message : String(e), "err"))
      .finally(() => alive && setBusy(false));
    return () => {
      alive = false;
    };
  }, [db, toast, time, energy, rec, seed, settings.contentFocus, destination]);

  const visible = ideas.filter((i) => !dismissed.has(i.key));

  return (
    <div className="page">
      <PageHead
        sys="TONIGHT.EXE :: CREATIVE JUICE DETECTED"
        title="Make something tonight"
        lede={
          destination === "twitch"
            ? "Three things you could stream tonight, with games you have or that are free. A stream can just be a stream."
            : "Three small gaming ideas you can start right now, with games you have or that are free. Each one has a reason to exist beyond 'I played it'."
        }
        actions={
          <Button icon="dice" onClick={() => setSeed((s) => s + 1)} disabled={busy}>
            Three different ideas
          </Button>
        }
      />
      <div className="row">
        <span className="label">Making</span>
        <Segmented
          value={destination}
          options={DESTINATIONS}
          onChange={(v) => {
            const next = v ?? "youtube";
            setDestination(next);
            void updateSettings({ generator: { ...settings.generator, destination: next } });
          }}
          label="What you're making"
        />
        <span className="label">Time</span>
        <Segmented value={time} options={TIMES} onChange={(v) => setTime(v)} allowNone label="Time available" />
        <span className="label">Energy</span>
        <Segmented value={energy} options={ENERGY} onChange={(v) => setEnergy(v)} allowNone label="Energy" />
        <span className="label">Recording</span>
        <Segmented value={rec} options={REC} onChange={(v) => setRec(v)} allowNone label="Recording style" />
      </div>
      {notes.map((n) => (
        <Note key={n}>{n}</Note>
      ))}
      <div className="ideas-grid">
        {visible.map((g) => (
          <IdeaCard
            key={g.key}
            idea={g}
            tonight
            onStart={() => void actions.start(g, true)}
            onSave={() => void actions.save(g)}
            onReact={(r) => {
              void actions.react(g, r);
              setDismissed((d) => new Set(d).add(g.key));
            }}
          />
        ))}
      </div>
      {inProgress.data?.length ? (
        <Win title="OR PICK UP WHERE YOU LEFT OFF" icon="projects" meta={`${inProgress.data.length}`}>
          <div className="continue-grid">
            {inProgress.data.map(({ p, next }) => (
              <button key={p.id} className="btn continue-item" onClick={() => go({ section: "workshop", projectId: p.id })}>
                <span className="dim small">{(PHASES.find((x) => x.id === phaseOf(p.stage))?.label ?? "").toUpperCase()}</span>
                <b className="ellipsis">{p.title}</b>
                <span className="small ellipsis">&gt; {next}</span>
              </button>
            ))}
          </div>
        </Win>
      ) : null}
      {!busy && visible.length === 0 ? (
        <Note>
          All three dismissed. <Button size="small" onClick={() => setSeed((s) => s + 1)}>Show three more</Button>
        </Note>
      ) : null}
    </div>
  );
}
