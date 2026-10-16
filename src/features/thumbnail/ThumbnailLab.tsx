import { useEffect, useMemo, useState } from "react";
import { useAction, useApp, useData } from "../../app/context.tsx";
import { deleteThumbnail, getProject, getThumbnail, listProjects, listThumbnails, listTitles, listVideos, saveThumbnail } from "../../db/repos.ts";
import { CONCEPTS, buildAllConcepts } from "../../domain/thumbnails/concepts.ts";
import { newDoc, newImage, parseDoc, serializeDoc, type ImageLayer, type ThumbnailDoc } from "../../domain/thumbnails/model.ts";
import { docToSvg } from "../../domain/thumbnails/render.ts";
import { mimeForPath } from "../../lib/base64.ts";
import { relativeTime } from "../../lib/util.ts";
import type { Video } from "../../domain/types.ts";
import { Button, Dialog, Empty, Field, Note, PageHead, Select, Win } from "../../ui/kit.tsx";
import { Icon } from "../../ui/icons.tsx";
import { Editor } from "./Editor.tsx";
import { ThumbImg } from "../ChannelDna.tsx";
import { docPreview, imageSize, measureText } from "./raster.ts";

interface Open {
  id?: string;
  projectId: string | null;
  doc: ThumbnailDoc;
}

function ReferencePicker({ onPick, onClose }: { onPick: (v: Video) => void; onClose: () => void }) {
  const { db } = useApp();
  const { data } = useData(() => listVideos(db), []);
  const vids = (data ?? []).filter((v) => v.thumbnailUrl);
  return (
    <Dialog title="Use an old thumbnail as reference" icon="channel" wide onClose={onClose} actions={<Button onClick={onClose}>Cancel</Button>}>
      <p className="small">The image is added as a faint, locked layer to trace layouts from. It cannot be split back into its original layers; for that, import your original design files as images.</p>
      {vids.length ? (
        <div className="vgrid" style={{ maxHeight: 460, overflow: "auto" }}>
          {vids.map((v) => (
            <button key={v.id} className="vcard" onClick={() => onPick(v)}>
              <div className="vthumb">
                <ThumbImg src={v.thumbnailUrl ?? ""} />
              </div>
              <div className="vtitle">{v.title}</div>
            </button>
          ))}
        </div>
      ) : (
        <Empty icon="channel" title="No channel thumbnails yet">
          Import your channel in Channel DNA first.
        </Empty>
      )}
    </Dialog>
  );
}

