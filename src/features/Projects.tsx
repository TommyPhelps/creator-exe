import { useEffect, useMemo, useRef, useState } from "react";
import { useAction, useApp, useData } from "../app/context.tsx";
import { createProject, deleteProject, listProjects, listTasks, updateProject } from "../db/repos.ts";
import { STAGES, type Complexity, type Project, type Stage } from "../domain/types.ts";
import { PHASES, phaseOf, stageForPhase, suggestedNextAction, stageLabel, type Phase } from "../domain/projects.ts";
import { relativeTime } from "../lib/util.ts";
import { Button, Chip, Empty, PageHead, Segmented, Win } from "../ui/kit.tsx";

const COMPLEXITY: { id: Complexity; label: string }[] = [
  { id: "quick", label: "Quick" },
  { id: "standard", label: "Standard" },
  { id: "ambitious", label: "Ambitious" },
];

type Lane = Phase | "archived";

interface Menu {
  x: number;
  y: number;
  project: Project;
}

export function Projects() {
  const { db, go, toast, changed, confirm } = useApp();
  const act = useAction();
  const [view, setView] = useState<"board" | "list">("board");
  const [query, setQuery] = useState("");
  const [complexity, setComplexity] = useState<Complexity | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [drag, setDrag] = useState<{ id: string; x: number; y: number; over: Lane | null } | null>(null);
  const dragStart = useRef<{ id: string; x: number; y: number } | null>(null);

  const { data } = useData(async () => ({ projects: await listProjects(db, true), tasks: await listTasks(db) }), []);
  const projects = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.projects ?? []).filter(
      (p) =>
        (showArchived ? true : !p.archived && p.stage !== "archived") &&
        (!complexity || p.complexity === complexity) &&
        (!q || `${p.title} ${p.premise} ${p.nextAction} ${p.details.customStatus}`.toLowerCase().includes(q)),
    );
  }, [data, query, complexity, showArchived]);

  const dropOn = (p: Project, lane: Lane) => {
    if (lane === "archived") {
      if (!p.archived) void act(() => updateProject(db, p.id, { archived: true }), { title: "ARCHIVED", body: p.title });
      return;
    }
    const stage = stageForPhase(p.stage, lane);
    if (p.archived) void act(() => updateProject(db, p.id, { archived: false, stage: stage === "archived" ? "idea" : stage }), { title: "RESTORED", body: p.title });
    else moveTo(p, stage);
  };

  const moveTo = (p: Project, stage: Stage) => {
    if (p.stage === stage) return;
    void act(() => updateProject(db, p.id, { stage, archived: stage === "archived" }), {
      title: stage === "published" ? "SHIPPED" : "STAGE UPDATED",
      body: `${p.title} -> ${stageLabel(stage)}`,
    });
  };

  // Pointer-based drag between lanes (HTML5 drag-and-drop is reserved for files on Windows).
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const s = dragStart.current;
      if (!s) return;
      if (!drag && Math.hypot(e.clientX - s.x, e.clientY - s.y) < 6) return;
      const el = document.elementFromPoint(e.clientX, e.clientY)?.closest("[data-lane]") as HTMLElement | null;
      setDrag({ id: s.id, x: e.clientX, y: e.clientY, over: (el?.dataset.lane as Lane | undefined) ?? null });
    };
    const onUp = () => {
      const s = dragStart.current;
      dragStart.current = null;
      setDrag((d) => {
        if (d && s && d.over) {
          const p = data?.projects.find((x) => x.id === d.id);
          if (p) dropOn(p, d.over);
        }
        return null;
      });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  });

  useEffect(() => {
    const close = () => setMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("keydown", close);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("keydown", close);
    };
  }, []);

  const newProject = async () => {
    const p = await act(() => createProject(db, { title: "Untitled video", nextAction: "Write one sentence about why you want to make this." }), { title: "PROJECT INITIALIZED" });
    if (p) go({ section: "workshop", projectId: p.id });
  };

  const lanes: { id: Lane; label: string }[] = [...PHASES.map((x) => ({ id: x.id as Lane, label: x.label })), ...(showArchived ? [{ id: "archived" as Lane, label: "Archived" }] : [])];
  const laneOf = (p: Project): Lane => (p.archived || p.stage === "archived" ? "archived" : (phaseOf(p.stage) ?? "plan"));
  const dragged = drag ? data?.projects.find((p) => p.id === drag.id) : null;

  const card = (p: Project) => (
    <div
      key={p.id}
      className={`pcard ${drag?.id === p.id ? "dragging" : ""}`}
      tabIndex={0}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        dragStart.current = { id: p.id, x: e.clientX, y: e.clientY };
      }}
      onClick={() => !drag && go({ section: "workshop", projectId: p.id })}
      onKeyDown={(e) => e.key === "Enter" && go({ section: "workshop", projectId: p.id })}
      onContextMenu={(e) => {
        e.preventDefault();
        setMenu({ x: e.clientX, y: e.clientY, project: p });
      }}
    >
      <b>{p.title}</b>
      <span className="next">&gt; {data ? suggestedNextAction(p, data.tasks) : p.nextAction}</span>
      <span className="row small">
        <Chip title="Detailed stage">{p.archived ? "Archived" : stageLabel(p.stage)}</Chip>
        <Chip>{COMPLEXITY.find((c) => c.id === p.complexity)?.label}</Chip>
        {p.priority > 0 ? <Chip kind="accent">P{p.priority}</Chip> : null}
        {p.details.customStatus ? <Chip kind="warn">{p.details.customStatus}</Chip> : null}
        <span className="dim right">{relativeTime(p.updatedAt)}</span>
      </span>
    </div>
  );

  return (
    <div className="page">
      <PageHead
        sys="VIDEO WORKSHOP :: PROJECT ARCHIVE"
        title="Projects"
        lede="Four steps: Plan, Record, Edit, Publish. Drag a card to the next step, or right-click it to set the exact stage. Every project shows one next action."
        actions={
          <Button variant="primary" icon="plus" onClick={() => void newProject()}>
            New project
          </Button>
        }
      />
      <div className="row">
        <Segmented
          value={view}
          options={[
            { id: "board", label: "Board" },
            { id: "list", label: "List" },
          ]}
          onChange={(v) => setView(v ?? "board")}
          label="View"
        />
        <input className="input" style={{ width: 260 }} placeholder="Search projects" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search projects" />
        <Segmented value={complexity} options={COMPLEXITY} onChange={setComplexity} allowNone label="Complexity filter" />
        <label className="check">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          Show archive
        </label>
        <span className="dim right">{projects.length} {projects.length === 1 ? "project" : "projects"}</span>
      </div>

      {!data ? null : projects.length === 0 && !query && !complexity ? (
        <Empty icon="projects" title="No projects yet">
          Start one from TONIGHT.EXE, the Idea Machine, or the New project button.
        </Empty>
      ) : view === "board" ? (
        <div className="kanban">
          {lanes.map((s) => {
            const items = projects.filter((p) => laneOf(p) === s.id);
            return (
              <section key={s.id} className={`lane ${drag?.over === s.id ? "drop" : ""}`} data-lane={s.id} aria-label={s.label}>
                <header>
                  <span>{s.label.toUpperCase()}</span>
                  <span className="dim">{items.length}</span>
                </header>
                <div className="cards">{items.map(card)}</div>
              </section>
            );
          })}
        </div>
      ) : (
        <Win title="ALL PROJECTS" icon="projects">
          <table className="table">
            <thead>
              <tr>
                <th>Project</th>
                <th>Stage</th>
                <th>Size</th>
                <th>Priority</th>
                <th>Next action</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {[...projects]
                .sort((a, b) => b.priority - a.priority || b.updatedAt.localeCompare(a.updatedAt))
                .map((p) => (
                  <tr key={p.id} onClick={() => go({ section: "workshop", projectId: p.id })} onContextMenu={(e) => (e.preventDefault(), setMenu({ x: e.clientX, y: e.clientY, project: p }))}>
                    <td>{p.title}</td>
                    <td>{p.archived ? "Archived" : stageLabel(p.stage)}</td>
                    <td>{p.complexity}</td>
                    <td className="mono">{p.priority}</td>
                    <td className="dim">{data ? suggestedNextAction(p, data.tasks) : ""}</td>
                    <td className="dim">{relativeTime(p.updatedAt)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </Win>
      )}

      {drag && dragged ? (
        <div className="drag-ghost pcard" style={{ left: drag.x + 8, top: drag.y + 8 }}>
          <b>{dragged.title}</b>
          <span className="next">{drag.over ? `Move to ${lanes.find((l) => l.id === drag.over)?.label ?? drag.over}` : "Drop on a step"}</span>
        </div>
      ) : null}

      {menu ? (
        <div className="ctxmenu" style={{ left: menu.x, top: menu.y }} role="menu" onClick={(e) => e.stopPropagation()}>
          <button className="menu-item" onClick={() => (setMenu(null), go({ section: "workshop", projectId: menu.project.id }))}>
            Open
          </button>
          <button className="menu-item" onClick={() => (setMenu(null), void act(() => updateProject(db, menu.project.id, { priority: menu.project.priority + 1 })))}>
            Raise priority
          </button>
          <button className="menu-item" onClick={() => (setMenu(null), void act(() => updateProject(db, menu.project.id, { priority: Math.max(0, menu.project.priority - 1) })))}>
            Lower priority
          </button>
          <div className="menu-sep" />
          {STAGES.filter((s) => s.id !== "archived").map((s) => (
            <button key={s.id} className={`menu-item ${menu.project.stage === s.id ? "checked" : ""}`} onClick={() => (setMenu(null), moveTo(menu.project, s.id))}>
              Move to {s.label}
            </button>
          ))}
          <div className="menu-sep" />
          <button className="menu-item" onClick={() => (setMenu(null), void act(() => updateProject(db, menu.project.id, { archived: !menu.project.archived }), { title: menu.project.archived ? "RESTORED" : "ARCHIVED" }))}>
            {menu.project.archived ? "Restore from archive" : "Archive"}
          </button>
          <button
            className="menu-item"
            onClick={async () => {
              const p = menu.project;
              setMenu(null);
              if (await confirm({ title: "Delete project", message: `Delete "${p.title}" and its checklists, titles and packages?\n\nResearch and thumbnails are kept. Files on disk are never touched.\nArchiving is usually the better choice.`, confirm: "Delete", danger: true })) {
                try {
                  await deleteProject(db, p.id);
                  changed();
                  toast("DELETED", p.title);
                } catch (e) {
                  toast("ERROR", e instanceof Error ? e.message : String(e), "err");
                }
              }
            }}
          >
            Delete...
          </button>
        </div>
      ) : null}
    </div>
  );
}
