import { useState } from "react";
import { useAction, useApp, useData } from "../app/context.tsx";
import { createProject, deleteIdea, listIdeas, recordIdeaFeedback, recordImpressions, setIdeaStatus, updateIdea } from "../db/repos.ts";
import { generateIdeas, TIME_LABEL, type GenerationResult, type GeneratorControls, type GenMode, type InterestMode } from "../domain/ideas/generator.ts";
import { loadCreatorContext } from "../domain/ideas/context.ts";
import { subjectLabel } from "../domain/ideas/subjects.ts";
import { projectFromIdea } from "../domain/projects.ts";
import type { Idea, IdeaStatus } from "../domain/types.ts";
import { Button, Chip, Empty, Field, Note, PageHead, Segmented, Tabs, TextArea, TextInput, Win } from "../ui/kit.tsx";
import { IdeaCard, useIdeaActions } from "./ideaActions.tsx";

const MODES: { id: GenMode; label: string; hint: string }[] = [
  { id: "standard", label: "Balanced", hint: "A mix based on your controls and profile." },
  { id: "tonight", label: "Tonight", hint: "Small enough to start right now." },
  { id: "zero-budget", label: "Zero budget", hint: "Nothing to buy." },
  { id: "deep-dive", label: "Deep dive", hint: "Substantial, research-heavy projects." },
  { id: "one-off", label: "One-off", hint: "Self-contained videos." },
  { id: "series", label: "Series", hint: "Could become a recurring format." },
  { id: "curiosity", label: "Curiosity", hint: "Steered by what you type below." },
  { id: "random", label: "Random", hint: "Unexpected picks to break habits." },
];
const INTEREST: { id: InterestMode; label: string }[] = [
  { id: "familiar", label: "Familiar" },
  { id: "adjacent", label: "Adjacent" },
  { id: "new", label: "Completely new" },
  { id: "surprise", label: "Surprise me" },
];

type Opt<T extends string> = { id: T; label: string }[];
const CONTROLS: { key: keyof GeneratorControls; label: string; options: Opt<string> }[] = [
  { key: "energy", label: "Energy", options: [{ id: "low", label: "Low" }, { id: "medium", label: "Medium" }, { id: "high", label: "High" }] },
  {
    key: "time",
    label: "Available time",
    options: [
      { id: "30m", label: "30 min" },
      { id: "1h", label: "1 hour" },
      { id: "afternoon", label: "Afternoon" },
      { id: "day", label: "A day" },
      { id: "weekend", label: "Weekend" },
      { id: "long", label: "Long-term" },
    ],
  },
  {
    key: "recording",
    label: "Recording style",
    options: [
      { id: "screen", label: "Screen" },
      { id: "voiceover", label: "Voiceover" },
      { id: "face", label: "Face camera" },
      { id: "real-world", label: "Real-world" },
      { id: "mixed", label: "Mixed" },
      { id: "anything", label: "Anything" },
    ],
  },
  { key: "size", label: "Project size", options: [{ id: "tiny", label: "Tiny" }, { id: "small", label: "Small" }, { id: "medium", label: "Medium" }, { id: "ambitious", label: "Ambitious" }] },
  { key: "format", label: "Format", options: [{ id: "long", label: "Long-form" }, { id: "short", label: "Shorts" }, { id: "either", label: "Either" }] },
  { key: "collab", label: "Collaboration", options: [{ id: "solo", label: "Solo" }, { id: "friends", label: "With friends" }, { id: "either", label: "Either" }] },
  { key: "research", label: "Research depth", options: [{ id: "light", label: "Light" }, { id: "moderate", label: "Moderate" }, { id: "deep", label: "Deep" }] },
  {
    key: "direction",
    label: "Creative direction",
    options: [
      { id: "lighthearted", label: "Lighthearted" },
      { id: "curious", label: "Curious" },
      { id: "informational", label: "Informational" },
      { id: "experimental", label: "Experimental" },
      { id: "unpredictable", label: "Unpredictable" },
    ],
  },
];
const BUDGETS = [
  { id: "0", label: "Free" },
  { id: "20", label: "Under $20" },
  { id: "50", label: "Under $50" },
];

