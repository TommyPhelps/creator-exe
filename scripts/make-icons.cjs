// Regenerates src-tauri/icons from assets/app-icon.svg (needs `sharp`).
const sharp = require("sharp");
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const svg = fs.readFileSync(path.join(root, "assets/app-icon.svg"));
const out = path.join(root, "src-tauri/icons");
async function png(size) { return sharp(svg, { density: 384 }).resize(size, size).png().toBuffer(); }
(async () => {
  const files = { "32x32.png": 32, "128x128.png": 128, "128x128@2x.png": 256, "icon.png": 512 };
  for (const [name, size] of Object.entries(files)) fs.writeFileSync(path.join(out, name), await png(size));
  // ICO containing PNG-compressed images (supported since Windows Vista).
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const images = await Promise.all(sizes.map(png));
  const header = Buffer.alloc(6); header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(sizes.length, 4);
  const dir = Buffer.alloc(16 * sizes.length);
  let offset = 6 + dir.length;
  sizes.forEach((s, i) => {
    const e = i * 16;
    dir.writeUInt8(s >= 256 ? 0 : s, e); dir.writeUInt8(s >= 256 ? 0 : s, e + 1);
    dir.writeUInt8(0, e + 2); dir.writeUInt8(0, e + 3);
    dir.writeUInt16LE(1, e + 4); dir.writeUInt16LE(32, e + 6);
    dir.writeUInt32LE(images[i].length, e + 8); dir.writeUInt32LE(offset, e + 12);
    offset += images[i].length;
  });
  fs.writeFileSync(path.join(out, "icon.ico"), Buffer.concat([header, dir, ...images]));
  console.log("icons written");
})();
