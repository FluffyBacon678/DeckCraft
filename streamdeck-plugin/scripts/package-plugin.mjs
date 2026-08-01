// Packages the Stream Deck plugin for distribution — WITHOUT the extracted Minecraft textures.
//
//   npm run package   ->  dist/com.fluffybacon.deckcraft-hotbar.sdPlugin.zip
//
// Why the exclusion matters: imgs/items/ holds ~1832 textures read out of the user's own
// Minecraft installation. They are fine to generate locally, but redistributing them would be
// republishing Mojang's assets. The plugin already falls back to item names when that folder is
// absent, so a package without it is fully functional — the end user runs
// `npm run icons:extract` (or the documented step) to populate it on their own machine.

import { createWriteStream, mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import zlib from "node:zlib";

const PLUGIN_DIR = "com.fluffybacon.deckcraft-hotbar.sdPlugin";
const OUT = `dist/${PLUGIN_DIR}.zip`;

// Anything matching these (relative to the plugin dir) is never packaged.
const EXCLUDE = [
  /^imgs[\\/]items[\\/]/,  // Minecraft textures — must NOT be redistributed
  /^logs[\\/]/,
  /\.map$/,
];

function walk(dir, base = dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, base, out);
    } else {
      out.push(full);
    }
  }
  return out;
}

// ---- ZIP writer with deflate ---------------------------------------------
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

function zip(files) {
  const locals = [];
  const central = [];
  let offset = 0;
  for (const { name, data } of files) {
    const nameBuf = Buffer.from(name, "utf8");
    const crc = crc32(data);
    const deflated = zlib.deflateRawSync(data, { level: 9 });
    const useDeflate = deflated.length < data.length;
    const payload = useDeflate ? deflated : data;
    const method = useDeflate ? 8 : 0;

    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(0, 6);
    lh.writeUInt16LE(method, 8);
    lh.writeUInt16LE(0, 10);
    lh.writeUInt16LE(0x21, 12);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(payload.length, 18);
    lh.writeUInt32LE(data.length, 22);
    lh.writeUInt16LE(nameBuf.length, 26);
    lh.writeUInt16LE(0, 28);
    locals.push(lh, nameBuf, payload);

    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4);
    ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(0, 8);
    ch.writeUInt16LE(method, 10);
    ch.writeUInt16LE(0, 12);
    ch.writeUInt16LE(0x21, 14);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(payload.length, 20);
    ch.writeUInt32LE(data.length, 24);
    ch.writeUInt16LE(nameBuf.length, 28);
    ch.writeUInt16LE(0, 30);
    ch.writeUInt16LE(0, 32);
    ch.writeUInt16LE(0, 34);
    ch.writeUInt16LE(0, 36);
    ch.writeUInt32LE(0, 38);
    ch.writeUInt32LE(offset, 42);
    central.push(ch, nameBuf);

    offset += lh.length + nameBuf.length + payload.length;
  }
  const centralBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBuf, eocd]);
}

// ---- main ----------------------------------------------------------------
const all = walk(PLUGIN_DIR);
const files = [];
let excluded = 0;

for (const full of all) {
  const rel = relative(PLUGIN_DIR, full);
  if (EXCLUDE.some((re) => re.test(rel))) {
    excluded++;
    continue;
  }
  files.push({
    name: `${PLUGIN_DIR}/${rel.split(sep).join("/")}`,
    data: readFileSync(full),
  });
}

mkdirSync("dist", { recursive: true });
const buf = zip(files);
createWriteStream(OUT).end(buf);

console.log(`Wrote ${OUT}`);
console.log(`  packaged : ${files.length} files (${(buf.length / 1024).toFixed(0)} KB)`);
console.log(`  excluded : ${excluded} files (Minecraft textures / logs / sourcemaps)`);

// Hard guarantee: fail loudly if a texture ever sneaks in.
const leaked = files.filter((f) => /imgs\/items\//.test(f.name));
if (leaked.length) {
  console.error(`ERROR: ${leaked.length} Minecraft textures leaked into the package!`);
  process.exit(1);
}
console.log("  verified : no Minecraft assets in the package");
