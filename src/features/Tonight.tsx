import { useEffect, useState } from "react";
import { useApp } from "../app/context.tsx";
import { recordImpressions } from "../db/repos.ts";
import { generateIdeas, type GeneratedIdea } from "../domain/ideas/generator.ts";
import { loadCreatorContext } from "../domain/ideas/context.ts";
import type { Energy, RecordingStyle, TimeBox } from "../domain/types.ts";
import { Button, Note, PageHead, Segmented } from "../ui/kit.tsx";
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
  const { db, toast } = useApp();
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
      const r = generateIdeas({ mode: "tonight", time, energy, recording: rec }, ctx, { count: 3 });
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
  }, [db, toast, time, energy, rec, seed]);

  const visible = ideas.filter((i) => !dismissed.has(i.key));

  return (
    <div className="page">
      <PageHead
        sys="TONIGHT.EXE :: CREATIVE JUICE DETECTED"
        title="Make something tonight"
        lede="Three small ideas you can start right now. Everything below is optional; pick one and press START THIS VIDEO to get a ready-made project."
        actions={
          <Button icon="dice" onClick={() => setSeed((s) => s + 1)} disabled={busy}>
            Three different ideas
          </Button>
        }
      />
      <div className="row">
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
      <div className="grid cols-3">
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
      {!busy && visible.length === 0 ? (
        <Note>
          All three dismissed. <Button size="small" onClick={() => setSeed((s) => s + 1)}>Show three more</Button>
        </Note>
      ) : null}
    </div>
  );
}
