// v0.2.0: layered PSD export (for Affinity Photo) and the face-cutout pixel work.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPsd, opaqueBounds, packBits, unpackBits } from "../src/domain/thumbnails/psd.ts";
import { alphaBounds, applyMask, keepLargest, refineAlpha, resizeGray, workingSize, CUT_SIZE } from "../src/domain/thumbnails/cutout.ts";

const rgba = (w: number, h: number, f: (x: number, y: number) => [number, number, number, number]) => {
  const a = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) a.set(f(x, y), (y * w + x) * 4);
  return a;
};

test("PackBits round-trips runs, literals and long rows", () => {
  const rows = [
    Uint8Array.from([]),
    Uint8Array.from([7]),
    Uint8Array.from([1, 1, 1, 1, 2, 3, 4, 4, 5, 5, 5]),
    Uint8Array.from(Array.from({ length: 300 }, (_, i) => (i < 200 ? 9 : i % 7))),
    Uint8Array.from(Array.from({ length: 1280 }, (_, i) => (i * 31) % 256)),
  ];
  for (const r of rows) assert.deepEqual(unpackBits(packBits(r), r.length), r);
  assert.ok(packBits(new Uint8Array(1280)).length < 30, "flat rows compress");
});

test("a PSD has the Photoshop header, named layers bottom-to-top, opacity and hidden flags", () => {
  const W = 64;
  const H = 36;
  const bg = rgba(W, H, () => [20, 40, 60, 255]);
  const dot = rgba(W, H, (x, y) => (x >= 10 && x < 20 && y >= 5 && y < 15 ? [255, 0, 0, 255] : [0, 0, 0, 0]));
  const empty = new Uint8Array(W * H * 4);
  const psd = buildPsd(W, H, [
    { name: "Screenshot", rgba: bg, opacity: 1, visible: true },
    { name: "Ты — face", rgba: dot, opacity: 0.5, visible: true },
    { name: "Hidden", rgba: empty, opacity: 1, visible: false },
  ], bg);
  const dv = new DataView(psd.buffer, psd.byteOffset, psd.byteLength);
  assert.equal(String.fromCharCode(...psd.subarray(0, 4)), "8BPS");
  assert.equal(dv.getUint16(4), 1);
  assert.equal(dv.getUint32(14), H);
  assert.equal(dv.getUint32(18), W);
  assert.equal(dv.getUint16(24), 3, "RGB");
  // colour mode (0) + resources (0), then layer section
  let o = 26 + 4 + 4;
  const lmLen = dv.getUint32(o);
  o += 4;
  const liLen = dv.getUint32(o);
  assert.ok(liLen > 0 && liLen <= lmLen && liLen % 2 === 0);
  o += 4;
  assert.equal(dv.getInt16(o), 3, "three layers");
  o += 2;
  // first record = bottom layer, full canvas
  assert.deepEqual([dv.getInt32(o), dv.getInt32(o + 4), dv.getInt32(o + 8), dv.getInt32(o + 12)], [0, 0, H, W]);
  const text = new TextDecoder("latin1").decode(psd);
  assert.ok(text.includes("Screenshot") && text.includes("luni") && text.includes("Hidden"));
  // second record trimmed to the red square
  const rec = 16 + 2 + 4 * 6 + 4 + 4 + 4 + 4;
  const extraLen = dv.getUint32(o + rec - 4);
  const o2 = o + rec + extraLen;
  assert.deepEqual([dv.getInt32(o2), dv.getInt32(o2 + 4), dv.getInt32(o2 + 8), dv.getInt32(o2 + 12)], [5, 10, 15, 20]);
  const blend = o2 + 16 + 2 + 4 * 6;
  assert.equal(String.fromCharCode(...psd.subarray(blend, blend + 8)), "8BIMnorm");
  assert.equal(psd[blend + 8], 128, "50% opacity");
  assert.equal(psd[blend + 10], 0, "visible");
  assert.equal(opaqueBounds(empty, W, H), null);
});

test("PSD rejects mismatched sizes instead of writing a broken file", () => {
  assert.throws(() => buildPsd(4, 4, [], new Uint8Array(10)));
  assert.throws(() => buildPsd(4, 4, [{ name: "x", rgba: new Uint8Array(8), opacity: 1, visible: true }], new Uint8Array(64)));
});

test("cutout: the 320×320 mask is scaled to the photo, cropped to you, with the visible box recorded", () => {
  const W = 400;
  const H = 300;
  const photo = rgba(W, H, (x) => [x % 256, 100, 200, 255]);
  // A person-shaped blob in the mask: a circle centred at (200,170) of radius 80 (mask coordinates).
  const mask = new Uint8Array(CUT_SIZE * CUT_SIZE);
  for (let y = 0; y < CUT_SIZE; y++) for (let x = 0; x < CUT_SIZE; x++) mask[y * CUT_SIZE + x] = (x - 200) ** 2 + (y - 170) ** 2 < 80 ** 2 ? 255 : 0;
  // A stray speck that should be dropped.
  for (let y = 10; y < 14; y++) for (let x = 10; x < 14; x++) mask[y * CUT_SIZE + x] = 255;
  const r = applyMask(photo, W, H, mask)!;
  assert.ok(r);
  assert.ok(r.w < W && r.h <= H, "cropped");
  assert.ok(r.alphaBox.x > 0 && r.alphaBox.y > 0 && r.alphaBox.w < 1 && r.alphaBox.h < 1);
  // The circle spans 160/320 of the width -> 200 px of 400.
  assert.ok(Math.abs(r.alphaBox.w * r.w - 200) < 6, `width ${r.alphaBox.w * r.w}`);
  // Corners are transparent, centre opaque, colour kept.
  assert.equal(r.rgba[3], 0);
  const c = ((Math.round(r.h / 2) * r.w + Math.round(r.w / 2)) * 4) | 0;
  assert.equal(r.rgba[c + 3], 255);
  assert.equal(r.rgba[c + 1], 100);
  assert.ok(r.coverage > 0.17 && r.coverage < 0.23, `coverage ${r.coverage}`); // an ellipse of pi*100*75 px in 400x300
});

