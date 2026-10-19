// Thumbnail concepts built from your own images and words, in the styles of
// your real thumbnails (styles.ts). Every concept is ordinary editable layers,
// text is measured with the bundled fonts so it always fits, and anything that
// fails the quality checks (quality.ts) is dropped instead of shown.
//
// No AI artwork: backgrounds are your screenshots (or store screenshots you
// chose), faces are your own photos cut out on your PC.

import { THUMB_H, THUMB_W, layerId, newBackground, newDoc, newShape, newText, type ImageLayer, type Layer, type ShapeLayer, type TextLayer, type ThumbnailDoc } from "./model.ts";
import { FONT_METRICS } from "./fontMetrics.ts";
import { measureWithMetrics } from "./render.ts";
import { SAFE_MARGIN, TIMESTAMP_ZONE, checkDoc, hasErrors, intersect, area, visibleBox, type Box, type QualityIssue } from "./quality.ts";
import { STYLE_BY_ID, THUMB_STYLES, type StyleId, type ThumbStyle } from "./styles.ts";

export interface ThumbImage {
  /** data: URL */
  src: string;
  w: number;
  h: number;
  name?: string;
}

export interface Cutout extends ThumbImage {
  /** Visible pixels as fractions of the image (from the cutout's alpha channel). */
  alphaBox: { x: number; y: number; w: number; h: number };
}

export interface ComposeInput {
  /** The main words (two to five is best). */
  headline: string;
  /** Lines for a rules list ("No guides", "No markers"...). Only used if you give them. */
  lines?: string[];
  /** One word for the big-word style; defaults to the headline when it is one or two words. */
  bigWord?: string;
  /** Labels for a split screen (left, right). Only used if you give them. */
  splitLabels?: [string, string];
  /** Program name for the system-message style, e.g. "Morrowind.exe". */
  errorTitle?: string;
  errorMessage?: string;
  backgrounds: ThumbImage[];
  cutouts: Cutout[];
  /** "Inspired by this": a style and colours taken from one of your thumbnails. */
  reference?: { styleId: StyleId; palette?: string[]; faceSide?: "left" | "right" } | null;
  /** Include the experimental styles. */
  experimental?: boolean;
  /** How many concepts to return (at least three when the inputs allow). */
  count?: number;
  seed?: number;
}

export interface Concept {
  id: string;
  style: ThumbStyle;
  doc: ThumbnailDoc;
  issues: QualityIssue[];
  /** One line on why, pointing at your own uploads. */
  why: string;
}

export interface ComposeResult {
  concepts: Concept[];
  /** What's missing or what was dropped, in plain words. */
  notes: string[];
}

const W = THUMB_W;
const H = THUMB_H;
const M = SAFE_MARGIN + 8;

// ------------------------------------------------------------ text fitting

export interface FitOptions {
  family: string;
  maxW: number;
  maxH: number;
  maxLines: number;
  minSize?: number;
  maxSize?: number;
  lineHeight?: number;
  uppercase?: boolean;
  /** Outline width as a fraction of the font size. */
  strokeRatio?: number;
}

/** Best line breaks and font size for `text` inside a box. Null when it can't fit at the minimum size. */
export function fitText(text: string, o: FitOptions): { lines: string[]; size: number } | null {
  const words = (o.uppercase ? text.toUpperCase() : text).trim().split(/\s+/).filter(Boolean);
  if (!words.length) return null;
  const lh = o.lineHeight ?? 1.0;
  const sr = o.strokeRatio ?? 0;
  const minSize = o.minSize ?? 48;
  const maxSize = o.maxSize ?? 220;
  let best: { lines: string[]; size: number } | null = null;
  for (let k = 1; k <= Math.min(o.maxLines, words.length); k++) {
    const lines = balancedBreak(words, k, o.family);
    const widest = Math.max(...lines.map((l) => measureWithMetrics(l, o.family, 1)));
    const size = Math.min(maxSize, o.maxW / (widest + 2 * sr), o.maxH / (k * lh + 2 * sr));
    // Prefer fewer lines unless more lines makes the text clearly bigger.
    if (!best || size > best.size * 1.12) best = { lines, size: Math.floor(size) };
  }
  if (!best || best.size < minSize) return null;
  return best;
}

