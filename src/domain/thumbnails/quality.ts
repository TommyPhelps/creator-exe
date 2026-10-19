// Quality checks for thumbnails: things that make a thumbnail fail at
// YouTube's sizes or look broken. The concept generator drops any concept
// with an error; the editor shows the same checks live as you work.

import { THUMB_H, THUMB_W, type ImageLayer, type Layer, type TextLayer, type ThumbnailDoc } from "./model.ts";
import { FONT_METRICS } from "./fontMetrics.ts";

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface QualityIssue {
  level: "error" | "warn";
  code: "off-canvas" | "edge" | "timestamp" | "overlap-face" | "overlap-text" | "overlap-accent" | "tiny" | "wordy" | "contrast" | "empty" | "small-face" | "low-res";
  message: string;
  layerIds: string[];
}

/** Where YouTube draws the video length on every thumbnail (bottom-right). */
export const TIMESTAMP_ZONE: Box = { x: THUMB_W - 190, y: THUMB_H - 80, w: 190, h: 80 };
/** Keep text this far from the edges. */
export const SAFE_MARGIN = 28;
/** The smallest common size a thumbnail is seen at (search results on phones), in pixels wide. */
export const SMALL_VIEW_W = 168;

export function area(b: Box): number {
  return Math.max(0, b.w) * Math.max(0, b.h);
}

export function intersect(a: Box, b: Box): Box {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  return { x, y, w: Math.min(a.x + a.w, b.x + b.w) - x, h: Math.min(a.y + a.h, b.y + b.h) - y };
}

export function overlapRatio(a: Box, b: Box): number {
  const i = intersect(a, b);
  if (i.w <= 0 || i.h <= 0) return 0;
  return area(i) / Math.max(1, Math.min(area(a), area(b)));
}

/** Axis-aligned bounds of a layer, including rotation. */
export function layerBox(l: Layer): Box {
  if (!l.rotation) return { x: l.x, y: l.y, w: l.w, h: l.h };
  const r = (l.rotation * Math.PI) / 180;
  const c = Math.abs(Math.cos(r));
  const s = Math.abs(Math.sin(r));
  const w = l.w * c + l.h * s;
  const h = l.w * s + l.h * c;
  return { x: l.x + l.w / 2 - w / 2, y: l.y + l.h / 2 - h / 2, w, h };
}

/** The visible (non-transparent) part of a cut-out image, in canvas coordinates. */
export function visibleBox(l: ImageLayer): Box {
  const ab = l.alphaBox;
  if (!ab) return layerBox(l);
  const fx = (v: number) => (v - l.crop.x) / l.crop.w;
  const fy = (v: number) => (v - l.crop.y) / l.crop.h;
  let x0 = fx(ab.x);
  let x1 = fx(ab.x + ab.w);
  if (l.flipX) [x0, x1] = [1 - x1, 1 - x0];
  const y0 = fy(ab.y);
  const y1 = fy(ab.y + ab.h);
  const cx0 = Math.max(0, Math.min(1, x0));
  const cx1 = Math.max(0, Math.min(1, x1));
  const cy0 = Math.max(0, Math.min(1, y0));
  const cy1 = Math.max(0, Math.min(1, y1));
  return { x: l.x + cx0 * l.w, y: l.y + cy0 * l.h, w: (cx1 - cx0) * l.w, h: (cy1 - cy0) * l.h };
}

const isWords = (l: Layer): l is TextLayer => l.type === "text" && l.visible && l.role !== "badge";

