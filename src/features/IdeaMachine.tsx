import { Fragment, useEffect, useState } from "react";
import { useAction, useApp, useData } from "../app/context.tsx";
import { createProject, deleteIdea, listIdeas, recordIdeaFeedback, recordImpressions, setIdeaStatus, updateIdea } from "../db/repos.ts";
import { generateIdeas, TIME_LABEL, type GeneratedIdea, type GenerationResult, type GeneratorControls, type GenMode, type InterestMode } from "../domain/ideas/generator.ts";
import { FOCUS_PRESETS, normalizeFocus, presetFocus, type FocusPresetId } from "../domain/ideas/focus.ts";
import { loadCreatorContext } from "../domain/ideas/context.ts";
import { GAMING_SUBJECTS, GAMING_TECH_SUBJECTS, subjectLabel } from "../domain/ideas/subjects.ts";
import { projectFromIdea } from "../domain/projects.ts";
import type { Idea, IdeaStatus } from "../domain/types.ts";
import { Button, Chip, Empty, Field, Note, PageHead, Segmented, Tabs, TextArea, TextInput, Win } from "../ui/kit.tsx";
import { IdeaCard, useIdeaActions } from "./ideaActions.tsx";

const MODES: { id: GenMode; label: string; hint: string }[] = [
  { id: "standard", label: "Balanced", hint: "A mix based on your controls, Content Focus and profile." },
  { id: "tonight", label: "Tonight", hint: "Small enough to start right now, with games you can actually play tonight." },
  { id: "zero-budget", label: "Zero budget", hint: "Nothing to buy: free games, games in your library, or no game at all." },
  { id: "deep-dive", label: "Deep dive", hint: "Substantial, research-heavy projects." },
  { id: "one-off", label: "One-off", hint: "Self-contained videos." },
  { id: "series", label: "Series", hint: "Could become a recurring format." },
  { id: "curiosity", label: "Curiosity", hint: "Steered by what you type below (inside your Content Focus)." },
  { id: "random", label: "Random", hint: "Unexpected picks to break habits, still inside your Content Focus." },
];
const INTEREST: { id: InterestMode; label: string; hint: string }[] = [
  { id: "familiar", label: "Familiar", hint: "Games and genres you know and like." },
  { id: "adjacent", label: "Adjacent", hint: "Games, genres and formats next door to your interests." },
  { id: "new", label: "Completely new", hint: "Unfamiliar games, obscure corners of gaming, new approaches." },
  { id: "surprise", label: "Surprise me", hint: "Unexpected, but still within your Content Focus." },
];

type Opt<T extends string> = { id: T; label: string }[];
const CONTROLS: { key: keyof GeneratorControls; label: string; options: Opt<string> }[] = [
  { key: "familiarity", label: "Games", options: [{ id: "known", label: "Ones I know" }, { id: "unfamiliar", label: "Ones I don't know" }] },
  { key: "access", label: "Game cost", options: [{ id: "free", label: "Free games only" }, { id: "owned", label: "Owned or free" }, { id: "buy", label: "Willing to buy" }] },
  { key: "era", label: "Era", options: [{ id: "retro", label: "Retro (before 2008)" }, { id: "modern", label: "Modern" }] },
  { key: "angle", label: "Focus", options: [{ id: "game", label: "The game itself" }, { id: "history", label: "History & research" }] },
  { key: "style", label: "Video style", options: [{ id: "gameplay", label: "Gameplay" }, { id: "commentary", label: "Commentary / retrospective" }] },
  { key: "shape", label: "Shape", options: [{ id: "one-off", label: "One-off" }, { id: "series", label: "Could be a series" }] },
  { key: "format", label: "Format", options: [{ id: "long", label: "Long-form" }, { id: "short", label: "Shorts" }, { id: "either", label: "Either" }] },
  { key: "size", label: "Effort", options: [{ id: "tiny", label: "Tiny" }, { id: "small", label: "Small" }, { id: "medium", label: "Medium" }, { id: "ambitious", label: "Ambitious" }] },
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
    label: "Recording",
    options: [
      { id: "screen", label: "Screen" },
      { id: "voiceover", label: "Voiceover" },
      { id: "face", label: "Face camera" },
      { id: "real-world", label: "Real-world" },
      { id: "mixed", label: "Mixed" },
      { id: "anything", label: "Anything" },
    ],
  },
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

