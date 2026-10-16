// The native, editable thumbnail format (.cthumb). One JSON document with
// layers from bottom to top. The same renderer draws the editor canvas and
// the SVG export, so what you edit is exactly what you export.

export const THUMB_W = 1280;
export const THUMB_H = 720;
export const THUMB_FORMAT = "creator-exe.thumbnail";
export const THUMB_VERSION = 1;

export interface Shadow {
  color: string;
  blur: number;
  dx: number;
  dy: number;
  opacity: number;
}

export interface Stroke {
  color: string;
  width: number;
}

interface LayerBase {
  id: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  opacity: number;
  visible: boolean;
  locked: boolean;
  shadow: Shadow | null;
  stroke: Stroke | null;
  /** Optional group label; layers sharing it move together in the editor. */
  group: string | null;
}

export interface BackgroundLayer extends LayerBase {
  type: "background";
  fill: { kind: "solid" | "linear" | "radial"; colors: [string, string]; angle: number };
}

export interface ShapeLayer extends LayerBase {
  type: "shape";
  shape: "rect" | "ellipse" | "triangle" | "arrow" | "star";
  fill: string;
  radius: number;
}

export interface TextLayer extends LayerBase {
  type: "text";
  text: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  italic: boolean;
  color: string;
  align: "start" | "middle" | "end";
  lineHeight: number;
  letterSpacing: number;
  uppercase: boolean;
}

export interface ImageLayer extends LayerBase {
  type: "image";
  /** data: URL so the document is self-contained and portable. */
  src: string;
  /** Crop rectangle in source-image fractions (0..1). */
  crop: { x: number; y: number; w: number; h: number };
  /** Natural pixel size of the source image. */
  naturalW: number;
  naturalH: number;
  flipX: boolean;
}

export type Layer = BackgroundLayer | ShapeLayer | TextLayer | ImageLayer;

export interface ThumbnailDoc {
  format: typeof THUMB_FORMAT;
  version: number;
  width: number;
  height: number;
  name: string;
  layers: Layer[];
  meta: { concept?: string; createdWith: string };
}

