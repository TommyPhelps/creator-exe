import { useEffect, useMemo, useState } from "react";
import { useAction, useApp, useData } from "../app/context.tsx";
import { listIdeas, listProjects, listResearch, listTasks, listThumbnails, listVideos, listProfile, recordImpressions, updateProject } from "../db/repos.ts";
import { generateIdeas, type GeneratedIdea } from "../domain/ideas/generator.ts";
import { loadCreatorContext } from "../domain/ideas/context.ts";
import { ACTIVE_STAGES, isUnfinished, stageIndex, stageLabel, suggestedNextAction } from "../domain/projects.ts";
import { relativeTime } from "../lib/util.ts";
import { Button, Empty, Note, Win } from "../ui/kit.tsx";
import { Icon } from "../ui/icons.tsx";
import { IdeaCard, useIdeaActions } from "./ideaActions.tsx";
import type { Project } from "../domain/types.ts";

function NowProducing({ project, next, onOpen, onDone }: { project: Project | null; next: string; onOpen: () => void; onDone: () => void }) {
  if (!project) {
    return (
      <div className="lcd">
        <div className="lcd-label">NOW PRODUCING</div>
        <div className="lcd-title">NO ACTIVE PROJECT</div>
        <div className="lcd-line">&gt; Start one from TONIGHT.EXE or the Idea Machine.</div>
        <div className="meter">
          {ACTIVE_STAGES.map((s) => (
            <i key={s} />
          ))}
        </div>
      </div>
    );
  }
  const idx = stageIndex(project.stage);
  return (
    <div className="stack">
      <div className="lcd">
        <div className="lcd-label">NOW PRODUCING :: {stageLabel(project.stage).toUpperCase()}</div>
        <div className="lcd-title selectable" title={project.title}>
          {project.title}
        </div>
        <div className="lcd-line">&gt; NEXT: {next || "Decide the next small step"}</div>
        <div className="meter" aria-label={`Stage ${idx + 1} of ${ACTIVE_STAGES.length}`}>
          {ACTIVE_STAGES.map((s, i) => (
            <i key={s} className={i < idx ? "on" : i === idx ? "on now" : ""} />
          ))}
        </div>
        <div className="stages">
          {ACTIVE_STAGES.map((s) => (
            <span key={s}>{stageLabel(s).toUpperCase()}</span>
          ))}
        </div>
      </div>
      <div className="row">
        <Button variant="primary" size="big" icon="play" onClick={onOpen}>
          CONTINUE THIS PROJECT
        </Button>
        <Button icon="check" onClick={onDone}>
          Next action done
        </Button>
      </div>
    </div>
  );
}