export function checkDoc(doc: ThumbnailDoc): QualityIssue[] {
  const out: QualityIssue[] = [];
  const visible = doc.layers.filter((l) => l.visible);
  const texts = visible.filter(isWords);
  const faces = visible.filter((l): l is ImageLayer => l.type === "image" && l.role === "face");
  const accents = visible.filter((l) => l.role === "accent");
  const hasImageUnder = visible.some((l) => l.type === "image");

  for (const t of texts) {
    const b = layerBox(t);
    const name = `"${t.text.split("\n")[0]?.slice(0, 24) ?? t.name}"`;
    if (!t.text.trim()) {
      out.push({ level: "warn", code: "empty", message: `An empty text layer (${t.name}).`, layerIds: [t.id] });
      continue;
    }
    if (b.x < -2 || b.y < -2 || b.x + b.w > THUMB_W + 2 || b.y + b.h > THUMB_H + 2) {
      out.push({ level: "error", code: "off-canvas", message: `${name} runs off the edge of the thumbnail.`, layerIds: [t.id] });
    } else if (t.role !== "dialog" && (b.x < SAFE_MARGIN - 10 || b.y < SAFE_MARGIN - 10 || b.x + b.w > THUMB_W - SAFE_MARGIN + 10 || b.y + b.h > THUMB_H - SAFE_MARGIN + 10)) {
      out.push({ level: "warn", code: "edge", message: `${name} is very close to the edge and may get cropped on some screens.`, layerIds: [t.id] });
    }
    if (overlapRatio(b, TIMESTAMP_ZONE) > 0.05) {
      out.push({ level: "warn", code: "timestamp", message: `${name} sits where YouTube shows the video length (bottom-right).`, layerIds: [t.id] });
    }
    const m = FONT_METRICS[t.fontFamily];
    const capPx = (m?.capHeight ?? 0.72) * t.fontSize * (SMALL_VIEW_W / THUMB_W);
    if (t.role !== "dialog" && capPx < 5.5) {
      out.push({ level: "warn", code: "tiny", message: `${name} is about ${capPx.toFixed(1)} px tall on a phone; it won't be readable there.`, layerIds: [t.id] });
    }
    const words = t.text.trim().split(/\s+/).length;
    if ((t.role === "caption" || !t.role) && words > 6) {
      out.push({ level: "warn", code: "wordy", message: `${name} has ${words} words; your thumbnails usually use two to five.`, layerIds: [t.id] });
    }
    if (hasImageUnder && t.role !== "dialog" && !(t.stroke && t.stroke.width >= t.fontSize * 0.04) && !(t.shadow && t.shadow.opacity >= 0.5)) {
      out.push({ level: "warn", code: "contrast", message: `${name} has no outline or shadow; it may disappear against the screenshot.`, layerIds: [t.id] });
    }
    for (const f of faces) {
      if (overlapRatio(b, visibleBox(f)) > 0.08) out.push({ level: "error", code: "overlap-face", message: `${name} covers your face.`, layerIds: [t.id, f.id] });
    }
    for (const a of accents) {
      if (overlapRatio(b, layerBox(a)) > 0.08) out.push({ level: "error", code: "overlap-accent", message: `The ${a.name.toLowerCase()} covers ${name}.`, layerIds: [t.id, a.id] });
    }
  }
  for (let i = 0; i < texts.length; i++) {
    for (let j = i + 1; j < texts.length; j++) {
      const a = texts[i]!;
      const b = texts[j]!;
      if (a.group && a.group === b.group) continue;
      if (overlapRatio(layerBox(a), layerBox(b)) > 0.05) {
        out.push({ level: "error", code: "overlap-text", message: `Two text layers overlap ("${a.text.slice(0, 16)}" and "${b.text.slice(0, 16)}").`, layerIds: [a.id, b.id] });
      }
    }
  }
  for (const im of visible.filter((l): l is ImageLayer => l.type === "image" && l.opacity > 0.5)) {
    const scale = upscale(im);
    if (scale > 1.6) {
      const what = im.role === "face" ? "Your photo" : im.role === "backdrop" ? "The screenshot" : `"${im.name}"`;
      out.push({ level: "warn", code: "low-res", message: `${what} is enlarged ${scale.toFixed(1)}×, so it will look soft. A bigger original looks sharper.`, layerIds: [im.id] });
    }
  }
  for (const f of faces) {
    const v = visibleBox(f);
    if (v.h < THUMB_H * 0.35) out.push({ level: "warn", code: "small-face", message: "Your face is small; in your thumbnails it usually fills most of the height.", layerIds: [f.id] });
  }
  return out;
}

/** How much an image is enlarged on the 1280×720 canvas (1 = shown at its own pixel size). */
export function upscale(l: ImageLayer): number {
  const srcW = Math.max(1, l.naturalW * l.crop.w);
  const srcH = Math.max(1, l.naturalH * l.crop.h);
  return Math.max(l.w / srcW, l.h / srcH);
}

export function hasErrors(issues: QualityIssue[]): boolean {
  return issues.some((i) => i.level === "error");
}
