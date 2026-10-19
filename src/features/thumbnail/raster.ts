// Browser-side rasterizing of thumbnail SVG (PNG/JPEG export, previews, OpenRaster layers).
import { base64ToBytes, bytesToBase64 } from "../../lib/base64.ts";
import { docToSvg, estimateTextBox } from "../../domain/thumbnails/render.ts";
import { THUMB_H, THUMB_W, type TextLayer, type ThumbnailDoc } from "../../domain/thumbnails/model.ts";
import { buildOra } from "../../domain/thumbnails/ora.ts";
import { buildPsd } from "../../domain/thumbnails/psd.ts";
import { FONT_METRICS } from "../../domain/thumbnails/fontMetrics.ts";
import { fontCssFor } from "./fonts.ts";

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not render the thumbnail image."));
    img.src = src;
  });
}

export async function svgToCanvas(svg: string, width: number, height: number): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const img = await loadImage(url);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas is not available.");
    ctx.drawImage(img, 0, 0, width, height);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function canvasBytes(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Uint8Array> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
  if (!blob) throw new Error("Could not encode the image.");
  return new Uint8Array(await blob.arrayBuffer());
}

/** The whole thumbnail drawn at a size, with its fonts embedded. */
export async function docToCanvas(doc: ThumbnailDoc, width = THUMB_W, height = THUMB_H): Promise<HTMLCanvasElement> {
  return svgToCanvas(docToSvg(doc, { fontCss: await fontCssFor(doc) }), width, height);
}

export async function docToPng(doc: ThumbnailDoc, width = THUMB_W, height = THUMB_H): Promise<Uint8Array> {
  return canvasBytes(await docToCanvas(doc, width, height), "image/png");
}

/** A small JPEG data URL for galleries. */
export async function docPreview(doc: ThumbnailDoc): Promise<string> {
  const c = await docToCanvas(doc, 384, 216);
  return c.toDataURL("image/jpeg", 0.82);
}

/** One canvas per layer (shadow and outline included), bottom to top. */
async function layerCanvases(doc: ThumbnailDoc): Promise<{ l: ThumbnailDoc["layers"][number]; canvas: HTMLCanvasElement }[]> {
  const fontCss = await fontCssFor(doc);
  const out = [];
  for (const l of doc.layers) {
    const svg = docToSvg({ ...doc, layers: doc.layers.map((x) => (x.id === l.id ? { ...x, visible: true } : x)) }, { onlyLayerId: l.id, ignoreOpacity: true, fontCss });
    out.push({ l, canvas: await svgToCanvas(svg, THUMB_W, THUMB_H) });
  }
  return out;
}

export async function docToOra(doc: ThumbnailDoc): Promise<Uint8Array> {
  const layers = [];
  for (const { l, canvas } of await layerCanvases(doc)) {
    layers.push({ id: l.id, name: l.name, png: await canvasBytes(canvas, "image/png"), opacity: l.opacity, visible: l.visible });
  }
  const merged = await docToPng(doc);
  const thumb = await docToPng(doc, 256, 144);
  return buildOra(doc, layers, merged, thumb);
}

const pixels = (c: HTMLCanvasElement) => {
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available.");
  return ctx.getImageData(0, 0, c.width, c.height).data;
};

/** Layered Photoshop file: opens in Affinity Photo, Photoshop, GIMP and Krita with every layer separate. */
export async function docToPsd(doc: ThumbnailDoc): Promise<Uint8Array> {
  const layers = (await layerCanvases(doc)).map(({ l, canvas }) => ({ name: l.name, rgba: pixels(canvas), opacity: l.opacity, visible: l.visible }));
  return buildPsd(THUMB_W, THUMB_H, layers, pixels(await docToCanvas(doc)));
}

export { base64ToBytes, bytesToBase64 };

let measureCtx: CanvasRenderingContext2D | null = null;
export function measureText(text: string, font: string): number {
  if (!measureCtx) measureCtx = document.createElement("canvas").getContext("2d");
  if (!measureCtx) return text.length * 10;
  measureCtx.font = font;
  return measureCtx.measureText(text).width;
}

export function fitText(l: TextLayer): TextLayer {
  // Bundled fonts are measured from their own metrics (same as the concept builder); others by the browser.
  const box = FONT_METRICS[l.fontFamily] ? estimateTextBox(l) : estimateTextBox(l, measureText);
  return { ...l, w: box.w, h: box.h };
}

/** Reads natural size of an image data URL. */
export async function imageSize(dataUrl: string): Promise<{ w: number; h: number }> {
  const img = await loadImage(dataUrl);
  return { w: img.naturalWidth || 1, h: img.naturalHeight || 1 };
}
