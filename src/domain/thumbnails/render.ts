// Renders thumbnail documents to SVG markup. Used by the editor canvas, the
// SVG export, PNG export (via the browser) and OpenRaster per-layer export.
import { THUMB_H, THUMB_W, type ImageLayer, type Layer, type ShapeLayer, type TextLayer, type ThumbnailDoc } from "./model.ts";
import { FONT_METRICS } from "./fontMetrics.ts";

export function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

const n = (v: number) => (Number.isFinite(v) ? Math.round(v * 100) / 100 : 0);

export const FONT_STACKS: Record<string, string> = {
  // Bundled with the app (public/fonts), so they look the same on every PC and in exports.
  Lato: "Lato, 'Segoe UI Black', 'Arial Black', sans-serif",
  Anton: "Anton, Impact, 'Arial Narrow Bold', sans-serif",
  "Archivo Black": "'Archivo Black', 'Arial Black', sans-serif",
  Bangers: "Bangers, Impact, sans-serif",
  "Luckiest Guy": "'Luckiest Guy', 'Arial Black', sans-serif",
  "Permanent Marker": "'Permanent Marker', 'Comic Sans MS', cursive",
  Cinzel: "Cinzel, Georgia, serif",
  // System fonts (kept for thumbnails made before 0.2.0).
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

function imageFilter(l: ImageLayer): string {
  const adj = l.adjust && (l.adjust.brightness !== 1 || l.adjust.saturate !== 1) ? l.adjust : null;
  const ol = l.outline && l.outline.width > 0 ? l.outline : null;
  if (!adj && !ol) return "";
  let f = `<filter id="im-${esc(l.id)}" x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="sRGB">`;
  let src = "SourceGraphic";
  if (adj) {
    f += `<feColorMatrix in="SourceGraphic" type="saturate" values="${n(adj.saturate)}" result="sat"/>`;
    f += `<feComponentTransfer in="sat" result="adj"><feFuncR type="linear" slope="${n(adj.brightness)}"/><feFuncG type="linear" slope="${n(adj.brightness)}"/><feFuncB type="linear" slope="${n(adj.brightness)}"/></feComponentTransfer>`;
    src = "adj";
  }
  if (ol) {
    f += `<feMorphology in="SourceAlpha" operator="dilate" radius="${n(ol.width)}" result="grow"/><feFlood flood-color="${esc(ol.color)}" result="ink"/><feComposite in="ink" in2="grow" operator="in" result="edge"/>`;
    f += `<feMerge><feMergeNode in="edge"/><feMergeNode in="${src}"/></feMerge>`;
  }
  return `${f}</filter>`;
}

function textFillDef(l: Layer): string {
  if (l.type !== "text" || !l.fill2) return "";
  return `<linearGradient id="tf-${esc(l.id)}" x1="0" y1="0" x2="0" y2="1"><stop offset="0.15" stop-color="${esc(l.color)}"/><stop offset="0.95" stop-color="${esc(l.fill2)}"/></linearGradient>`;
}

/** Points of the curved arrow's centre line and head, in a w×h box. */
export function curvedArrowGeometry(w: number, h: number): { path: string; head: [number, number][]; thickness: number } {
  const t = Math.max(6, Math.min(w, h) * 0.13);
  const x0 = w * 0.06;
  const y0 = h * 0.88;
  const cx = w * 0.12;
  const cy = h * 0.12;
  const x1 = w * 0.7;
  const y1 = h * 0.2;
  let dx = x1 - cx;
  let dy = y1 - cy;
  const len = Math.hypot(dx, dy) || 1;
  dx /= len;
  dy /= len;
  const hl = t * 2.6;
  const hw = t * 2.4;
  const tip: [number, number] = [x1 + dx * hl * 0.75, y1 + dy * hl * 0.75];
  const back: [number, number] = [x1 - dx * hl * 0.25, y1 - dy * hl * 0.25];
  const head: [number, number][] = [tip, [back[0] - dy * hw / 2, back[1] + dx * hw / 2], [back[0] + dy * hw / 2, back[1] - dx * hw / 2]];
  return { path: `M ${n(x0)} ${n(y0)} Q ${n(cx)} ${n(cy)} ${n(x1)} ${n(y1)}`, head, thickness: t };
}

function curvedArrow(l: ShapeLayer): string {
  const g = curvedArrowGeometry(l.w, l.h);
  const fill = esc(l.fill);
  let out = "";
  if (l.stroke && l.stroke.width > 0) {
    const sw = l.stroke.width;
    const c = esc(l.stroke.color);
    out += `<path d="${g.path}" fill="none" stroke="${c}" stroke-width="${n(g.thickness + sw * 2)}" stroke-linecap="round"/>`;
    out += `<polygon points="${polygon(g.head)}" fill="${c}" stroke="${c}" stroke-width="${n(sw * 2)}" stroke-linejoin="round"/>`;
  }
  out += `<path d="${g.path}" fill="none" stroke="${fill}" stroke-width="${n(g.thickness)}" stroke-linecap="round"/>`;
  out += `<polygon points="${polygon(g.head)}" fill="${fill}"/>`;
  return l.mirror ? `<g transform="translate(${n(l.w)} 0) scale(-1 1)">${out}</g>` : out;
}

/** Where each line's baseline sits inside a text box. */
export function lineBaselines(l: TextLayer, count: number): number[] {
  const m = FONT_METRICS[l.fontFamily];
  if (l.capBaseline && m) {
    const lh = l.fontSize * l.lineHeight;
    const cap = l.fontSize * m.capHeight;
    return Array.from({ length: count }, (_, i) => i * lh + (lh + cap) / 2);
  }
  return Array.from({ length: count }, (_, i) => l.fontSize * 0.86 + i * l.fontSize * l.lineHeight);
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
      if (l.shape === "curved-arrow") return curvedArrow(l);
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
      const style = `font-family="${esc(fontStack(l.fontFamily))}" font-size="${n(l.fontSize)}" font-weight="${l.fontWeight}"${l.italic ? ' font-style="italic"' : ""}${l.letterSpacing ? ` letter-spacing="${n(l.letterSpacing)}"` : ""}`;
      const fill = l.fill2 ? `url(#tf-${esc(l.id)})` : esc(l.color);
      if (l.arch && lines.length === 1) {
        // One line bent along an arc that spans the box width.
        const theta = (Math.min(170, Math.abs(l.arch)) * Math.PI) / 180;
        const r = w / (2 * Math.sin(theta / 2));
        const base = l.arch > 0 ? h - l.fontSize * 0.2 : l.fontSize * 0.9;
        const sweep = l.arch > 0 ? 1 : 0;
        const pid = `arc-${esc(l.id)}`;
        return `<path id="${pid}" d="M 0 ${n(base)} A ${n(r)} ${n(r)} 0 0 ${sweep} ${n(w)} ${n(base)}" fill="none"/><text ${style} fill="${fill}" paint-order="stroke"${strokeAttrs(l, true)} xml:space="preserve"><textPath href="#${pid}" xlink:href="#${pid}" startOffset="50%" text-anchor="middle">${esc(lines[0] ?? "")}</textPath></text>`;
      }
      const ys = lineBaselines(l, lines.length);
      const tspans = lines.map((line, i) => `<tspan x="${n(ax)}" y="${n(ys[i] ?? 0)}">${esc(line) || " "}</tspan>`).join("");
      return `<text ${style} fill="${fill}" text-anchor="${l.align}" paint-order="stroke"${strokeAttrs(l, true)} xml:space="preserve">${tspans}</text>`;
    }
    case "image": {
      const vb = `${n(l.crop.x * l.naturalW)} ${n(l.crop.y * l.naturalH)} ${n(Math.max(1, l.crop.w * l.naturalW))} ${n(Math.max(1, l.crop.h * l.naturalH))}`;
      const flip = l.flipX ? ` transform="translate(${n(w)} 0) scale(-1 1)"` : "";
      const img = `<svg x="0" y="0" width="${n(w)}" height="${n(h)}" viewBox="${vb}" preserveAspectRatio="none"><image width="${n(l.naturalW)}" height="${n(l.naturalH)}" href="${esc(l.src)}" xlink:href="${esc(l.src)}"/></svg>`;
      const border = l.stroke && l.stroke.width > 0 ? `<rect x="0" y="0" width="${n(w)}" height="${n(h)}" fill="none"${strokeAttrs(l, true)}/>` : "";
      const filt = imageFilter(l) ? ` filter="url(#im-${esc(l.id)})"` : "";
      return `<g${filt}><g${flip}>${img}</g></g>${border}`;
    }
  }
}

