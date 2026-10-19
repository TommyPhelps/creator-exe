// Thumbnail Lab (0.2.0): your screenshots + your cut-out face + your words,
// composed in the styles of your own uploads. Every concept is editable
// layers; nothing here generates artwork.
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useAction, useApp, useData } from "../../app/context.tsx";
import { addThumbAsset, deleteThumbAsset, deleteThumbnail, getProject, getThumbAsset, getThumbnail, listProjects, listThumbAssets, listThumbnails, listTitles, listVideos, saveThumbnail } from "../../db/repos.ts";
import { composeConcepts, type ComposeResult, type Cutout, type ThumbImage } from "../../domain/thumbnails/compose.ts";
import { newDoc, newImage, parseDoc, serializeDoc, type ImageLayer, type ThumbnailDoc } from "../../domain/thumbnails/model.ts";
import { docToSvg } from "../../domain/thumbnails/render.ts";
import { THUMB_STYLES, STYLE_BY_ID, styleForTitle, type StyleId } from "../../domain/thumbnails/styles.ts";
import { relativeTime } from "../../lib/util.ts";
import type { ThumbAsset, Video } from "../../domain/types.ts";
import { Button, Check, Dialog, Empty, Field, Note, PageHead, Progress, Select, Splitter, Win, usePaneWidth } from "../../ui/kit.tsx";
import { Icon } from "../../ui/icons.tsx";
import { Editor } from "./Editor.tsx";
import { ThumbImg } from "../ChannelDna.tsx";
import { docPreview } from "./raster.ts";
import { IMAGE_EXTENSIONS, cutOutPhoto, fetchThumbnail, fileName, imageSize, prepareScreenshot, readImageFile } from "./images.ts";
import { preloadPageFonts } from "./fonts.ts";

interface Open {
  id?: string;
  projectId: string | null;
  doc: ThumbnailDoc;
}

type CutState = { phase: "consent"; paths: string[] } | { phase: "downloading"; paths: string[]; done: number; total: number } | { phase: "cutting"; index: number; count: number } | null;

const MB = (n: number) => `${Math.round(n / 1_000_000)} MB`;

/** Adds photos of you to the library as cut-outs, downloading the model first if you agree. */
function useCutouts(onAdded: (a: ThumbAsset) => void) {
  const { db, platform, toast, changed } = useApp();
  const [state, setState] = useState<CutState>(null);

  const cut = async (paths: string[]) => {
    for (let i = 0; i < paths.length; i++) {
      setState({ phase: "cutting", index: i, count: paths.length });
      const path = paths[i]!;
      try {
        const r = await cutOutPhoto(platform, await readImageFile(platform, path));
        const a = await addThumbAsset(db, { kind: "cutout", name: fileName(path), projectId: null, src: r.src, preview: r.preview, w: r.w, h: r.h, alphaBox: r.alphaBox });
        onAdded(a);
      } catch (e) {
        toast("CUT-OUT FAILED", `${fileName(path)}: ${e instanceof Error ? e.message : String(e)}`, "err");
      }
    }
    setState(null);
    changed();
  };

  const start = async (pathsIn?: string[]) => {
    const status = await platform.cutout.status();
    if (!status.runtimeReady) {
      toast("FACE CUT-OUT UNAVAILABLE", "This copy of CREATOR.EXE doesn't include ONNX Runtime. Use the installer version (the portable .exe can't cut out photos).", "err");
      return;
    }
    const paths = pathsIn ?? (await platform.dialogs.openFiles("Choose photos of you", [{ name: "Images", extensions: IMAGE_EXTENSIONS }]));
    if (!paths.length) return;
    if (!status.modelReady) setState({ phase: "consent", paths });
    else await cut(paths);
  };

  const download = async (paths: string[]) => {
    setState({ phase: "downloading", paths, done: 0, total: 175_997_641 });
    try {
      await platform.cutout.download((done, total) => setState({ phase: "downloading", paths, done, total }));
      await cut(paths);
    } catch (e) {
      setState(null);
      toast("DOWNLOAD FAILED", e instanceof Error ? e.message : String(e), "err");
    }
  };

  const dialog =
    state?.phase === "consent" ? (
      <Dialog
        title="Face cut-out: one-time download"
        icon="image"
        onClose={() => setState(null)}
        actions={
          <>
            <Button onClick={() => setState(null)}>Not now</Button>
            <Button variant="primary" onClick={() => void download(state.paths)}>
              Download {MB(175_997_641)}
            </Button>
          </>
        }
      >
        <p>Cutting you out of a photo runs entirely on this PC. It needs a person-segmentation model (U²-Net human segmentation, Apache-2.0) that is downloaded once from the rembg project's GitHub releases and checked against its SHA-256 before use.</p>
        <p className="dim small">Nothing is uploaded. Your photos never leave this PC. The model is kept in the app's data folder; deleting it just means asking again next time.</p>
      </Dialog>
    ) : state?.phase === "downloading" ? (
      <Dialog title="Downloading the cut-out model" icon="image" onClose={() => undefined}>
        <div className="cut-progress">
          <Progress value={state.done} max={state.total} />
          <span className="small dim">
            {MB(state.done)} of {MB(state.total)}
          </span>
        </div>
      </Dialog>
    ) : state?.phase === "cutting" ? (
      <Dialog title="Cutting out" icon="image" onClose={() => undefined}>
        <div className="cut-progress">
          <Progress value={state.index} max={state.count} />
          <span className="small dim">
            Photo {state.index + 1} of {state.count}, on this PC…
          </span>
        </div>
      </Dialog>
    ) : null;

  return { start, dialog, busy: state !== null };
}

