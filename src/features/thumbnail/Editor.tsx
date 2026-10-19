// Slim layered thumbnail editor (0.2.0). The canvas is the same SVG the
// exporter writes. Live checks flag text over your face, text over text,
// the timestamp corner and words too small for a phone, as you work.
import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent, type RefObject } from "react";
import { useApp } from "../../app/context.tsx";
import {
  THUMB_H,
  THUMB_W,
  addLayer,
  alignLayers,
  duplicateLayer,
  groupMembers,
  newBackground,
  newImage,
  newShape,
  newText,
  removeLayer,
  reorderLayer,
  serializeDoc,
  translateLayers,
  updateLayer,
  type Align,
  type BackgroundLayer,
  type ImageLayer,
  type Layer,
  type LayerRole,
  type ShapeLayer,
  type TextLayer,
  type ThumbnailDoc,
} from "../../domain/thumbnails/model.ts";
import { FONT_STACKS, docToSvg, layerDefs, layerSvg } from "../../domain/thumbnails/render.ts";
import { History, snap } from "../../domain/thumbnails/history.ts";
import { SAFE_MARGIN, TIMESTAMP_ZONE, checkDoc, layerBox, visibleBox } from "../../domain/thumbnails/quality.ts";
import { FONT_METRICS } from "../../domain/thumbnails/fontMetrics.ts";
import { mimeForPath } from "../../lib/base64.ts";
import { Button, Check, Dialog, Note, Segmented, Select, Splitter, usePaneWidth } from "../../ui/kit.tsx";
import { Icon } from "../../ui/icons.tsx";
import { bytesToBase64, docToOra, docToPng, docToPsd, fitText, imageSize } from "./raster.ts";
import { fontCssFor, preloadPageFonts } from "./fonts.ts";

type Handle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "rot";
interface DragState {
  mode: "move" | "resize" | "rotate";
  handle?: Handle;
  id: string;
  start: { x: number; y: number };
  orig: Layer;
  /** Everything that moves with the layer (its group). */
  group: Layer[];
  moved: boolean;
}

const rad = (d: number) => (d * Math.PI) / 180;
const rot = (x: number, y: number, deg: number) => {
  const r = rad(deg);
  return { x: x * Math.cos(r) - y * Math.sin(r), y: x * Math.sin(r) + y * Math.cos(r) };
};

function contains(l: Layer, px: number, py: number): boolean {
  const cx = l.x + l.w / 2;
  const cy = l.y + l.h / 2;
  const p = rot(px - cx, py - cy, -l.rotation);
  return Math.abs(p.x) <= l.w / 2 && Math.abs(p.y) <= l.h / 2;
}

// Bundled fonts first (they look the same everywhere and in exports), then system fonts for older thumbnails.
const FONTS = Object.keys(FONT_STACKS).map((f) => ({ id: f, label: FONT_METRICS[f] ? f : `${f} (system)` }));
const ROLES: { id: LayerRole | ""; label: string }[] = [
  { id: "", label: "Not set" },
  { id: "face", label: "Your face (keep text off it)" },
  { id: "backdrop", label: "Background screenshot" },
  { id: "caption", label: "Caption" },
  { id: "list", label: "List line" },
  { id: "accent", label: "Arrow / accent (keep off text)" },
  { id: "dialog", label: "Error box part" },
  { id: "badge", label: "Small badge" },
];
const SHAPES: { id: ShapeLayer["shape"]; label: string }[] = [
  { id: "curved-arrow", label: "Curved arrow" },
  { id: "arrow", label: "Straight arrow" },
  { id: "rect", label: "Rectangle" },
  { id: "ellipse", label: "Circle / ellipse" },
  { id: "triangle", label: "Triangle" },
  { id: "star", label: "Starburst" },
];

function NumberField(p: { label: string; value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number }) {
  return (
    <label className="field">
      <span className="label">{p.label}</span>
      <input
        className="input"
        type="number"
        value={Number.isFinite(p.value) ? Math.round(p.value * 100) / 100 : 0}
        step={p.step ?? 1}
        min={p.min}
        max={p.max}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v)) p.onChange(v);
        }}
      />
    </label>
  );
}

function Slider(p: { label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void; format?: (v: number) => string }) {
  return (
    <label className="field">
      <span className="label">
        {p.label}: <span className="mono">{p.format ? p.format(p.value) : Math.round(p.value)}</span>
      </span>
      <input type="range" min={p.min} max={p.max} step={p.step ?? 1} value={p.value} onChange={(e) => p.onChange(Number(e.target.value))} />
    </label>
  );
}

function ColorField(p: { label: string; value: string; onChange: (v: string) => void }) {
  const hex = /^#[0-9a-f]{6}$/i.test(p.value) ? p.value : "#000000";
  return (
    <label className="field">
      <span className="label">{p.label}</span>
      <span className="row nowrap" style={{ gap: 6 }}>
        <input className="color" type="color" value={hex} onChange={(e) => p.onChange(e.target.value)} />
        <input className="input mono" value={p.value} onChange={(e) => p.onChange(e.target.value)} style={{ width: 110 }} />
      </span>
    </label>
  );
}

export interface EditorProps {
  doc: ThumbnailDoc;
  name: string;
  onSave: (doc: ThumbnailDoc) => Promise<void>;
  onClose: () => void;
  onAddReference: () => Promise<ImageLayer | null>;
  /** Picks (or makes) a cut-out of you from the library. */
  onAddCutout: () => Promise<ImageLayer | null>;
  /** The video title, for the YouTube previews. */
  videoTitle?: string;
  /** True when the document has never been saved. */
  unsaved?: boolean;
}

