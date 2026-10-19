// Bundled thumbnail fonts. The editor canvas uses them through app.css; an
// SVG drawn into an <img> (for PNG/PSD export and previews) can't see page
// fonts, so exports embed the ones a thumbnail uses as data URLs.
import { FONT_METRICS } from "../../domain/thumbnails/fontMetrics.ts";
import type { ThumbnailDoc } from "../../domain/thumbnails/model.ts";
import { bytesToBase64 } from "../../lib/base64.ts";

const cache = new Map<string, Promise<string>>();

function faceFor(family: string): Promise<string> {
  const m = FONT_METRICS[family];
  if (!m) return Promise.resolve("");
  let p = cache.get(family);
  if (!p) {
    p = fetch(`/fonts/${m.file}`)
      .then((r) => {
        if (!r.ok) throw new Error(`font ${m.file}: ${r.status}`);
        return r.arrayBuffer();
      })
      .then((buf) => `@font-face{font-family:"${family}";src:url(data:font/ttf;base64,${bytesToBase64(new Uint8Array(buf))}) format("truetype");font-weight:100 900;font-style:normal;}`)
      .catch(() => {
        cache.delete(family);
        return "";
      });
    cache.set(family, p);
  }
  return p;
}

/** @font-face rules for every bundled font the document uses. */
export async function fontCssFor(doc: ThumbnailDoc): Promise<string> {
  const families = new Set<string>();
  for (const l of doc.layers) if (l.type === "text" && FONT_METRICS[l.fontFamily]) families.add(l.fontFamily);
  return (await Promise.all([...families].map(faceFor))).join("");
}

/** Waits until the page has the bundled fonts, so the first canvas draw isn't in a fallback font. */
export async function preloadPageFonts(): Promise<void> {
  if (!("fonts" in document)) return;
  await Promise.all(Object.keys(FONT_METRICS).map((f) => document.fonts.load(`900 64px "${f}"`).catch(() => [])));
}
