// v0.2.0: thumbnail concepts in the styles of Tamster's own uploads, built from real images, never broken.
import { test } from "node:test";
import assert from "node:assert/strict";
import { composeConcepts, fitText, type ComposeInput } from "../src/domain/thumbnails/compose.ts";
import { checkDoc, layerBox, visibleBox, TIMESTAMP_ZONE, overlapRatio } from "../src/domain/thumbnails/quality.ts";
import { measureWithMetrics, docToSvg } from "../src/domain/thumbnails/render.ts";
import { THUMB_W, THUMB_H, newDoc, newText, parseDoc, serializeDoc, type ImageLayer, type TextLayer } from "../src/domain/thumbnails/model.ts";
import { THUMB_STYLES } from "../src/domain/thumbnails/styles.ts";

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const shot = (w = 1920, h = 1080) => ({ src: PNG, w, h });
const me = { src: PNG, w: 900, h: 1000, alphaBox: { x: 0.15, y: 0.05, w: 0.7, h: 0.95 } };

const base: ComposeInput = { headline: "Only the journal's directions", backgrounds: [shot(), shot(1280, 720)], cutouts: [me], seed: 2 };

test("three or more different concepts from real images, each from a style seen on the channel", () => {
  const r = composeConcepts({ ...base, lines: ["No wiki", "No quest markers", "Only the journal"], errorTitle: "Morrowind.exe" });
  assert.ok(r.concepts.length >= 3, r.notes.join(" "));
  assert.equal(new Set(r.concepts.map((c) => c.style.id)).size, r.concepts.length, "all different styles");
  for (const c of r.concepts) {
    assert.ok(c.style.seenIn.length > 0, `${c.style.id} comes from Tamster's uploads`);
    assert.ok(c.doc.layers.some((l) => l.type === "image" && l.role === "backdrop"), "built on a real screenshot");
    assert.ok(!c.doc.layers.some((l) => l.type === "shape" && /slot|placeholder/i.test(l.name)), "no placeholder boxes");
    assert.deepEqual(checkDoc(c.doc).filter((i) => i.level === "error"), [], `${c.id} passes every check`);
  }
});

test("text never overlaps the face, other text, the arrow, the edges or YouTube's timestamp", () => {
  for (let seed = 1; seed <= 12; seed++) {
    const r = composeConcepts({ ...base, seed, headline: ["Only the journal's directions", "I got lost again", "Fargoth", "Why is this mudcrab so rich?"][seed % 4]!, lines: ["No wiki", "No markers", "Only the journal", "No fast travel"], experimental: seed % 2 === 0, count: 6 });
    for (const c of r.concepts) {
      const texts = c.doc.layers.filter((l): l is TextLayer => l.type === "text" && l.role !== "dialog");
      const faces = c.doc.layers.filter((l): l is ImageLayer => l.type === "image" && l.role === "face");
      for (const t of texts) {
        const b = layerBox(t);
        assert.ok(b.x >= 0 && b.y >= 0 && b.x + b.w <= THUMB_W && b.y + b.h <= THUMB_H, `${c.id}: "${t.text}" inside the frame`);
        assert.ok(overlapRatio(b, TIMESTAMP_ZONE) <= 0.05, `${c.id}: clear of the timestamp`);
        for (const f of faces) assert.ok(overlapRatio(b, visibleBox(f)) <= 0.08, `${c.id}: "${t.text}" clear of the face`);
      }
    }
  }
});

test("no screenshot means no concepts: words on a plain colour block are not offered", () => {
  const r = composeConcepts({ ...base, backgrounds: [] });
  assert.equal(r.concepts.length, 0);
  assert.match(r.notes[0] ?? "", /screenshot/);
});

test("without a cut-out, face styles are skipped and the reason is given", () => {
  const r = composeConcepts({ ...base, cutouts: [], lines: ["No wiki", "No markers", "Only the journal"], bigWord: "LOST" });
  assert.ok(r.concepts.every((c) => c.style.needs.face !== "required"));
  assert.ok(r.notes.some((n) => /cut-out of you/.test(n)));
});

test("rules lists and split labels only use words you gave; nothing is invented", () => {
  const r = composeConcepts({ ...base, count: 9, experimental: true, backgrounds: [shot(), shot()] });
  assert.ok(!r.concepts.some((c) => c.style.id === "rules"), "no list without lines");
  assert.ok(!r.concepts.some((c) => c.style.id === "split"), "no split without labels");
  const words = new Set("only the journal's directions".split(" "));
  for (const c of r.concepts) for (const l of c.doc.layers) if (l.type === "text" && l.role !== "dialog") for (const w of l.text.toLowerCase().split(/\s+/)) assert.ok(words.has(w), `${c.id}: "${w}" came from your headline`);
});

test("'inspired by' puts that style first with its colours and side", () => {
  const r = composeConcepts({ ...base, reference: { styleId: "reaction-arrow", palette: ["#ffe14d", "#1fa2ff"], faceSide: "left" } });
  const first = r.concepts[0]!;
  assert.equal(first.style.id, "reaction-arrow");
  const t = first.doc.layers.find((l): l is TextLayer => l.type === "text")!;
  assert.equal(t.color, "#ffe14d");
  const f = first.doc.layers.find((l): l is ImageLayer => l.role === "face")!;
  assert.ok(f.x < THUMB_W / 2, "face on the left like the reference");
});

test("text fitting uses real font metrics: bigger for short words, never wider than the box", () => {
  const short = fitText("LOST", { family: "Anton", maxW: 600, maxH: 300, maxLines: 1 })!;
  const long = fitText("Only the journal's directions", { family: "Lato", maxW: 600, maxH: 300, maxLines: 3 })!;
  assert.ok(short.size > long.size);
  for (const line of long.lines) assert.ok(measureWithMetrics(line, "Lato", long.size) <= 600);
  assert.equal(fitText("Supercalifragilisticexpialidocious nonsense words", { family: "Lato", maxW: 200, maxH: 60, maxLines: 1, minSize: 48 }), null);
});

test("quality checks catch the v0.1.3 problems: overlapping text and text over the timestamp", () => {
  const d = newDoc("bad");
  const a: TextLayer = { ...newText("PLAYING.EXE", 60), x: 100, y: 100, w: 400, h: 80 };
  const b: TextLayer = { ...newText("PLAYING.EXE", 60), x: 120, y: 110, w: 400, h: 80 };
  const c: TextLayer = { ...newText("timestamp", 40), x: THUMB_W - 180, y: THUMB_H - 70, w: 170, h: 50 };
  d.layers.push(a, b, c);
  const issues = checkDoc(d);
  assert.ok(issues.some((i) => i.code === "overlap-text" && i.level === "error"));
  assert.ok(issues.some((i) => i.code === "timestamp"));
});

test("v1 thumbnails still open and render; v2 fields survive a save", () => {
  const v1 = JSON.stringify({ ...newDoc("old"), version: 1 });
  assert.equal(parseDoc(v1).layers.length, 1);
  const r = composeConcepts(base);
  const d = r.concepts[0]!.doc;
  const again = parseDoc(serializeDoc(d));
  assert.deepEqual(again.layers.map((l) => l.role), d.layers.map((l) => l.role));
  const svg = docToSvg(d, { fontCss: "@font-face{}" });
  assert.match(svg, /<style>@font-face/);
  assert.match(svg, /feMorphology/, "sticker outline around the cut-out");
});

test("every style is described with where it was seen", () => {
  for (const s of THUMB_STYLES) assert.ok(s.look.length > 20 && (s.experimental || s.seenIn.length > 0), s.id);
});