/** Splits words into k lines with the smallest widest line. */
function balancedBreak(words: string[], k: number, family: string): string[] {
  if (k <= 1) return [words.join(" ")];
  let best: string[] = [];
  let bestW = Infinity;
  const n = words.length;
  // Few words: try every split.
  const rec = (start: number, left: number, acc: string[]) => {
    if (left === 1) {
      const lines = [...acc, words.slice(start).join(" ")];
      const w = Math.max(...lines.map((l) => measureWithMetrics(l, family, 1)));
      if (w < bestW) {
        bestW = w;
        best = lines;
      }
      return;
    }
    for (let i = start + 1; i <= n - left + 1; i++) rec(i, left - 1, [...acc, words.slice(start, i).join(" ")]);
  };
  rec(0, k, []);
  return best;
}

function caption(_text: string, fit: { lines: string[]; size: number }, x: number, y: number, o: { family: string; color?: string; align?: TextLayer["align"]; strokeRatio?: number; lineHeight?: number; uppercase?: boolean; role?: Layer["role"]; name?: string; shadow?: boolean; boxW?: number }): TextLayer {
  const t = newText(fit.lines.join("\n"), fit.size);
  const sw = Math.max(4, Math.round(fit.size * (o.strokeRatio ?? 0.09)));
  const lh = o.lineHeight ?? 1.0;
  const widest = Math.max(...fit.lines.map((l) => measureWithMetrics(l, o.family, fit.size)));
  const w = Math.ceil(o.boxW ?? widest + sw * 2);
  const h = Math.ceil(fit.size * lh * fit.lines.length + sw * 2);
  return {
    ...t,
    name: o.name ?? "Caption",
    role: o.role ?? "caption",
    fontFamily: o.family,
    fontWeight: FONT_METRICS[o.family]?.weight ?? 400,
    color: o.color ?? "#ffffff",
    align: o.align ?? "start",
    lineHeight: lh,
    uppercase: false,
    capBaseline: true,
    x: Math.round(o.align === "end" ? x - w : o.align === "middle" ? x - w / 2 : x),
    y: Math.round(y),
    w,
    h,
    stroke: { color: "#000000", width: sw },
    shadow: o.shadow === false ? null : { color: "#000000", blur: Math.round(fit.size * 0.12), dx: 0, dy: Math.round(fit.size * 0.05), opacity: 0.55 },
  };
}

// ------------------------------------------------------------ images

/** A screenshot covering the whole canvas, cropped (not stretched). */
function backdrop(img: ThumbImage, o: { brightness?: number; saturate?: number; box?: Box; name?: string } = {}): ImageLayer {
  const box = o.box ?? { x: 0, y: 0, w: W, h: H };
  const slot = box.w / box.h;
  const ratio = img.w / img.h;
  let crop = { x: 0, y: 0, w: 1, h: 1 };
  if (ratio > slot) crop = { x: (1 - slot / ratio) / 2, y: 0, w: slot / ratio, h: 1 };
  else if (ratio < slot) crop = { x: 0, y: (1 - ratio / slot) / 2, w: 1, h: ratio / slot };
  return {
    id: layerId(),
    name: o.name ?? "Screenshot",
    role: "backdrop",
    type: "image",
    src: img.src,
    naturalW: img.w,
    naturalH: img.h,
    crop,
    flipX: false,
    x: box.x,
    y: box.y,
    w: box.w,
    h: box.h,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    shadow: null,
    stroke: null,
    group: null,
    outline: null,
    adjust: { brightness: o.brightness ?? 0.92, saturate: o.saturate ?? 1.15 },
    alphaBox: null,
  };
}

/** Your cut-out face, scaled so the visible part is `heightFrac` of the canvas, anchored to the bottom and one side. */
function face(c: Cutout, side: "left" | "right", heightFrac: number, o: { inset?: number } = {}): ImageLayer {
  const ab = c.alphaBox;
  const visibleH = H * heightFrac;
  const s = visibleH / Math.max(1, ab.h * c.h);
  const w = c.w * s;
  const h = c.h * s;
  // Bottom of the visible pixels touches the bottom edge (a little bleed hides cut edges).
  const y = H + 6 - (ab.y + ab.h) * h;
  const inset = o.inset ?? 0;
  const x = side === "right" ? W + 4 - inset - (ab.x + ab.w) * w : -4 + inset - ab.x * w;
  return {
    id: layerId(),
    name: "Your face",
    role: "face",
    type: "image",
    src: c.src,
    naturalW: c.w,
    naturalH: c.h,
    crop: { x: 0, y: 0, w: 1, h: 1 },
    flipX: false,
    x: Math.round(x),
    y: Math.round(y),
    w: Math.round(w),
    h: Math.round(h),
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    shadow: { color: "#000000", blur: 24, dx: 0, dy: 8, opacity: 0.45 },
    stroke: null,
    group: null,
    outline: { color: "#ffffff", width: 7 },
    adjust: null,
    alphaBox: { ...ab },
  };
}

