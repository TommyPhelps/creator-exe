// Browser-side rasterizing of thumbnail SVG (PNG/JPEG export, previews, OpenRaster layers).
import { base64ToBytes, bytesToBase64 } from "../../lib/base64.ts";
import { docToSvg, estimateTextBox } from "../../domain/thumbnails/render.ts";
import { THUMB_H, THUMB_W, type TextLayer, type ThumbnailDoc } from "../../domain/thumbnails/model.ts";
import { buildOra } from "../../domain/thumbnails/ora.ts";

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

export async function docToPng(doc: ThumbnailDoc, width = THUMB_W, height = THUMB_H): Promise<Uint8Array> {
  return canvasBytes(await svgToCanvas(docToSvg(doc), width, height), "image/png");
}

/** A small JPEG data URL for galleries. */
export async function docPreview(doc: ThumbnailDoc): Promise<string> {
  const c = await svgToCanvas(docToSvg(doc), 384, 216);
  return c.toDataURL("image/jpeg", 0.82);
}

export async function docToOra(doc: ThumbnailDoc): Promise<Uint8Array> {
  const layers = [];
  for (const l of doc.layers) {
    const svg = docToSvg({ ...doc, layers: doc.layers.map((x) => (x.id === l.id ? { ...x, visible: true } : x)) }, { onlyLayerId: l.id, ignoreOpacity: true });
    const png = await canvasBytes(await svgToCanvas(svg, THUMB_W, THUMB_H), "image/png");
    layers.push({ id: l.id, name: l.name, png, opacity: l.opacity, visible: l.visible });
  }
  const merged = await docToPng(doc);
  const thumb = await canvasBytes(await svgToCanvas(docToSvg(doc), 256, 144), "image/png");
  return buildOra(doc, layers, merged, thumb);
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
  const box = estimateTextBox(l, measureText);
  return { ...l, w: box.w, h: box.h };
}

/** Reads natural size of an image data URL. */
export async function imageSize(dataUrl: string): Promise<{ w: number; h: number }> {
  const img = await loadImage(dataUrl);
  return { w: img.naturalWidth || 1, h: img.naturalHeight || 1 };
}
