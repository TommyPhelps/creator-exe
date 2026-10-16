// Shared idea card and actions used by Control Room, Tonight and Idea Machine.
import { useState } from "react";
import { useApp } from "../app/context.tsx";
import type { GeneratedIdea } from "../domain/ideas/generator.ts";
import { TIME_LABEL } from "../domain/ideas/generator.ts";
import { REACTIONS, type Idea, type IdeaStatus, type Reaction } from "../domain/types.ts";
import { createProject, recordIdeaFeedback, saveIdea } from "../db/repos.ts";
import { projectFromIdea } from "../domain/projects.ts";
import { subjectLabel } from "../domain/ideas/subjects.ts";
import { Button, Chip, LevelMeter } from "../ui/kit.tsx";

const EFFORT_LABEL = { tiny: "Tiny", small: "Small", medium: "Medium", ambitious: "Ambitious" } as const;
const REC_LABEL = { screen: "Screen", voiceover: "Voiceover", face: "Face cam", "real-world": "Real world" } as const;

export function useIdeaActions() {
  const { db, toast, changed, go } = useApp();

  const persist = async (g: GeneratedIdea, status: IdeaStatus): Promise<Idea> =>
    saveIdea(db, { origin: "library", libraryKey: g.key, title: g.title, premise: g.premise, details: g.details, subjects: g.subjects, status });

  return {
    async save(g: GeneratedIdea, status: IdeaStatus = "saved") {
      try {
        await persist(g, status);
        if (status === "saved" || status === "maybe") await recordIdeaFeedback(db, g.key, status === "saved" ? "save" : "maybe", g.subjects);
        changed();
        toast("IDEA SAVED", g.title);
      } catch (e) {
        toast("ERROR", e instanceof Error ? e.message : String(e), "err");
      }
    },
    async react(g: GeneratedIdea, reaction: Reaction) {
      try {
        await recordIdeaFeedback(db, g.key, reaction, g.subjects);
        if (reaction === "love") await persist(g, "saved");
        if (reaction === "save") await persist(g, "saved");
        if (reaction === "maybe") await persist(g, "maybe");
        changed();
        toast("FEEDBACK LOGGED", REACTIONS.find((r) => r.id === reaction)?.label);
      } catch (e) {
        toast("ERROR", e instanceof Error ? e.message : String(e), "err");
      }
    },
    async start(g: GeneratedIdea, tonight = false) {
      try {
        const idea = await persist(g, "saved");
        const p = await createProject(db, projectFromIdea(idea, { tonight }));
        changed();
        toast("PROJECT INITIALIZED", tonight ? "First five minutes are on the Plan tab." : g.title);
        go({ section: "workshop", projectId: p.id });
      } catch (e) {
        toast("ERROR", e instanceof Error ? e.message : String(e), "err");
      }
    },
  };
}

export function IdeaCard(props: { idea: GeneratedIdea; compact?: boolean; tonight?: boolean; onStart: () => void; onSave: () => void; onReact: (r: Reaction) => void }) {
  const { idea: g } = props;
  const d = g.details;
  const [open, setOpen] = useState(!props.compact);
  const plus = g.factors.filter((f) => f.effect === "plus");
  const minus = g.factors.filter((f) => f.effect === "minus");

  return (
    <article className="card">
      <div className="row nowrap" style={{ alignItems: "flex-start" }}>
        <h3 className="grow selectable">{g.title}</h3>
        <Chip title="Estimated production effort">{EFFORT_LABEL[d.effort]} effort</Chip>
      </div>
      <p className="selectable">{g.premise}</p>
      <div className="row small">
        <span className="dim">Enjoyment</span>
        <LevelMeter value={g.ratings.enjoyment} label="Likely personal enjoyment" />
        <span className="dim">Feasibility</span>
        <LevelMeter value={g.ratings.feasibility} label="Production feasibility" />
        <span className="dim">Originality</span>
        <LevelMeter value={g.ratings.originality} label="Originality" />
        <span className="dim">Research</span>
        <LevelMeter value={g.ratings.research} label="Research required" />
      </div>
      <div className="row small">
        <Chip>{TIME_LABEL[d.time]}</Chip>
        <Chip>{d.budgetUsd === 0 ? "Free" : `Up to $${d.budgetUsd}`}</Chip>
        <Chip>{d.recording.map((r) => REC_LABEL[r]).join(" + ")}</Chip>
        {d.format === "short" ? <Chip>Short</Chip> : d.format === "either" ? <Chip>Long or Short</Chip> : null}
        {d.series ? <Chip>Series potential</Chip> : null}
        {d.collab === "friends" ? <Chip>With friends</Chip> : null}
      </div>

      {props.tonight && d.tonight ? (
        <dl className="kv selectable">
          <dt>Why it might interest you</dt>
          <dd>{d.why}</dd>
          <dt>What you need</dt>
          <dd>{d.tonight.needs.join("; ")}</dd>
          <dt>First five minutes</dt>
          <dd>
            <b>{d.tonight.firstFive}</b>
          </dd>
          <dt>Minimum viable video</dt>
          <dd>{d.tonight.minimumVideo}</dd>
          <dt>If it goes well</dt>
          <dd>{d.tonight.expansion}</dd>
        </dl>
      ) : open ? (
        <dl className="kv selectable">
          <dt>Why it might interest you</dt>
          <dd>{d.why}</dd>
          <dt>What you'd actually do</dt>
          <dd>{d.whatYouDo}</dd>
          <dt>Worth exploring because</dt>
          <dd>{d.worthExploring}</dd>
          <dt>Possible audience</dt>
          <dd>{d.audience}</dd>
          <dt>You'll need</dt>
          <dd>{d.requirements.join("; ")}</dd>
          <dt>Budget</dt>
          <dd>{d.budgetNote}</dd>
          <dt>Thumbnail direction</dt>
          <dd>{d.thumbnail}</dd>
          <dt>Realistic first step</dt>
          <dd>
            <b>{d.firstStep}</b>
          </dd>
          {d.alternatives.length ? (
            <>
              <dt>Other approaches</dt>
              <dd>{d.alternatives.join(" / ")}</dd>
            </>
          ) : null}
          <dt>Subjects</dt>
          <dd>{g.subjects.map(subjectLabel).join(", ")}</dd>
        </dl>
      ) : null}

      {(plus.length || minus.length) && !props.compact ? (
        <div className="factors" aria-label="Why this was suggested">
          {plus.map((f) => (
            <span key={f.text} className="plus">
              {f.text}
            </span>
          ))}
          {minus.map((f) => (
            <span key={f.text} className="minus">
              {f.text}
            </span>
          ))}
        </div>
      ) : null}

      <div className="row">
        <Button variant="primary" icon="play" onClick={props.onStart}>
          {props.tonight ? "START THIS VIDEO" : "Start project"}
        </Button>
        <Button icon="star" onClick={props.onSave}>
          Save
        </Button>
        {props.compact ? (
          <Button variant="flat" onClick={() => setOpen(!open)}>
            {open ? "Less" : "Details"}
          </Button>
        ) : null}
        <select
          className="select"
          style={{ width: "auto" }}
          value=""
          aria-label="Give feedback on this idea"
          onChange={(e) => {
            const v = e.target.value as Reaction;
            if (v) props.onReact(v);
          }}
        >
          <option value="">Feedback...</option>
          {REACTIONS.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </select>
      </div>
    </article>
  );
}