function arrow(x: number, y: number, w: number, h: number, mirror: boolean, color = "#e8202a"): ShapeLayer {
  return { ...newShape("curved-arrow", color), name: "Arrow", role: "accent", x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h), mirror, stroke: { color: "#000000", width: 7 }, shadow: null };
}

function doc(name: string, style: StyleId, layers: Layer[]): ThumbnailDoc {
  const d = newDoc(name, [newBackground(["#0b0b0b", "#0b0b0b"], "solid"), ...layers]);
  d.meta.concept = style;
  return d;
}

/** Free horizontal space beside the face, inside the safe margins. */
function textColumn(f: ImageLayer | null, side: "left" | "right"): { x: number; w: number } {
  if (!f) return { x: M, w: W - 2 * M };
  const v = visibleBox(f);
  const gap = 24;
  if (side === "right") return { x: M, w: Math.max(200, v.x - gap - M) };
  const x = v.x + v.w + gap;
  return { x, w: Math.max(200, W - M - x) };
}

// ------------------------------------------------------------ styles

type Builder = (input: ComposeInput, v: Variant) => ThumbnailDoc | null;

interface Variant {
  side: "left" | "right";
  bg: ThumbImage;
  bg2?: ThumbImage;
  cut: Cutout | null;
  accent: string;
  captionColor: string;
}

const sentence = (s: string) => s.trim().replace(/\s+/g, " ");
const titleCase = (s: string) => sentence(s).replace(/\b([a-z])/g, (m) => m.toUpperCase());

