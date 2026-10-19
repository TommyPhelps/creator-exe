// Pixel work for the on-device face cutout. The model itself runs in the
// Windows app (ONNX Runtime); this file turns its small 320×320 mask into a
// clean, cropped, transparent cut-out of your photo. Pure functions so they
// are tested in Node.

export const CUT_SIZE = 320;
/** Photos are scaled down to this longest side first; thumbnails never need more. */
export const MAX_SIDE = 1600;

/** Bilinear resize of a one-channel image. */
export function resizeGray(src: ArrayLike<number>, sw: number, sh: number, dw: number, dh: number): Uint8Array {
  const out = new Uint8Array(dw * dh);
  const sx = sw / dw;
  const sy = sh / dh;
  for (let y = 0; y < dh; y++) {
    const fy = Math.max(0, Math.min(sh - 1, (y + 0.5) * sy - 0.5));
    const y0 = Math.floor(fy);
    const y1 = Math.min(sh - 1, y0 + 1);
    const ty = fy - y0;
    for (let x = 0; x < dw; x++) {
      const fx = Math.max(0, Math.min(sw - 1, (x + 0.5) * sx - 0.5));
      const x0 = Math.floor(fx);
      const x1 = Math.min(sw - 1, x0 + 1);
      const tx = fx - x0;
      const a = src[y0 * sw + x0]! * (1 - tx) + src[y0 * sw + x1]! * tx;
      const b = src[y1 * sw + x0]! * (1 - tx) + src[y1 * sw + x1]! * tx;
      out[y * dw + x] = Math.round(a * (1 - ty) + b * ty);
    }
  }
  return out;
}

/** Firms up the soft edge so the sticker outline hugs you instead of a haze. */
export function refineAlpha(a: Uint8Array, lo = 0.18, hi = 0.82): Uint8Array {
  const out = new Uint8Array(a.length);
  for (let i = 0; i < a.length; i++) {
    const v = (a[i]! / 255 - lo) / (hi - lo);
    const c = v <= 0 ? 0 : v >= 1 ? 1 : v * v * (3 - 2 * v);
    out[i] = Math.round(c * 255);
  }
  return out;
}

/**
 * Keeps only the largest connected shape (you), dropping stray specks the
 * model sometimes leaves on busy backgrounds.
 */
export function keepLargest(a: Uint8Array, w: number, h: number, threshold = 96): Uint8Array {
  const label = new Int32Array(w * h).fill(-1);
  const sizes: number[] = [];
  const stack: number[] = [];
  for (let i = 0; i < w * h; i++) {
    if (a[i]! < threshold || label[i] !== -1) continue;
    const id = sizes.length;
    let size = 0;
    label[i] = id;
    stack.push(i);
    while (stack.length) {
      const p = stack.pop()!;
      size++;
      const x = p % w;
      const y = (p - x) / w;
      const n = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1];
      for (const q of n) {
        if (q >= 0 && label[q] === -1 && a[q]! >= threshold) {
          label[q] = id;
          stack.push(q);
        }
      }
    }
    sizes.push(size);
  }
  if (sizes.length <= 1) return a;
  const best = sizes.indexOf(Math.max(...sizes));
  const out = new Uint8Array(a);
  // Clear the other shapes, and any faint haze outside the main shape's box.
  let x0 = w;
  let y0 = h;
  let x1 = 0;
  let y1 = 0;
  for (let i = 0; i < w * h; i++) {
    if (label[i] === best) {
      const x = i % w;
      const y = (i - x) / w;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  const m = 3;
  for (let i = 0; i < w * h; i++) {
    const x = i % w;
    const y = (i - x) / w;
    const outside = x < x0 - m || x > x1 + m || y < y0 - m || y > y1 + m;
    if ((label[i] !== -1 && label[i] !== best) || outside) out[i] = 0;
  }
  return out;
}

export interface PixelBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function alphaBounds(a: ArrayLike<number>, w: number, h: number, threshold = 128): PixelBox | null {
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (a[y * w + x]! >= threshold) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

export interface CutResult {
  rgba: Uint8ClampedArray<ArrayBuffer>;
  w: number;
  h: number;
  /** Visible part of the cut-out, as fractions of the (cropped) image. */
  alphaBox: { x: number; y: number; w: number; h: number };
  /** Share of the photo that is you (0..1); very small means the model probably missed. */
  coverage: number;
}

/**
 * Applies a 320×320 model mask to the full photo, crops to you plus a margin
 * (room for the sticker outline), and reports where the visible pixels are.
 */
export function applyMask(rgba: ArrayLike<number>, w: number, h: number, mask: ArrayLike<number>, maskSize = CUT_SIZE): CutResult | null {
  const up = keepLargest(refineAlpha(resizeGray(mask, maskSize, maskSize, w, h)), w, h);
  const b = alphaBounds(up, w, h);
  if (!b) return null;
  let solid = 0;
  for (let i = 0; i < up.length; i++) if (up[i]! >= 128) solid++;
  const pad = Math.round(Math.max(b.w, b.h) * 0.04) + 8;
  const cx = Math.max(0, b.x - pad);
  const cy = Math.max(0, b.y - pad);
  const cw = Math.min(w, b.x + b.w + pad) - cx;
  const ch = Math.min(h, b.y + b.h + pad) - cy;
  const out = new Uint8ClampedArray(cw * ch * 4);
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const s = (cy + y) * w + cx + x;
      const d = (y * cw + x) * 4;
      out[d] = rgba[s * 4]!;
      out[d + 1] = rgba[s * 4 + 1]!;
      out[d + 2] = rgba[s * 4 + 2]!;
      out[d + 3] = Math.min(rgba[s * 4 + 3]!, up[s]!);
    }
  }
  return {
    rgba: out,
    w: cw,
    h: ch,
    alphaBox: { x: (b.x - cx) / cw, y: (b.y - cy) / ch, w: b.w / cw, h: b.h / ch },
    coverage: solid / (w * h),
  };
}

/** Size to scale a photo to before cutting (never upscales). */
export function workingSize(w: number, h: number, max = MAX_SIDE): { w: number; h: number } {
  const s = Math.min(1, max / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * s)), h: Math.max(1, Math.round(h * s)) };
}
