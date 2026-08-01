// Extracts vanilla item/block textures from a Minecraft client jar into
// com.fluffybacon.deckcraft-hotbar.sdPlugin/imgs/items/<name>.png
//
//   npm run icons:extract              # auto-discovers the newest jar in .minecraft
//   npm run icons:extract -- <path>    # or point it at a specific client jar
//
// Uses a minimal built-in ZIP reader (Node zlib only) so there is no new dependency.
// Textures are the game's own 16x16 PNGs — they are NOT redistributed by this repo, they are
// read from the copy of Minecraft already installed on this machine.

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import zlib from "node:zlib";

const OUT_DIR = "com.fluffybacon.deckcraft-hotbar.sdPlugin/imgs/items";

// ---- minimal ZIP reader --------------------------------------------------
function findEocd(buf) {
  // End of Central Directory: signature 0x06054b50, within the last 64KB + 22 bytes.
  const min = Math.max(0, buf.length - 65557);
  for (let i = buf.length - 22; i >= min; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) return i;
  }
  throw new Error("Not a ZIP file (no EOCD found)");
}

function* readEntries(buf) {
  const eocd = findEocd(buf);
  let count = buf.readUInt16LE(eocd + 10);
  let ptr = buf.readUInt32LE(eocd + 16);
  if (ptr === 0xffffffff || count === 0xffff) {
    throw new Error("Zip64 archives are not supported by this minimal reader");
  }
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(ptr) !== 0x02014b50) break; // central directory header
    const method = buf.readUInt16LE(ptr + 10);
    const compSize = buf.readUInt32LE(ptr + 20);
    const nameLen = buf.readUInt16LE(ptr + 28);
    const extraLen = buf.readUInt16LE(ptr + 30);
    const commentLen = buf.readUInt16LE(ptr + 32);
    const localOff = buf.readUInt32LE(ptr + 42);
    const name = buf.toString("utf8", ptr + 46, ptr + 46 + nameLen);
    yield { name, method, compSize, localOff };
    ptr += 46 + nameLen + extraLen + commentLen;
  }
}

function readData(buf, entry) {
  if (buf.readUInt32LE(entry.localOff) !== 0x04034b50) return null; // local file header
  const nameLen = buf.readUInt16LE(entry.localOff + 26);
  const extraLen = buf.readUInt16LE(entry.localOff + 28);
  const start = entry.localOff + 30 + nameLen + extraLen;
  const raw = buf.subarray(start, start + entry.compSize);
  if (entry.method === 0) return Buffer.from(raw); // stored
  if (entry.method === 8) return zlib.inflateRawSync(raw); // deflate
  return null; // unsupported method — skip
}

// ---- jar discovery -------------------------------------------------------
function discoverJar() {
  const appdata = process.env.APPDATA;
  if (!appdata) return null;
  const versionsDir = join(appdata, ".minecraft", "versions");
  if (!existsSync(versionsDir)) return null;

  const candidates = [];
  for (const dir of readdirSync(versionsDir)) {
    const jar = join(versionsDir, dir, `${dir}.jar`);
    if (existsSync(jar)) candidates.push({ dir, jar });
  }
  if (!candidates.length) return null;

  // Prefer plain release versions (1.21.11), newest first, over loader/forge profiles.
  const release = /^(\d+)\.(\d+)(?:\.(\d+))?$/;
  const scored = candidates
    .map((c) => {
      const m = release.exec(c.dir);
      if (!m) return { ...c, score: -1 };
      return { ...c, score: (+m[1] * 1e6) + (+m[2] * 1e3) + (m[3] ? +m[3] : 0) };
    })
    .sort((a, b) => b.score - a.score);
  return scored[0].score > 0 ? scored[0].jar : null;
}

// ---- main ----------------------------------------------------------------
const argJar = process.argv[2];
const jarPath = argJar || discoverJar();

if (!jarPath || !existsSync(jarPath)) {
  console.error("Could not find a Minecraft client jar.");
  console.error("Pass one explicitly:  npm run icons:extract -- \"<path to 1.21.11.jar>\"");
  console.error("(Launch Minecraft 1.21.11 once so the launcher downloads its client jar.)");
  process.exit(1);
}

console.log(`Reading textures from: ${jarPath}`);
const buf = readFileSync(jarPath);

// Fresh output dir so removed/renamed textures don't linger.
if (existsSync(OUT_DIR)) rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(OUT_DIR, { recursive: true });

const ITEM_RE = /^assets\/minecraft\/textures\/item\/([a-z0-9_]+)\.png$/;
const BLOCK_RE = /^assets\/minecraft\/textures\/block\/([a-z0-9_]+)\.png$/;

let items = 0;
let blocks = 0;
const written = new Set();

for (const entry of readEntries(buf)) {
  const itemMatch = ITEM_RE.exec(entry.name);
  const blockMatch = itemMatch ? null : BLOCK_RE.exec(entry.name);
  if (!itemMatch && !blockMatch) continue;

  const name = (itemMatch ?? blockMatch)[1];
  // Item textures win over block textures of the same name (e.g. an item overlay).
  if (written.has(name) && blockMatch) continue;

  const data = readData(buf, entry);
  if (!data || data.length === 0) continue;

  writeFileSync(join(OUT_DIR, `${name}.png`), data);
  if (!written.has(name)) {
    written.add(name);
    if (itemMatch) items++;
    else blocks++;
  }
}

console.log(`Wrote ${written.size} textures to ${OUT_DIR}`);
console.log(`  ${items} item textures, ${blocks} block textures (used as flat tiles)`);
console.log("Keys set to 'Icon + info' will now show real item art; anything missing falls back to the item name.");