const BUILDERS: Record<StyleId, Builder> = {
  reaction: (input, v) => {
    if (!v.cut) return null;
    const f = face(v.cut, v.side, 0.92);
    const col = textColumn(f, v.side);
    const fit = fitText(input.headline, { family: "Lato", maxW: col.w, maxH: H * 0.46, maxLines: 3, uppercase: true, strokeRatio: 0.09, lineHeight: 1.02, maxSize: 150 });
    if (!fit) return null;
    const t = caption(fit.lines.join(" "), fit, v.side === "right" ? col.x : col.x + col.w, M, { family: "Lato", align: v.side === "right" ? "start" : "end", color: v.captionColor, lineHeight: 1.02 });
    return doc(input.headline, "reaction", [backdrop(v.bg), f, t]);
  },
  "reaction-arrow": (input, v) => {
    if (!v.cut) return null;
    const f = face(v.cut, v.side, 0.88);
    const col = textColumn(f, v.side);
    const fit = fitText(input.headline, { family: "Lato", maxW: col.w, maxH: H * 0.42, maxLines: 3, uppercase: true, strokeRatio: 0.09, lineHeight: 1.02, maxSize: 140 });
    if (!fit) return null;
    const t = caption(fit.lines.join(" "), fit, v.side === "right" ? col.x : col.x + col.w, M, { family: "Lato", align: v.side === "right" ? "start" : "end", color: v.captionColor, lineHeight: 1.02 });
    // The arrow goes in the open space under the caption, pointing into the game, away from your face.
    const top = t.y + t.h + 18;
    const aw = Math.min(330, col.w * 0.6);
    const ah = Math.min(260, H - top - 70);
    if (ah < 140) return null;
    const ax = v.side === "right" ? col.x + col.w * 0.15 : col.x + col.w - aw - col.w * 0.15;
    const a = arrow(ax, top, aw, ah, v.side === "left", v.accent);
    return doc(input.headline, "reaction-arrow", [backdrop(v.bg), f, t, a]);
  },
  rules: (input, v) => {
    const lines = (input.lines ?? []).map(sentence).filter(Boolean).slice(0, 5);
    if (lines.length < 3) return null;
    // Like your Pacifist thumbnail: the list is the picture, no face.
    const f = null;
    const col = textColumn(f, "right");
    const maxW = Math.min(col.w, W * 0.78);
    const n = lines.length;
    const lh = 1.04;
    let size = Math.floor(Math.min(130, (H - 2 * M) / (n * lh + 0.2)));
    for (const l of lines) size = Math.min(size, Math.floor(maxW / (measureWithMetrics(titleCase(l), "Lato", 1) + 0.18)));
    if (size < 52) return null;
    const fit = { lines: lines.map(titleCase), size };
    const t = caption("", fit, M, M, { family: "Lato", role: "list", name: "Rules", lineHeight: lh, color: v.captionColor });
    const layers: Layer[] = [backdrop(v.bg)];
    if (f) layers.push(f);
    layers.push(t);
    return doc(input.headline, "rules", layers);
  },
  "big-word": (input, v) => {
    const word = (input.bigWord ?? (input.headline.trim().split(/\s+/).length <= 2 ? input.headline : "")).trim();
    if (!word) return null;
    const f = v.cut ? face(v.cut, v.side, 0.9) : null;
    const col = textColumn(f, v.side);
    const fit = fitText(word, { family: "Anton", maxW: col.w, maxH: H * 0.42, maxLines: 1, uppercase: true, strokeRatio: 0.03, lineHeight: 1, maxSize: 320, minSize: 110 });
    if (!fit) return null;
    const t = caption(fit.lines[0] ?? word, fit, col.x + col.w / 2, H / 2 - (fit.size * 1.06) / 2, { family: "Anton", align: "middle", strokeRatio: 0.03, color: v.captionColor });
    t.shadow = { color: "#000000", blur: 40, dx: 0, dy: 10, opacity: 0.85 };
    const layers: Layer[] = [backdrop(v.bg, { brightness: 0.55, saturate: 0.9 })];
    if (f) layers.push(f);
    layers.push(t);
    return doc(word, "big-word", layers);
  },
  question: (input, v) => {
    if (!v.cut || !/\?\s*$/.test(input.headline)) return null;
    const f = face(v.cut, v.side, 0.9);
    const col = textColumn(f, v.side);
    const q = titleCase(input.headline).replace(/\?+$/, "?");
    const fit = fitText(q, { family: "Lato", maxW: col.w, maxH: H * 0.5, maxLines: 3, strokeRatio: 0.09, lineHeight: 1.04, maxSize: 140 });
    if (!fit) return null;
    const t = caption(fit.lines.join(" "), fit, v.side === "right" ? col.x : col.x + col.w, M + 10, { family: "Lato", align: v.side === "right" ? "start" : "end", lineHeight: 1.04, color: v.captionColor });
    return doc(q, "question", [backdrop(v.bg), f, t]);
  },
  error: (input, v) => {
    const title = (input.errorTitle ?? "").trim();
    if (!title) return null;
    const msg = (input.errorMessage ?? "has stopped working").trim();
    const f = v.cut ? face(v.cut, "right", 0.84) : null;
    const col = textColumn(f, "right");
    const dw = Math.min(820, col.w);
    const titleFit = fitText(title, { family: "Lato", maxW: dw - 60, maxH: 84, maxLines: 1, minSize: 40, maxSize: 76 });
    const msgFit = fitText(msg, { family: "Lato", maxW: dw - 60, maxH: 150, maxLines: 2, minSize: 36, maxSize: 70, lineHeight: 1.1 });
    if (!titleFit || !msgFit) return null;
    const group = `dialog-${layerId()}`;
    const barH = titleFit.size + 34;
    const bodyH = msgFit.size * 1.1 * msgFit.lines.length + 50;
    const btnH = 64;
    const dh = barH + bodyH + btnH + 28;
    const dx = col.x;
    const dy = Math.max(M, (H - dh) / 2 - 30);
    const plain = (l: TextLayer): TextLayer => ({ ...l, stroke: null, shadow: null, group, role: "dialog" });
    const win: ShapeLayer = { ...newShape("rect", "#f3f3f3"), name: "Dialog", role: "dialog", group, x: dx, y: dy, w: dw, h: dh, radius: 0, stroke: { color: "#1f1f1f", width: 2 }, shadow: { color: "#000000", blur: 30, dx: 0, dy: 12, opacity: 0.6 } };
    const bar: ShapeLayer = { ...newShape("rect", "#2b5797"), name: "Dialog title bar", role: "dialog", group, x: dx, y: dy, w: dw, h: barH, radius: 0, stroke: null, shadow: null };
    const tt = plain(caption("", titleFit, dx + 26, dy + (barH - titleFit.size) / 2, { family: "Lato", color: "#ffffff", strokeRatio: 0.0001, name: "Dialog title" }));
    const mt = plain(caption("", msgFit, dx + 26, dy + barH + 24, { family: "Lato", color: "#111111", lineHeight: 1.1, strokeRatio: 0.0001, name: "Dialog message" }));
    const btn: ShapeLayer = { ...newShape("rect", "#e1e1e1"), name: "Dialog button", role: "dialog", group, x: dx + dw - 26 - 200, y: dy + dh - btnH - 22, w: 200, h: btnH, radius: 0, stroke: { color: "#7a7a7a", width: 2 }, shadow: null };
    const btnFit = { lines: ["Close"], size: 34 };
    const bt = plain(caption("", btnFit, btn.x + 100, btn.y + (btnH - 34) / 2, { family: "Lato", color: "#111111", align: "middle", strokeRatio: 0.0001, name: "Dialog button label", boxW: 160 }));
    bt.x = btn.x + 20;
    const layers: Layer[] = [backdrop(v.bg, { brightness: 0.8 })];
    if (f) layers.push(f);
    layers.push(win, bar, tt, mt, btn, bt);
    return doc(title, "error", layers);
  },
  wordart: (input, v) => {
    const f = v.cut ? face(v.cut, v.side, 0.82) : null;
    const col = textColumn(f, v.side);
    const fit = fitText(input.headline, { family: "Luckiest Guy", maxW: col.w * 0.92, maxH: H * 0.3, maxLines: 1, uppercase: true, strokeRatio: 0.1, maxSize: 160, minSize: 64 });
    if (!fit) return null;
    const t = caption(fit.lines[0] ?? "", fit, col.x + col.w / 2, M + 30, { family: "Luckiest Guy", align: "middle", color: "#fff35c" });
    t.fill2 = "#ff7a1a";
    t.stroke = { color: "#3a0a52", width: Math.round(fit.size * 0.1) };
    t.arch = 28;
    t.h = Math.round(t.h + fit.size * 0.5);
    t.rotation = v.side === "right" ? -5 : 5;
    const layers: Layer[] = [backdrop(v.bg, { saturate: 1.35 })];
    if (f) layers.push(f);
    layers.push(t);
    return doc(input.headline, "wordart", layers);
  },
  tilted: (input, v) => {
    const f = v.cut ? face(v.cut, v.side, 0.86) : null;
    const col = textColumn(f, v.side);
    const fit = fitText(input.headline, { family: "Anton", maxW: col.w * 0.86, maxH: H * 0.3, maxLines: 2, uppercase: true, strokeRatio: 0.04, maxSize: 150, lineHeight: 1.0 });
    if (!fit) return null;
    const t = caption(fit.lines.join(" "), fit, col.x + col.w / 2, H * 0.3, { family: "Anton", align: "middle", strokeRatio: 0.04, color: "#ffffff" });
    const band: ShapeLayer = { ...newShape("rect", v.accent), name: "Banner", role: "badge", x: t.x - 40, y: t.y - 18, w: t.w + 80, h: t.h + 36, radius: 0, stroke: { color: "#000000", width: 6 }, shadow: { color: "#000000", blur: 20, dx: 0, dy: 10, opacity: 0.5 } };
    band.rotation = -6;
    t.rotation = -6;
    const layers: Layer[] = [backdrop(v.bg)];
    if (f) layers.push(f);
    layers.push(band, t);
    return doc(input.headline, "tilted", layers);
  },
  split: (input, v) => {
    if (!v.bg2) return null;
    const left = backdrop(v.bg, { box: { x: 0, y: 0, w: W / 2, h: H }, name: "Left screenshot" });
    const right = backdrop(v.bg2, { box: { x: W / 2, y: 0, w: W / 2, h: H }, name: "Right screenshot" });
    const divider: ShapeLayer = { ...newShape("rect", "#ffffff"), name: "Divider", role: "badge", x: W / 2 - 5, y: 0, w: 10, h: H, radius: 0, stroke: null, shadow: { color: "#000000", blur: 16, dx: 0, dy: 0, opacity: 0.7 } };
    if (!input.splitLabels) return null;
    const [a, b] = input.splitLabels;
    const fa = fitText(a, { family: "Lato", maxW: W / 2 - 2 * M, maxH: 150, maxLines: 2, uppercase: true, strokeRatio: 0.09, maxSize: 120 });
    const fb = fitText(b, { family: "Lato", maxW: W / 2 - 2 * M, maxH: 150, maxLines: 2, uppercase: true, strokeRatio: 0.09, maxSize: 120 });
    if (!fa || !fb) return null;
    const size = Math.min(fa.size, fb.size);
    const ta = caption("", { lines: fa.lines, size }, W / 4, M, { family: "Lato", align: "middle" });
    const tb = caption("", { lines: fb.lines, size }, (3 * W) / 4, M, { family: "Lato", align: "middle" });
    return doc(input.headline, "split", [left, right, divider, ta, tb]);
  },
};

