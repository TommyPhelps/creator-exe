// Shared idea card and actions used by Control Room, Tonight and Idea Machine.
import { useEffect, useState } from "react";
import { useApp } from "../app/context.tsx";
import type { GeneratedIdea } from "../domain/ideas/generator.ts";
import { TIME_LABEL } from "../domain/ideas/generator.ts";
import { REACTIONS, type FeedbackDetail, type Idea, type IdeaStatus, type Reaction } from "../domain/types.ts";
import { createProject, getGame, getGameInfo, recordIdeaFeedback, saveGameInfo, saveIdea, type GameInfo } from "../db/repos.ts";
import { projectFromIdea } from "../domain/projects.ts";
import { subjectLabel } from "../domain/ideas/subjects.ts";
import { videoTypeLabel } from "../domain/ideas/videoTypes.ts";
import { DOMAIN_LABEL } from "../domain/ideas/focus.ts";
import { canon, findCatalogGame } from "../domain/games/catalog.ts";
import { accessLabel } from "../domain/games/library.ts";
import { isStale, lookupSteam, STEAM_SOURCE } from "../domain/games/steam.ts";
import { formatDate } from "../lib/util.ts";
import { Button, Chip, LevelMeter } from "../ui/kit.tsx";

const EFFORT_LABEL = { tiny: "Tiny", small: "Small", medium: "Medium", ambitious: "Ambitious" } as const;
const REC_LABEL = { screen: "Screen", voiceover: "Voiceover", face: "Face cam", "real-world": "Real world" } as const;

const reactionLabel = (r: Reaction) => REACTIONS.find((x) => x.id === r)?.label ?? r;

export function feedbackDetail(g: GeneratedIdea): FeedbackDetail {
  return { seedKey: g.seedKey, videoType: g.videoType, games: g.games, domain: g.domain };
}

