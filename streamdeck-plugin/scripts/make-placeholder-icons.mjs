// Generates the PNG assets the manifest references, using only Node's built-in zlib
// (no native deps, no `canvas`). Run with: npm run icons
//
// Draws a simple "hotbar" mark — a row/grid of keys with one highlighted — so the plugin is
// recognisable in the Stream Deck category list and action picker.

import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import zlib from "node:zlib";

// --- minimal PNG encoder (8-bit RGBA) ------------------------------------
const crcTable = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

/** Simple RGBA canvas with a rect fill; enough for flat icon art. */
function canvas(w, h, bg = [0, 0, 0, 0]) {
  const px = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    px[i * 4] = bg[0]; px[i * 4 + 1] = bg[1]; px[i * 4 + 2] = bg[2]; px[i * 4 + 3] = bg[3];
  }
  return {
    w, h, px,
    rect(x0, y0, rw, rh, [r, g, b, a = 255]) {
      for (let y = Math.max(0, y0); y < Math.min(h, y0 + rh); y++) {
        for (let x = Math.max(0, x0); x < Math.min(w, x0 + rw); x++) {
          const o = (y * w + x) * 4;
          px[o] = r; px[o + 1] = g; px[o + 2] = b; px[o + 3] = a;
        }
      }
    },
    toPng() {
      const ihdr = Buffer.alloc(13);
      ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
      ihdr[8] = 8; ihdr[9] = 6;
      const rows = [];
      for (let y = 0; y < h; y++) {
        rows.push(Buffer.from([0]));                       // filter: none
        rows.push(px.subarray(y * w * 4, (y + 1) * w * 4));
      }
      return Buffer.concat([
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
        chunk("IHDR", ihdr),
        chunk("IDAT", zlib.deflateSync(Buffer.concat(rows))),
        chunk("IEND", Buffer.alloc(0)),
      ]);
    },
  };
}

const DARK = [24, 27, 33, 255];
const CELL = [55, 62, 74, 255];
const GREEN = [88, 170, 90, 255];

/** A row of `n` cells with one highlighted — the "hotbar with selected slot" mark. */
function hotbarMark(size, cols, rows, transparentBg) {
  const c = canvas(size, size, transparentBg ? [0, 0, 0, 0] : DARK);
  const pad = Math.max(1, Math.round(size * 0.10));
  const gap = Math.max(1, Math.round(size * 0.05));
  const cw = (size - pad * 2 - gap * (cols - 1)) / cols;
  const ch = (size - pad * 2 - gap * (rows - 1)) / rows;
  const selCol = Math.floor(cols / 2);
  const selRow = Math.floor(rows / 2);
  for (let r = 0; r < rows; r++) {
    for (let k = 0; k < cols; k++) {
      const x = Math.round(pad + k * (cw + gap));
      const y = Math.round(pad + r * (ch + gap));
      const on = k === selCol && r === selRow;
      c.rect(x, y, Math.round(cw), Math.round(ch), on ? GREEN : CELL);
    }
  }
  return c;
}

function write(path, buf) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, buf);
  console.log("wrote", path);
}

/**
 * Write only if the file is missing. Used for assets that real artwork may own
 * (see branding/make-branding.ps1) — this script must never clobber that artwork,
 * but still has to produce *something* so a fresh clone can load the plugin.
 */
function writeIfMissing(path, makeBuf) {
  if (existsSync(path)) {
    console.log("kept  ", path, "(existing artwork)");
    return;
  }
  write(path, makeBuf());
}

const base = "com.fluffybacon.deckcraft-hotbar.sdPlugin/imgs";

// Marketplace / plugin icon: real artwork owns these (branding/make-branding.ps1).
// Only fall back to the drawn mark when the artwork hasn't been generated.
writeIfMissing(`${base}/plugin/marketplace.png`, () => hotbarMark(256, 3, 3, false).toPng());
writeIfMissing(`${base}/plugin/marketplace@2x.png`, () => hotbarMark(512, 3, 3, false).toPng());

// Category icon: transparent background, drawn on the Stream Deck's own chrome.
write(`${base}/plugin/category-icon.png`, hotbarMark(28, 3, 1, true).toPng());
write(`${base}/plugin/category-icon@2x.png`, hotbarMark(56, 3, 1, true).toPng());

// Action icon in the action list.
write(`${base}/actions/slot/icon.png`, hotbarMark(20, 3, 1, true).toPng());
write(`${base}/actions/slot/icon@2x.png`, hotbarMark(40, 3, 1, true).toPng());

// Default key image, shown before Minecraft connects (the plugin overwrites it at runtime).
write(`${base}/actions/slot/key.png`, canvas(72, 72, DARK).toPng());
write(`${base}/actions/slot/key@2x.png`, canvas(144, 144, DARK).toPng());

console.log("Done. Plugin icons generated.");
