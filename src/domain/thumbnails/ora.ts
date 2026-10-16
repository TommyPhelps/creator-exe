// OpenRaster (.ora) export: a zip with one PNG per layer plus stack.xml.
// Krita, GIMP and MyPaint open it with layers intact. Text becomes pixels in
// this format; use SVG export to keep text editable.
import { createZip, type ZipEntry } from "./zip.ts";
import { esc } from "./render.ts";
import type { ThumbnailDoc } from "./model.ts";

export interface RasterizedLayer {
  id: string;
  name: string;
  png: Uint8Array;
  opacity: number;
  visible: boolean;
}

export function buildOra(doc: ThumbnailDoc, layers: RasterizedLayer[], merged: Uint8Array, thumbnail: Uint8Array): Uint8Array {
  const enc = new TextEncoder();
  // In stack.xml the first child is the top-most layer.
  const ordered = [...layers].reverse();
  const stack = `<?xml version="1.0" encoding="UTF-8"?>
<image version="0.0.5" w="${doc.width}" h="${doc.height}" xres="72" yres="72">
  <stack>
${ordered
  .map((l, i) => `    <layer name="${esc(l.name)}" src="data/layer${ordered.length - i}.png" x="0" y="0" opacity="${l.opacity.toFixed(3)}" visibility="${l.visible ? "visible" : "hidden"}" composite-op="svg:src-over"/>`)
  .join("\n")}
  </stack>
</image>
`;
  const entries: ZipEntry[] = [
    { name: "mimetype", data: enc.encode("image/openraster") },
    { name: "stack.xml", data: enc.encode(stack) },
    ...ordered.map((l, i) => ({ name: `data/layer${ordered.length - i}.png`, data: l.png })),
    { name: "Thumbnails/thumbnail.png", data: thumbnail },
    { name: "mergedimage.png", data: merged },
  ];
  return createZip(entries);
}
