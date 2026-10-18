import { useEffect, useState } from "react";
import { useAction, useApp, useData } from "../app/context.tsx";
import {
  addTask,
  deleteResearch,
  deleteTask,
  getProject,
  listPackages,
  listProjectEvents,
  listResearch,
  listTasks,
  listThumbnails,
  listTitles,
  logProjectEvent,
  renameTask,
  saveResearch,
  setTaskDone,
  touchProject,
  updateProject,
  type ProjectPatch,
} from "../db/repos.ts";
import { STAGES, type Complexity, type Project, type ResearchItem, type TaskList } from "../domain/types.ts";
import { PHASES, phaseOf, rescueOptions, stageForPhase, stageLabel, suggestedNextAction } from "../domain/projects.ts";
import { formatDate, relativeTime } from "../lib/util.ts";
import { Button, Chip, Dialog, Empty, Note, PageHead, Segmented, Select, Tabs, TextInput, Win } from "../ui/kit.tsx";
import { ResearchEditor, SOURCE_TYPES, VERIFICATION } from "./Research.tsx";
import { RecordingSheet } from "./RecordingSheet.tsx";

type Tab = "sheet" | "checklists" | "research" | "files" | "history";


const LISTS: { id: TaskList; label: string; hint: string }[] = [
  { id: "prep", label: "Preparation", hint: "What to get ready before recording." },
  { id: "recording", label: "Recording checklist", hint: "Shots and takes to get." },
  { id: "upload", label: "Upload checklist", hint: "Anything specific to this upload (the standard list is in Packaging Lab)." },
];