/** Content Focus editor: presets plus exact percentages. Saved to settings; enforced by the generator. */
export function ContentFocusPanel() {
  const { settings, updateSettings } = useApp();
  const f = settings.contentFocus;
  const [draft, setDraft] = useState({ gaming: String(f.gaming), tech: String(f.tech), other: String(f.other) });
  useEffect(() => setDraft({ gaming: String(f.gaming), tech: String(f.tech), other: String(f.other) }), [f.gaming, f.tech, f.other]);
  const commit = (patch: Partial<typeof draft>) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    void updateSettings({ contentFocus: normalizeFocus({ gaming: Number(next.gaming) || 0, tech: Number(next.tech) || 0, other: Number(next.other) || 0 }) });
  };
  const preset = FOCUS_PRESETS.find((p) => p.id === f.preset);
  return (
    <Win title="CONTENT FOCUS" icon="control" meta={preset ? preset.label : "Custom"}>
      <div className="stack">
        <Segmented<FocusPresetId> value={f.preset === "custom" ? null : f.preset} options={FOCUS_PRESETS} onChange={(v) => v && void updateSettings({ contentFocus: presetFocus(v) })} label="Content focus preset" />
        <div className="focus-bar">
          <span className="mix" aria-hidden="true">
            <i className="g" style={{ width: `${f.gaming}%` }} />
            <i className="t" style={{ width: `${f.tech}%` }} />
            <i className="o" style={{ width: `${f.other}%` }} />
          </span>
          <span className="focus-nums">
            {(
              [
                ["gaming", "Gaming"],
                ["tech", "Gaming-adjacent tech"],
                ["other", "Outside gaming"],
              ] as const
            ).map(([k, label]) => (
              <label key={k} className="row nowrap">
                <span className="dim">{label}</span>
                <input className="input" style={{ width: 72, flex: "none" }} inputMode="numeric" value={draft[k]} onChange={(e) => setDraft({ ...draft, [k]: e.target.value.replace(/[^0-9]/g, "") })} onBlur={() => commit({})} onKeyDown={(e) => e.key === "Enter" && commit({})} aria-label={`${label} percent`} />
                <span className="dim">%</span>
              </label>
            ))}
          </span>
        </div>
        <p className="dim small">
          {preset?.hint ?? "Your own mix."} Shares are met over several batches, not inside each one. A domain at 0% is never suggested
          {f.other === 0 ? "; use Explore outside my niche when you want something unrelated." : "."}
        </p>
      </div>
    </Win>
  );
}

