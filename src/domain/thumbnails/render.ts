// Renders thumbnail documents to SVG markup. Used by the editor canvas, the
// SVG export, PNG export (via the browser) and OpenRaster per-layer export.
import { THUMB_H, THUMB_W, type Layer, type TextLayer, type ThumbnailDoc } from "./model.ts";

export function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

const n = (v: number) => (Number.isFinite(v) ? Math.round(v * 100) / 100 : 0);

export const FONT_STACKS: Record<string, string> = {
  Impact: "Impact, 'Haettenschweiler', 'Arial Narrow Bold', sans-serif",
  "Arial Black": "'Arial Black', 'Arial Bold', Gadget, sans-serif",
  Tahoma: "Tahoma, Verdana, Segoe, sans-serif",
  Verdana: "Verdana, Geneva, sans-serif",
  "Trebuchet MS": "'Trebuchet MS', 'Lucida Grande', sans-serif",
  Georgia: "Georgia, 'Times New Roman', serif",
  "Courier New": "'Courier New', Courier, monospace",
  "Lucida Console": "'Lucida Console', Monaco, monospace",
  "Comic Sans MS": "'Comic Sans MS', 'Comic Sans', cursive",
  "Segoe UI": "'Segoe UI', Tahoma, sans-serif",
  Bahnschrift: "Bahnschrift, 'Segoe UI', sans-serif",
  "Franklin Gothic Medium": "'Franklin Gothic Medium', 'Arial Narrow', sans-serif",
};

export function fontStack(family: string): string {
  return FONT_STACKS[family] ?? `'${family.replace(/'/g, "")}', sans-serif`;
}

export function textLines(l: TextLayer): string[] {
  const t = l.uppercase ? l.text.toUpperCase() : l.text;
  return t.split("\n");
}

function shadowFilter(l: Layer): string {
  if (!l.shadow) return "";
  const s = l.shadow;
  return `<filter id="sh-${esc(l.id)}" x="-50%" y="-50%" width="200%" height="200%" color-interpolation-filters="sRGB"><feDropShadow dx="${n(s.dx)}" dy="${n(s.dy)}" stdDeviation="${n(s.blur / 2)}" flood-color="${esc(s.color)}" flood-opacity="${n(s.opacity)}"/></filter>`;
}

function gradientDef(l: Layer): string {
  if (l.type !== "background" || l.fill.kind === "solid") return "";
  const [a, b] = l.fill.colors;
  if (l.fill.kind === "radial") {
    return `<radialGradient id="bg-${esc(l.id)}" cx="50%" cy="50%" r="75%"><stop offset="0" stop-color="${esc(a)}"/><stop offset="1" stop-color="${esc(b)}"/></radialGradient>`;
  }
  const rad = (l.fill.angle * Math.PI) / 180;
  const x = Math.cos(rad) / 2;
  const y = Math.sin(rad) / 2;
  return `<linearGradient id="bg-${esc(l.id)}" x1="${n(0.5 - x)}" y1="${n(0.5 - y)}" x2="${n(0.5 + x)}" y2="${n(0.5 + y)}"><stop offset="0" stop-color="${esc(a)}"/><stop offset="1" stop-color="${esc(b)}"/></linearGradient>`;
}

function strokeAttrs(l: Layer, doubled = false): string {
  if (!l.stroke || l.stroke.width <= 0) return "";
  const w = doubled ? l.stroke.width * 2 : l.stroke.width;
  return ` stroke="${esc(l.stroke.color)}" stroke-width="${n(w)}" stroke-linejoin="round"`;
}

function polygon(points: [number, number][]): string {
  return points.map(([x, y]) => `${n(x)},${n(y)}`).join(" ");
}

