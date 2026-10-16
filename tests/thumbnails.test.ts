import { test } from "node:test";
import assert from "node:assert/strict";
import { addLayer, duplicateLayer, newDoc, newImage, newShape, newText, parseDoc, removeLayer, reorderLayer, serializeDoc, updateLayer, THUMB_W } from "../src/domain/thumbnails/model.ts";
import { docToSvg, estimateTextBox, layerSvg } from "../src/domain/thumbnails/render.ts";
import { History, snap } from "../src/domain/thumbnails/history.ts";
import { CONCEPTS, buildAllConcepts, wrapHeadline } from "../src/domain/thumbnails/concepts.ts";
import { createZip, crc32, readStoredZip } from "../src/domain/thumbnails/zip.ts";
import { buildOra } from "../src/domain/thumbnails/ora.ts";

const PNG_1PX = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

test("layer operations are immutable and ordered bottom to top", () => {
  const d0 = newDoc("t");
  const t = newText("HELLO");
  const s = newShape("ellipse");
  const d1 = addLayer(addLayer(d0, t), s);
  assert.equal(d0.layers.length, 1);
  assert.deepEqual(d1.layers.map((l) => l.type), ["background", "text", "shape"]);
  const d2 = reorderLayer(d1, s.id, -1);
  assert.deepEqual(d2.layers.map((l) => l.type), ["background", "shape", "text"]);
  assert.equal(reorderLayer(d1, t.id, Infinity).layers.at(-1)?.id, t.id);
  const d3 = updateLayer(d1, t.id, { x: 500, locked: true });
  assert.equal(d3.layers[1]?.x, 500);
  assert.equal(d1.layers[1]?.x, t.x);
  const dup = duplicateLayer(d3, t.id);
  assert.equal(dup.doc.layers.length, 4);
  assert.equal(dup.doc.layers[2]?.locked, false);
  assert.equal(removeLayer(dup.doc, dup.newId!).layers.length, 3);
});

test("undo/redo history", () => {
  const h = new History(1);
  h.push(2);
  h.push(3);
  h.replace(4);
  assert.equal(h.undo(), 2);
  assert.equal(h.redo(), 4);
  assert.equal(h.canRedo, false);
  h.undo();
  h.push(9);
  assert.equal(h.canRedo, false, "a new edit clears redo");
  assert.equal(h.undo(), 2);
  assert.equal(h.undo(), 1);
  assert.equal(h.undo(), 1);
});

test("snapping prefers guides over the grid", () => {
  assert.deepEqual(snap(637, [640], 20), { value: 640, guide: 640 });
  assert.deepEqual(snap(47, [640], 20), { value: 40, guide: null });
  assert.deepEqual(snap(47, [], null), { value: 47, guide: null });
});