function Generate() {
  const { db, settings, updateSettings, toast } = useApp();
  const actions = useIdeaActions();
  const [controls, setControls] = useState<GeneratorControls>({ ...settings.generator });
  const [count, setCount] = useState(3);
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [more, setMore] = useState(false);
  const [customBudget, setCustomBudget] = useState("");

  const set = (patch: Partial<GeneratorControls>) => {
    const next = { ...controls, ...patch };
    setControls(next);
    const remember: GeneratorControls = { ...next };
    delete remember.curiosity;
    void updateSettings({ generator: remember });
  };

  const run = async (override?: Partial<GeneratorControls>) => {
    setBusy(true);
    try {
      const ctx = await loadCreatorContext(db);
      const r = generateIdeas({ ...controls, ...override }, ctx, { count });
      setResult(r);
      await recordImpressions(db, r.ideas.map((i) => i.key));
    } catch (e) {
      toast("ERROR", e instanceof Error ? e.message : String(e), "err");
    } finally {
      setBusy(false);
    }
  };

  const mode = controls.mode ?? "standard";
  const budgetValue = controls.budgetUsd === null || controls.budgetUsd === undefined ? null : String(controls.budgetUsd);

  return (
    <div className="stack">
      <Win title="IDEA MACHINE CONTROLS" icon="settings">
        <div className="stack">
          <div className="row">
            <span className="label" style={{ width: 120 }}>
              Mode
            </span>
            <Segmented value={mode} options={MODES} onChange={(v) => set({ mode: v ?? "standard" })} label="Generation mode" />
          </div>
          <p className="dim small" style={{ marginLeft: 130 }}>
            {MODES.find((m) => m.id === mode)?.hint}
          </p>
          <div className="row">
            <span className="label" style={{ width: 120 }}>
              Interest
            </span>
            <Segmented value={controls.interest ?? null} options={INTEREST} onChange={(v) => set({ interest: v })} allowNone label="Interest" />
          </div>
          <div className="row nowrap">
            <span className="label" style={{ width: 120 }}>
              Curious about
            </span>
            <input
              className="input grow"
              value={controls.curiosity ?? ""}
              placeholder="optional: anything on your mind, e.g. old phones, cooking, Linux on weird hardware"
              onChange={(e) => setControls({ ...controls, curiosity: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && void run()}
            />
          </div>
          {more ? (
            <div className="stack">
              {CONTROLS.map((c) => (
                <div key={c.key} className="row">
                  <span className="label" style={{ width: 120 }}>
                    {c.label}
                  </span>
                  <Segmented value={(controls[c.key] as string | null | undefined) ?? null} options={c.options} onChange={(v) => set({ [c.key]: v } as Partial<GeneratorControls>)} allowNone label={c.label} />
                </div>
              ))}
              <div className="row">
                <span className="label" style={{ width: 120 }}>
                  Budget
                </span>
                <Segmented value={BUDGETS.some((b) => b.id === budgetValue) ? budgetValue : null} options={BUDGETS} onChange={(v) => set({ budgetUsd: v === null ? null : Number(v) })} allowNone label="Budget" />
                <input
                  className="input"
                  style={{ width: 110 }}
                  placeholder="Custom $"
                  inputMode="numeric"
                  value={customBudget}
                  onChange={(e) => setCustomBudget(e.target.value.replace(/[^0-9]/g, ""))}
                  onBlur={() => customBudget && set({ budgetUsd: Number(customBudget) })}
                  aria-label="Custom budget in dollars"
                />
              </div>
              <p className="dim small">Nothing here is required. Click a selected option again to clear it. Choices are remembered.</p>
            </div>
          ) : null}
          <div className="row">
            <Button variant="primary" size="big" icon="ideas" onClick={() => void run()} disabled={busy}>
              {busy ? "GENERATING..." : "GENERATE IDEAS"}
            </Button>
            <Button icon="dice" onClick={() => void run({ mode: "random" })} disabled={busy}>
              NO IDEAS? INITIATE RANDOMIZER
            </Button>
            <Button variant="flat" onClick={() => setMore(!more)}>
              {more ? "Fewer controls" : "More controls"}
            </Button>
            <span className="right row">
              <span className="label">How many</span>
              <Segmented value={String(count)} options={[{ id: "3", label: "3" }, { id: "6", label: "6" }]} onChange={(v) => setCount(Number(v ?? 3))} label="Number of ideas" />
            </span>
          </div>
        </div>
      </Win>

      {result ? (
        <>
          {result.notes.map((n) => (
            <Note key={n} kind="warn">
              {n}
            </Note>
          ))}
          {result.relaxed.length ? <Note>To find enough ideas, these preferences were loosened: {result.relaxed.join(", ")}.</Note> : null}
          <div className="grid cols-3">
            {result.ideas.map((g) => (
              <IdeaCard
                key={g.key}
                idea={g}
                onStart={() => void actions.start(g)}
                onSave={() => void actions.save(g)}
                onReact={(r) => {
                  void actions.react(g, r);
                  setResult((cur) => (cur ? { ...cur, ideas: cur.ideas.filter((x) => x.key !== g.key || r === "love" || r === "save" || r === "maybe") } : cur));
                }}
              />
            ))}
          </div>
          <p className="dim small">
            Ratings are rough estimates, not predictions. Enjoyment shows "unknown" until you add favorite subjects, rate past videos or react to ideas. {result.poolSize} concepts matched your limits.
          </p>
        </>
      ) : (
        <Empty icon="ideas" title="NEW IDEA INCOMING">
          Press Generate. You don't need to set anything first.
        </Empty>
      )}
    </div>
  );
}

const STATUS_OPTS: { id: IdeaStatus; label: string }[] = [
  { id: "inbox", label: "Inbox" },
  { id: "saved", label: "Saved" },
  { id: "maybe", label: "Maybe" },
  { id: "started", label: "Started" },
  { id: "done", label: "Done" },
  { id: "rejected", label: "Rejected" },
];

function Inbox({ onCompare }: { onCompare: (ids: string[]) => void }) {
  const { db, go, toast, changed, confirm } = useApp();
  const act = useAction();
  const [filter, setFilter] = useState<IdeaStatus | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const { data } = useData(() => listIdeas(db), []);
  const ideas = (data ?? []).filter((i) => (filter ? i.status === filter : ["inbox", "saved", "maybe"].includes(i.status)));
  const sel = (data ?? []).find((i) => i.id === selected) ?? null;

  const start = async (i: Idea) => {
    try {
      const p = await createProject(db, projectFromIdea(i));
      changed();
      toast("PROJECT INITIALIZED", i.title);
      go({ section: "workshop", projectId: p.id });
    } catch (e) {
      toast("ERROR", e instanceof Error ? e.message : String(e), "err");
    }
  };

  return (
    <div className="split wide-left">
      <Win
        title="IDEA INBOX"
        icon="bolt"
        meta={`${ideas.length} shown`}
        actions={
          picked.size >= 2 ? (
            <Button size="small" onClick={() => onCompare([...picked])}>
              Compare {picked.size}
            </Button>
          ) : null
        }
      >
        <Segmented value={filter} options={STATUS_OPTS} onChange={setFilter} allowNone label="Filter by status" />
        {ideas.length ? (
          <table className="table">
            <thead>
              <tr>
                <th title="Pick up to three to compare">Cmp</th>
                <th>Idea</th>
                <th>Status</th>
                <th>Priority</th>
              </tr>
            </thead>
            <tbody>
              {ideas.map((i) => (
                <tr key={i.id} className={selected === i.id ? "sel" : ""} onClick={() => setSelected(i.id)}>
                  <td onClick={(e) => e.stopPropagation()}>
                    <label className="check">
                      <input
                        type="checkbox"
                        checked={picked.has(i.id)}
                        disabled={!picked.has(i.id) && picked.size >= 3}
                        onChange={(e) => {
                          const n = new Set(picked);
                          if (e.target.checked) n.add(i.id);
                          else n.delete(i.id);
                          setPicked(n);
                        }}
                        aria-label={`Compare ${i.title}`}
                      />
                    </label>
                  </td>
                  <td>
                    <div>{i.title}</div>
                    <div className="dim small">{i.origin === "capture" ? "Quick capture" : i.origin === "library" ? "Idea Machine" : i.origin}</div>
                  </td>
                  <td>{i.status}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <span className="row nowrap">
                      <Button size="small" icon="up" title="Raise priority" onClick={() => void act(() => updateIdea(db, i.id, { priority: i.priority + 1 }))} />
                      <span className="mono">{i.priority}</span>
                      <Button size="small" icon="down" title="Lower priority" onClick={() => void act(() => updateIdea(db, i.id, { priority: i.priority - 1 }))} />
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty icon="bolt" title="Nothing here yet">
            Save ideas from the generator, or capture your own with Ctrl+K.
          </Empty>
        )}
      </Win>
      <Win title={sel ? "IDEA DETAILS" : "SELECT AN IDEA"} icon="ideas" scroll>
        {sel ? (
          <div className="stack">
            <Field label="Title">{(id) => <TextInput id={id} value={sel.title} onCommit={(v) => void act(() => updateIdea(db, sel.id, { title: v }))} />}</Field>
            <Field label="Premise / notes">{(id) => <TextArea id={id} value={sel.premise} rows={4} onCommit={(v) => void act(() => updateIdea(db, sel.id, { premise: v }))} />}</Field>
            <div className="row">
              <span className="label">Status</span>
              <Segmented value={sel.status} options={STATUS_OPTS} onChange={(v) => v && void act(() => setIdeaStatus(db, sel.id, v))} label="Status" />
            </div>
            {sel.subjects.length ? (
              <div className="row">
                {sel.subjects.map((s) => (
                  <Chip key={s}>{subjectLabel(s)}</Chip>
                ))}
              </div>
            ) : null}
            {sel.details ? (
              <dl className="kv selectable">
                <dt>Why</dt>
                <dd>{sel.details.why}</dd>
                <dt>What you'd do</dt>
                <dd>{sel.details.whatYouDo}</dd>
                <dt>Needs</dt>
                <dd>{sel.details.requirements.join("; ")}</dd>
                <dt>Time</dt>
                <dd>{TIME_LABEL[sel.details.time]}</dd>
                <dt>First step</dt>
                <dd>{sel.details.firstStep}</dd>
              </dl>
            ) : null}
            <div className="row">
              <Button variant="primary" icon="play" onClick={() => void start(sel)}>
                Start project
              </Button>
              <Button
                onClick={() =>
                  void act(async () => {
                    await setIdeaStatus(db, sel.id, "rejected");
                    if (sel.libraryKey) await recordIdeaFeedback(db, sel.libraryKey, "not_interested", sel.subjects);
                  })
                }
              >
                Not interested
              </Button>
              <Button
                variant="danger"
                icon="trash"
                onClick={async () => {
                  if (await confirm({ title: "Delete idea", message: `Delete "${sel.title}"? This cannot be undone.`, confirm: "Delete", danger: true })) {
                    await act(() => deleteIdea(db, sel.id));
                    setSelected(null);
                  }
                }}
              >
                Delete
              </Button>
            </div>
          </div>
        ) : (
          <Empty icon="ideas" title="Pick an idea on the left">
            Tick up to three ideas to compare them side by side.
          </Empty>
        )}
      </Win>
    </div>
  );
}

function Compare({ ids, onBack }: { ids: string[]; onBack: () => void }) {
  const { db } = useApp();
  const { data } = useData(() => listIdeas(db), []);
  const ideas = (data ?? []).filter((i) => ids.includes(i.id));
  const rows: [string, (i: Idea) => string][] = [
    ["Premise", (i) => i.premise],
    ["Why it might interest you", (i) => i.details?.why ?? "-"],
    ["Effort", (i) => i.details?.effort ?? "-"],
    ["Time", (i) => (i.details ? TIME_LABEL[i.details.time] : "-")],
    ["Budget", (i) => i.details?.budgetNote ?? "-"],
    ["Recording", (i) => i.details?.recording.join(", ") ?? "-"],
    ["Research", (i) => i.details?.research ?? "-"],
    ["Originality", (i) => i.details?.originality ?? "-"],
    ["Audience", (i) => i.details?.audience ?? "-"],
    ["First step", (i) => i.details?.firstStep ?? "-"],
    ["Subjects", (i) => i.subjects.map(subjectLabel).join(", ") || "-"],
    ["Your priority", (i) => String(i.priority)],
  ];
  return (
    <Win title="IDEA ADVISOR :: COMPARE" icon="ideas" actions={<Button size="small" onClick={onBack}>Back to inbox</Button>}>
      <p className="dim small">Side-by-side, no overall score: the trade-offs are yours to weigh.</p>
      <table className="table selectable">
        <thead>
          <tr>
            <th />
            {ideas.map((i) => (
              <th key={i.id}>{i.title}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, f]) => (
            <tr key={label}>
              <td className="dim">{label}</td>
              {ideas.map((i) => (
                <td key={i.id}>{f(i)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </Win>
  );
}

export function IdeaMachine() {
  const { route, go } = useApp();
  const [tab, setTab] = useState<"generate" | "inbox" | "compare">(route.tab === "inbox" ? "inbox" : "generate");
  const [compareIds, setCompareIds] = useState<string[]>([]);
  return (
    <div className="page">
      <PageHead sys="IDEA MACHINE :: NEW IDEA INCOMING" title="Find something worth making" lede="Concepts, not title formulas. Every suggestion explains why it showed up, and your reactions shape the next batch without locking you into one niche." />
      <Tabs
        value={tab}
        tabs={[
          { id: "generate", label: "Generate" },
          { id: "inbox", label: "Inbox & saved" },
          { id: "compare", label: "Compare" },
        ]}
        onChange={(t) => {
          setTab(t);
          go({ section: "ideas", tab: t });
        }}
      />
      <div className="tabpanel">
        {tab === "generate" ? <Generate /> : null}
        {tab === "inbox" ? (
          <Inbox
            onCompare={(ids) => {
              setCompareIds(ids);
              setTab("compare");
            }}
          />
        ) : null}
        {tab === "compare" ? (
          compareIds.length >= 2 ? (
            <Compare ids={compareIds} onBack={() => setTab("inbox")} />
          ) : (
            <Empty icon="ideas" title="Nothing to compare yet">
              In the Inbox tab, tick two or three ideas and press Compare.
            </Empty>
          )
        ) : null}
      </div>
    </div>
  );
}