function body(l: Layer): string {
  const w = l.w;
  const h = l.h;
  switch (l.type) {
    case "background": {
      const fill = l.fill.kind === "solid" ? esc(l.fill.colors[0]) : `url(#bg-${esc(l.id)})`;
      return `<rect x="0" y="0" width="${n(w)}" height="${n(h)}" fill="${fill}"/>`;
    }
    case "shape": {
      const fill = esc(l.fill);
      const st = strokeAttrs(l);
      if (l.shape === "ellipse") return `<ellipse cx="${n(w / 2)}" cy="${n(h / 2)}" rx="${n(w / 2)}" ry="${n(h / 2)}" fill="${fill}"${st}/>`;
      if (l.shape === "triangle") return `<polygon points="${polygon([[w / 2, 0], [w, h], [0, h]])}" fill="${fill}"${st}/>`;
      if (l.shape === "arrow") {
        const shaft = h * 0.36;
        const head = Math.min(w * 0.45, h * 1.2);
        return `<polygon points="${polygon([[0, (h - shaft) / 2], [w - head, (h - shaft) / 2], [w - head, 0], [w, h / 2], [w - head, h], [w - head, (h + shaft) / 2], [0, (h + shaft) / 2]])}" fill="${fill}"${st}/>`;
      }
      if (l.shape === "star") {
        const pts: [number, number][] = [];
        for (let i = 0; i < 10; i++) {
          const r = i % 2 === 0 ? 0.5 : 0.21;
          const a = -Math.PI / 2 + (i * Math.PI) / 5;
          pts.push([w / 2 + Math.cos(a) * w * r, h / 2 + Math.sin(a) * h * r]);
        }
        return `<polygon points="${polygon(pts)}" fill="${fill}"${st}/>`;
      }
      return `<rect x="0" y="0" width="${n(w)}" height="${n(h)}" rx="${n(l.radius)}" ry="${n(l.radius)}" fill="${fill}"${st}/>`;
    }
    case "text": {
      const lines = textLines(l);
      const ax = l.align === "middle" ? w / 2 : l.align === "end" ? w : 0;
      const tspans = lines
        .map((line, i) => `<tspan x="${n(ax)}" y="${n(l.fontSize * 0.86 + i * l.fontSize * l.lineHeight)}">${esc(line) || " "}</tspan>`)
        .join("");
      const style = `font-family="${esc(fontStack(l.fontFamily))}" font-size="${n(l.fontSize)}" font-weight="${l.fontWeight}"${l.italic ? ' font-style="italic"' : ""}${l.letterSpacing ? ` letter-spacing="${n(l.letterSpacing)}"` : ""}`;
      return `<text ${style} fill="${esc(l.color)}" text-anchor="${l.align}" paint-order="stroke"${strokeAttrs(l, true)} xml:space="preserve">${tspans}</text>`;
    }
    case "image": {
      const vb = `${n(l.crop.x * l.naturalW)} ${n(l.crop.y * l.naturalH)} ${n(Math.max(1, l.crop.w * l.naturalW))} ${n(Math.max(1, l.crop.h * l.naturalH))}`;
      const flip = l.flipX ? ` transform="translate(${n(w)} 0) scale(-1 1)"` : "";
      const img = `<svg x="0" y="0" width="${n(w)}" height="${n(h)}" viewBox="${vb}" preserveAspectRatio="none"><image width="${n(l.naturalW)}" height="${n(l.naturalH)}" href="${esc(l.src)}" xlink:href="${esc(l.src)}"/></svg>`;
      const border = l.stroke && l.stroke.width > 0 ? `<rect x="0" y="0" width="${n(w)}" height="${n(h)}" fill="none"${strokeAttrs(l, true)}/>` : "";
      return `<g${flip}>${img}</g>${border}`;
    }
  }
}

export function layerTransform(l: Layer): string {
  if (!l.rotation) return `translate(${n(l.x)} ${n(l.y)})`;
  return `translate(${n(l.x + l.w / 2)} ${n(l.y + l.h / 2)}) rotate(${n(l.rotation)}) translate(${n(-l.w / 2)} ${n(-l.h / 2)})`;
}

/** Definitions (gradients, filters) needed by one layer. */
export function layerDefs(l: Layer): string {
  return gradientDef(l) + shadowFilter(l);
}

/** One layer as an SVG group, in canvas coordinates. */
export function layerSvg(l: Layer, opts: { ignoreOpacity?: boolean } = {}): string {
  if (!l.visible) return "";
  const op = !opts.ignoreOpacity && l.opacity < 1 ? ` opacity="${n(l.opacity)}"` : "";
  const filter = l.shadow ? ` filter="url(#sh-${esc(l.id)})"` : "";
  return `<g id="${esc(l.id)}" data-name="${esc(l.name)}" transform="${layerTransform(l)}"${op}><g${filter}>${body(l)}</g></g>`;
}

export function docToSvg(doc: ThumbnailDoc, opts: { onlyLayerId?: string; ignoreOpacity?: boolean; width?: number; height?: number } = {}): string {
  const layers = opts.onlyLayerId ? doc.layers.filter((l) => l.id === opts.onlyLayerId) : doc.layers;
  const defs = layers.map(layerDefs).join("");
  const content = layers.map((l) => layerSvg(l, { ignoreOpacity: opts.ignoreOpacity ?? false })).join("\n");
  const w = opts.width ?? THUMB_W;
  const h = opts.height ?? THUMB_H;
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w}" height="${h}" viewBox="0 0 ${THUMB_W} ${THUMB_H}"><title>${esc(doc.name)}</title><defs>${defs}</defs>\n${content}\n</svg>`;
}

/** Approximate text box size when no browser measurement is available. */
export function estimateTextBox(l: TextLayer, measure?: (text: string, font: string) => number): { w: number; h: number } {
  const lines = textLines(l);
  const font = `${l.italic ? "italic " : ""}${l.fontWeight} ${l.fontSize}px ${fontStack(l.fontFamily)}`;
  const widths = lines.map((line) => (measure ? measure(line, font) : line.length * l.fontSize * 0.55) + Math.max(0, line.length - 1) * l.letterSpacing);
  const w = Math.max(20, ...widths) + (l.stroke ? l.stroke.width * 2 : 0);
  const h = Math.max(l.fontSize, l.fontSize * (0.15 + l.lineHeight * lines.length));
  return { w: Math.ceil(w), h: Math.ceil(h) };
}
