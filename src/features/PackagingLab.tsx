import { useEffect, useMemo, useRef, useState } from "react";
import { useAction, useApp, useData } from "../app/context.tsx";
import { addTitle, deletePackage, deleteTitle, getProject, listPackages, listProjects, listResearch, listThumbnails, listTitles, savePackage, updateTitle } from "../db/repos.ts";
import { checkTitle, suggestTitles, TITLE_STYLES, type TitleSlots, type TitleStyle } from "../domain/titles.ts";
import { checkChapters, DISCLOSURES, draftDescription, emptyPackage, formatSources, fullDescription, packageToText, suggestHashtags, suggestTags, UPLOAD_CHECKLIST } from "../domain/packaging.ts";
import { subjectLabel } from "../domain/ideas/subjects.ts";
import type { PackageContent, Project, TitleCandidate, UploadPackage } from "../domain/types.ts";
import { Button, Check, Chip, Empty, Field, Note, PageHead, Select, Tabs, Win } from "../ui/kit.tsx";
import { Icon } from "../ui/icons.tsx";

async function copy(text: string, toast: (t: string, b?: string, k?: "ok" | "err") => void) {
  try {
    await navigator.clipboard.writeText(text);
    toast("COPIED", text.length > 60 ? `${text.slice(0, 60)}...` : text);
  } catch {
    toast("ERROR", "The clipboard is not available.", "err");
  }
}

function defaultSlots(p: Project): TitleSlots {
  const topic = p.subjects[0] ? subjectLabel(p.subjects[0]) : "";
  return { topic, did: p.title.startsWith("I ") ? p.title : "", constraint: "", outcome: "" };
}