export function Editor(props: EditorProps) {
  const { platform, toast, confirm } = useApp();
  const history = useRef(new History<ThumbnailDoc>(props.doc));
  const [, force] = useReducer((n: number) => n + 1, 0);
  const doc = history.current.present;
  const [sel, setSel] = useState<string | null>(null);
  const [zoom, setZoom] = useState<number | "fit">("fit");
  const [fit, setFit] = useState(0.6);
  const [snapOn, setSnapOn] = useState(true);
  const [safe, setSafe] = useState(true);
  const [showIssues, setShowIssues] = useState(true);
  const [guides, setGuides] = useState<{ x: number | null; y: number | null }>({ x: null, y: null });
  const [dirty, setDirty] = useState(!!props.unsaved);
  const [exportDlg, setExportDlg] = useState(false);
  const [ytDlg, setYtDlg] = useState(false);
  const [busy, setBusy] = useState(false);
  const [leftW, setLeftW, saveLeftW] = usePaneWidth("editor-left", 250);
  const [rightW, setRightW, saveRightW] = usePaneWidth("editor-right", 340);
  const [, fontsReady] = useReducer((n: number) => n + 1, 0);
  const drag = useRef<DragState | null>(null);
  const lastEdit = useRef<{ key: string; t: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  const scale = zoom === "fit" ? fit : zoom;
  const selected = doc.layers.find((l) => l.id === sel) ?? null;
  const issues = useMemo(() => checkDoc(doc), [doc]);
  const issueIds = useMemo(() => new Set(issues.flatMap((i) => i.layerIds)), [issues]);
  const errorIds = useMemo(() => new Set(issues.filter((i) => i.level === "error").flatMap((i) => i.layerIds)), [issues]);

  useEffect(() => {
    void preloadPageFonts().then(fontsReady);
  }, []);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setFit(Math.max(0.2, Math.min((r.width - 32) / THUMB_W, (r.height - 32) / THUMB_H)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /** Records an edit. Rapid edits with the same key merge into one undo step. */
  const commit = useCallback((next: ThumbnailDoc, key?: string) => {
    const now = Date.now();
    const prev = lastEdit.current;
    if (key && prev && prev.key === key && now - prev.t < 700) history.current.replace(next);
    else history.current.push(next);
    lastEdit.current = key ? { key, t: now } : null;
    setDirty(true);
    force();
  }, []);

  const patch = useCallback(
    (id: string, p: Partial<Layer>, key?: string) => {
      const cur = history.current.present;
      let next = updateLayer(cur, id, p);
      const l = next.layers.find((x) => x.id === id);
      if (l && l.type === "text") next = updateLayer(next, id, fitText(l));
      commit(next, key ?? `${id}:${Object.keys(p).join(",")}`);
    },
    [commit],
  );

  const toCanvas = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    const m = svg?.getScreenCTM();
    if (!svg || !m) return { x: 0, y: 0 };
    const pt = new DOMPoint(clientX, clientY).matrixTransform(m.inverse());
    return { x: pt.x, y: pt.y };
  };

  const save = useCallback(async () => {
    setBusy(true);
    try {
      await props.onSave(history.current.present);
      setDirty(false);
    } finally {
      setBusy(false);
    }
  }, [props]);

  const undo = () => {
    history.current.undo();
    lastEdit.current = null;
    setDirty(true);
    force();
  };
  const redo = () => {
    history.current.redo();
    lastEdit.current = null;
    setDirty(true);
    force();
  };

  // Keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT");
      const k = e.key.toLowerCase();
      if (e.ctrlKey && k === "s") {
        e.preventDefault();
        void save();
        return;
      }
      if (typing) return;
      if (e.ctrlKey && (k === "z" || k === "y")) {
        e.preventDefault();
        if (k === "z" && !e.shiftKey) undo();
        else redo();
        return;
      }
      if (!selected) return;
      if (e.ctrlKey && k === "d") {
        e.preventDefault();
        const r = duplicateLayer(history.current.present, selected.id);
        commit(r.doc);
        setSel(r.newId);
      } else if (e.ctrlKey && (e.key === "[" || e.key === "]")) {
        e.preventDefault();
        commit(reorderLayer(history.current.present, selected.id, e.key === "]" ? 1 : -1));
      } else if (k === "delete" || k === "backspace") {
        e.preventDefault();
        commit(removeLayer(history.current.present, selected.id));
        setSel(null);
      } else if (k.startsWith("arrow") && !selected.locked) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = k === "arrowleft" ? -step : k === "arrowright" ? step : 0;
        const dy = k === "arrowup" ? -step : k === "arrowdown" ? step : 0;
        const cur = history.current.present;
        commit(translateLayers(cur, groupMembers(cur, selected.id), dx, dy), `${selected.id}:nudge`);
      } else if (k === "escape") setSel(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const addImageFromPath = useCallback(
    async (path: string) => {
      try {
        const mime = mimeForPath(path);
        if (!mime.startsWith("image/")) throw new Error("Only image files (PNG, JPG, GIF, WebP, BMP) can be added.");
        const b64 = await platform.files.readBinary(path);
        const src = `data:${mime};base64,${b64}`;
        const size = await imageSize(src);
        const layer = newImage(src, size.w, size.h, path.split(/[\\/]/).pop() ?? "Image");
        commit(addLayer(history.current.present, layer, sel));
        setSel(layer.id);
      } catch (e) {
        toast("ERROR", e instanceof Error ? e.message : String(e), "err");
      }
    },
    [platform, commit, sel, toast],
  );

  // Dropping image files from Explorer onto the window adds them as layers.
  useEffect(() => {
    let off: (() => void) | null = null;
    let alive = true;
    void platform
      .onFileDrop((paths) => {
        for (const p of paths) void addImageFromPath(p);
      })
      .then((u) => {
        if (alive) off = u;
        else u();
      });
    return () => {
      alive = false;
      off?.();
    };
  }, [platform, addImageFromPath]);

  // ---------------------------------------------------------- pointer handling
  const onPointerDown = (e: RPointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    const p = toCanvas(e.clientX, e.clientY);
    const target = e.target as Element;
    const handle = target.getAttribute("data-handle") as Handle | null;
    if (handle && selected) {
      drag.current = { mode: handle === "rot" ? "rotate" : "resize", handle, id: selected.id, start: p, orig: selected, group: [selected], moved: false };
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
      return;
    }
    const g = target.closest("[data-layers] > g[id]");
    let hit = g ? (doc.layers.find((l) => l.id === g.id) ?? null) : null;
    if (hit?.locked) {
      const unlocked = [...doc.layers].reverse().find((l) => l.visible && !l.locked && contains(l, p.x, p.y));
      if (unlocked) hit = unlocked;
    }
    if (!hit) {
      setSel(null);
      return;
    }
    setSel(hit.id);
    if (!hit.locked) {
      drag.current = { mode: "move", id: hit.id, start: p, orig: hit, group: groupMembers(doc, hit.id), moved: false };
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
    }
  };

  const onPointerMove = (e: RPointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    if (!d) return;
    const p = toCanvas(e.clientX, e.clientY);
    const o = d.orig;
    const key = `${d.id}:${d.mode}:${d.start.x}:${d.start.y}`;
    if (d.mode === "move") {
      let x = o.x + (p.x - d.start.x);
      let y = o.y + (p.y - d.start.y);
      let gx: number | null = null;
      let gy: number | null = null;
      if (snapOn && !e.altKey) {
        const ids = new Set(d.group.map((l) => l.id));
        const others = doc.layers.filter((l) => !ids.has(l.id) && l.visible && l.type !== "background" && l.role !== "backdrop");
        const xs = [0, SAFE_MARGIN, THUMB_W / 2, THUMB_W - SAFE_MARGIN, THUMB_W, ...others.flatMap((l) => [l.x, l.x + l.w / 2, l.x + l.w])];
        const ys = [0, SAFE_MARGIN, THUMB_H / 2, THUMB_H - SAFE_MARGIN, THUMB_H, ...others.flatMap((l) => [l.y, l.y + l.h / 2, l.y + l.h])];
        const candX = [snap(x, xs, null), snap(x + o.w / 2, xs, null), snap(x + o.w, xs, null)];
        const offX = [0, o.w / 2, o.w];
        const bx = candX.findIndex((c) => c.guide !== null);
        if (bx >= 0) {
          gx = candX[bx]!.value;
          x = gx - offX[bx]!;
        }
        const candY = [snap(y, ys, null), snap(y + o.h / 2, ys, null), snap(y + o.h, ys, null)];
        const offY = [0, o.h / 2, o.h];
        const by = candY.findIndex((c) => c.guide !== null);
        if (by >= 0) {
          gy = candY[by]!.value;
          y = gy - offY[by]!;
        }
      }
      setGuides({ x: gx, y: gy });
      d.moved = true;
      commit(translateLayers(history.current.present, d.group, x - o.x, y - o.y), key);
      return;
    }
    const cx = o.x + o.w / 2;
    const cy = o.y + o.h / 2;
    if (d.mode === "rotate") {
      let angle = (Math.atan2(p.y - cy, p.x - cx) * 180) / Math.PI + 90;
      if (e.shiftKey || snapOn) {
        const near = Math.round(angle / 15) * 15;
        if (e.shiftKey || Math.abs(near - angle) < 4) angle = near;
      }
      angle = ((angle + 540) % 360) - 180;
      d.moved = true;
      patch(d.id, { rotation: Math.round(angle * 10) / 10 }, key);
      return;
    }
    // Resize in the layer's own (rotated) frame, keeping the opposite side fixed.
    const local = rot(p.x - d.start.x, p.y - d.start.y, -o.rotation);
    const h = d.handle ?? "se";
    let x0 = -o.w / 2;
    let x1 = o.w / 2;
    let y0 = -o.h / 2;
    let y1 = o.h / 2;
    if (h.includes("w")) x0 += local.x;
    if (h.includes("e")) x1 += local.x;
    if (h.includes("n")) y0 += local.y;
    if (h.includes("s")) y1 += local.y;
    let w = Math.max(8, x1 - x0);
    let hh = Math.max(8, y1 - y0);
    const corner = h.length === 2;
    if (corner && (e.shiftKey || o.type === "image" || o.type === "text")) {
      const ratio = o.w / o.h;
      if (w / hh > ratio) w = hh * ratio;
      else hh = w / ratio;
      if (h.includes("w")) x0 = x1 - w;
      else x1 = x0 + w;
      if (h.includes("n")) y0 = y1 - hh;
      else y1 = y0 + hh;
    }
    const c = rot((x0 + x1) / 2, (y0 + y1) / 2, o.rotation);
    const ncx = cx + c.x;
    const ncy = cy + c.y;
    d.moved = true;
    if (o.type === "text") {
      const fontSize = Math.max(8, Math.round(o.fontSize * (corner ? w / o.w : 1)));
      const next = fitText({ ...o, fontSize });
      patch(d.id, { fontSize, x: ncx - next.w / 2, y: ncy - next.h / 2 } as Partial<TextLayer>, key);
    } else {
      patch(d.id, { x: ncx - w / 2, y: ncy - hh / 2, w, h: hh }, key);
    }
  };

  const onPointerUp = () => {
    drag.current = null;
    lastEdit.current = null;
    setGuides({ x: null, y: null });
  };

  // ---------------------------------------------------------- rendering
  const defs = useMemo(() => doc.layers.map(layerDefs).join(""), [doc]);
  const hs = 10 / scale;
  const group = selected ? groupMembers(doc, selected.id) : [];

  const selectionOverlay = selected ? (
    <>
      {group.length > 1
        ? group
            .filter((g) => g.id !== selected.id)
            .map((g) => {
              const b = layerBox(g);
              return <rect key={g.id} x={b.x} y={b.y} width={b.w} height={b.h} fill="none" stroke="var(--accent)" strokeOpacity={0.5} strokeWidth={1 / scale} strokeDasharray={`${4 / scale} ${4 / scale}`} pointerEvents="none" />;
            })
        : null}
      <g transform={`translate(${selected.x + selected.w / 2} ${selected.y + selected.h / 2}) rotate(${selected.rotation}) translate(${-selected.w / 2} ${-selected.h / 2})`} pointerEvents={selected.locked ? "none" : "all"}>
        <rect x={0} y={0} width={selected.w} height={selected.h} fill="none" stroke="var(--accent)" strokeWidth={1.5 / scale} pointerEvents="none" />
        {selected.locked || selected.type === "background"
          ? null
          : (
              [
                ["nw", 0, 0],
                ["n", selected.w / 2, 0],
                ["ne", selected.w, 0],
                ["e", selected.w, selected.h / 2],
                ["se", selected.w, selected.h],
                ["s", selected.w / 2, selected.h],
                ["sw", 0, selected.h],
                ["w", 0, selected.h / 2],
              ] as [Handle, number, number][]
            )
              .filter(([h]) => selected.type !== "text" || h.length === 2)
              .map(([h, x, y]) => <rect key={h} data-handle={h} x={x - hs / 2} y={y - hs / 2} width={hs} height={hs} fill="#ffffff" stroke="#000000" strokeWidth={1 / scale} style={{ cursor: `${h}-resize` }} />)}
        {selected.locked || selected.type === "background" ? null : (
          <>
            <line x1={selected.w / 2} y1={0} x2={selected.w / 2} y2={-28 / scale} stroke="var(--accent)" strokeWidth={1.5 / scale} pointerEvents="none" />
            <circle data-handle="rot" cx={selected.w / 2} cy={-28 / scale} r={hs * 0.6} fill="var(--accent)" stroke="#000" strokeWidth={1 / scale} style={{ cursor: "grab" }} />
          </>
        )}
      </g>
    </>
  ) : null;

  const issueOverlay = showIssues
    ? doc.layers
        .filter((l) => l.visible && issueIds.has(l.id) && l.id !== sel)
        .map((l) => {
          const b = l.type === "image" && l.role === "face" ? visibleBox(l) : layerBox(l);
          return <rect key={`iss-${l.id}`} x={b.x} y={b.y} width={b.w} height={b.h} fill="none" stroke={errorIds.has(l.id) ? "#e5625c" : "#d9a441"} strokeWidth={2 / scale} strokeDasharray={`${8 / scale} ${5 / scale}`} pointerEvents="none" />;
        })
    : null;

  const add = (layer: Layer) => {
    const l = layer.type === "text" ? fitText({ ...layer, fontFamily: "Lato", fontWeight: 900, capBaseline: true, role: "caption" }) : layer;
    commit(addLayer(history.current.present, l, sel));
    setSel(l.id);
  };

  const exportFile = async (kind: "png" | "psd" | "svg" | "ora" | "cthumb") => {
    const base = (doc.name || "thumbnail").replace(/[<>:"/\\|?*]/g, "-");
    const names = { png: "PNG image", psd: "Photoshop / Affinity layers", svg: "SVG (editable vector)", ora: "OpenRaster (layers)", cthumb: "CREATOR.EXE thumbnail" };
    const path = await platform.dialogs.saveFile(`Export ${names[kind]}`, `${base}.${kind}`, [{ name: names[kind], extensions: [kind] }]);
    if (!path) return;
    setBusy(true);
    try {
      if (kind === "png") await platform.files.writeBinary(path, bytesToBase64(await docToPng(doc)));
      if (kind === "psd") await platform.files.writeBinary(path, bytesToBase64(await docToPsd(doc)));
      if (kind === "svg") await platform.files.writeText(path, docToSvg(doc, { fontCss: await fontCssFor(doc) }));
      if (kind === "ora") await platform.files.writeBinary(path, bytesToBase64(await docToOra(doc)));
      if (kind === "cthumb") await platform.files.writeText(path, serializeDoc(doc));
      toast("EXPORTED", path);
    } catch (e) {
      toast("EXPORT FAILED", e instanceof Error ? e.message : String(e), "err");
    } finally {
      setBusy(false);
    }
  };

  const layersTopFirst = [...doc.layers].reverse();
  const svgContent = doc.layers.map((l) => layerSvg(l)).join("");
  const errors = issues.filter((i) => i.level === "error").length;

  return (
    <div className="stack" style={{ height: "calc(100vh - 190px)", minHeight: 600, gap: 8 }}>
      <div className="toolbar" style={{ border: "1px solid var(--border)", flexWrap: "wrap" }}>
        <Button icon="save" variant={dirty ? "primary" : undefined} onClick={() => void save()} disabled={busy} title="Save (Ctrl+S)">
          {dirty ? "Save" : "Saved"}
        </Button>
        <Button icon="undo" title="Undo (Ctrl+Z)" disabled={!history.current.canUndo} onClick={undo} />
        <Button icon="redo" title="Redo (Ctrl+Y)" disabled={!history.current.canRedo} onClick={redo} />
        <span className="sep" />
        <Button icon="text" onClick={() => add(newText("YOUR WORDS", 110))}>
          Text
        </Button>
        <Button
          icon="user"
          title="Add a cut-out of you"
          onClick={async () => {
            const l = await props.onAddCutout();
            if (l) add(l);
          }}
        >
          You
        </Button>
        <Button
          icon="image"
          onClick={async () => {
            const paths = await platform.dialogs.openFiles("Add images", [{ name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "webp", "bmp"] }]);
            for (const p of paths) await addImageFromPath(p);
          }}
        >
          Image
        </Button>
        <Select
          value=""
          options={[{ id: "", label: "+ Shape" }, ...SHAPES, { id: "bg", label: "Colour background" }] as { id: string; label: string }[]}
          onChange={(v) => {
            if (!v) return;
            if (v === "bg") add(newBackground(["#1b1b1b", "#050505"]));
            else if (v === "curved-arrow") add({ ...newShape("curved-arrow", "#e8261f"), w: 260, h: 220, stroke: { color: "#000000", width: 8 }, role: "accent", name: "Arrow" });
            else add(newShape(v as ShapeLayer["shape"], v === "arrow" ? "#e8261f" : "#e8c547"));
          }}
          className=""
        />
        <Button
          icon="channel"
          title="Add one of your old thumbnails as a faint, locked layer to line things up"
          onClick={async () => {
            const l = await props.onAddReference();
            if (l) add(l);
          }}
        >
          Reference
        </Button>
        <span className="sep" />
        <Check checked={snapOn} onChange={setSnapOn}>
          Snap
        </Check>
        <Check checked={safe} onChange={setSafe}>
          Safe area
        </Check>
        <Check checked={showIssues} onChange={setShowIssues}>
          Mark problems
        </Check>
        <Select
          value={zoom === "fit" ? "fit" : String(zoom)}
          options={[
            { id: "fit", label: "Fit" },
            { id: "0.5", label: "50%" },
            { id: "0.75", label: "75%" },
            { id: "1", label: "100%" },
          ]}
          onChange={(v) => setZoom(v === "fit" ? "fit" : Number(v))}
          className=""
        />
        <span className="spacer" />
        <Button icon="play" onClick={() => setYtDlg(true)}>
          Preview on YouTube
        </Button>
        <Button icon="export" onClick={() => setExportDlg(true)}>
          Export
        </Button>
        <Button onClick={async () => (!dirty || (await confirmLeave())) && props.onClose()}>Close</Button>
      </div>

      <div className="editor" style={{ flex: 1, "--ed-left": `${leftW}px`, "--ed-right": `${rightW}px` } as CSSProperties}>
        <section className="win">
          <div className="titlebar">
            <Icon name="layers" /> Layers
            <span className="tb-spacer" />
            <span className="tb-meta">{doc.layers.length}</span>
          </div>
          <div className="content" style={{ padding: 0, gap: 0 }}>
            <div className="layers" role="listbox" aria-label="Layers, top first">
              {layersTopFirst.map((l) => (
                <div key={l.id} className={`layer-row ${sel === l.id ? "sel" : ""} ${issueIds.has(l.id) ? "issue" : ""}`} role="option" aria-selected={sel === l.id} onClick={() => setSel(l.id)}>
                  <button title={l.visible ? "Hide" : "Show"} onClick={(e) => (e.stopPropagation(), patch(l.id, { visible: !l.visible }))}>
                    <Icon name={l.visible ? "eye" : "eyeoff"} />
                  </button>
                  <button title={l.locked ? "Unlock" : "Lock"} onClick={(e) => (e.stopPropagation(), patch(l.id, { locked: !l.locked }))}>
                    <Icon name={l.locked ? "lock" : "unlock"} />
                  </button>
                  <span className="ellipsis" title={l.name}>
                    {l.name}
                  </span>
                  <span className="role">{l.group ? "group" : l.role === "face" ? "you" : ""}</span>
                </div>
              ))}
            </div>
            {selected ? (
              <div className="row" style={{ gap: 2, padding: 6, borderTop: "1px solid var(--border)" }}>
                <Button size="small" icon="up" title="Bring forward (Ctrl+])" onClick={() => commit(reorderLayer(doc, selected.id, 1))} />
                <Button size="small" icon="down" title="Send backward (Ctrl+[)" onClick={() => commit(reorderLayer(doc, selected.id, -1))} />
                <Button
                  size="small"
                  icon="copy"
                  title="Duplicate (Ctrl+D)"
                  onClick={() => {
                    const r = duplicateLayer(doc, selected.id);
                    commit(r.doc);
                    setSel(r.newId);
                  }}
                />
                <Button size="small" icon="trash" title="Delete (Del)" onClick={() => (commit(removeLayer(doc, selected.id)), setSel(null))} />
                {selected.group ? (
                  <Button size="small" variant="flat" title="Let this layer move on its own" onClick={() => patch(selected.id, { group: null })}>
                    Ungroup
                  </Button>
                ) : null}
              </div>
            ) : null}
            <p className="dim small" style={{ padding: "6px 8px" }}>
              Drop image files from Explorer onto the window to add them.
            </p>
          </div>
        </section>

        <Splitter label="Resize the layers panel" value={leftW} min={180} max={420} onChange={setLeftW} onDone={saveLeftW} />

        <div className="stagewrap" ref={wrapRef}>
          <div className="stage" style={{ width: THUMB_W * scale, height: THUMB_H * scale }}>
            <svg
              ref={svgRef}
              width={THUMB_W * scale}
              height={THUMB_H * scale}
              viewBox={`0 0 ${THUMB_W} ${THUMB_H}`}
              xmlns="http://www.w3.org/2000/svg"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onDoubleClick={() => selected?.type === "text" && textRef.current?.focus()}
              role="application"
              aria-label="Thumbnail canvas"
            >
              <defs dangerouslySetInnerHTML={{ __html: defs }} />
              <g data-layers="" dangerouslySetInnerHTML={{ __html: svgContent }} />
              {safe ? (
                <g pointerEvents="none">
                  <rect x={TIMESTAMP_ZONE.x} y={TIMESTAMP_ZONE.y} width={TIMESTAMP_ZONE.w} height={TIMESTAMP_ZONE.h} fill="rgba(0,0,0,.45)" stroke="#ffffff" strokeOpacity={0.5} strokeDasharray="6 5" strokeWidth={1.5 / scale} />
                  <text x={TIMESTAMP_ZONE.x + TIMESTAMP_ZONE.w / 2} y={TIMESTAMP_ZONE.y + TIMESTAMP_ZONE.h / 2 + 7} fill="#ffffff" fillOpacity={0.7} fontSize={20} textAnchor="middle" fontFamily="Inter, sans-serif">
                    video length
                  </text>
                  <rect x={SAFE_MARGIN} y={SAFE_MARGIN} width={THUMB_W - SAFE_MARGIN * 2} height={THUMB_H - SAFE_MARGIN * 2} fill="none" stroke="#ffffff" strokeOpacity={0.22} strokeDasharray="10 8" strokeWidth={1 / scale} />
                </g>
              ) : null}
              {issueOverlay}
              {guides.x !== null ? <line x1={guides.x} y1={0} x2={guides.x} y2={THUMB_H} stroke="var(--accent)" strokeWidth={1 / scale} pointerEvents="none" /> : null}
              {guides.y !== null ? <line x1={0} y1={guides.y} x2={THUMB_W} y2={guides.y} stroke="var(--accent)" strokeWidth={1 / scale} pointerEvents="none" /> : null}
              {selectionOverlay}
            </svg>
          </div>
        </div>

        <Splitter label="Resize the properties panel" side="right" value={rightW} min={260} max={520} onChange={setRightW} onDone={saveRightW} />

        <section className="win props">
          <div className="titlebar">
            <Icon name="settings" /> {selected ? selected.name : "Properties"}
          </div>
          <div className="content" style={{ overflow: "auto" }}>
            <div className="groupbox">
              <legend>
                Checks {issues.length ? `(${errors ? `${errors} to fix, ` : ""}${issues.length - errors} to look at)` : ""}
              </legend>
              {issues.length ? (
                <div className="issues">
                  {issues.map((i, k) => (
                    <button key={k} className={`issue-row ${i.level}`} onClick={() => setSel(i.layerIds[0] ?? null)}>
                      <i />
                      <span>{i.message}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="small dim">Nothing overlaps, everything is inside the frame and readable on a phone.</p>
              )}
            </div>
            {selected ? (
              <Properties
                layer={selected}
                patch={patch}
                textRef={textRef}
                onAlign={(how) => commit(alignLayers(doc, selected.id, how, SAFE_MARGIN))}
                onReplaceImage={async () => {
                  const path = await platform.dialogs.openFile("Replace image", [{ name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "webp", "bmp"] }]);
                  if (!path || selected.type !== "image") return;
                  const b64 = await platform.files.readBinary(path);
                  const src = `data:${mimeForPath(path)};base64,${b64}`;
                  const size = await imageSize(src);
                  patch(selected.id, { src, naturalW: size.w, naturalH: size.h, crop: { x: 0, y: 0, w: 1, h: 1 }, alphaBox: null, h: Math.round(selected.w * (size.h / size.w)) } as Partial<ImageLayer>);
                }}
              />
            ) : (
              <p className="dim small">Click a layer on the canvas or in the list. Grouped layers (like the error box) move together. Alt-drag moves without snapping; Shift keeps proportions and snaps rotation to 15°.</p>
            )}
            <div className="groupbox">
              <legend>Real sizes</legend>
              <div className="mini-previews">
                {[
                  { w: 168, label: "Phone search / Up next" },
                  { w: 246, label: "Phone feed (small)" },
                ].map((s) => (
                  <figure key={s.w}>
                    <div style={{ position: "relative", width: s.w, height: (s.w * 9) / 16, borderRadius: 6, overflow: "hidden" }} dangerouslySetInnerHTML={{ __html: docToSvg(doc, { width: s.w, height: (s.w * 9) / 16 }) }} />
                    <figcaption>{s.label}</figcaption>
                  </figure>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>

      {ytDlg ? <YouTubePreview doc={doc} title={props.videoTitle || doc.name} onClose={() => setYtDlg(false)} /> : null}

      {exportDlg ? (
        <Dialog title="Export thumbnail" icon="export" onClose={() => setExportDlg(false)} actions={<Button onClick={() => setExportDlg(false)}>Done</Button>}>
          <div className="stack">
            {errors ? <Note kind="err">{errors} problem{errors === 1 ? "" : "s"} still marked (see Checks). You can export anyway.</Note> : null}
            <div className="row nowrap">
              <Button variant="primary" disabled={busy} onClick={() => void exportFile("png")}>
                PNG
              </Button>
              <span className="small">1280×720 image to upload to YouTube.</span>
            </div>
            <div className="row nowrap">
              <Button disabled={busy} onClick={() => void exportFile("psd")}>
                PSD (layers)
              </Button>
              <span className="small">Opens in Affinity Photo, Photoshop, GIMP and Krita with every layer separate and named. Text arrives as pixels; keep the .cthumb to change the wording later.</span>
            </div>
            <div className="row nowrap">
              <Button disabled={busy} onClick={() => void exportFile("svg")}>
                SVG
              </Button>
              <span className="small">Vector with live text and its fonts embedded, for Inkscape, Affinity Designer or a browser.</span>
            </div>
            <div className="row nowrap">
              <Button disabled={busy} onClick={() => void exportFile("ora")}>
                OpenRaster
              </Button>
              <span className="small">Layers for Krita, GIMP and MyPaint.</span>
            </div>
            <div className="row nowrap">
              <Button disabled={busy} onClick={() => void exportFile("cthumb")}>
                .cthumb
              </Button>
              <span className="small">The fully editable file, to reopen here on any PC.</span>
            </div>
          </div>
        </Dialog>
      ) : null}
    </div>
  );

  async function confirmLeave(): Promise<boolean> {
    return confirm({ title: "Unsaved changes", message: "Close the editor without saving your latest changes?", confirm: "Close without saving", danger: true });
  }
}

/** The thumbnail where people will see it: YouTube's home feed (dark and light) and the Up next list. */
function YouTubePreview({ doc, title, onClose }: { doc: ThumbnailDoc; title: string; onClose: () => void }) {
  const svg = docToSvg(doc);
  const yours = (w?: number) => (
    <div className="yt-card" style={w ? { width: w } : undefined}>
      <div className="yt-img">
        <div dangerouslySetInnerHTML={{ __html: svg }} />
        <span className="dur">14:07</span>
      </div>
      <div className="yt-meta">
        <span className="yt-avatar" />
        <div>
          <div className="yt-title">{title}</div>
          <div className="yt-sub">Tamster · 1 day ago</div>
        </div>
      </div>
    </div>
  );
  const other = (k: number) => (
    <div key={k} className="yt-card other">
      <div className="yt-img" />
      <div className="yt-meta">
        <span className="yt-avatar" />
        <div className="stack tight">
          <div className="yt-title">placeholder video title</div>
          <div className="yt-sub">channel</div>
        </div>
      </div>
    </div>
  );
  return (
    <Dialog title="Preview on YouTube" icon="play" wide onClose={onClose} actions={<Button onClick={onClose}>Close</Button>}>
      <div className="yt-previews">
        <span className="label">Home feed, dark (cards are about this size at 1440p)</span>
        <div className="yt-feed">
          {other(1)}
          {yours()}
          {other(2)}
        </div>
        <span className="label">Home feed, light</span>
        <div className="yt-feed light">
          {other(3)}
          {other(4)}
          {yours()}
        </div>
        <span className="label">Up next / phone search (168 px wide)</span>
        <div className="yt-list">
          <div className="yt-img">
            <div dangerouslySetInnerHTML={{ __html: svg }} />
          </div>
          <div className="yt-card">
            <div className="yt-title">{title}</div>
            <div className="yt-sub">Tamster</div>
          </div>
        </div>
        <p className="dim small">Grey cards stand in for other videos; nothing here is fetched from YouTube.</p>
      </div>
    </Dialog>
  );
}

function Properties(p: { layer: Layer; patch: (id: string, p: Partial<Layer>, key?: string) => void; textRef: RefObject<HTMLTextAreaElement | null>; onReplaceImage: () => Promise<void>; onAlign: (how: Align) => void }) {
  const l = p.layer;
  const set = (patch: Partial<Layer>, key?: string) => p.patch(l.id, patch, key);
  return (
    <div className="stack">
      {l.type !== "background" ? (
        <div className="align-row" role="group" aria-label="Align to the thumbnail">
          <Button size="small" icon="alignL" title="Align left (inside the safe margin)" onClick={() => p.onAlign("left")} />
          <Button size="small" icon="alignC" title="Centre horizontally" onClick={() => p.onAlign("center")} />
          <Button size="small" icon="alignR" title="Align right" onClick={() => p.onAlign("right")} />
          <Button size="small" icon="alignT" title="Align top" onClick={() => p.onAlign("top")} />
          <Button size="small" icon="alignM" title="Centre vertically" onClick={() => p.onAlign("middle")} />
          <Button size="small" icon="alignB" title="Align bottom" onClick={() => p.onAlign("bottom")} />
        </div>
      ) : null}

      {l.type === "text" ? (
        <>
          <label className="field">
            <span className="label">Text (Enter for a new line)</span>
            <textarea ref={p.textRef} className="textarea" rows={3} value={l.text} onChange={(e) => set({ text: e.target.value } as Partial<TextLayer>, `${l.id}:text`)} />
          </label>
          <label className="field">
            <span className="label">Font</span>
            <Select value={l.fontFamily} options={FONTS} onChange={(v) => set({ fontFamily: v, fontWeight: FONT_METRICS[v]?.weight ?? l.fontWeight } as Partial<TextLayer>)} />
          </label>
          <div className="grid cols-2">
            <NumberField label="Size" value={l.fontSize} min={8} onChange={(v) => set({ fontSize: Math.max(8, v) } as Partial<TextLayer>)} />
            <NumberField label="Line height" value={l.lineHeight} step={0.05} onChange={(v) => set({ lineHeight: Math.max(0.6, v) } as Partial<TextLayer>)} />
            <NumberField label="Letter spacing" value={l.letterSpacing} onChange={(v) => set({ letterSpacing: v } as Partial<TextLayer>)} />
            <NumberField label="Rotation" value={l.rotation} onChange={(v) => set({ rotation: v })} />
          </div>
          <div className="row">
            <Check checked={l.uppercase} onChange={(v) => set({ uppercase: v } as Partial<TextLayer>)}>
              CAPS
            </Check>
            <Check checked={l.italic} onChange={(v) => set({ italic: v } as Partial<TextLayer>)}>
              Italic
            </Check>
          </div>
          <Segmented
            value={l.align}
            options={[
              { id: "start", label: "Left" },
              { id: "middle", label: "Centre" },
              { id: "end", label: "Right" },
            ]}
            onChange={(v) => v && set({ align: v } as Partial<TextLayer>)}
            label="Alignment"
          />
          <ColorField label="Colour" value={l.color} onChange={(v) => set({ color: v } as Partial<TextLayer>, `${l.id}:color`)} />
          <Check checked={!!l.fill2} onChange={(v) => set({ fill2: v ? "#ff9b1a" : null } as Partial<TextLayer>)}>
            Gradient (top to bottom)
          </Check>
          {l.fill2 ? <ColorField label="Bottom colour" value={l.fill2} onChange={(v) => set({ fill2: v } as Partial<TextLayer>, `${l.id}:fill2`)} /> : null}
          {!l.text.includes("\n") ? <Slider label="Bend" value={l.arch ?? 0} min={-60} max={60} onChange={(v) => set({ arch: v } as Partial<TextLayer>, `${l.id}:arch`)} format={(v) => `${Math.round(v)}°`} /> : null}
        </>
      ) : null}

      {l.type === "shape" ? (
        <>
          <label className="field">
            <span className="label">Shape</span>
            <Select value={l.shape} options={SHAPES} onChange={(v) => set({ shape: v } as Partial<ShapeLayer>)} />
          </label>
          <ColorField label="Fill ('none' for outline only)" value={l.fill} onChange={(v) => set({ fill: v } as Partial<ShapeLayer>, `${l.id}:fill`)} />
          {l.shape === "curved-arrow" || l.shape === "arrow" ? (
            <Check checked={!!l.mirror} onChange={(v) => set({ mirror: v } as Partial<ShapeLayer>)}>
              Point the other way
            </Check>
          ) : null}
          {l.shape === "rect" ? <Slider label="Corner radius" value={l.radius} min={0} max={Math.min(l.w, l.h) / 2} onChange={(v) => set({ radius: v } as Partial<ShapeLayer>)} /> : null}
          <NumberField label="Rotation" value={l.rotation} onChange={(v) => set({ rotation: v })} />
        </>
      ) : null}

      {l.type === "background" ? (
        <>
          <Segmented
            value={l.fill.kind}
            options={[
              { id: "solid", label: "Solid" },
              { id: "linear", label: "Linear" },
              { id: "radial", label: "Radial" },
            ]}
            onChange={(v) => v && set({ fill: { ...l.fill, kind: v } } as Partial<BackgroundLayer>)}
            label="Fill type"
          />
          <ColorField label="Colour 1" value={l.fill.colors[0]} onChange={(v) => set({ fill: { ...l.fill, colors: [v, l.fill.colors[1]] } } as Partial<BackgroundLayer>, `${l.id}:c1`)} />
          {l.fill.kind !== "solid" ? <ColorField label="Colour 2" value={l.fill.colors[1]} onChange={(v) => set({ fill: { ...l.fill, colors: [l.fill.colors[0], v] } } as Partial<BackgroundLayer>, `${l.id}:c2`)} /> : null}
          {l.fill.kind === "linear" ? <Slider label="Angle" value={l.fill.angle} min={0} max={360} onChange={(v) => set({ fill: { ...l.fill, angle: v } } as Partial<BackgroundLayer>)} /> : null}
        </>
      ) : null}

      {l.type === "image" ? (
        <>
          <div className="row">
            <Button size="small" onClick={() => void p.onReplaceImage()}>
              Replace image…
            </Button>
            <Check checked={l.flipX} onChange={(v) => set({ flipX: v } as Partial<ImageLayer>)}>
              Mirror
            </Check>
          </div>
          <div className="groupbox">
            <legend>Look</legend>
            <Slider label="Brightness" value={(l.adjust?.brightness ?? 1) * 100} min={40} max={160} onChange={(v) => set({ adjust: { brightness: v / 100, saturate: l.adjust?.saturate ?? 1 } } as Partial<ImageLayer>, `${l.id}:bright`)} format={(v) => `${Math.round(v)}%`} />
            <Slider label="Colour" value={(l.adjust?.saturate ?? 1) * 100} min={0} max={200} onChange={(v) => set({ adjust: { brightness: l.adjust?.brightness ?? 1, saturate: v / 100 } } as Partial<ImageLayer>, `${l.id}:sat`)} format={(v) => `${Math.round(v)}%`} />
            <Check checked={!!l.outline} onChange={(v) => set({ outline: v ? { color: "#ffffff", width: 7 } : null } as Partial<ImageLayer>)}>
              Sticker outline (follows the cut-out)
            </Check>
            {l.outline ? (
              <>
                <ColorField label="Outline colour" value={l.outline.color} onChange={(v) => set({ outline: { ...(l.outline ?? { width: 7 }), color: v } } as Partial<ImageLayer>, `${l.id}:olc`)} />
                <Slider label="Outline width" value={l.outline.width} min={1} max={24} onChange={(v) => set({ outline: { ...(l.outline ?? { color: "#fff" }), width: v } } as Partial<ImageLayer>, `${l.id}:olw`)} />
              </>
            ) : null}
          </div>
          <div className="groupbox">
            <legend>Crop</legend>
            <Slider label="Left" value={l.crop.x * 100} min={0} max={95} onChange={(v) => set({ crop: { ...l.crop, x: v / 100, w: Math.min(l.crop.w, 1 - v / 100) } } as Partial<ImageLayer>, `${l.id}:crop`)} format={(v) => `${Math.round(v)}%`} />
            <Slider label="Top" value={l.crop.y * 100} min={0} max={95} onChange={(v) => set({ crop: { ...l.crop, y: v / 100, h: Math.min(l.crop.h, 1 - v / 100) } } as Partial<ImageLayer>, `${l.id}:crop`)} format={(v) => `${Math.round(v)}%`} />
            <Slider label="Width" value={l.crop.w * 100} min={5} max={(1 - l.crop.x) * 100} onChange={(v) => set({ crop: { ...l.crop, w: v / 100 }, h: Math.round(l.w * ((l.crop.h * l.naturalH) / ((v / 100) * l.naturalW))) } as Partial<ImageLayer>, `${l.id}:crop`)} format={(v) => `${Math.round(v)}%`} />
            <Slider label="Height" value={l.crop.h * 100} min={5} max={(1 - l.crop.y) * 100} onChange={(v) => set({ crop: { ...l.crop, h: v / 100 }, h: Math.round(l.w * (((v / 100) * l.naturalH) / (l.crop.w * l.naturalW))) } as Partial<ImageLayer>, `${l.id}:crop`)} format={(v) => `${Math.round(v)}%`} />
            <Button size="small" variant="flat" onClick={() => set({ crop: { x: 0, y: 0, w: 1, h: 1 }, h: Math.round(l.w * (l.naturalH / l.naturalW)) } as Partial<ImageLayer>)}>
              Reset crop
            </Button>
          </div>
        </>
      ) : null}

      {l.type !== "background" ? (
        <>
          <Slider label="Opacity" value={l.opacity * 100} min={0} max={100} onChange={(v) => set({ opacity: v / 100 }, `${l.id}:op`)} format={(v) => `${Math.round(v)}%`} />
          {l.type !== "image" ? (
            <div className="groupbox">
              <legend>Outline</legend>
              <Check checked={!!l.stroke} onChange={(v) => set({ stroke: v ? { color: "#000000", width: l.type === "text" ? Math.round(l.fontSize * 0.09) : 6 } : null })}>
                On
              </Check>
              {l.stroke ? (
                <>
                  <ColorField label="Colour" value={l.stroke.color} onChange={(v) => set({ stroke: { ...(l.stroke ?? { width: 6 }), color: v } }, `${l.id}:stroke`)} />
                  <Slider label="Thickness" value={l.stroke.width} min={0} max={40} onChange={(v) => set({ stroke: { ...(l.stroke ?? { color: "#000" }), width: v } }, `${l.id}:strokew`)} />
                </>
              ) : null}
            </div>
          ) : null}
          <div className="groupbox">
            <legend>Shadow</legend>
            <Check checked={!!l.shadow} onChange={(v) => set({ shadow: v ? { color: "#000000", blur: 16, dx: 0, dy: 8, opacity: 0.6 } : null })}>
              On
            </Check>
            {l.shadow ? (
              <>
                <Slider label="Blur" value={l.shadow.blur} min={0} max={80} onChange={(v) => set({ shadow: { ...l.shadow!, blur: v } }, `${l.id}:shb`)} />
                <Slider label="Drop" value={l.shadow.dy} min={-40} max={40} onChange={(v) => set({ shadow: { ...l.shadow!, dy: v } }, `${l.id}:shy`)} />
                <Slider label="Strength" value={l.shadow.opacity * 100} min={0} max={100} onChange={(v) => set({ shadow: { ...l.shadow!, opacity: v / 100 } }, `${l.id}:sho`)} format={(v) => `${Math.round(v)}%`} />
              </>
            ) : null}
          </div>
          <div className="grid cols-2">
            <NumberField label="X" value={l.x} onChange={(v) => set({ x: v })} />
            <NumberField label="Y" value={l.y} onChange={(v) => set({ y: v })} />
            {l.type !== "text" ? (
              <>
                <NumberField label="Width" value={l.w} min={8} onChange={(v) => set({ w: Math.max(8, v) })} />
                <NumberField label="Height" value={l.h} min={8} onChange={(v) => set({ h: Math.max(8, v) })} />
              </>
            ) : null}
          </div>
          <label className="field">
            <span className="label">This layer is…</span>
            <Select<LayerRole | ""> value={l.role ?? ""} options={ROLES} onChange={(v) => set({ role: v || undefined })} />
          </label>
        </>
      ) : null}
      <label className="field">
        <span className="label">Layer name</span>
        <input className="input" value={l.name} onChange={(e) => set({ name: e.target.value }, `${l.id}:name`)} />
      </label>
    </div>
  );
}
