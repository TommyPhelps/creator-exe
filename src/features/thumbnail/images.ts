// Getting your images into the Thumbnail Lab: screenshots are scaled to a
// sensible size, photos of you are cut out on this PC.
import type { Platform } from "../../platform/types.ts";
import { applyMask, CUT_SIZE, workingSize } from "../../domain/thumbnails/cutout.ts";
import { base64ToBytes, bytesToBase64, mimeForPath } from "../../lib/base64.ts";

export const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "webp", "bmp", "gif"];

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("That file couldn't be opened as an image."));
    img.src = src;
  });
}

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas is not available.");
  ctx.imageSmoothingQuality = "high";
  return [c, ctx];
}

export async function readImageFile(platform: Platform, path: string): Promise<string> {
  const mime = mimeForPath(path);
  if (!mime.startsWith("image/")) throw new Error("Only image files (PNG, JPG, WebP, BMP, GIF) can be used.");
  return `data:${mime};base64,${await platform.files.readBinary(path)}`;
}

export const fileName = (path: string) => (path.split(/[\\/]/).pop() ?? "Image").replace(/\.[a-z0-9]+$/i, "");

export interface PreparedImage {
  src: string;
  preview: string;
  w: number;
  h: number;
}

/** Screenshots: at most 1920 wide (thumbnails are 1280), stored as high-quality JPEG. */
export async function prepareScreenshot(src: string): Promise<PreparedImage> {
  const img = await loadImage(src);
  const size = workingSize(img.naturalWidth, img.naturalHeight, 1920);
  const [c, ctx] = canvas(size.w, size.h);
  ctx.drawImage(img, 0, 0, size.w, size.h);
  const pw = 256;
  const [p, pctx] = canvas(pw, Math.round((pw * size.h) / size.w));
  pctx.drawImage(c, 0, 0, p.width, p.height);
  return { src: c.toDataURL("image/jpeg", 0.92), preview: p.toDataURL("image/jpeg", 0.8), w: size.w, h: size.h };
}

export interface CutPhoto extends PreparedImage {
  alphaBox: { x: number; y: number; w: number; h: number };
  coverage: number;
}

/**
 * Cuts you out of a photo. The model sees a 320×320 copy; the mask is then
 * applied to the full photo (up to 1600 px) so edges stay sharp.
 */
export async function cutOutPhoto(platform: Platform, src: string): Promise<CutPhoto> {
  const img = await loadImage(src);
  const size = workingSize(img.naturalWidth, img.naturalHeight);
  const [full, fctx] = canvas(size.w, size.h);
  fctx.drawImage(img, 0, 0, size.w, size.h);
  const [small, sctx] = canvas(CUT_SIZE, CUT_SIZE);
  sctx.drawImage(img, 0, 0, CUT_SIZE, CUT_SIZE);
  const smallPx = sctx.getImageData(0, 0, CUT_SIZE, CUT_SIZE).data;
  const mask = base64ToBytes(await platform.cutout.run(bytesToBase64(new Uint8Array(smallPx.buffer, smallPx.byteOffset, smallPx.byteLength))));
  const r = applyMask(fctx.getImageData(0, 0, size.w, size.h).data, size.w, size.h, mask);
  if (!r || r.coverage < 0.01) throw new Error("No person was found in that photo. A photo with your head and shoulders clearly visible works best.");
  const [out, octx] = canvas(r.w, r.h);
  octx.putImageData(new ImageData(r.rgba, r.w, r.h), 0, 0);
  const ph = 200;
  const [p, pctx] = canvas(Math.max(1, Math.round((ph * r.w) / r.h)), ph);
  pctx.drawImage(out, 0, 0, p.width, p.height);
  return { src: out.toDataURL("image/png"), preview: p.toDataURL("image/png"), w: r.w, h: r.h, alphaBox: r.alphaBox, coverage: r.coverage };
}

/** Downloads one of your YouTube thumbnails (for "inspired by" and reference layers). */
export async function fetchThumbnail(platform: Platform, url: string): Promise<string> {
  const res = await platform.httpBinary(url);
  if (res.status >= 400) throw new Error(`YouTube returned HTTP ${res.status} for that thumbnail.`);
  return `data:${res.contentType.split(";")[0] || "image/jpeg"};base64,${res.base64}`;
}

export async function imageSize(src: string): Promise<{ w: number; h: number }> {
  const img = await loadImage(src);
  return { w: img.naturalWidth || 1, h: img.naturalHeight || 1 };
}
