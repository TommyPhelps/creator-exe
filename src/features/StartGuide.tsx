// "Where do I start?" on the recording sheet (v0.1.3). A few quick answers,
// then plain guidance on where to begin recording. It never writes a script
// or decides the edit; you pick how much background to include.
import { useAction, useApp, useData } from "../app/context.tsx";
import { getGame, updateProject } from "../db/repos.ts";
import { canon, catalogNames, findCatalogGame } from "../domain/games/catalog.ts";
import { CHOICE_LABEL, startAdvice, type AboutPart, type ContextNeed, type SaveState, type StartChoice, type StartPlan } from "../domain/startGuide.ts";
import type { Project } from "../domain/types.ts";
import { Segmented } from "../ui/kit.tsx";
import { StringList } from "./RecordingSheet.tsx";

const SAVE: { id: SaveState; label: string }[] = [
  { id: "existing", label: "I have a save near it" },
  { id: "fresh", label: "No save yet" },
  { id: "unsure", label: "Not sure" },
];
const ABOUT: { id: AboutPart; label: string }[] = [
  { id: "beginning", label: "How the game begins" },
  { id: "middle", label: "Something later on" },
  { id: "anywhere", label: "Could happen anywhere" },
];
const CONTEXT: { id: ContextNeed; label: string }[] = [
  { id: "none", label: "None" },
  { id: "little", label: "A little" },
  { id: "lots", label: "Quite a lot" },
];
const CHOICES = (Object.keys(CHOICE_LABEL) as StartChoice[]).map((id) => ({ id, label: CHOICE_LABEL[id] }));

export function StartGuide({ project: p }: { project: Project }) {
  const { db } = useApp();
  const act = useAction();
  const d = p.details;
  const plan = d.startPlan;
  const set = (patch: Partial<StartPlan>) => void act(() => updateProject(db, p.id, { details: { startPlan: { ...plan, ...patch } } }));
  const firstGame = d.game.split(" + ")[0]?.trim() ?? "";
  // Hours played, from your imported library (if the game is there).
  const { data: hours } = useData(async () => {
    if (!firstGame) return null;
    const cat = findCatalogGame(firstGame);
    for (const n of cat ? catalogNames(cat) : [canon(firstGame)]) {
      const g = await getGame(db, n);
      if (g?.playtimeMin) return g.playtimeMin / 60;
    }
    return null;
  }, [firstGame]);
  const advice = startAdvice(plan, { startingSituation: d.startingSituation || undefined, startFrom: d.startFrom ?? undefined, hoursPlayed: hours ?? null, game: d.game || undefined, fromStream: !!p.sourceProjectId });
  const answered = plan.save || plan.about || plan.context || plan.choice;

  return (
    <details className="sheet-section start-guide" open={!plan.choice}>
      <summary>
        <h4>Where do I start?</h4>
        {plan.choice ? <span className="chip ok">{CHOICE_LABEL[plan.choice]}</span> : <span className="dim small">You don't have to show everything that came before.</span>}
      </summary>
      <div className="start-q">
        <span className="label">Your save</span>
        <Segmented value={plan.save} options={SAVE} onChange={(v) => set({ save: v })} allowNone label="Your save" />
        <span className="label">It's about</span>
        <Segmented value={plan.about} options={ABOUT} onChange={(v) => set({ about: v })} allowNone label="What the video is about" />
        <span className="label">Context needed</span>
        <div className="row">
          <Segmented value={plan.context} options={CONTEXT} onChange={(v) => set({ context: v })} allowNone label="Context a viewer needs" />
          <label className="check">
            <input type="checkbox" checked={plan.dependsOnChoices} onChange={(e) => set({ dependsOnChoices: e.target.checked })} />
            Depends on earlier choices or story
          </label>
        </div>
      </div>

      <div className={`lcd start-advice ${answered ? "" : "quiet"}`}>
        <div className="lcd-label">SUGGESTION{advice.suggested ? ` :: ${CHOICE_LABEL[advice.suggested].toUpperCase()}` : ""}</div>
        <div className="lcd-line selectable">{advice.headline}</div>
      </div>

      <div className="start-cols">
        <div className="stack tight">
          <span className="label">Viewers actually need</span>
          <ul className="plain">
            {advice.viewersNeed.slice(0, advice.viewersNeed.length - plan.viewerNeeds.filter((x) => x.trim()).length).map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
          <StringList items={plan.viewerNeeds} label="What viewers need to know" placeholder="Something viewers need to know, in your words" onChange={(viewerNeeds) => set({ viewerNeeds })} />
        </div>
        <div className="stack tight">
          <span className="label">Footage to grab separately (a few seconds each)</span>
          {advice.capture.map((c) => (
            <label key={c} className="check">
              <input type="checkbox" checked={plan.captured.includes(c)} onChange={(e) => set({ captured: e.target.checked ? [...plan.captured, c] : plan.captured.filter((x) => x !== c) })} />
              {c}
            </label>
          ))}
        </div>
      </div>
      <ul className="plain dim small">
        {advice.notes.map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>
      <div className="row">
        <span className="label">I'll go with</span>
        <Segmented value={plan.choice} options={CHOICES} onChange={(v) => set({ choice: v })} allowNone label="Where you'll start" />
        <span className="dim small">Your call; change it any time.</span>
      </div>
    </details>
  );
}