// ------------------------------------------------------------ the generator

function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 10000) / 10000;
  };
}

/** Three or more different concepts from your images and words. */
export function composeConcepts(input: ComposeInput): ComposeResult {
  const notes: string[] = [];
  const count = Math.max(3, input.count ?? 4);
  if (!input.headline.trim() && !(input.lines?.length)) return { concepts: [], notes: ["Type the words for the thumbnail first."] };
  if (!input.backgrounds.length) {
    return { concepts: [], notes: ["Add at least one screenshot (or pick a store screenshot). Your thumbnails are built on real gameplay, so CREATOR.EXE won't put words on a plain colour block."] };
  }
  if (!input.cutouts.length) notes.push("No cut-out of you yet, so face styles are skipped. Add a photo of yourself to get them.");
  const random = rng(input.seed ?? 1);
  const ref = input.reference ?? null;
  const palette = ref?.palette ?? [];
  const order: StyleId[] = [];
  if (ref) order.push(ref.styleId);
  for (const s of THUMB_STYLES) if (!order.includes(s.id) && (input.experimental || !s.experimental)) order.push(s.id);
  // When you ask for something different, keep room for at least two experiments.
  const wantExperiments = input.experimental ? Math.min(2, count - 1) : 0;

  const concepts: Concept[] = [];
  const dropped: string[] = [];
  let i = 0;
  for (const id of order) {
    if (concepts.length >= count) break;
    const style = STYLE_BY_ID.get(id)!;
    const expHave = concepts.filter((c) => c.style.experimental).length;
    const expLeft = order.slice(order.indexOf(id)).filter((x) => STYLE_BY_ID.get(x)!.experimental).length;
    if (!style.experimental && wantExperiments - expHave > 0 && count - concepts.length <= Math.min(wantExperiments - expHave, expLeft)) continue;
    const side: "left" | "right" = ref?.faceSide && id === ref.styleId ? ref.faceSide : (i + Math.floor(random() * 2)) % 2 === 0 ? "right" : "left";
    const variant: Variant = {
      side,
      bg: input.backgrounds[i % input.backgrounds.length]!,
      bg2: input.backgrounds.length > 1 ? input.backgrounds[(i + 1) % input.backgrounds.length] : undefined,
      cut: input.cutouts.length ? input.cutouts[i % input.cutouts.length]! : null,
      accent: palette.find((c) => /^#/.test(c) && c.toLowerCase() !== "#ffffff") ?? "#e8202a",
      captionColor: id === ref?.styleId && palette[0] ? palette[0] : "#ffffff",
    };
    const d = BUILDERS[id](input, variant);
    if (!d) continue;
    const issues = checkDoc(d);
    if (hasErrors(issues)) {
      dropped.push(`${style.name}: ${issues.find((x) => x.level === "error")?.message ?? "failed a check"}`);
      continue;
    }
    i++;
    concepts.push({
      id: `${id}-${i}`,
      style,
      doc: d,
      issues,
      why: style.seenIn.length ? `Like your "${style.seenIn[0]}" thumbnail${style.seenIn.length > 1 ? ` (and ${style.seenIn.length - 1} more)` : ""}.` : "A different direction, not seen on your channel yet.",
    });
  }
  if (dropped.length) notes.push(`Skipped because they didn't fit cleanly: ${dropped.join("; ")}.`);
  if (concepts.length < 3) notes.push("Fewer than three concepts fit these inputs. A second screenshot, a cut-out photo of you, or a shorter caption gives more options.");
  return { concepts, notes };
}

/** True when two boxes overlap by more than a sliver (used by tests and the editor). */
export function boxesOverlap(a: Box, b: Box): boolean {
  const x = intersect(a, b);
  return x.w > 2 && x.h > 2 && area(x) > 16;
}

export { TIMESTAMP_ZONE };
