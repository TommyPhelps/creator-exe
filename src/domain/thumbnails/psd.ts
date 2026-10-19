// Layered Photoshop (.psd) export, written from scratch so nothing external is
// needed. Affinity Photo, Photoshop, GIMP and Krita open these with every
// layer separate and named. Each layer is stored as pixels (text included):
// live, editable text inside a PSD needs Photoshop's private text engine data,
// so edit wording here or keep the .cthumb for that.

export interface PsdLayerInput {
  name: string;
  /** Full-canvas RGBA pixels for this layer alone (width × height × 4). */
  rgba: Uint8Array | Uint8ClampedArray;
  /** 0..1 */
  opacity: number;
  visible: boolean;
}

interface Trimmed {
  top: number;
  left: number;
  bottom: number;
  right: number;
  channels: Uint8Array[]; // A, R, G, B planes for the trimmed rectangle
}

/** Finds the rectangle that holds the layer's non-transparent pixels. */
export function opaqueBounds(rgba: ArrayLike<number>, width: number, height: number): { top: number; left: number; bottom: number; right: number } | null {
  let top = height;
  let left = width;
  let bottom = -1;
  let right = -1;
  for (let y = 0; y < height; y++) {
    const row = y * width * 4;
    for (let x = 0; x < width; x++) {
      if (rgba[row + x * 4 + 3]! !== 0) {
        if (y < top) top = y;
        if (y > bottom) bottom = y;
        if (x < left) left = x;
        if (x > right) right = x;
      }
    }
  }
  if (bottom < 0) return null;
  return { top, left, bottom: bottom + 1, right: right + 1 };
}

function trim(rgba: ArrayLike<number>, width: number, height: number): Trimmed {
  const b = opaqueBounds(rgba, width, height);
  if (!b) return { top: 0, left: 0, bottom: 0, right: 0, channels: [new Uint8Array(0), new Uint8Array(0), new Uint8Array(0), new Uint8Array(0)] };
  const w = b.right - b.left;
  const h = b.bottom - b.top;
  const planes = [0, 1, 2, 3].map(() => new Uint8Array(w * h));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const s = ((b.top + y) * width + b.left + x) * 4;
      const d = y * w + x;
      planes[0]![d] = rgba[s + 3]!;
      planes[1]![d] = rgba[s]!;
      planes[2]![d] = rgba[s + 1]!;
      planes[3]![d] = rgba[s + 2]!;
    }
  }
  return { ...b, channels: planes };
}

/** PackBits run-length encoding of one row (the RLE that PSD uses). */
export function packBits(row: Uint8Array): Uint8Array {
  const out: number[] = [];
  let i = 0;
  const n = row.length;
  while (i < n) {
    // Look for a run of at least 3 equal bytes.
    let run = 1;
    while (i + run < n && run < 128 && row[i + run] === row[i]) run++;
    if (run >= 3) {
      out.push(257 - run, row[i]!);
      i += run;
      continue;
    }
    // Literal stretch until the next run of 3 (or 128 bytes).
    const start = i;
    let len = 0;
    while (i < n && len < 128) {
      if (i + 2 < n && row[i] === row[i + 1] && row[i] === row[i + 2]) break;
      i++;
      len++;
    }
    out.push(len - 1);
    for (let k = start; k < start + len; k++) out.push(row[k]!);
  }
  return Uint8Array.from(out);
}

/** Decodes PackBits (used by the tests to prove the round trip). */
export function unpackBits(data: Uint8Array, expected: number): Uint8Array {
  const out = new Uint8Array(expected);
  let o = 0;
  let i = 0;
  while (i < data.length && o < expected) {
    const h = data[i++]!;
    if (h < 128) {
      for (let k = 0; k <= h; k++) out[o++] = data[i++]!;
    } else if (h > 128) {
      const v = data[i++]!;
      for (let k = 0; k < 257 - h; k++) out[o++] = v;
    }
  }
  return out;
}

/** RLE-compressed channel: [u16 compression=1][u16 count per row…][rows…]. */
function rleChannel(plane: Uint8Array, w: number, h: number): Uint8Array {
  if (w === 0 || h === 0) return Uint8Array.from([0, 0]); // raw, empty
  const rows: Uint8Array[] = [];
  for (let y = 0; y < h; y++) rows.push(packBits(plane.subarray(y * w, (y + 1) * w)));
  const size = 2 + h * 2 + rows.reduce((a, r) => a + r.length, 0);
  const out = new Uint8Array(size);
  const dv = new DataView(out.buffer);
  dv.setUint16(0, 1);
  rows.forEach((r, y) => dv.setUint16(2 + y * 2, r.length));
  let o = 2 + h * 2;
  for (const r of rows) {
    out.set(r, o);
    o += r.length;
  }
  return out;
}