export function layerTransform(l: Layer): string {
  if (!l.rotation) return `translate(${n(l.x)} ${n(l.y)})`;
  return `translate(${n(l.x + l.w / 2)} ${n(l.y + l.h / 2)}) rotate(${n(l.rotation)}) translate(${n(-l.w / 2)} ${n(-l.h / 2)})`;
}

/** Definitions (gradients, filters) needed by one layer. */
export function layerDefs(l: Layer): string {
  return gradientDef(l) + shadowFilter(l) + textFillDef(l) + (l.type === "image" ? imageFilter(l) : "");
}

/** One layer as an SVG group, in canvas coordinates. */
export function layerSvg(l: Layer, opts: { ignoreOpacity?: boolean } = {}): string {
  if (!l.visible) return "";
  const op = !opts.ignoreOpacity && l.opacity < 1 ? ` opacity="${n(l.opacity)}"` : "";
  const filter = l.shadow ? ` filter="url(#sh-${esc(l.id)})"` : "";
  return `<g id="${esc(l.id)}" data-name="${esc(l.name)}" transform="${layerTransform(l)}"${op}><g${filter}>${body(l)}</g></g>`;
}

export function docToSvg(doc: ThumbnailDoc, opts: { onlyLayerId?: string; ignoreOpacity?: boolean; width?: number; height?: number; fontCss?: string } = {}): string {
  const layers = opts.onlyLayerId ? doc.layers.filter((l) => l.id === opts.onlyLayerId) : doc.layers;
  const defs = layers.map(layerDefs).join("");
  const content = layers.map((l) => layerSvg(l, { ignoreOpacity: opts.ignoreOpacity ?? false })).join("\n");
  const w = opts.width ?? THUMB_W;
  const h = opts.height ?? THUMB_H;
  const style = opts.fontCss ? `<style>${opts.fontCss}</style>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w}" height="${h}" viewBox="0 0 ${THUMB_W} ${THUMB_H}"><title>${esc(doc.name)}</title><defs>${style}${defs}</defs>\n${content}\n</svg>`;
}