function AssetStrip(p: { items: ThumbAsset[]; selected: string[]; onToggle: (id: string) => void; onDelete: (a: ThumbAsset) => void; cut?: boolean; add: { label: string; onClick: () => void } }) {
  return (
    <div className="asset-strip">
      {p.items.map((a) => (
        <div key={a.id} className={`asset ${p.cut ? "cut" : ""} ${p.selected.includes(a.id) ? "on" : ""}`} title={a.name} onClick={() => p.onToggle(a.id)} role="checkbox" aria-checked={p.selected.includes(a.id)}>
          <img src={a.preview} alt={a.name} />
          <button
            className="x"
            title="Remove from library"
            onClick={(e) => {
              e.stopPropagation();
              p.onDelete(a);
            }}
          >
            <Icon name="x" />
          </button>
        </div>
      ))}
      <button className={`asset-add ${p.cut ? "cut" : ""}`} onClick={p.add.onClick} style={p.cut ? { aspectRatio: "3 / 4" } : undefined}>
        <Icon name="plus" />
        {p.add.label}
      </button>
    </div>
  );
}

function ReferencePicker({ onPick, onClose }: { onPick: (v: Video) => void; onClose: () => void }) {
  const { db } = useApp();
  const { data } = useData(() => listVideos(db), []);
  const vids = (data ?? []).filter((v) => v.thumbnailUrl);
  return (
    <Dialog title="Add one of your thumbnails as a reference layer" icon="channel" wide onClose={onClose} actions={<Button onClick={onClose}>Cancel</Button>}>
      <p className="small dim">It is added as a faint, locked layer to line things up against, and isn't exported unless you make it visible.</p>
      {vids.length ? (
        <div className="ref-strip" style={{ maxHeight: 520 }}>
          {vids.map((v) => (
            <button key={v.id} className="ref" onClick={() => onPick(v)}>
              <ThumbImg src={v.thumbnailUrl ?? ""} />
              <span>{v.title}</span>
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

function CutoutPicker({ onPick, onClose }: { onPick: (l: ImageLayer) => void; onClose: () => void }) {
  const { db } = useApp();
  const { data, reload } = useData(() => listThumbAssets(db, "cutout"), []);
  const cuts = useCutouts(() => reload());
  return (
    <Dialog title="Add yourself" icon="image" wide onClose={onClose} actions={<Button onClick={onClose}>Cancel</Button>}>
      <AssetStrip
        cut
        items={data ?? []}
        selected={[]}
        onToggle={async (id) => {
          const a = await getThumbAsset(db, id);
          if (!a) return;
          const l = newImage(a.src, a.w, a.h, a.name);
          const h = 620;
          const w = Math.round((h * a.w) / a.h);
          onPick({ ...l, role: "face", alphaBox: a.alphaBox, x: 1280 - w - 20, y: 720 - h, w, h, outline: { color: "#ffffff", width: 7 }, shadow: { color: "#000000", blur: 18, dx: 0, dy: 6, opacity: 0.55 } });
        }}
        onDelete={() => undefined}
        add={{ label: "Cut out a photo", onClick: () => void cuts.start() }}
      />
      {cuts.dialog}
    </Dialog>
  );
}

export function ThumbnailLab({ projectId, thumbnailId }: { projectId: string | null; thumbnailId: string | null }) {
  const { db, platform, toast, changed, go, confirm } = useApp();
  const act = useAction();
  const [open, setOpenState] = useState<Open | null>(null);
  const [editorKey, setEditorKey] = useState(0);
  const setOpen = (o: Open | null) => {
    if (o && (!open || o.doc !== open.doc)) setEditorKey((k) => k + 1);
    setOpenState(o);
  };
  const [headline, setHeadline] = useState("");
  const [more, setMore] = useState(false);
  const [lines, setLines] = useState("");
  const [bigWord, setBigWord] = useState("");
  const [errorTitle, setErrorTitle] = useState("");
  const [split, setSplit] = useState<[string, string]>(["", ""]);
  const [shots, setShots] = useState<string[]>([]);
  const [faces, setFaces] = useState<string[]>([]);
  const [styleChoice, setStyleChoice] = useState<StyleId | "">("");
  const [refId, setRefId] = useState<string | null>(null);
  const [experimental, setExperimental] = useState(false);
  const [count, setCount] = useState("4");
  const [seed, setSeed] = useState(1);
  const [result, setResult] = useState<ComposeResult | null>(null);
  const [building, setBuilding] = useState(false);
  const [refResolve, setRefResolve] = useState<((l: ImageLayer | null) => void) | null>(null);
  const [cutResolve, setCutResolve] = useState<((l: ImageLayer | null) => void) | null>(null);
  const [leftW, setLeftW, saveLeftW] = usePaneWidth("lab-left", 440);

  const { data } = useData(async () => {
    const [thumbs, projects, project, titles, assets, videos] = await Promise.all([
      listThumbnails(db),
      listProjects(db, true),
      projectId ? getProject(db, projectId) : Promise.resolve(null),
      projectId ? listTitles(db, projectId) : Promise.resolve([]),
      listThumbAssets(db),
      listVideos(db),
    ]);
    return { thumbs, projects, project, titles, assets, videos };
  }, [projectId]);

  const screenshots = useMemo(() => (data?.assets ?? []).filter((a) => a.kind === "screenshot"), [data]);
  const cutouts = useMemo(() => (data?.assets ?? []).filter((a) => a.kind === "cutout"), [data]);
  const refs = useMemo(() => (data?.videos ?? []).filter((v) => v.thumbnailUrl).map((v) => ({ v, style: styleForTitle(v.title) })), [data]);

  const cuts = useCutouts((a) => setFaces((f) => [a.id, ...f]));

  useEffect(() => {
    void preloadPageFonts();
  }, []);

  useEffect(() => {
    if (!data) return;
    const fav = data.titles.find((t) => t.favorite)?.text ?? data.project?.title ?? "";
    setHeadline((h) => h || fav);
  }, [data]);

  useEffect(() => {
    if (!thumbnailId) return;
    getThumbnail(db, thumbnailId)
      .then((r) => {
        if (r) setOpen({ id: r.id, projectId: r.projectId, doc: parseDoc(r.doc) });
      })
      .catch((e: unknown) => toast("ERROR", `This thumbnail could not be opened: ${e instanceof Error ? e.message : String(e)}`, "err"));
  }, [db, thumbnailId, toast]);

  const shown = useMemo(() => (data?.thumbs ?? []).filter((t) => !projectId || t.projectId === projectId), [data, projectId]);

  // What will be used if nothing is ticked: your newest few.
  const useShots = shots.length ? shots : screenshots.slice(0, 3).map((a) => a.id);
  const useFaces = faces.length ? faces : cutouts.slice(0, 2).map((a) => a.id);

  const generate = async (nextSeed = seed) => {
    setBuilding(true);
    try {
      const load = async (ids: string[]) => (await Promise.all(ids.map((id) => getThumbAsset(db, id)))).filter((a): a is ThumbAsset => !!a);
      const [bg, fc] = await Promise.all([load(useShots), load(useFaces)]);
      const backgrounds: ThumbImage[] = bg.map((a) => ({ src: a.src, w: a.w, h: a.h, name: a.name }));
      const cutoutsIn: Cutout[] = fc.filter((a) => a.alphaBox).map((a) => ({ src: a.src, w: a.w, h: a.h, name: a.name, alphaBox: a.alphaBox! }));
      const ruleLines = lines
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      setResult(
        composeConcepts({
          headline: headline.trim(),
          lines: ruleLines.length ? ruleLines : undefined,
          bigWord: bigWord.trim() || undefined,
          errorTitle: errorTitle.trim() || undefined,
          splitLabels: split[0].trim() && split[1].trim() ? [split[0].trim(), split[1].trim()] : undefined,
          backgrounds,
          cutouts: cutoutsIn,
          reference: styleChoice ? { styleId: styleChoice } : null,
          experimental,
          count: Number(count),
          seed: nextSeed,
        }),
      );
    } catch (e) {
      toast("ERROR", e instanceof Error ? e.message : String(e), "err");
    } finally {
      setBuilding(false);
    }
  };

  const addScreenshots = async () => {
    const paths = await platform.dialogs.openFiles("Choose screenshots", [{ name: "Images", extensions: IMAGE_EXTENSIONS }]);
    for (const path of paths) {
      try {
        const r = await prepareScreenshot(await readImageFile(platform, path));
        const a = await addThumbAsset(db, { kind: "screenshot", name: fileName(path), projectId, src: r.src, preview: r.preview, w: r.w, h: r.h, alphaBox: null });
        setShots((s) => [a.id, ...s]);
      } catch (e) {
        toast("ERROR", `${fileName(path)}: ${e instanceof Error ? e.message : String(e)}`, "err");
      }
    }
    if (paths.length) changed();
  };

  const removeAsset = async (a: ThumbAsset) => {
    if (!(await confirm({ title: "Remove from library", message: `Remove "${a.name}" from the Thumbnail Lab library? Thumbnails that already use it keep their copy.`, confirm: "Remove", danger: true }))) return;
    await act(() => deleteThumbAsset(db, a.id));
    setShots((s) => s.filter((x) => x !== a.id));
    setFaces((s) => s.filter((x) => x !== a.id));
  };

  /** Ticking starts from what is currently used (your newest), so the first click doesn't silently drop the others. */
  const toggle = (set: (f: (s: string[]) => string[]) => void, implicit: string[]) => (id: string) =>
    set((s) => {
      const cur = s.length ? s : implicit;
      return cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    });

  const save = async (doc: ThumbnailDoc) => {
    if (!open) return;
    try {
      const preview = await docPreview(doc).catch(() => "");
      const rec = await saveThumbnail(db, { id: open.id, projectId: open.projectId, name: doc.name, doc: serializeDoc(doc), preview });
      setOpenState({ ...open, id: rec.id, doc });
      changed();
      toast("SAVED", doc.name);
    } catch (e) {
      toast("SAVE FAILED", e instanceof Error ? e.message : String(e), "err");
      throw e;
    }
  };

  const onPickReference = async (v: Video) => {
    const resolve = refResolve;
    setRefResolve(null);
    if (!resolve) return;
    try {
      const src = await fetchThumbnail(platform, v.thumbnailUrl ?? "");
      const size = await imageSize(src);
      const l = newImage(src, size.w, size.h, `Reference: ${v.title}`);
      resolve({ ...l, x: 0, y: 0, w: 1280, h: 720, opacity: 0.35, locked: true, visible: true });
    } catch (e) {
      toast("ERROR", `Could not download the thumbnail: ${e instanceof Error ? e.message : String(e)}`, "err");
      resolve(null);
    }
  };

  if (open) {
    return (
      <div className="page" style={{ maxWidth: "none" }}>
        <div className="row nowrap">
          <input className="input" style={{ maxWidth: 440 }} value={open.doc.name} onChange={(e) => setOpenState({ ...open, doc: { ...open.doc, name: e.target.value } })} aria-label="Thumbnail name" />
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
          onAddReference={() => new Promise<ImageLayer | null>((resolve) => setRefResolve(() => resolve))}
          onAddCutout={() => new Promise<ImageLayer | null>((resolve) => setCutResolve(() => resolve))}
          videoTitle={data?.titles.find((t) => t.favorite)?.text ?? data?.project?.title ?? ""}
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
        {cutResolve ? (
          <CutoutPicker
            onPick={(l) => {
              cutResolve(l);
              setCutResolve(null);
            }}
            onClose={() => {
              cutResolve(null);
              setCutResolve(null);
            }}
          />
        ) : null}
      </div>
    );
  }

  const chosenStyle = styleChoice ? STYLE_BY_ID.get(styleChoice) : null;

  return (
    <div className="page" style={{ maxWidth: "none" }}>
      <PageHead
        sys="Thumbnail Lab"
        title={data?.project ? `Thumbnails: ${data.project.title}` : "Thumbnail Lab"}
        lede="Your screenshots, your face and your words, laid out the way your own thumbnails are. Every concept opens as editable layers."
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
              Open file…
            </Button>
          </>
        }
      />

      <div className="lab" style={{ "--lab-left": `${leftW}px` } as CSSProperties}>
        <div className="lab-inputs">
          <Win title="Words" icon="text">
            <Field label="Caption (your words; two to five reads best)">
              {(id) => <input id={id} className="input" value={headline} placeholder="e.g. Only the journal's directions" onChange={(e) => setHeadline(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void generate()} />}
            </Field>
            {headline.trim().split(/\s+/).length > 6 ? <Note kind="warn">Over five or six words is hard to read on a phone. Let the title carry the rest.</Note> : null}
            <button className="linklike small" style={{ alignSelf: "flex-start" }} onClick={() => setMore(!more)}>
              {more ? "Fewer options" : "Rules list, one big word, error box, split labels…"}
            </button>
            {more ? (
              <div className="stack">
                <Field label="Rules list (one per line)" hint="Used for the rules-list style, like your Pacifist video.">
                  {(id) => <textarea id={id} className="textarea" rows={4} value={lines} placeholder={"No wiki\nNo quest markers\nOnly the journal"} onChange={(e) => setLines(e.target.value)} />}
                </Field>
                <div className="grid cols-2">
                  <Field label="One big word">{(id) => <input id={id} className="input" value={bigWord} placeholder="LOST" onChange={(e) => setBigWord(e.target.value)} />}</Field>
                  <Field label="Error box program">{(id) => <input id={id} className="input" value={errorTitle} placeholder="Morrowind.exe" onChange={(e) => setErrorTitle(e.target.value)} />}</Field>
                  <Field label="Split: left label">{(id) => <input id={id} className="input" value={split[0]} placeholder="Day 1" onChange={(e) => setSplit([e.target.value, split[1]])} />}</Field>
                  <Field label="Split: right label">{(id) => <input id={id} className="input" value={split[1]} placeholder="Day 30" onChange={(e) => setSplit([split[0], e.target.value])} />}</Field>
                </div>
              </div>
            ) : null}
          </Win>

          <Win title="Screenshots" icon="image" meta={shots.length ? `${shots.length} chosen` : screenshots.length ? "newest 3 used" : undefined}>
            <AssetStrip items={screenshots} selected={useShots} onToggle={toggle(setShots, useShots)} onDelete={(a) => void removeAsset(a)} add={{ label: "Add screenshots", onClick: () => void addScreenshots() }} />
            {!screenshots.length ? <p className="dim small">Concepts are built on real gameplay. Add a few screenshots from the game (F12 in Steam, or frames from your recording).</p> : null}
          </Win>

          <Win title="You" icon="user" meta={faces.length ? `${faces.length} chosen` : cutouts.length ? "newest 2 used" : undefined}>
            <AssetStrip cut items={cutouts} selected={useFaces} onToggle={toggle(setFaces, useFaces)} onDelete={(a) => void removeAsset(a)} add={{ label: cuts.busy ? "Working…" : "Cut out a photo", onClick: () => void cuts.start() }} />
            <p className="dim small">Pick a photo or webcam frame of you reacting; you're cut out on this PC, nothing is uploaded. Cut-outs are kept here for next time.</p>
          </Win>

          <Win title="Inspired by" icon="channel" meta={chosenStyle ? chosenStyle.name : "any of your styles"}>
            <Select<StyleId | "">
              value={styleChoice}
              options={[{ id: "", label: "Any of your styles" }, ...THUMB_STYLES.map((s) => ({ id: s.id, label: `${s.name}${s.experimental ? " (experimental)" : ""}` }))]}
              onChange={(v) => {
                setStyleChoice(v);
                setRefId(null);
              }}
            />
            {chosenStyle ? <p className="small dim">{chosenStyle.look}</p> : null}
            {refs.length ? (
              <div className="ref-strip">
                {refs.map(({ v, style }) => (
                  <button
                    key={v.id}
                    className={`ref ${refId === v.id ? "on" : ""}`}
                    title={style ? `${v.title}: ${style.name}` : `${v.title}: style not identified, pick one above`}
                    onClick={() => {
                      setRefId(v.id);
                      if (style) setStyleChoice(style.id);
                    }}
                  >
                    <ThumbImg src={v.thumbnailUrl ?? ""} />
                    <span>{style ? style.name : "Pick a style above"}</span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="dim small">Import your channel in Channel DNA to pick one of your own thumbnails here.</p>
            )}
          </Win>

          <div className="row nowrap">
            <Check checked={experimental} onChange={setExperimental}>
              Include experimental
            </Check>
            <Select
              value={count}
              options={["3", "4", "5", "6"].map((n) => ({ id: n, label: `${n} concepts` }))}
              onChange={setCount}
            />
            <span className="grow" />
            <Button variant="primary" size="big" disabled={!headline.trim() || building} onClick={() => void generate()}>
              {building ? "Building…" : "Build concepts"}
            </Button>
          </div>
        </div>

        <Splitter label="Resize the Thumbnail Lab panels" value={leftW} min={360} max={720} onChange={setLeftW} onDone={saveLeftW} />

        <div className="stack">
          {result ? (
            <>
              <div className="row">
                <h2 className="grow">
                  {result.concepts.length} concept{result.concepts.length === 1 ? "" : "s"}
                </h2>
                <Button
                  icon="refresh"
                  onClick={() => {
                    setSeed(seed + 1);
                    void generate(seed + 1);
                  }}
                >
                  Shuffle layouts
                </Button>
              </div>
              {result.notes.map((n) => (
                <Note key={n}>{n}</Note>
              ))}
              <div className="concepts">
                {result.concepts.map((c) => (
                  <article key={c.id} className="concept">
                    <div className="vthumb" onClick={() => setOpen({ projectId, doc: { ...c.doc, name: `${headline.trim()} (${c.style.name})` } })} dangerouslySetInnerHTML={{ __html: docToSvg(c.doc) }} />
                    <div className="c-body">
                      <div className="c-head">
                        <h3>{c.style.name}</h3>
                        {c.style.experimental ? <span className="tag-exp">Experimental</span> : null}
                        <Button variant="primary" size="small" onClick={() => setOpen({ projectId, doc: { ...c.doc, name: `${headline.trim()} (${c.style.name})` } })}>
                          Edit
                        </Button>
                      </div>
                      <p className="why">{c.why}</p>
                      {c.issues.length ? (
                        <p className="small" style={{ color: "var(--warn)" }}>
                          {c.issues.map((i) => i.message).join(" ")}
                        </p>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
            </>
          ) : (
            <Win title="Concepts" icon="ideas">
              <Empty icon="thumbnail" title="Nothing built yet">
                Type your caption, add a screenshot or two and a cut-out of you, then Build concepts. Each one follows a layout from your own uploads.
              </Empty>
            </Win>
          )}

          <Win title="Saved thumbnails" icon="thumbnail" meta={`${shown.length}`}>
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
                    <div className="row" style={{ padding: "0 10px 10px", gap: 4 }}>
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
                Build concepts above or start from a blank canvas.
              </Empty>
            )}
          </Win>
        </div>
      </div>
      {cuts.dialog}
    </div>
  );
}