let counter = 0;
export function layerId(): string {
  counter = (counter + 1) % 1_000_000;
  return `L${Date.now().toString(36)}${counter.toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
}

const base = (name: string, x: number, y: number, w: number, h: number): LayerBase => ({
  id: layerId(),
  name,
  x,
  y,
  w,
  h,
  rotation: 0,
  opacity: 1,
  visible: true,
  locked: false,
  shadow: null,
  stroke: null,
  group: null,
});

export function newBackground(colors: [string, string] = ["#1b2333", "#0f1626"], kind: BackgroundLayer["fill"]["kind"] = "linear"): BackgroundLayer {
  return { ...base("Background", 0, 0, THUMB_W, THUMB_H), type: "background", locked: true, fill: { kind, colors, angle: 135 } };
}

export function newShape(shape: ShapeLayer["shape"] = "rect", fill = "#e8c547"): ShapeLayer {
  return { ...base(shape[0]!.toUpperCase() + shape.slice(1), 440, 210, 400, 300), type: "shape", shape, fill, radius: 0 };
}

export function newText(text = "YOUR TEXT", fontSize = 120): TextLayer {
  return {
    ...base("Text", 80, 80, 800, fontSize * 1.15),
    type: "text",
    text,
    fontFamily: "Impact",
    fontSize,
    fontWeight: 400,
    italic: false,
    color: "#ffffff",
    align: "start",
    lineHeight: 1.05,
    letterSpacing: 0,
    uppercase: false,
    stroke: { color: "#000000", width: 10 },
    shadow: { color: "#000000", blur: 12, dx: 0, dy: 6, opacity: 0.6 },
  };
}

export function newImage(src: string, naturalW: number, naturalH: number, name = "Image"): ImageLayer {
  // Fit inside the canvas, preserving aspect ratio.
  const scale = Math.min(THUMB_W / naturalW, THUMB_H / naturalH, 1);
  const w = Math.max(20, Math.round(naturalW * scale));
  const h = Math.max(20, Math.round(naturalH * scale));
  return {
    ...base(name, Math.round((THUMB_W - w) / 2), Math.round((THUMB_H - h) / 2), w, h),
    type: "image",
    src,
    crop: { x: 0, y: 0, w: 1, h: 1 },
    naturalW,
    naturalH,
    flipX: false,
  };
}

export function newDoc(name = "Untitled thumbnail", layers: Layer[] = [newBackground()]): ThumbnailDoc {
  return { format: THUMB_FORMAT, version: THUMB_VERSION, width: THUMB_W, height: THUMB_H, name, layers, meta: { createdWith: "CREATOR.EXE" } };
}

const isNum = (v: unknown) => typeof v === "number" && Number.isFinite(v);

/** Validates an untrusted document (from disk or the database). */
export function parseDoc(text: string): ThumbnailDoc {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("This thumbnail file is not valid JSON.");
  }
  const d = raw as Partial<ThumbnailDoc>;
  if (!d || d.format !== THUMB_FORMAT) throw new Error("This is not a CREATOR.EXE thumbnail file.");
  if (!isNum(d.version) || (d.version as number) > THUMB_VERSION) throw new Error("This thumbnail was made by a newer version of CREATOR.EXE.");
  if (!Array.isArray(d.layers)) throw new Error("The thumbnail has no layers.");
  const layers: Layer[] = [];
  for (const l of d.layers as Partial<Layer>[]) {
    if (!l || typeof l !== "object" || typeof l.id !== "string") throw new Error("A layer is malformed.");
    if (!["background", "shape", "text", "image"].includes(String(l.type))) throw new Error(`Unknown layer type "${String(l.type)}".`);
    for (const k of ["x", "y", "w", "h", "rotation", "opacity"] as const) if (!isNum(l[k])) throw new Error(`Layer "${l.name ?? l.id}" has an invalid ${k}.`);
    if (l.type === "image" && (typeof (l as ImageLayer).src !== "string" || !(l as ImageLayer).src.startsWith("data:image/"))) {
      throw new Error(`Image layer "${l.name ?? l.id}" must embed its image data.`);
    }
    layers.push({ group: null, shadow: null, stroke: null, visible: true, locked: false, ...l } as Layer);
  }
  return {
    format: THUMB_FORMAT,
    version: THUMB_VERSION,
    width: THUMB_W,
    height: THUMB_H,
    name: typeof d.name === "string" ? d.name : "Untitled thumbnail",
    layers,
    meta: { createdWith: "CREATOR.EXE", ...(d.meta ?? {}) },
  };
}

export function serializeDoc(doc: ThumbnailDoc): string {
  return JSON.stringify(doc);
}

// ------------------------------------------------------------ editing operations (pure)

export function updateLayer(doc: ThumbnailDoc, id: string, patch: Partial<Layer>): ThumbnailDoc {
  return { ...doc, layers: doc.layers.map((l) => (l.id === id ? ({ ...l, ...patch } as Layer) : l)) };
}

export function addLayer(doc: ThumbnailDoc, layer: Layer, aboveId?: string | null): ThumbnailDoc {
  const layers = [...doc.layers];
  const idx = aboveId ? layers.findIndex((l) => l.id === aboveId) : -1;
  if (idx >= 0) layers.splice(idx + 1, 0, layer);
  else layers.push(layer);
  return { ...doc, layers };
}

export function removeLayer(doc: ThumbnailDoc, id: string): ThumbnailDoc {
  return { ...doc, layers: doc.layers.filter((l) => l.id !== id) };
}

export function duplicateLayer(doc: ThumbnailDoc, id: string): { doc: ThumbnailDoc; newId: string | null } {
  const src = doc.layers.find((l) => l.id === id);
  if (!src) return { doc, newId: null };
  const copy = { ...structuredClone(src), id: layerId(), name: `${src.name} copy`, x: src.x + 20, y: src.y + 20, locked: false } as Layer;
  return { doc: addLayer(doc, copy, id), newId: copy.id };
}

/** Moves a layer up (+1, toward the front) or down (-1). Use +Infinity / -Infinity for front/back. */
export function reorderLayer(doc: ThumbnailDoc, id: string, delta: number): ThumbnailDoc {
  const layers = [...doc.layers];
  const i = layers.findIndex((l) => l.id === id);
  if (i < 0) return doc;
  const [l] = layers.splice(i, 1);
  if (!l) return doc;
  const target = delta === Infinity ? layers.length : delta === -Infinity ? 0 : Math.max(0, Math.min(layers.length, i + delta));
  layers.splice(target, 0, l);
  return { ...doc, layers };
}

/** Rebuilds a document with a different text in every text layer (for title pairing). */
export function withPrimaryText(doc: ThumbnailDoc, text: string): ThumbnailDoc {
  const first = doc.layers.find((l) => l.type === "text");
  if (!first) return doc;
  return updateLayer(doc, first.id, { text } as Partial<TextLayer>);
}