export function ControlRoom() {
  const app = useApp();
  const { db, go, openQuickCapture, settings } = app;
  const act = useAction();
  const ideaActions = useIdeaActions();
  const [seed, setSeed] = useState(0);

  const data = useData(async () => {
    const [projects, tasks, ideas, research, thumbs, videos, profile] = await Promise.all([
      listProjects(db),
      listTasks(db),
      listIdeas(db, ["inbox", "saved", "maybe"]),
      listResearch(db),
      listThumbnails(db),
      listVideos(db),
      listProfile(db),
    ]);
    return { projects, tasks, ideas, research: research.slice(0, 5), thumbs: thumbs.slice(0, 4), videoCount: videos.length, profileCount: profile.length };
  });

  // Suggestions are generated once per visit (and on request), not on every data change.
  const [ideas, setIdeas] = useState<GeneratedIdea[]>([]);
  const [ideaError, setIdeaError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      const ctx = await loadCreatorContext(db);
      const r = generateIdeas({ ...settings.generator, mode: "standard" }, ctx, { count: 3, focus: settings.contentFocus });
      if (!alive) return;
      setIdeas(r.ideas);
      await recordImpressions(db, r.ideas.map((i) => i.key));
    })().catch((e: unknown) => alive && setIdeaError(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed]);

  const d = data.data;
  const active = useMemo(() => (d ? d.projects.filter(isUnfinished) : []), [d]);
  const current = useMemo(() => {
    if (!active.length) return null;
    // Most recently opened wins; ties go to the project furthest along, then priority.
    return (
      [...active].sort(
        (a, b) =>
          (b.openedAt ?? b.updatedAt).slice(0, 16).localeCompare((a.openedAt ?? a.updatedAt).slice(0, 16)) ||
          stageIndex(b.stage) - stageIndex(a.stage) ||
          b.priority - a.priority,
      )[0] ?? null
    );
  }, [active]);
  const next = current && d ? suggestedNextAction(current, d.tasks) : "";

  const markDone = async () => {
    if (!current) return;
    const nextText = await app.prompt({ title: "Next action done", message: "Nice. What's the next small step? Leave it empty to decide later.", confirm: "Save" });
    if (nextText === null) return;
    await act(() => updateProject(db, current.id, { nextAction: nextText.trim() }), { title: "PROGRESS LOGGED", body: nextText.trim() || "Pick the next step in the project." });
  };

  if (data.error) return <Note kind="err">{data.error}</Note>;
  if (!d) return <div className="dim">Loading...</div>;

  const firstRun = d.videoCount === 0 && d.profileCount === 0 && d.projects.length === 0;

  return (
    <div className="page">
      <div className="grid" style={{ gridTemplateColumns: "minmax(0, 1.6fr) minmax(300px, 1fr)" }}>
        <Win title="NOW PRODUCING" icon="control" meta={current ? `${active.length} in progress` : undefined}>
          <NowProducing project={current} next={next} onOpen={() => current && go({ section: "workshop", projectId: current.id })} onDone={() => void markDone()} />
        </Win>
        <Win title="MAKE SOMETHING TONIGHT" icon="tonight">
          <p>No plan, low energy, or just bored? Get three small ideas you can start in five minutes.</p>
          <Button variant="primary" size="big" icon="tonight" onClick={() => go({ section: "tonight" })}>
            INITIATE TONIGHT.EXE
          </Button>
          <div className="row">
            <Button icon="bolt" onClick={openQuickCapture}>
              Quick capture
            </Button>
            <Button icon="ideas" onClick={() => go({ section: "ideas" })}>
              Idea Machine
            </Button>
          </div>
        </Win>
      </div>

      {firstRun ? (
        <Win title="FIRST BOOT" icon="settings">
          <p>Three optional steps make suggestions personal. None of them are required to start making something.</p>
          <div className="row">
            <Button icon="channel" onClick={() => go({ section: "channel" })}>
              1. Import your channel
            </Button>
            <Button icon="memory" onClick={() => go({ section: "memory" })}>
              2. Tell it what you like
            </Button>
            <Button icon="settings" onClick={() => go({ section: "settings" })}>
              3. Pick a projects folder
            </Button>
          </div>
        </Win>
      ) : null}

      <Win
        title="THREE IDEAS FOR YOU"
        icon="ideas"
        actions={
          <Button
            size="small"
            icon="refresh"
            onClick={() => setSeed((s) => s + 1)}
          >
            New batch
          </Button>
        }
      >
        {ideaError ? <Note kind="err">{ideaError}</Note> : null}
        <div className="ideas-grid">
          {ideas.map((g) => (
            <IdeaCard key={g.key} idea={g} compact onStart={() => void ideaActions.start(g)} onSave={() => void ideaActions.save(g)} onReact={(r) => void ideaActions.react(g, r)} />
          ))}
        </div>
      </Win>

      <div className="grid cols-3">
        <Win title="PROJECTS IN PROGRESS" icon="projects" meta={`${active.length}`}>
          {active.length ? (
            <div className="stack tight">
              {active.slice(0, 7).map((p) => (
                <button key={p.id} className="btn" style={{ justifyContent: "space-between" }} onClick={() => go({ section: "workshop", projectId: p.id })}>
                  <span className="ellipsis">{p.title}</span>
                  <span className="dim small">{stageLabel(p.stage)}</span>
                </button>
              ))}
              {active.length > 7 ? (
                <Button variant="flat" onClick={() => go({ section: "projects" })}>
                  All {active.length} projects
                </Button>
              ) : null}
            </div>
          ) : (
            <Empty icon="projects" title="Nothing in progress">
              That's fine. Start small.
            </Empty>
          )}
        </Win>
        <Win title="IDEA INBOX" icon="bolt" meta={`${d.ideas.length}`} actions={<Button size="small" icon="plus" onClick={openQuickCapture} title="Quick capture" />}>
          {d.ideas.length ? (
            <div className="stack tight">
              {d.ideas.slice(0, 7).map((i) => (
                <button key={i.id} className="btn" style={{ justifyContent: "space-between" }} onClick={() => go({ section: "ideas", tab: "inbox" })}>
                  <span className="ellipsis">{i.title}</span>
                  <span className="dim small">{i.status}</span>
                </button>
              ))}
            </div>
          ) : (
            <Empty icon="bolt" title="Inbox empty">
              Press Ctrl+K whenever an idea appears.
            </Empty>
          )}
        </Win>
        <Win title="RECENT" icon="research">
          <div className="stack tight small">
            <b>Research</b>
            {d.research.length ? (
              d.research.map((r) => (
                <button key={r.id} className="btn flat" style={{ justifyContent: "space-between" }} onClick={() => go({ section: "research" })}>
                  <span className="ellipsis">{r.title}</span>
                  <span className="dim">{relativeTime(r.updatedAt)}</span>
                </button>
              ))
            ) : (
              <span className="dim">No saved research yet.</span>
            )}
            <b style={{ marginTop: 6 }}>Thumbnails</b>
            {d.thumbs.length ? (
              <div className="row">
                {d.thumbs.map((t) => (
                  <button key={t.id} className="vcard" style={{ width: 120 }} title={t.name} onClick={() => go({ section: "thumbnails", thumbnailId: t.id, projectId: t.projectId })}>
                    <div className="vthumb">{t.preview ? <img src={t.preview} alt="" /> : <Icon name="thumbnail" />}</div>
                  </button>
                ))}
              </div>
            ) : (
              <span className="dim">No thumbnails yet.</span>
            )}
          </div>
        </Win>
      </div>
    </div>
  );
}