export function ThumbnailLab({ projectId, thumbnailId }: { projectId: string | null; thumbnailId: string | null }) {
  const { db, platform, toast, changed, go, confirm } = useApp();
  const act = useAction();
  const [open, setOpenState] = useState<Open | null>(null);
  const [editorKey, setEditorKey] = useState(0);
  /** Opens a document in a fresh editor session (new undo history). */
  const setOpen = (o: Open | null) => {
    if (o && (!open || o.doc !== open.doc)) setEditorKey((k) => k + 1);
    setOpenState(o);
  };
  const [headline, setHeadline] = useState("");
  const [photo, setPhoto] = useState<ImageLayer | null>(null);
  const [concepts, setConcepts] = useState<ReturnType<typeof buildAllConcepts> | null>(null);
  const [refResolve, setRefResolve] = useState<((l: ImageLayer | null) => void) | null>(null);

  const { data } = useData(async () => {
    const [thumbs, projects, project, titles] = await Promise.all([
      listThumbnails(db),
      listProjects(db, true),
      projectId ? getProject(db, projectId) : Promise.resolve(null),
      projectId ? listTitles(db, projectId) : Promise.resolve([]),
    ]);
    return { thumbs, projects, project, titles };
  }, [projectId]);

  // Default the headline to a favorite title or the project title.
  useEffect(() => {
    if (!data) return;
    const fav = data.titles.find((t) => t.favorite)?.text ?? data.project?.title ?? "";
    setHeadline((h) => h || fav);
  }, [data]);

  // Open a specific thumbnail when navigated to one.
  useEffect(() => {
    if (!thumbnailId) return;
    getThumbnail(db, thumbnailId)
      .then((r) => {
        if (r) setOpen({ id: r.id, projectId: r.projectId, doc: parseDoc(r.doc) });
      })
      .catch((e: unknown) => toast("ERROR", `This thumbnail could not be opened: ${e instanceof Error ? e.message : String(e)}`, "err"));
  }, [db, thumbnailId, toast]);

  const shown = useMemo(() => (data?.thumbs ?? []).filter((t) => !projectId || t.projectId === projectId), [data, projectId]);

  const save = async (doc: ThumbnailDoc) => {
    if (!open) return;
    try {
      const preview = await docPreview(doc).catch(() => "");
      const rec = await saveThumbnail(db, { id: open.id, projectId: open.projectId, name: doc.name, doc: serializeDoc(doc), preview });
      setOpenState({ ...open, id: rec.id, doc });
      changed();
      toast("THUMBNAIL.EXE SAVED", doc.name);
    } catch (e) {
      toast("SAVE FAILED", e instanceof Error ? e.message : String(e), "err");
      throw e;
    }
  };

  const pickPhoto = async () => {
    const path = await platform.dialogs.openFile("Choose a photo or screenshot", [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "bmp", "gif"] }]);
    if (!path) return;
    try {
      const src = `data:${mimeForPath(path)};base64,${await platform.files.readBinary(path)}`;
      const size = await imageSize(src);
      setPhoto(newImage(src, size.w, size.h, path.split(/[\\/]/).pop() ?? "Photo"));
    } catch (e) {
      toast("ERROR", e instanceof Error ? e.message : String(e), "err");
    }
  };

  const addReference = () =>
    new Promise<ImageLayer | null>((resolve) => {
      setRefResolve(() => resolve);
    });

  const onPickReference = async (v: Video) => {
    const resolve = refResolve;
    setRefResolve(null);
    if (!resolve) return;
    try {
      const res = await platform.httpBinary(v.thumbnailUrl ?? "");
      if (res.status >= 400) throw new Error(`YouTube returned HTTP ${res.status} for that thumbnail.`);
      const src = `data:${res.contentType.split(";")[0] || "image/jpeg"};base64,${res.base64}`;
      const size = await imageSize(src);
      const l = newImage(src, size.w, size.h, `Reference: ${v.title}`);
      resolve({ ...l, x: 0, y: 0, w: 1280, h: 720, opacity: 0.35, locked: true });
    } catch (e) {
      toast("ERROR", `Could not download the thumbnail: ${e instanceof Error ? e.message : String(e)}`, "err");
      resolve(null);
    }
  };

  if (open) {
    return (
      <div className="page">
        <div className="row nowrap">
          <input className="input" style={{ maxWidth: 420 }} value={open.doc.name} onChange={(e) => setOpenState({ ...open, doc: { ...open.doc, name: e.target.value } })} aria-label="Thumbnail name" />
          <Select
            value={open.projectId ?? ""}
            options={[{ id: "", label: "(no project)" }, ...(data?.projects ?? []).map((p) => ({ id: p.id, label: p.title }))]}
            onChange={(v) => setOpenState({ ...open, projectId: v || null })}
            className=""
          />
          <span className="dim small">Name and project are saved with the next Save.</span>
        </div>
        <Editor
          key={editorKey}
          doc={open.doc}
          name={open.doc.name}
          onSave={(doc) => save({ ...doc, name: open.doc.name })}
          onClose={() => {
            setOpen(null);
            if (thumbnailId) go({ section: "thumbnails", projectId });
          }}
          onAddReference={addReference}
          unsaved={!open.id}
        />
        {refResolve ? (
          <ReferencePicker
            onPick={(v) => void onPickReference(v)}
            onClose={() => {
              refResolve(null);
              setRefResolve(null);
            }}
          />
        ) : null}
      </div>
    );
  }

  return (
    <div className="page">
      <PageHead
        sys="THUMBNAIL.EXE :: LAYERED DESIGN"
        title={data?.project ? `Thumbnails: ${data.project.title}` : "Thumbnail Lab"}
        lede="Start from a concept or a blank canvas. Every concept is built from real, editable layers using your own words."
        actions={
          <>
            <Select
              value={projectId ?? ""}
              options={[{ id: "", label: "All projects" }, ...(data?.projects ?? []).map((p) => ({ id: p.id, label: p.title }))]}
              onChange={(v) => go({ section: "thumbnails", projectId: v || null })}
            />
            <Button icon="plus" onClick={() => setOpen({ projectId, doc: newDoc(headline || "Untitled thumbnail") })}>
              Blank canvas
            </Button>
            <Button
              icon="import"
              onClick={async () => {
                const path = await platform.dialogs.openFile("Open a .cthumb file", [{ name: "CREATOR.EXE thumbnail", extensions: ["cthumb", "json"] }]);
                if (!path) return;
                try {
                  setOpen({ projectId, doc: parseDoc(await platform.files.readText(path)) });
                } catch (e) {
                  toast("ERROR", e instanceof Error ? e.message : String(e), "err");
                }
              }}
            >
              Open file...
            </Button>
          </>
        }
      />

      <Win title="CONCEPT GENERATOR" icon="ideas">
        <div className="row nowrap">
          <Field label="Thumbnail text (your words, short is better)" className="grow">
            {(id) => <input id={id} className="input" value={headline} placeholder="e.g. Windows 98 for a week" onChange={(e) => setHeadline(e.target.value)} onKeyDown={(e) => e.key === "Enter" && headline.trim() && setConcepts(buildAllConcepts({ headline: headline.trim(), image: photo, measure: measureText }))} />}
          </Field>
          <div className="stack tight">
            <span className="label">Photo or screenshot (optional)</span>
            <div className="row nowrap">
              <Button icon="image" onClick={() => void pickPhoto()}>
                {photo ? photo.name : "Choose..."}
              </Button>
              {photo ? <Button size="small" icon="x" title="Remove photo" onClick={() => setPhoto(null)} /> : null}
            </div>
          </div>
          <Button variant="primary" size="big" disabled={!headline.trim()} onClick={() => setConcepts(buildAllConcepts({ headline: headline.trim(), image: photo, measure: measureText }))}>
            Generate {CONCEPTS.length} concepts
          </Button>
        </div>
        {headline.trim().split(/\s+/).length > 6 ? <Note kind="warn">Thumbnail text over five or six words is hard to read on phones. The title can carry the rest.</Note> : null}
        {concepts ? (
          <div className="concepts">
            {concepts.map(({ concept, doc }) => (
              <article key={concept.id} className="card">
                <div className="vthumb" dangerouslySetInnerHTML={{ __html: docToSvg(doc, { width: 384, height: 216 }) }} />
                <div className="row nowrap">
                  <h3 className="grow">{concept.name}</h3>
                  <Button variant="primary" size="small" icon="play" onClick={() => setOpen({ projectId, doc: { ...doc, name: `${headline} (${concept.name})` } })}>
                    Open in editor
                  </Button>
                </div>
                <p className="small">{concept.premise}</p>
                <details>
                  <summary className="dim small">Design notes</summary>
                  <dl className="kv small">
                    <dt>Layout</dt>
                    <dd>{concept.layout}</dd>
                    <dt>Subject</dt>
                    <dd>{concept.placement}</dd>
                    <dt>Background</dt>
                    <dd>{concept.background}</dd>
                    <dt>Type</dt>
                    <dd>{concept.typography}</dd>
                    <dt>Palette</dt>
                    <dd>
                      <span className="row" style={{ gap: 3 }}>
                        {concept.palette.map((c) => (
                          <span key={c} title={c} style={{ width: 16, height: 16, background: c, boxShadow: "var(--sunken)", display: "inline-block" }} />
                        ))}
                      </span>
                    </dd>
                    <dt>Needs</dt>
                    <dd>{concept.imageNeeds}</dd>
                    <dt>Why</dt>
                    <dd>{concept.reasoning}</dd>
                    <dt>Drawbacks</dt>
                    <dd>{concept.drawbacks}</dd>
                  </dl>
                </details>
              </article>
            ))}
          </div>
        ) : (
          <p className="dim small">Concepts use system fonts so exports look the same everywhere. Image generation by AI is not part of this version; bring your own photos or screenshots.</p>
        )}
      </Win>

      <Win title="SAVED THUMBNAILS" icon="thumbnail" meta={`${shown.length}`}>
        {shown.length ? (
          <div className="vgrid">
            {shown.map((t) => (
              <div key={t.id} className="vcard">
                <button className="vthumb" style={{ border: 0, padding: 0 }} onClick={() => go({ section: "thumbnails", projectId, thumbnailId: t.id })} aria-label={`Open ${t.name}`}>
                  {t.preview ? <img src={t.preview} alt="" /> : <Icon name="thumbnail" />}
                </button>
                <div className="vtitle">{t.name}</div>
                <div className="vmeta">
                  <span>{data?.projects.find((p) => p.id === t.projectId)?.title ?? "No project"}</span>
                  <span>{relativeTime(t.updatedAt)}</span>
                </div>
                <div className="row" style={{ padding: "0 4px 4px" }}>
                  <Button size="small" onClick={() => go({ section: "thumbnails", projectId, thumbnailId: t.id })}>
                    Edit
                  </Button>
                  <Button
                    size="small"
                    icon="copy"
                    title="Duplicate"
                    onClick={async () => {
                      const full = await getThumbnail(db, t.id);
                      if (full) await act(() => saveThumbnail(db, { projectId: full.projectId, name: `${full.name} copy`, doc: full.doc, preview: full.preview }), { title: "DUPLICATED" });
                    }}
                  />
                  <Button
                    size="small"
                    icon="trash"
                    title="Delete"
                    onClick={async () => {
                      if (await confirm({ title: "Delete thumbnail", message: `Delete "${t.name}"? Exported files on disk are not affected.`, confirm: "Delete", danger: true })) void act(() => deleteThumbnail(db, t.id));
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Empty icon="thumbnail" title="No thumbnails yet">
            Generate concepts above or start from a blank canvas.
          </Empty>
        )}
      </Win>
    </div>
  );
}