export function useIdeaActions() {
  const { db, toast, changed, go } = useApp();

  const persist = async (g: GeneratedIdea, status: IdeaStatus): Promise<Idea> =>
    saveIdea(db, { origin: "library", libraryKey: g.key, title: g.title, premise: g.premise, details: g.details, subjects: g.subjects, status });

  return {
    async save(g: GeneratedIdea, status: IdeaStatus = "saved") {
      try {
        await persist(g, status);
        if (status === "saved" || status === "maybe") await recordIdeaFeedback(db, g.key, status === "saved" ? "save" : "maybe", g.subjects, feedbackDetail(g));
        changed();
        toast("IDEA SAVED", g.title);
      } catch (e) {
        toast("ERROR", e instanceof Error ? e.message : String(e), "err");
      }
    },
    async react(g: GeneratedIdea, reaction: Reaction) {
      try {
        await recordIdeaFeedback(db, g.key, reaction, g.subjects, feedbackDetail(g));
        if (reaction === "love" || reaction === "save") await persist(g, "saved");
        if (reaction === "maybe") await persist(g, "maybe");
        changed();
        toast("FEEDBACK LOGGED", reactionLabel(reaction));
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

/** Steam store info for a game: cached, refreshed after 30 days, never guessed. */
export function useGameInfo(name: string | null): GameInfo | null {
  const { db, platform, settings } = useApp();
  const [info, setInfo] = useState<GameInfo | null>(null);
  const cat = name ? findCatalogGame(name) : null;
  const lookupName = cat && !cat.generic ? cat.title : null;
  useEffect(() => {
    setInfo(null);
    if (!lookupName || !settings.gameCovers) return;
    let alive = true;
    (async () => {
      const key = canon(lookupName);
      const cached = await getGameInfo(db, key);
      if (cached && !isStale(cached)) {
        if (alive) setInfo(cached);
        return;
      }
      if (platform.kind !== "tauri") {
        if (alive && cached) setInfo(cached);
        return;
      }
      const owned = await getGame(db, key);
      const fresh = await lookupSteam((u) => platform.http(u, { timeoutMs: 8000 }), lookupName, owned?.steamAppId ?? null);
      if (fresh.status !== "error") await saveGameInfo(db, fresh);
      if (alive) setInfo(fresh.status === "error" ? cached : fresh);
    })().catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [db, platform, settings.gameCovers, lookupName]);
  return info;
}

function GameCover({ game }: { game: string | null }) {
  const info = useGameInfo(game);
  const [broken, setBroken] = useState(false);
  if (!info || info.status !== "found" || !info.imageUrl || broken) return null;
  return (
    <figure className="cover">
      <img src={info.imageUrl} alt={`${info.steamName ?? game} store image`} loading="lazy" onError={() => setBroken(true)} />
      <figcaption>
        {STEAM_SOURCE} · checked {formatDate(info.checkedAt)}
      </figcaption>
    </figure>
  );
}

function AccessBadge({ g }: { g: GeneratedIdea }) {
  const info = useGameInfo(g.games[0] ?? null);
  const a = g.access;
  const kind = a.kind === "owned" || a.kind === "free" || a.kind === "none" ? "ok" : a.kind === "not_owned" ? "warn" : undefined;
  return (
    <div className="access">
      <Chip kind={kind} title="Based only on your imported library and the built-in list of free games">
        {a.kind === "owned" ? "✓ " : a.kind === "not_owned" ? "$ " : a.kind === "unknown" ? "? " : ""}
        {accessLabel(a)}
      </Chip>
      {info?.status === "found" && info.priceText && a.kind !== "owned" ? (
        <span className="dim small" title={`Checked ${formatDate(info.checkedAt)}`}>
          {info.priceText} · checked {formatDate(info.checkedAt)}
        </span>
      ) : null}
    </div>
  );
}

const LIKE_GROUP: Reaction[] = ["like_game", "like_format", "like_topic", "love", "maybe"];
const NOT_GROUP: Reaction[] = ["less_like", "not_this_type", "not_interested", "too_similar", "too_expensive", "too_complicated", "not_in_mood", "already_done"];

export function FeedbackMenu({ g, onReact }: { g: GeneratedIdea; onReact: (r: Reaction) => void }) {
  return (
    <select
      className="select"
      style={{ width: "auto" }}
      value=""
      aria-label="Give feedback on this idea"
      onChange={(e) => {
        const v = e.target.value as Reaction;
        if (v) onReact(v);
      }}
    >
      <option value="">Feedback...</option>
      <optgroup label="What you liked">
        {LIKE_GROUP.filter((r) => r !== "like_game" || g.games.some((x) => !findCatalogGame(x)?.generic)).map((r) => (
          <option key={r} value={r}>
            {r === "like_game" ? `I like ${g.games[0]}` : r === "like_format" ? `I like ${videoTypeLabel(g.videoType).toLowerCase()} videos` : reactionLabel(r)}
          </option>
        ))}
      </optgroup>
      <optgroup label="Not for me">
        {NOT_GROUP.map((r) => (
          <option key={r} value={r}>
            {r === "not_this_type" ? `No ${videoTypeLabel(g.videoType).toLowerCase()} videos` : reactionLabel(r)}
          </option>
        ))}
      </optgroup>
    </select>
  );
}

export function IdeaCard(props: {
  idea: GeneratedIdea;
  compact?: boolean;
  tonight?: boolean;
  onStart: () => void;
  onSave: () => void;
  onReact: (r: Reaction) => void;
  onMoreLike?: () => void;
}) {
  const { idea: g } = props;
  const d = g.details;
  const [open, setOpen] = useState(false);
  const plus = g.factors.filter((f) => f.effect === "plus");
  const minus = g.factors.filter((f) => f.effect === "minus");
  const notes = g.factors.filter((f) => f.effect === "note");
  const named = g.games.filter((x) => !findCatalogGame(x)?.generic);
  const cat = g.games[0] ? findCatalogGame(g.games[0]) : null;
  const suits = plus.filter((f) => !/No purchases needed|Has a ready-made|Low energy|Nothing to set up/.test(f.text)).slice(0, 3);

  return (
    <article className={`card idea-card ${g.novelty ? "novel" : ""}`}>
      {props.compact ? null : <GameCover game={named[0] ?? null} />}
      <div className="idea-meta">
        <span title="Content focus area">{DOMAIN_LABEL[g.domain]}</span>
        <span>·</span>
        <span>{videoTypeLabel(g.videoType)}</span>
        {g.novelty ? <span className="chip accent">something new</span> : null}
      </div>
      <h3 className="selectable">{g.title}</h3>
      {g.games.length ? (
        <div className="idea-game">
          <span className="label">{named.length > 1 ? "Games" : "Game"}</span>
          <b>{g.games.join(" + ")}</b>
          {cat?.year ? <span className="dim"> · {cat.year}</span> : null}
          {cat?.genres.length ? <span className="dim"> · {cat.genres.slice(0, 2).map(subjectLabel).join(", ")}</span> : null}
        </div>
      ) : (
        <div className="idea-game">
          <span className="label">Topic</span>
          <b>{g.subjects.slice(0, 2).map(subjectLabel).join(", ")}</b>
        </div>
      )}
      <AccessBadge g={g} />
      <p className="selectable premise">{g.premise}</p>

      <div className="idea-why">
        <span className="label">Why it suits you</span>
        {suits.length ? (
          <ul className="plain">
            {suits.map((f) => (
              <li key={f.text}>{f.text}</li>
            ))}
          </ul>
        ) : (
          <p>{d.why}</p>
        )}
      </div>

      <div className="row chips">
        <Chip title="Estimated production effort">{EFFORT_LABEL[d.effort]} effort</Chip>
        <Chip>{TIME_LABEL[d.time]}</Chip>
        <Chip>{d.recording.map((r) => REC_LABEL[r]).join(" + ")}</Chip>
        {d.format === "short" ? <Chip>Short</Chip> : d.format === "either" ? <Chip>Long or Short</Chip> : null}
        {d.series ? <Chip>Series potential</Chip> : null}
      </div>

      {props.tonight && d.tonight ? (
        <dl className="kv selectable">
          <dt>You need</dt>
          <dd>{d.tonight.needs.join("; ")}</dd>
          <dt>First five minutes</dt>
          <dd>
            <b>{d.tonight.firstFive}</b>
          </dd>
          <dt>Smallest video</dt>
          <dd>{d.tonight.minimumVideo}</dd>
        </dl>
      ) : (
        <dl className="kv selectable">
          <dt>You need</dt>
          <dd>{d.requirements.join("; ")}</dd>
          <dt>First step</dt>
          <dd>
            <b>{d.firstStep}</b>
          </dd>
        </dl>
      )}

      {open ? (
        <div className="idea-details stack tight">
          <dl className="kv selectable">
            <dt>What you'd do</dt>
            <dd>{d.whatYouDo}</dd>
            <dt>Worth exploring</dt>
            <dd>{d.worthExploring}</dd>
            <dt>Audience</dt>
            <dd>{d.audience}</dd>
            <dt>Budget</dt>
            <dd>{d.budgetNote}</dd>
            <dt>Thumbnail idea</dt>
            <dd>{d.thumbnail}</dd>
            {props.tonight && d.tonight ? (
              <>
                <dt>If it goes well</dt>
                <dd>{d.tonight.expansion}</dd>
              </>
            ) : null}
            {d.alternatives.length ? (
              <>
                <dt>Other approaches</dt>
                <dd>{d.alternatives.join(" / ")}</dd>
              </>
            ) : null}
            <dt>Subjects</dt>
            <dd>{g.subjects.map(subjectLabel).join(", ")}</dd>
          </dl>
          <div className="row small" style={{ gap: "4px 14px" }}>
            {(
              [
                ["Enjoyment", g.ratings.enjoyment, "Likely personal enjoyment"],
                ["Feasibility", g.ratings.feasibility, "Production feasibility"],
                ["Originality", g.ratings.originality, "Originality"],
                ["Research", g.ratings.research, "Research required"],
              ] as const
            ).map(([label, value, full]) => (
              <span key={label} className="row nowrap" style={{ gap: 6 }}>
                <span className="dim">{label}</span>
                <LevelMeter value={value} label={full} />
              </span>
            ))}
          </div>
          {plus.length || minus.length || notes.length ? (
            <div className="factors" aria-label="Every reason behind this suggestion">
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
              {notes.map((f) => (
                <span key={f.text} className="note">
                  {f.text}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="row idea-actions">
        <Button variant="primary" icon="play" onClick={props.onStart}>
          {props.tonight ? "START THIS VIDEO" : "Start project"}
        </Button>
        <Button icon="star" onClick={props.onSave}>
          Save
        </Button>
        {props.onMoreLike ? (
          <Button icon="refresh" onClick={props.onMoreLike} title="Show ideas related to this one (different game or concept)">
            More like this
          </Button>
        ) : null}
        <Button variant="flat" onClick={() => setOpen(!open)} title="Everything else about this idea">
          {open ? "Less" : "Details"}
        </Button>
        <FeedbackMenu g={g} onReact={props.onReact} />
      </div>
    </article>
  );
}