test("cutout: nothing found means no cut-out, not an empty layer", () => {
  assert.equal(applyMask(new Uint8Array(40 * 40 * 4), 40, 40, new Uint8Array(CUT_SIZE * CUT_SIZE)), null);
});

test("cutout helpers: resize, edge firming, largest shape, working size", () => {
  assert.deepEqual(Array.from(resizeGray([0, 255, 0, 255], 2, 2, 2, 2)), [0, 255, 0, 255]);
  const big = resizeGray([0, 255], 2, 1, 4, 1);
  assert.ok(big[0]! <= big[1]! && big[1]! <= big[2]! && big[2]! <= big[3]!);
  const r = refineAlpha(Uint8Array.from([0, 40, 128, 220, 255]));
  assert.equal(r[0], 0);
  assert.equal(r[1], 0);
  assert.equal(r[4], 255);
  assert.ok(Math.abs(r[2]! - 128) < 4);
  const two = new Uint8Array(10 * 3);
  two.set([255, 255, 255], 0);
  two.set([255], 9);
  assert.deepEqual(alphaBounds(keepLargest(two, 10, 3), 10, 3), { x: 0, y: 0, w: 3, h: 1 });
  assert.deepEqual(workingSize(4000, 3000), { w: 1600, h: 1200 });
  assert.deepEqual(workingSize(800, 600), { w: 800, h: 600 });
});

test("schema v6 keeps a library of cut-outs and screenshots, and leaves old data alone", async () => {
  const { memoryDb } = await import("./helpers/sqliteDb.ts");
  const { migrate } = await import("../src/db/migrate.ts");
  const repo = await import("../src/db/repos.ts");
  const db = memoryDb();
  await migrate(db);
  const a = await repo.addThumbAsset(db, { kind: "cutout", name: "Me, shocked", projectId: null, src: "data:image/png;base64,AAAA", preview: "data:image/png;base64,AA", w: 800, h: 1000, alphaBox: { x: 0.1, y: 0.05, w: 0.8, h: 0.95 } });
  await repo.addThumbAsset(db, { kind: "screenshot", name: "Seyda Neen", projectId: null, src: "data:image/jpeg;base64,BBBB", preview: "", w: 1920, h: 1080, alphaBox: null });
  const cuts = await repo.listThumbAssets(db, "cutout");
  assert.equal(cuts.length, 1);
  assert.equal(cuts[0]!.src, "", "lists don't load full images");
  assert.deepEqual(cuts[0]!.alphaBox, { x: 0.1, y: 0.05, w: 0.8, h: 0.95 });
  assert.equal((await repo.getThumbAsset(db, a.id))!.src, "data:image/png;base64,AAAA");
  assert.equal((await repo.listThumbAssets(db)).length, 2);
  await assert.rejects(repo.addThumbAsset(db, { kind: "screenshot", name: "x", projectId: null, src: "https://example.com/x.png", preview: "", w: 1, h: 1, alphaBox: null }));
  await repo.deleteThumbAsset(db, a.id);
  assert.equal((await repo.listThumbAssets(db, "cutout")).length, 0);
});

test("upgrading a 0.1.3 database to schema v6 keeps every thumbnail and project exactly as it was", async () => {
  const { memoryDb } = await import("./helpers/sqliteDb.ts");
  const { migrate } = await import("../src/db/migrate.ts");
  const { MIGRATIONS } = await import("../src/db/migrations.ts");
  const repo = await import("../src/db/repos.ts");
  const { newDoc, newText, serializeDoc, parseDoc } = await import("../src/domain/thumbnails/model.ts");
  const db = memoryDb();
  await migrate(db, MIGRATIONS.filter((m) => m.version <= 5));
  const p = await repo.createProject(db, { title: "Morrowind with only the journal" });
  const old = newDoc("v0.1.3 thumbnail");
  old.version = 1;
  old.layers.push({ ...newText("PLAYING MORROWIND", 90), fontFamily: "Impact" });
  const t = await repo.saveThumbnail(db, { projectId: p.id, name: "old", doc: serializeDoc(old), preview: "data:image/jpeg;base64,AA" });
  const r = await migrate(db);
  assert.deepEqual(r.applied.map((x) => x.split(":")[0]), ["6"]);
  const back = await repo.getThumbnail(db, t.id);
  assert.equal(back!.doc, serializeDoc(old), "stored document untouched");
  assert.equal(back!.projectId, p.id);
  assert.equal(parseDoc(back!.doc).layers[1]!.type, "text");
  assert.equal((await repo.getProject(db, p.id))!.title, "Morrowind with only the journal");
});