test("SVG export keeps every layer separately editable", () => {
  let d = newDoc("Test <&>");
  const t = { ...newText("Big & \"bold\"\nline two"), uppercase: true };
  d = addLayer(d, t);
  d = addLayer(d, { ...newImage(PNG_1PX, 100, 100, "Photo"), crop: { x: 0.25, y: 0, w: 0.5, h: 1 }, flipX: true });
  d = addLayer(d, { ...newShape("star"), rotation: 30, opacity: 0.5 });
  d = addLayer(d, { ...newShape("rect"), visible: false });
  const svg = docToSvg(d);
  assert.ok(svg.startsWith("<svg"));
  assert.ok(svg.includes("<title>Test &lt;&amp;&gt;</title>"));
  assert.equal((svg.match(/<g id="/g) ?? []).length, 4, "hidden layer omitted, others are separate groups");
  assert.ok(svg.includes("BIG &amp; &quot;BOLD&quot;"));
  assert.ok(svg.includes("<tspan") && svg.includes("LINE TWO"));
  assert.ok(svg.includes('paint-order="stroke"'));
  assert.ok(svg.includes("feDropShadow"));
  assert.ok(svg.includes("rotate(30)") && svg.includes('opacity="0.5"'));
  assert.ok(svg.includes('xlink:href="data:image/png'));
  assert.ok(svg.includes("scale(-1 1)"));
  assert.ok(svg.includes('viewBox="25 0 50 100"'));
  const only = docToSvg(d, { onlyLayerId: t.id });
  assert.equal((only.match(/<g id="/g) ?? []).length, 1);
  assert.equal(layerSvg({ ...t, visible: false }), "");
});

test("native documents round-trip and reject unsafe or broken input", () => {
  const d = addLayer(newDoc("x"), newImage(PNG_1PX, 10, 10));
  const back = parseDoc(serializeDoc(d));
  assert.deepEqual(back.layers.map((l) => l.id), d.layers.map((l) => l.id));
  assert.throws(() => parseDoc("{"), /not valid JSON/);
  assert.throws(() => parseDoc(JSON.stringify({ format: "other" })), /not a CREATOR.EXE/);
  const remote = JSON.parse(serializeDoc(d));
  remote.layers[1].src = "https://example.com/x.png";
  assert.throws(() => parseDoc(JSON.stringify(remote)), /embed/);
  const nan = JSON.parse(serializeDoc(d));
  nan.layers[0].x = "left";
  assert.throws(() => parseDoc(JSON.stringify(nan)), /invalid x/);
  const future = JSON.parse(serializeDoc(d));
  future.version = 99;
  assert.throws(() => parseDoc(JSON.stringify(future)), /newer/);
});

test("every concept builds editable layers from the creator's words only", () => {
  const results = buildAllConcepts({ headline: "I used Windows 98 for a week" });
  assert.equal(results.length, CONCEPTS.length);
  assert.ok(results.length >= 7);
  for (const { concept, doc } of results) {
    assert.ok(doc.layers.length >= 2, concept.id);
    assert.ok(doc.layers.some((l) => l.type === "text"), concept.id);
    for (const f of ["premise", "layout", "placement", "background", "typography", "imageNeeds", "reasoning", "drawbacks"] as const) assert.ok(concept[f].length > 3);
    const words = doc.layers.filter((l) => l.type === "text").map((l) => (l.type === "text" ? l.text : "")).join(" ").toLowerCase();
    assert.ok(/windows|week|used|i/.test(words), concept.id);
    assert.doesNotThrow(() => parseDoc(serializeDoc(doc)));
    for (const l of doc.layers) assert.ok(l.x > -THUMB_W && l.x < THUMB_W * 2, `${concept.id} ${l.name} on canvas`);
  }
  const withImage = buildAllConcepts({ headline: "Hi", image: newImage(PNG_1PX, 1600, 900) });
  const bold = withImage.find((r) => r.concept.id === "bold")!;
  const img = bold.doc.layers.find((l) => l.type === "image");
  assert.ok(img && img.type === "image" && img.crop.w < 1, "image is cropped to cover its slot");
  assert.equal(wrapHeadline("one two three four five six", 9, 2), "one two\nthree four five six");
});

test("text boxes grow with content", () => {
  const small = estimateTextBox({ ...newText("Hi"), stroke: null });
  const big = estimateTextBox({ ...newText("Hello there\nsecond line"), stroke: null });
  assert.ok(big.w > small.w && big.h > small.h);
});

test("zip writer produces a valid store-only archive", () => {
  assert.equal(crc32(new TextEncoder().encode("123456789")), 0xcbf43926);
  const z = createZip([
    { name: "mimetype", data: new TextEncoder().encode("image/openraster") },
    { name: "data/a.png", data: new Uint8Array([1, 2, 3]) },
  ]);
  assert.equal(new DataView(z.buffer).getUint32(0, true), 0x04034b50);
  const entries = readStoredZip(z);
  assert.deepEqual(entries.map((e) => e.name), ["mimetype", "data/a.png"]);
  assert.equal(new TextDecoder().decode(z.subarray(30, 38)), "mimetype", "mimetype is the first, uncompressed entry");
  const tail = new DataView(z.buffer, z.length - 22);
  assert.equal(tail.getUint32(0, true), 0x06054b50);
  assert.equal(tail.getUint16(10, true), 2);
});

test("OpenRaster export lists layers top-first with their own PNGs", () => {
  const d = addLayer(newDoc("o"), newText("T"));
  const png = new Uint8Array([137, 80, 78, 71]);
  const ora = buildOra(d, d.layers.map((l, i) => ({ id: l.id, name: l.name, png: new Uint8Array([i]), opacity: 1, visible: true })), png, png);
  const entries = readStoredZip(ora);
  assert.equal(entries[0]?.name, "mimetype");
  const stack = new TextDecoder().decode(entries.find((e) => e.name === "stack.xml")!.data);
  const order = [...stack.matchAll(/name="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(order, ["Text", "Background"]);
  assert.ok(entries.some((e) => e.name === "mergedimage.png"));
  assert.ok(entries.some((e) => e.name === "Thumbnails/thumbnail.png"));
  assert.equal(entries.filter((e) => e.name.startsWith("data/")).length, 2);
});