function TitleLab({ project }: { project: Project }) {
  const { db, toast } = useApp();
  const act = useAction();
  const { data } = useData(async () => ({ titles: await listTitles(db, project.id), thumbs: await listThumbnails(db, project.id) }), [project.id]);
  const [slots, setSlots] = useState<TitleSlots>(() => defaultSlots(project));
  const [styles, setStyles] = useState<TitleStyle[]>([...TITLE_STYLES]);
  const [custom, setCustom] = useState("");
  const [compare, setCompare] = useState(false);
  const suggestions = useMemo(() => suggestTitles(slots, styles), [slots, styles]);
  const titles = data?.titles ?? [];
  const existing = new Set(titles.map((t) => t.text.toLowerCase()));
  const favorites = titles.filter((t) => t.favorite);

  const thumbFor = (t: TitleCandidate) => data?.thumbs.find((x) => x.id === t.thumbnailId) ?? null;

  return (
    <div className="stack">
      <div className="grid" style={{ gridTemplateColumns: "minmax(320px, 1fr) minmax(320px, 1fr)" }}>
        <Win title="TITLE INGREDIENTS" icon="text">
          <p className="dim small">Titles are built only from what you write here. Leave "what happened" empty unless it really happened.</p>
          <Field label="Subject" hint="What people would search for.">
            {(id) => <input id={id} className="input" value={slots.topic} placeholder="e.g. Windows 98" onChange={(e) => setSlots({ ...slots, topic: e.target.value })} />}
          </Field>
          <Field label="What you did (first person)">
            {(id) => <input id={id} className="input" value={slots.did} placeholder="e.g. I used Windows 98 for a week" onChange={(e) => setSlots({ ...slots, did: e.target.value })} />}
          </Field>
          <Field label="Constraint or twist (optional)">
            {(id) => <input id={id} className="input" value={slots.constraint} placeholder="e.g. for a week" onChange={(e) => setSlots({ ...slots, constraint: e.target.value })} />}
          </Field>
          <Field label="What actually happened (optional, only if true)">
            {(id) => <input id={id} className="input" value={slots.outcome} placeholder="e.g. it fixed my old laptop" onChange={(e) => setSlots({ ...slots, outcome: e.target.value })} />}
          </Field>
          <div className="row small">
            {TITLE_STYLES.map((s) => (
              <Check key={s} checked={styles.includes(s)} onChange={(on) => setStyles(on ? [...styles, s] : styles.filter((x) => x !== s))}>
                {s}
              </Check>
            ))}
          </div>
        </Win>
        <Win title="SUGGESTIONS" icon="ideas" meta={`${suggestions.length}`} scroll>
          {suggestions.length ? (
            <div className="stack tight">
              {suggestions.map((s) => (
                <div key={s.text} className="row nowrap">
                  <Chip>{s.style}</Chip>
                  <span className="grow selectable">{s.text}</span>
                  <Button size="small" icon="plus" disabled={existing.has(s.text.toLowerCase())} onClick={() => void act(() => addTitle(db, project.id, s.text, s.style))}>
                    {existing.has(s.text.toLowerCase()) ? "Added" : "Keep"}
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <Empty icon="text" title="Fill in a subject or what you did">
              Suggestions appear as you type.
            </Empty>
          )}
          <div className="row nowrap">
            <input className="input grow" placeholder="Or write your own title" value={custom} onChange={(e) => setCustom(e.target.value)} onKeyDown={(e) => e.key === "Enter" && custom.trim() && (void act(() => addTitle(db, project.id, custom, "custom")), setCustom(""))} aria-label="Your own title" />
            <Button icon="plus" disabled={!custom.trim()} onClick={() => (void act(() => addTitle(db, project.id, custom, "custom")), setCustom(""))}>
              Add
            </Button>
          </div>
        </Win>
      </div>

      <Win
        title="CANDIDATES"
        icon="star"
        meta={`${titles.length} kept, ${favorites.length} favorite`}
        actions={
          <Button size="small" on={compare} onClick={() => setCompare(!compare)} disabled={favorites.length < 1}>
            Compare favorites
          </Button>
        }
      >
        {compare && favorites.length ? (
          <div className="grid cols-3">
            {favorites.map((t) => {
              const th = thumbFor(t);
              return (
                <div key={t.id} className="vcard" style={{ cursor: "default" }}>
                  <div className="vthumb">{th?.preview ? <img src={th.preview} alt="" /> : <span>No thumbnail paired</span>}</div>
                  <div className="vtitle" style={{ fontWeight: 700 }}>
                    {t.text}
                  </div>
                  <div className="vmeta">Your channel :: preview of how it reads in a feed</div>
                </div>
              );
            })}
          </div>
        ) : null}
        {titles.length ? (
          <table className="table">
            <tbody>
              {titles.map((t) => {
                const check = checkTitle(t.text, slots.topic);
                return (
                  <tr key={t.id}>
                    <td style={{ width: 36 }}>
                      <Button size="small" variant="flat" icon={t.favorite ? "star" : "staroff"} title={t.favorite ? "Unfavorite" : "Favorite"} onClick={() => void act(() => updateTitle(db, t.id, { favorite: !t.favorite }))} />
                    </td>
                    <td>
                      <input className="input" defaultValue={t.text} onBlur={(e) => e.target.value.trim() && e.target.value !== t.text && void act(() => updateTitle(db, t.id, { text: e.target.value.trim() }))} aria-label="Edit title" />
                      <div className="factors" style={{ marginTop: 4 }}>
                        {check.notes.map((n) => (
                          <span key={n.text} className={n.level === "ok" ? "plus" : "minus"}>
                            {n.text}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td style={{ width: 200 }}>
                      <Select
                        value={t.thumbnailId ?? ""}
                        options={[{ id: "", label: "Pair with thumbnail..." }, ...(data?.thumbs ?? []).map((x) => ({ id: x.id, label: x.name }))]}
                        onChange={(v) => void act(() => updateTitle(db, t.id, { thumbnailId: v || null }))}
                      />
                    </td>
                    <td style={{ width: 90 }}>
                      <span className="row nowrap">
                        <Button size="small" icon="copy" title="Copy" onClick={() => void copy(t.text, toast)} />
                        <Button size="small" icon="trash" title="Delete" onClick={() => void act(() => deleteTitle(db, t.id))} />
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <p className="dim">Keep a few suggestions or write your own. No title is guaranteed to perform; pick the one that honestly describes the video.</p>
        )}
      </Win>
    </div>
  );
}

function PackageEditor({ project }: { project: Project }) {
  const { db, platform, toast, changed } = useApp();
  const saveTimer = useRef<number | null>(null);
  const act = useAction();
  const { data } = useData(async () => ({ packages: await listPackages(db, project.id), titles: await listTitles(db, project.id), research: await listResearch(db, project.id) }), [project.id]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState<PackageContent | null>(null);
  const [label, setLabel] = useState("Version 1");

  const pkgs = data?.packages ?? [];
  const active: UploadPackage | null = pkgs.find((p) => p.id === activeId) ?? pkgs[pkgs.length - 1] ?? null;

  useEffect(() => {
    if (active) {
      setActiveId(active.id);
      setDraft({ ...emptyPackage(), ...active.content });
      setLabel(active.label);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id]);

  const fav = data?.titles.find((t) => t.favorite)?.text ?? data?.titles[0]?.text ?? project.title;

  const createVersion = async (fromCurrent: boolean) => {
    const base: PackageContent = fromCurrent && draft
      ? draft
      : {
          ...emptyPackage(fav),
          description: draftDescription(project, data?.research ?? []),
          summary: project.premise,
          tags: suggestTags(project, fav),
          hashtags: suggestHashtags(project),
          sources: formatSources(data?.research ?? []),
          credits: project.details.assets,
        };
    const p = await act(() => savePackage(db, { projectId: project.id, label: `Version ${pkgs.length + 1}`, content: base }), { title: "PACKAGE VERSION SAVED" });
    if (p) setActiveId(p.id);
  };

  // Autosave: write after a short pause so typing stays smooth.
  const persist = (next: PackageContent, nextLabel = label) => {
    setDraft(next);
    if (!active) return;
    const id = active.id;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      saveTimer.current = null;
      savePackage(db, { id, projectId: project.id, label: nextLabel, content: next })
        .then(() => changed())
        .catch((e: unknown) => toast("ERROR", e instanceof Error ? e.message : String(e), "err"));
    }, 500);
  };

  if (!data) return null;
  if (!active || !draft) {
    return (
      <Empty icon="packaging" title="No upload package yet">
        <p>A package collects the title, description, tags, credits and checklists for one upload. It starts from your project notes and saved sources; nothing is made up.</p>
        <Button variant="primary" icon="plus" onClick={() => void createVersion(false)}>
          Create package from project notes
        </Button>
      </Empty>
    );
  }

  const chapters = checkChapters(draft.chapters);
  const set = (patch: Partial<PackageContent>) => persist({ ...draft, ...patch });
  const doneCount = UPLOAD_CHECKLIST.filter((c) => draft.checklist[c.id]).length;

  const exportTxt = async () => {
    const path = await platform.dialogs.saveFile("Export upload package", `${project.title} - upload package.txt`, [{ name: "Text", extensions: ["txt"] }]);
    if (path) await act(() => platform.files.writeText(path, packageToText(draft)), { title: "UPLOAD PACKAGE READY", body: path });
  };

  return (
    <div className="stack">
      <div className="row">
        <span className="label">Version</span>
        <Select value={active.id} options={pkgs.map((p) => ({ id: p.id, label: p.label }))} onChange={(v) => setActiveId(v)} />
        <input className="input" style={{ width: 180 }} value={label} onChange={(e) => setLabel(e.target.value)} onBlur={() => persist(draft, label)} aria-label="Version name" />
        <Button icon="copy" onClick={() => void createVersion(true)}>
          Duplicate as new version
        </Button>
        <Button icon="refresh" onClick={() => void createVersion(false)} title="Start a fresh version from the current project notes">
          Fresh version from notes
        </Button>
        <Button icon="export" onClick={() => void exportTxt()}>
          Export .txt
        </Button>
        <Button icon="copy" variant="primary" onClick={() => void copy(fullDescription(draft), toast)}>
          Copy full description
        </Button>
        {pkgs.length > 1 ? (
          <Button variant="danger" icon="trash" onClick={() => void act(() => deletePackage(db, active.id)).then(() => setActiveId(null))}>
            Delete version
          </Button>
        ) : null}
      </div>
      <div className="grid" style={{ gridTemplateColumns: "minmax(0, 1.4fr) minmax(300px, 1fr)" }}>
        <div className="stack">
          <Win title="TITLE & DESCRIPTION" icon="text">
            <Field label={`Title (${[...draft.title].length}/100)`}>
              {(id) => (
                <div className="row nowrap">
                  <input id={id} className="input grow" value={draft.title} onChange={(e) => set({ title: e.target.value })} />
                  <Button size="small" icon="copy" title="Copy title" onClick={() => void copy(draft.title, toast)} />
                </div>
              )}
            </Field>
            {data.titles.length ? (
              <div className="row small">
                <span className="dim">Use a kept title:</span>
                {data.titles.slice(0, 6).map((t) => (
                  <Button key={t.id} size="small" variant="flat" onClick={() => set({ title: t.text })}>
                    {t.favorite ? <Icon name="star" /> : null}
                    {t.text.length > 40 ? `${t.text.slice(0, 40)}...` : t.text}
                  </Button>
                ))}
              </div>
            ) : null}
            <Field label="Description">{(id) => <textarea id={id} className="textarea" rows={8} value={draft.description} onChange={(e) => set({ description: e.target.value })} />}</Field>
            <Field label="Short summary (for socials or the first line)">{(id) => <textarea id={id} className="textarea" rows={2} value={draft.summary} onChange={(e) => set({ summary: e.target.value })} />}</Field>
          </Win>
          <Win title="CHAPTERS" icon="layers">
            <p className="dim small">Type timestamps from your final edit, one per line (0:00 Intro). CREATOR.EXE never guesses timestamps.</p>
            <textarea className="textarea mono" rows={5} value={draft.chapters} placeholder={"0:00 Intro\n0:45 ..."} onChange={(e) => set({ chapters: e.target.value })} aria-label="Chapters" />
            {draft.chapters.trim() ? (
              chapters.valid ? (
                <Note>
                  {chapters.chapters.length} chapters look valid for YouTube.
                </Note>
              ) : (
                <Note kind="warn">
                  {chapters.problems.map((p) => (
                    <div key={p}>{p}</div>
                  ))}
                </Note>
              )
            ) : project.details.structure.trim() ? (
              <Button
                size="small"
                onClick={() =>
                  set({
                    chapters: project.details.structure
                      .split("\n")
                      .map((l) => l.replace(/^[-*\d.)\s]+/, "").trim())
                      .filter(Boolean)
                      .map((l, i) => `${i === 0 ? "0:00" : "?:??"} ${l}`)
                      .join("\n"),
                  })
                }
              >
                Start from my outline (fill in the ?:?? times)
              </Button>
            ) : null}
          </Win>
          <Win title="CREDITS & SOURCES" icon="research">
            <Field label="Credits (music, footage, collaborators: only what you actually used)">{(id) => <textarea id={id} className="textarea" rows={3} value={draft.credits} onChange={(e) => set({ credits: e.target.value })} />}</Field>
            <Field label="Sources">
              {(id) => (
                <>
                  <textarea id={id} className="textarea" rows={4} value={draft.sources} onChange={(e) => set({ sources: e.target.value })} />
                  <Button size="small" icon="refresh" onClick={() => set({ sources: formatSources(data.research) })}>
                    Refresh from saved research ({data.research.filter((r) => r.url).length})
                  </Button>
                </>
              )}
            </Field>
            <Field label="Pinned comment draft">{(id) => <textarea id={id} className="textarea" rows={2} value={draft.pinnedComment} onChange={(e) => set({ pinnedComment: e.target.value })} />}</Field>
          </Win>
        </div>
        <div className="stack">
          <Win title="TAGS & HASHTAGS" icon="link">
            <p className="dim small">Tags play a small role in discovery; the title, thumbnail and description matter more.</p>
            <Field label={`Tags (${draft.tags.join(",").length}/500 characters)`}>
              {(id) => <textarea id={id} className="textarea" rows={3} value={draft.tags.join(", ")} onChange={(e) => set({ tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean) })} />}
            </Field>
            <div className="row">
              <Button size="small" onClick={() => set({ tags: suggestTags(project, draft.title) })}>
                Suggest from title & subjects
              </Button>
              <Button size="small" icon="copy" onClick={() => void copy(draft.tags.join(", "), toast)}>
                Copy tags
              </Button>
            </div>
            <Field label="Hashtags (max 3 show above the title)">
              {(id) => <input id={id} className="input" value={draft.hashtags.join(" ")} onChange={(e) => set({ hashtags: e.target.value.split(/\s+/).filter(Boolean).map((h) => (h.startsWith("#") ? h : `#${h}`)) })} />}
            </Field>
          </Win>
          <Win title="DISCLOSURES" icon="settings">
            {DISCLOSURES.map((d) => (
              <div key={d.id} className="stack tight">
                <Check checked={!!draft.disclosures[d.id]} onChange={(v) => set({ disclosures: { ...draft.disclosures, [d.id]: v } })}>
                  {d.label}
                </Check>
                {draft.disclosures[d.id] ? <span className="dim small" style={{ marginLeft: 24 }}>{d.hint}</span> : null}
              </div>
            ))}
          </Win>
          <Win title="UPLOAD CHECKLIST" icon="check" meta={`${doneCount}/${UPLOAD_CHECKLIST.length}`}>
            {UPLOAD_CHECKLIST.map((c) => (
              <Check key={c.id} checked={!!draft.checklist[c.id]} onChange={(v) => set({ checklist: { ...draft.checklist, [c.id]: v } })}>
                {c.label}
              </Check>
            ))}
            {doneCount === UPLOAD_CHECKLIST.length ? <Note>UPLOAD PACKAGE READY. Go publish it.</Note> : null}
          </Win>
        </div>
      </div>
    </div>
  );
}

export function PackagingLab({ projectId, tab: initialTab }: { projectId: string | null; tab?: string }) {
  const { db, go } = useApp();
  const [tab, setTab] = useState<"titles" | "package">(initialTab === "package" ? "package" : "titles");
  const { data: projects } = useData(() => listProjects(db), []);
  const { data: project } = useData(() => (projectId ? getProject(db, projectId) : Promise.resolve(null)), [projectId]);

  return (
    <div className="page">
      <PageHead
        sys="PACKAGING LAB :: UPLOAD PACKAGE"
        title={project ? `Packaging: ${project.title}` : "Packaging Lab"}
        lede="Compare honest titles, assemble the description from your own notes and sources, and tick off the upload checklist."
        actions={
          <Select
            value={projectId ?? ""}
            options={[{ id: "", label: "Choose a project..." }, ...(projects ?? []).map((p) => ({ id: p.id, label: p.title }))]}
            onChange={(v) => go({ section: "packaging", projectId: v || null, tab })}
          />
        }
      />
      {!project ? (
        <Empty icon="packaging" title="Pick a project to package">
          Titles and packages belong to a project.
        </Empty>
      ) : (
        <>
          <Tabs
            value={tab}
            tabs={[
              { id: "titles", label: "Title Lab" },
              { id: "package", label: "Description, tags & checklist" },
            ]}
            onChange={setTab}
          />
          <div className="tabpanel">{tab === "titles" ? <TitleLab project={project} /> : <PackageEditor project={project} />}</div>
        </>
      )}
    </div>
  );
}