/** Approximate text box size when no browser measurement is available. */
export function estimateTextBox(l: TextLayer, measure?: (text: string, font: string) => number): { w: number; h: number } {
  const lines = textLines(l);
  const m = FONT_METRICS[l.fontFamily];
  if (m && !measure) {
    // Bundled font: exact advance widths, no browser needed.
    const sw = l.stroke ? l.stroke.width * 2 : 0;
    const w = Math.max(20, ...lines.map((line) => measureWithMetrics(line, l.fontFamily, l.fontSize, l.letterSpacing))) + sw;
    const h = l.capBaseline ? l.fontSize * l.lineHeight * lines.length + sw : Math.max(l.fontSize, l.fontSize * (0.15 + l.lineHeight * lines.length));
    return { w: Math.ceil(w), h: Math.ceil(h) };
  }
  const font = `${l.italic ? "italic " : ""}${l.fontWeight} ${l.fontSize}px ${fontStack(l.fontFamily)}`;
  const widths = lines.map((line) => (measure ? measure(line, font) : line.length * l.fontSize * 0.55) + Math.max(0, line.length - 1) * l.letterSpacing);
  const w = Math.max(20, ...widths) + (l.stroke ? l.stroke.width * 2 : 0);
  const h = Math.max(l.fontSize, l.fontSize * (0.15 + l.lineHeight * lines.length));
  return { w: Math.ceil(w), h: Math.ceil(h) };
}

/** Width of one line in a bundled font, from its metrics (kerning ignored, so slightly generous). */
export function measureWithMetrics(text: string, family: string, size: number, letterSpacing = 0): number {
  const m = FONT_METRICS[family];
  if (!m) return text.length * size * 0.55;
  const t = m.lower ? text : text.toUpperCase();
  let wsum = 0;
  for (const ch of t) wsum += m.widths[ch] ?? m.fallback;
  return wsum * size + Math.max(0, [...t].length - 1) * letterSpacing;
}