function GenreChips({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  return (
    <div className="toggle-chips" role="group" aria-label="Genres">
      {[...GAMING_SUBJECTS, ...GAMING_TECH_SUBJECTS].map((s) => (
        <button key={s.id} type="button" className={value.includes(s.id) ? "on" : ""} aria-pressed={value.includes(s.id)} onClick={() => toggle(s.id)}>
          {s.label}
        </button>
      ))}
    </div>
  );
}

function Generate() {
  const { db, settings, updateSettings, toast } = useApp();
  const actions = useIdeaActions();
  const [controls, setControls] = useState<GeneratorControls>({ ...settings.generator });
  const [count, setCount] = useState(3);
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [likeOf, setLikeOf] = useState<GeneratedIdea | null>(null);
  const [busy, setBusy] = useState(false);
  const [more, setMore] = useState(false);
  const [customBudget, setCustomBudget] = useState("");
  const [inspiration, setInspiration] = useState((settings.generator.inspiration ?? []).join(", "));

  const set = (patch: Partial<GeneratorControls>) => {
    const next = { ...controls, ...patch };
    setControls(next);
    const remember: GeneratorControls = { ...next };
    delete remember.curiosity;
    delete remember.explore;
    void updateSettings({ generator: remember });
  };

  const run = async (override?: Partial<GeneratorControls>, like?: GeneratedIdea) => {
    setBusy(true);
    try {
      const ctx = await loadCreatorContext(db);
      const insp = inspiration.split(/[,;\n]/).map((x) => x.trim()).filter(Boolean);
      const r = generateIdeas({ ...controls, inspiration: insp, ...override }, ctx, {
        count,
        focus: settings.contentFocus,
        likeThis: like ? { key: like.key, seedKey: like.seedKey, videoType: like.videoType, subjects: like.subjects, games: like.games } : null,
      });
      setResult(r);
      setLikeOf(like ?? null);
      await recordImpressions(db, r.ideas.map((i) => i.key));
    } catch (e) {
      toast("ERROR", e instanceof Error ? e.message : String(e), "err");
    } finally {
      setBusy(false);
    }
  };

  const mode = controls.mode ?? "standard";
  const budgetValue = controls.budgetUsd === null || controls.budgetUsd === undefined ? null : String(controls.budgetUsd);
  const active = CONTROLS.filter((c) => controls[c.key]).length + (controls.genres?.length ? 1 : 0) + (budgetValue !== null ? 1 : 0);

  return (
    <div className="stack">
      <ContentFocusPanel />
      <Win title="IDEA MACHINE CONTROLS" icon="settings" meta={active ? `${active} filter${active > 1 ? "s" : ""} on` : "no filters"}>
        <div className="stack">
          <div className="ctl-grid">
            <span className="label">Mode</span>
            <div className="stack tight">
              <Segmented value={mode} options={MODES} onChange={(v) => set({ mode: v ?? "standard" })} label="Generation mode" />
              <span className="dim small">{MODES.find((m) => m.id === mode)?.hint}</span>
            </div>
            <span className="label">Interest</span>
            <div className="stack tight">
              <Segmented value={controls.interest ?? null} options={INTEREST} onChange={(v) => set({ interest: v })} allowNone label="Interest" />
              {controls.interest ? <span className="dim small">{INTEREST.find((i) => i.id === controls.interest)?.hint}</span> : null}
            </div>
            <span className="label">Inspired by games</span>
            <input
              className="input"
              value={inspiration}
              placeholder="optional: e.g. Elden Ring, Thief, Minecraft modpacks"
              onChange={(e) => setInspiration(e.target.value)}
              onBlur={() => set({ inspiration: inspiration.split(/[,;\n]/).map((x) => x.trim()).filter(Boolean) })}
              onKeyDown={(e) => e.key === "Enter" && void run()}
              aria-label="Games to use as inspiration"
            />
            <span className="label">Curious about</span>
            <input
              className="input"
              value={controls.curiosity ?? ""}
              placeholder="optional: anything on your mind, e.g. game preservation, immersive sims"
              onChange={(e) => setControls({ ...controls, curiosity: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && void run()}
              aria-label="Curious about"
            />
            {more ? (
              <>
                <span className="label">Genre</span>
                <GenreChips value={controls.genres ?? []} onChange={(v) => set({ genres: v.length ? v : null })} />
                {CONTROLS.map((c) => (
                  <Fragment key={c.key}>
                    <span className="label">{c.label}</span>
                    <Segmented value={(controls[c.key] as string | null | undefined) ?? null} options={c.options} onChange={(v) => set({ [c.key]: v } as Partial<GeneratorControls>)} allowNone label={c.label} />
                  </Fragment>
                ))}
                <span className="label">Extra budget</span>
                <div className="row">
                  <Segmented value={["0", "20", "50"].includes(budgetValue ?? "") ? budgetValue : null} options={[{ id: "0", label: "Nothing" }, { id: "20", label: "Under $20" }, { id: "50", label: "Under $50" }]} onChange={(v) => set({ budgetUsd: v === null ? null : Number(v) })} allowNone label="Budget" />
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
                  <span className="dim small">Equipment and software, not the game (see Game cost).</span>
                </div>
              </>
            ) : null}
          </div>
          {more ? <p className="dim small">Nothing here is required. Click a selected option again to clear it. Choices are remembered. If too few ideas match, the least important filters are loosened first and you're told which.</p> : null}
          <div className="row">
            <Button variant="primary" size="big" icon="ideas" onClick={() => void run()} disabled={busy}>
              {busy ? "GENERATING..." : "GENERATE IDEAS"}
            </Button>
            <Button icon="dice" onClick={() => void run({ mode: "random" })} disabled={busy}>
              NO IDEAS? INITIATE RANDOMIZER
            </Button>
            <Button icon="globe" onClick={() => void run({ explore: true })} disabled={busy} title="One batch that deliberately includes subjects outside gaming">
              Explore outside my niche
            </Button>
            <Button variant="flat" onClick={() => setMore(!more)}>
              {more ? "Fewer controls" : `More controls${active ? ` (${active})` : ""}`}
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
          {likeOf ? (
            <div className="row">
              <Note>
                More like <b>{likeOf.title}</b>: same kind of video or topic, different game or concept.
              </Note>
              <Button size="small" onClick={() => void run()}>
                Back to normal ideas
              </Button>
            </div>
          ) : null}
          {result.notes.map((n) => (
            <div key={n} className={/outside|Exploring/i.test(n) ? "explore-banner" : "note"}>
              {n}
            </div>
          ))}
          {result.relaxed.length ? <Note>To find enough ideas, these preferences were loosened: {result.relaxed.join(", ")}.</Note> : null}
          <div className="ideas-grid">
            {result.ideas.map((g) => (
              <IdeaCard
                key={g.key}
                idea={g}
                onStart={() => void actions.start(g)}
                onSave={() => void actions.save(g)}
                onMoreLike={() => {
                  void actions.react(g, "more_like");
                  void run(undefined, g);
                }}
                onReact={(r) => {
                  void actions.react(g, r);
                  if (r === "more_like") void run(undefined, g);
                  setResult((cur) => (cur ? { ...cur, ideas: cur.ideas.filter((x) => x.key !== g.key || ["love", "save", "maybe", "like_game", "like_format", "more_like"].includes(r)) } : cur));
                }}
              />
            ))}
          </div>
          <p className="dim small">
            Ratings are rough estimates, not predictions. Ownership comes only from the library you imported; prices and covers come from the Steam store with the date checked. {result.poolSize} concepts matched your limits.
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
      <PageHead sys="IDEA MACHINE :: NEW IDEA INCOMING" title="Find something worth making" lede="Gaming first: your Content Focus decides what shows up. Every suggestion explains why, and your reactions shape the next batch without locking you into one game or genre." />
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