class Writer {
  private chunks: Uint8Array[] = [];
  length = 0;
  bytes(b: Uint8Array | number[]): void {
    const u = b instanceof Uint8Array ? b : Uint8Array.from(b);
    this.chunks.push(u);
    this.length += u.length;
  }
  u8(v: number): void {
    this.bytes([v & 255]);
  }
  u16(v: number): void {
    this.bytes([(v >> 8) & 255, v & 255]);
  }
  i16(v: number): void {
    this.u16(v < 0 ? 0x10000 + v : v);
  }
  u32(v: number): void {
    this.bytes([(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255]);
  }
  i32(v: number): void {
    this.u32(v < 0 ? 0x100000000 + v : v);
  }
  ascii(s: string): void {
    this.bytes(Array.from(s, (c) => c.charCodeAt(0) & 255));
  }
  pad(to: number): void {
    while (this.length % to) this.u8(0);
  }
  done(): Uint8Array {
    const out = new Uint8Array(this.length);
    let o = 0;
    for (const c of this.chunks) {
      out.set(c, o);
      o += c.length;
    }
    return out;
  }
}

function layerExtra(name: string): Uint8Array {
  const w = new Writer();
  w.u32(0); // layer mask data
  w.u32(0); // blending ranges
  // Pascal name (MacRoman/ASCII fallback), padded to a multiple of 4 including the length byte.
  const ascii = Array.from(name.slice(0, 255), (c) => (c.charCodeAt(0) < 128 ? c.charCodeAt(0) : 63));
  w.u8(ascii.length);
  w.bytes(ascii);
  w.pad(4);
  // 'luni': the real (Unicode) layer name.
  const units = Array.from(name.slice(0, 255)).flatMap((ch) => {
    const s = ch;
    const out: number[] = [];
    for (let i = 0; i < s.length; i++) out.push(s.charCodeAt(i));
    return out;
  });
  const body = new Writer();
  body.u32(units.length);
  for (const u of units) body.u16(u);
  body.pad(4);
  const b = body.done();
  w.ascii("8BIM");
  w.ascii("luni");
  w.u32(b.length);
  w.bytes(b);
  return w.done();
}

/**
 * Builds a PSD. `layers` are bottom-to-top, each with full-canvas RGBA.
 * `composite` is the flattened RGBA image shown by programs that ignore layers.
 */
export function buildPsd(width: number, height: number, layers: PsdLayerInput[], composite: Uint8Array | Uint8ClampedArray): Uint8Array {
  if (composite.length !== width * height * 4) throw new Error("The flattened image has the wrong size.");
  const trimmed = layers.map((l) => {
    if (l.rgba.length !== width * height * 4) throw new Error(`Layer "${l.name}" has the wrong size.`);
    const t = trim(l.rgba, width, height);
    const w = t.right - t.left;
    const h = t.bottom - t.top;
    return { layer: l, t, data: t.channels.map((p) => rleChannel(p, w, h)) };
  });

  // ---- layer info
  const li = new Writer();
  li.i16(trimmed.length);
  for (const { layer, t, data } of trimmed) {
    li.i32(t.top);
    li.i32(t.left);
    li.i32(t.bottom);
    li.i32(t.right);
    li.u16(4);
    [-1, 0, 1, 2].forEach((id, k) => {
      li.i16(id);
      li.u32(data[k]!.length);
    });
    li.ascii("8BIM");
    li.ascii("norm");
    li.u8(Math.round(Math.max(0, Math.min(1, layer.opacity)) * 255));
    li.u8(0); // clipping
    li.u8(layer.visible ? 0 : 2); // flags: bit 1 = hidden
    li.u8(0);
    const extra = layerExtra(layer.name);
    li.u32(extra.length);
    li.bytes(extra);
  }
  for (const { data } of trimmed) for (const d of data) li.bytes(d);
  li.pad(2);
  const layerInfo = li.done();

  const lm = new Writer();
  lm.u32(layerInfo.length);
  lm.bytes(layerInfo);
  lm.u32(0); // global layer mask info
  const layerAndMask = lm.done();

  // ---- flattened image (RGB, RLE): all row counts first, then all rows.
  const planes = [0, 1, 2].map((c) => {
    const p = new Uint8Array(width * height);
    for (let i = 0; i < width * height; i++) {
      const a = composite[i * 4 + 3]! / 255;
      p[i] = Math.round(composite[i * 4 + c]! * a + 255 * (1 - a)); // over white if anything is see-through
    }
    return p;
  });
  const rows: Uint8Array[] = [];
  for (const p of planes) for (let y = 0; y < height; y++) rows.push(packBits(p.subarray(y * width, (y + 1) * width)));

  const w = new Writer();
  w.ascii("8BPS");
  w.u16(1);
  w.bytes([0, 0, 0, 0, 0, 0]);
  w.u16(3);
  w.u32(height);
  w.u32(width);
  w.u16(8);
  w.u16(3); // RGB
  w.u32(0); // colour mode data
  w.u32(0); // image resources
  w.u32(layerAndMask.length);
  w.bytes(layerAndMask);
  w.u16(1);
  for (const r of rows) w.u16(r.length);
  for (const r of rows) w.bytes(r);
  return w.done();
}