function Checklists({ projectId }: { projectId: string }) {
  const { db } = useApp();
  const act = useAction();
  const { data } = useData(() => listTasks(db, projectId), [projectId]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  return (
    <div className="grid cols-3">
      {LISTS.map((l) => {
        const items = (data ?? []).filter((t) => t.list === l.id);
        const add = () => {
          const v = (drafts[l.id] ?? "").trim();
          if (!v) return;
          setDrafts({ ...drafts, [l.id]: "" });
          void act(() => addTask(db, projectId, l.id, v));
        };
        return (
          <Win key={l.id} title={l.label.toUpperCase()} icon="check" meta={`${items.filter((t) => t.done).length}/${items.length}`}>
            <p className="dim small">{l.hint}</p>
            <div className="stack tight">
              {items.map((t) => (
                <div key={t.id} className="row nowrap">
                  <label className="check">
                    <input type="checkbox" checked={t.done} onChange={(e) => void act(() => setTaskDone(db, t.id, e.target.checked))} aria-label={t.label} />
                  </label>
                  <TextInput className={t.done ? "dim" : ""} value={t.label} onCommit={(v) => void act(() => (v.trim() ? renameTask(db, t.id, v.trim()) : deleteTask(db, t.id)))} />
                  <Button size="small" icon="x" title="Remove" onClick={() => void act(() => deleteTask(db, t.id))} />
                </div>
              ))}
            </div>
            <div className="row nowrap">
              <input
                className="input"
                placeholder="Add item and press Enter"
                value={drafts[l.id] ?? ""}
                onChange={(e) => setDrafts({ ...drafts, [l.id]: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && add()}
                aria-label={`Add to ${l.label}`}
              />
              <Button icon="plus" onClick={add} title="Add" />
            </div>
          </Win>
        );
      })}
    </div>
  );
}

function ProjectResearch({ projectId }: { projectId: string }) {
  const { db, platform, confirm } = useApp();
  const act = useAction();
  const { data } = useData(() => listResearch(db, projectId), [projectId]);
  const [editing, setEditing] = useState<ResearchItem | "new" | null>(null);
  const items = data ?? [];
  return (
    <div className="stack">
      <div className="row">
        <Button variant="primary" icon="plus" onClick={() => setEditing("new")}>
          Add source or note
        </Button>
        <span className="dim small">Paste a link, then write what it says in your own words. Mark whether you verified it.</span>
      </div>
      {items.length ? (
        <table className="table">
          <thead>
            <tr>
              <th>Item</th>
              <th>Type</th>
              <th>Status</th>
              <th>Checked</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.map((r) => (
              <tr key={r.id} onDoubleClick={() => setEditing(r)}>
                <td>
                  <div>{r.title}</div>
                  <div className="dim small ellipsis" style={{ maxWidth: 520 }}>
                    {r.kind === "source" ? r.url || "no link" : r.kind}
                    {r.publisher ? ` :: ${r.publisher}` : ""}
                    {r.publishedAt ? ` :: ${r.publishedAt}` : ""}
                  </div>
                </td>
                <td>{SOURCE_TYPES.find((s) => s.id === r.sourceType)?.label ?? r.sourceType}</td>
                <td>
                  <Chip kind={r.verification === "verified" ? "ok" : r.verification === "disputed" ? "err" : r.verification === "speculation" ? "warn" : undefined}>
                    {VERIFICATION.find((v) => v.id === r.verification)?.label}
                  </Chip>
                </td>
                <td className="dim small">{r.checkedAt ? formatDate(r.checkedAt) : "-"}</td>
                <td>
                  <span className="row nowrap">
                    {r.url ? <Button size="small" icon="link" title="Open original source" onClick={() => void platform.openUrl(r.url)} /> : null}
                    <Button size="small" onClick={() => setEditing(r)}>
                      Edit
                    </Button>
                    <Button
                      size="small"
                      icon="trash"
                      title="Delete"
                      onClick={async () => {
                        if (await confirm({ title: "Delete research item", message: `Delete "${r.title}"?`, confirm: "Delete", danger: true })) void act(() => deleteResearch(db, r.id));
                      }}
                    />
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <Empty icon="research" title="No research saved for this project">
          Add sources as you find them. They become the Sources section of your description.
        </Empty>
      )}
      {editing ? (
        <ResearchEditor
          item={editing === "new" ? null : editing}
          defaultProjectId={projectId}
          onClose={() => setEditing(null)}
          onSave={async (input) => {
            await act(() => saveResearch(db, input), { title: "RESEARCH SAVED" });
            setEditing(null);
          }}
        />
      ) : null}
    </div>
  );
}

function Files({ project }: { project: Project }) {
  const { db, platform, settings, confirm, toast, go } = useApp();
  const act = useAction();
  const [exists, setExists] = useState<boolean | null>(null);
  useEffect(() => {
    if (!project.folderPath) return setExists(null);
    platform.files.exists(project.folderPath).then(setExists, () => setExists(false));
  }, [project.folderPath, platform]);

  const create = async () => {
    if (!settings.projectRoot) {
      toast("NO PROJECT FOLDER SET", "Choose where project folders go in Settings first.", "err");
      go({ section: "settings" });
      return;
    }
    const ok = await confirm({
      title: "Create project folder",
      message: `CREATOR.EXE will create this folder (existing files are never changed or deleted):\n\n${settings.projectRoot}\\${project.title}\\\n${settings.folderTemplate.map((f) => `    ${f}\\`).join("\n")}`,
      confirm: "Create folders",
    });
    if (!ok) return;
    const path = await act(() => platform.files.createProjectFolders(settings.projectRoot, project.title, settings.folderTemplate), { title: "FOLDERS CREATED" });
    if (path) {
      await updateProject(db, project.id, { folderPath: path });
      await logProjectEvent(db, project.id, "folder", path);
    }
  };

  return (
    <div className="grid cols-2">
      <Win title="PROJECT FOLDER" icon="folder">
        {project.folderPath ? (
          <>
            <div className="inset mono small selectable">{project.folderPath}</div>
            {exists === false ? <Note kind="warn">This folder no longer exists at that path. It may have been moved or renamed.</Note> : null}
            <div className="row">
              <Button icon="folder" disabled={exists === false} onClick={() => void act(() => platform.files.reveal(project.folderPath as string))}>
                Open in File Explorer
              </Button>
              <Button onClick={() => void create()}>Re-create missing subfolders</Button>
              <Button variant="flat" onClick={() => void act(() => updateProject(db, project.id, { folderPath: null }))}>
                Forget this path
              </Button>
            </div>
          </>
        ) : (
          <>
            <p>Create a tidy folder for recordings, audio, thumbnails and exports. You'll be shown exactly what will be created first.</p>
            <div className="row">
              <Button variant="primary" icon="folder" onClick={() => void create()}>
                Create project folder
              </Button>
              <Button
                onClick={async () => {
                  const p = await platform.dialogs.pickFolder("Use an existing folder for this project");
                  if (p) void act(() => updateProject(db, project.id, { folderPath: p }), { title: "FOLDER LINKED" });
                }}
              >
                Use an existing folder
              </Button>
            </div>
            <p className="dim small">Project folders go in: {settings.projectRoot || "(not set; choose one in Settings)"}</p>
          </>
        )}
      </Win>
      <Win title="EDITING APP" icon="play">
        <p>Open your own video editor. CREATOR.EXE only launches it; every editing decision stays yours.</p>
        {settings.editorPath ? (
          <>
            <div className="inset mono small selectable">{settings.editorPath}</div>
            <Button icon="play" onClick={() => void act(() => platform.files.launch(settings.editorPath, project.folderPath ?? undefined))}>
              Open editor{project.folderPath ? " with project folder" : ""}
            </Button>
          </>
        ) : (
          <Button onClick={() => go({ section: "settings" })}>Choose your editor in Settings</Button>
        )}
      </Win>
      <Win title="LINKS" icon="link">
        <Links project={project} />
      </Win>
    </div>
  );
}

function Links({ project }: { project: Project }) {
  const { db, platform } = useApp();
  const act = useAction();
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const links = project.details.links;
  const add = () => {
    if (!url.trim()) return;
    void act(() => updateProject(db, project.id, { details: { links: [...links, { label: label.trim() || url.trim(), url: url.trim() }] } }));
    setLabel("");
    setUrl("");
  };
  return (
    <div className="stack">
      {links.map((l, i) => (
        <div key={`${l.url}${i}`} className="row nowrap">
          <Button variant="flat" icon="link" onClick={() => void platform.openUrl(l.url)}>
            {l.label}
          </Button>
          <span className="dim small ellipsis grow">{l.url}</span>
          <Button size="small" icon="x" title="Remove link" onClick={() => void act(() => updateProject(db, project.id, { details: { links: links.filter((_, j) => j !== i) } }))} />
        </div>
      ))}
      <div className="row nowrap">
        <input className="input" style={{ width: 160 }} placeholder="Label" value={label} onChange={(e) => setLabel(e.target.value)} aria-label="Link label" />
        <input className="input grow" placeholder="https://" value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} aria-label="Link URL" />
        <Button icon="plus" onClick={add} title="Add link" />
      </div>
    </div>
  );
}

function History({ projectId }: { projectId: string }) {
  const { db } = useApp();
  const { data } = useData(() => listProjectEvents(db, projectId), [projectId]);
  return (
    <Win title="PROJECT HISTORY" icon="refresh">
      <table className="table">
        <tbody>
          {(data ?? []).map((e) => (
            <tr key={e.id}>
              <td className="dim small" style={{ width: 200 }}>
                {new Date(e.createdAt).toLocaleString()}
              </td>
              <td>{e.kind}</td>
              <td className="selectable">{e.detail}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Win>
  );
}

function Rescue({ project, onClose }: { project: Project; onClose: () => void }) {
  const { db, go } = useApp();
  const act = useAction();
  const apply = async (id: string) => {
    if (id === "simplify") await act(() => updateProject(db, project.id, { complexity: "quick", nextAction: "Decide the single moment the short version is about." }), { title: "SCALED DOWN" });
    if (id === "first-action") await act(() => updateProject(db, project.id, { nextAction: "Record five minutes of anything related. It doesn't need to be usable." }), { title: "NEXT ACTION SET" });
    if (id === "less-research") await act(() => updateProject(db, project.id, { details: { research: `${project.details.research}\n(Research trimmed: use what's already saved.)`.trim() } }), { title: "RESEARCH TRIMMED" });
    if (id === "park") await act(() => updateProject(db, project.id, { archived: true }), { title: "PARKED", body: "It's in the archive whenever you want it back." });
    if (id === "switch") go({ section: "tonight" });
    onClose();
  };
  return (
    <Dialog title="Creative block rescue" icon="rescue" onClose={onClose} actions={<Button onClick={onClose}>Close</Button>}>
      <p>Being stuck is normal. Pick one, or none.</p>
      <div className="stack tight">
        {rescueOptions(project).map((o) => (
          <button key={o.id} className="btn" style={{ justifyContent: "flex-start", textAlign: "left", height: "auto", padding: 10 }} onClick={() => void apply(o.id)}>
            <span className="stack tight">
              <b>{o.label}</b>
              <span className="dim small">{o.detail}</span>
            </span>
          </button>
        ))}
      </div>
    </Dialog>
  );
}

export function Workshop({ projectId, tab: initialTab }: { projectId: string; tab?: string }) {
  const { db, go } = useApp();
  const act = useAction();
  const [tab, setTab] = useState<Tab>(initialTab && initialTab !== "plan" ? (initialTab as Tab) : "sheet");
  const [rescue, setRescue] = useState(false);
  const { data, error } = useData(async () => {
    const [project, tasks, research, thumbs, titles, packages] = await Promise.all([
      getProject(db, projectId),
      listTasks(db, projectId),
      listResearch(db, projectId),
      listThumbnails(db, projectId),
      listTitles(db, projectId),
      listPackages(db, projectId),
    ]);
    return { project, tasks, research, thumbs, titles, packages };
  }, [projectId]);

  useEffect(() => {
    void touchProject(db, projectId);
  }, [db, projectId]);

  if (error) return <Note kind="err">{error}</Note>;
  if (!data) return <div className="dim">Loading...</div>;
  const p = data.project;
  if (!p) {
    return (
      <Empty icon="projects" title="Project not found">
        <Button onClick={() => go({ section: "projects" })}>Back to projects</Button>
      </Empty>
    );
  }
  const save = (patch: ProjectPatch) => void act(() => updateProject(db, p.id, patch));
  const next = suggestedNextAction(p, data.tasks);

  return (
    <div className="page">
      <PageHead
        sys={`VIDEO WORKSHOP :: ${stageLabel(p.stage).toUpperCase()}${p.archived ? " :: ARCHIVED" : ""}`}
        title={p.title}
        actions={
          <>
            <Button onClick={() => go({ section: "projects" })}>All projects</Button>
            <Button icon="rescue" onClick={() => setRescue(true)}>
              Stuck?
            </Button>
            <Button icon="thumbnail" onClick={() => go({ section: "thumbnails", projectId: p.id })}>
              Thumbnail ({data.thumbs.length})
            </Button>
            <Button icon="packaging" onClick={() => go({ section: "packaging", projectId: p.id })}>
              Titles & package ({data.titles.length}/{data.packages.length})
            </Button>
          </>
        }
      />
      <div className="row">
        <span className="label" style={{ width: 100 }}>
          Step
        </span>
        <Segmented
          value={p.archived ? null : phaseOf(p.stage)}
          options={PHASES.map((x) => ({ id: x.id, label: x.label }))}
          onChange={(v) => v && save({ stage: stageForPhase(p.stage, v), archived: false })}
          label="Step"
        />
        <Select value={p.stage} options={STAGES} onChange={(v) => save({ stage: v, archived: v === "archived" })} className="" />
        <span className="label">Size</span>
        <Segmented<Complexity>
          value={p.complexity}
          options={[
            { id: "quick", label: "Quick" },
            { id: "standard", label: "Standard" },
            { id: "ambitious", label: "Ambitious" },
          ]}
          onChange={(v) => v && save({ complexity: v })}
          label="Project size"
        />
        <span className="label">Priority</span>
        <Button size="small" icon="down" title="Lower priority" onClick={() => save({ priority: Math.max(0, p.priority - 1) })} />
        <span className="mono">{p.priority}</span>
        <Button size="small" icon="up" title="Raise priority" onClick={() => save({ priority: p.priority + 1 })} />
        <span className="label">Custom status</span>
        <TextInput className="" value={p.details.customStatus} placeholder="e.g. waiting on parts" onCommit={(v) => save({ details: { customStatus: v } })} />
        {p.stage === "editing" ? <span className="dim small">Editing is just a status here. The edit is all yours.</span> : null}
      </div>

      <Tabs<Tab>
        value={tab}
        tabs={[
          { id: "sheet", label: "Recording sheet" },
          { id: "checklists", label: "Checklists", badge: data.tasks.filter((t) => !t.done).length },
          { id: "research", label: "Research", badge: data.research.length },
          { id: "files", label: "Folder, editor & links" },
          { id: "history", label: "History" },
        ]}
        onChange={setTab}
      />
      <div className="tabpanel">
        {tab === "sheet" ? (
          <>
            <RecordingSheet project={p} next={next} />
            <p className="dim small">
              Everything saves automatically. Created {formatDate(p.createdAt)}, last changed {relativeTime(p.updatedAt)}.
            </p>
          </>
        ) : null}
        {tab === "checklists" ? <Checklists projectId={p.id} /> : null}
        {tab === "research" ? <ProjectResearch projectId={p.id} /> : null}
        {tab === "files" ? <Files project={p} /> : null}
        {tab === "history" ? <History projectId={p.id} /> : null}
      </div>
      {rescue ? <Rescue project={p} onClose={() => setRescue(false)} /> : null}
    </div>
  );
}
