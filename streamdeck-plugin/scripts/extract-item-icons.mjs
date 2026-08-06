// Extracts a texture for (almost) every Minecraft item into
// com.fluffybacon.deckcraft-hotbar.sdPlugin/imgs/items/<item_id>.png
//
//   npm run icons:extract              # auto-discovers the newest jar in .minecraft
//   npm run icons:extract -- <path>    # or point it at a specific client jar
//
// Rather than guessing that item "X" uses texture "X.png", this walks the game's own model
// graph, which is what the game itself does:
//
//   assets/minecraft/items/<id>.json   -> a model reference (possibly nested in conditions)
//   assets/minecraft/models/{item,block}/<name>.json
//                                      -> textures, plus a `parent` chain to inherit from
//   -> pick the most representative texture and write it out as <id>.png
//
// That fixes items whose texture name differs from the item name, and covers block items
// (which have no item texture at all) via their block model.
//
// Uses a minimal built-in ZIP reader (Node zlib only) so there is no new dependency.
// Textures are NOT redistributed by this project — they are read from the copy of Minecraft
// already installed on this machine, and the output folder is gitignored.

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import zlib from "node:zlib";

const OUT_DIR = "com.fluffybacon.deckcraft-hotbar.sdPlugin/imgs/items";

// ---- minimal ZIP reader --------------------------------------------------
function findEocd(buf) {
  const min = Math.max(0, buf.length - 65557);
  for (let i = buf.length - 22; i >= min; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) return i;
  }
  throw new Error("Not a ZIP file (no EOCD found)");
}

function readAllEntries(buf) {
  const eocd = findEocd(buf);
  const count = buf.readUInt16LE(eocd + 10);
  let ptr = buf.readUInt32LE(eocd + 16);
  if (ptr === 0xffffffff || count === 0xffff) {
    throw new Error("Zip64 archives are not supported by this minimal reader");
  }
  const map = new Map();
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(ptr) !== 0x02014b50) break;
    const method = buf.readUInt16LE(ptr + 10);
    const compSize = buf.readUInt32LE(ptr + 20);
    const nameLen = buf.readUInt16LE(ptr + 28);
    const extraLen = buf.readUInt16LE(ptr + 30);
    const commentLen = buf.readUInt16LE(ptr + 32);
    const localOff = buf.readUInt32LE(ptr + 42);
    const name = buf.toString("utf8", ptr + 46, ptr + 46 + nameLen);
    map.set(name, { method, compSize, localOff });
    ptr += 46 + nameLen + extraLen + commentLen;
  }
  return map;
}

function readData(buf, entry) {
  if (!entry) return null;
  if (buf.readUInt32LE(entry.localOff) !== 0x04034b50) return null;
  const nameLen = buf.readUInt16LE(entry.localOff + 26);
  const extraLen = buf.readUInt16LE(entry.localOff + 28);
  const start = entry.localOff + 30 + nameLen + extraLen;
  const raw = buf.subarray(start, start + entry.compSize);
  if (entry.method === 0) return Buffer.from(raw);
  if (entry.method === 8) return zlib.inflateRawSync(raw);
  return null;
}

// ---- jar discovery -------------------------------------------------------
function discoverJar() {
  const appdata = process.env.APPDATA;
  if (!appdata) return null;
  const versionsDir = join(appdata, ".minecraft", "versions");
  if (!existsSync(versionsDir)) return null;
  const release = /^(\d+)\.(\d+)(?:\.(\d+))?$/;
  const scored = [];
  for (const dir of readdirSync(versionsDir)) {
    const jar = join(versionsDir, dir, `${dir}.jar`);
    if (!existsSync(jar)) continue;
    const m = release.exec(dir);
    if (!m) continue;
    scored.push({ jar, score: +m[1] * 1e6 + +m[2] * 1e3 + (m[3] ? +m[3] : 0) });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.length ? scored[0].jar : null;
}

// ---- model graph resolution ---------------------------------------------
const stripNs = (s) => (s.includes(":") ? s.slice(s.indexOf(":") + 1) : s);

/** Recursively find the first concrete model path in an item definition. */
function findModelRef(node, depth = 0) {
  if (!node || depth > 12) return null;
  if (typeof node === "string") return node;
  if (Array.isArray(node)) {
    for (const n of node) {
      const r = findModelRef(n, depth + 1);
      if (r) return r;
    }
    return null;
  }
  if (typeof node !== "object") return null;

  // A plain model reference.
  if (typeof node.model === "string") return node.model;
  // Special renderers (shield, bed, chest...) expose a `base` texture reference.
  if (typeof node.base === "string") return node.base;

  // Nested selectors: take the first branch that resolves.
  for (const key of ["model", "on_true", "on_false", "fallback", "cases", "entries", "models"]) {
    if (node[key] !== undefined) {
      const r = findModelRef(node[key], depth + 1);
      if (r) return r;
    }
  }
  return null;
}

/** Merge a model's textures with its inherited parent chain. */
function resolveTextures(modelPath, getJson, depth = 0) {
  if (!modelPath || depth > 12) return {};
  const path = stripNs(modelPath);
  const json = getJson(`assets/minecraft/models/${path}.json`);
  if (!json) return {};
  const parentTex = json.parent ? resolveTextures(json.parent, getJson, depth + 1) : {};
  return { ...parentTex, ...(json.textures || {}) };
}

/** Follow "#key" indirections inside a texture map. */
function deref(textures, value, depth = 0) {
  if (typeof value !== "string" || depth > 8) return value;
  if (!value.startsWith("#")) return value;
  return deref(textures, textures[value.slice(1)], depth + 1);
}

/**
 * Choose the most recognisable texture for an item.
 * Flat items use layer0/layer1; block items have no layers, so fall back to the faces a player
 * actually sees, preferring the side over the top.
 */
function pickTexture(textures, itemId) {
  const layers = Object.keys(textures)
    .filter((k) => /^layer\d+$/.test(k))
    .sort();

  if (layers.length) {
    // Multi-layer items are usually base + tinted overlay (potions, spawn eggs). The tint is a
    // runtime value we don't have, so prefer whichever layer is actually named after the item
    // (e.g. potion -> layer1 "item/potion", the bottle) and otherwise take layer0.
    for (const l of layers) {
      const t = deref(textures, textures[l]);
      if (typeof t === "string" && stripNs(t).split("/").pop() === itemId) return t;
    }
    return deref(textures, textures[layers[0]]);
  }

  for (const key of ["all", "side", "texture", "top", "north", "end", "front", "fire", "particle"]) {
    if (textures[key] !== undefined) {
      const t = deref(textures, textures[key]);
      if (typeof t === "string") return t;
    }
  }
  return null;
}

// ---- main ----------------------------------------------------------------
const jarPath = process.argv[2] || discoverJar();
if (!jarPath || !existsSync(jarPath)) {
  console.error("Could not find a Minecraft client jar.");
  console.error('Pass one explicitly:  npm run icons:extract -- "<path to 1.21.11.jar>"');
  console.error("(Launch Minecraft once so the launcher downloads its client jar.)");
  process.exit(1);
}

console.log(`Reading model graph from: ${jarPath}`);
const buf = readFileSync(jarPath);
const entries = readAllEntries(buf);

const jsonCache = new Map();
function getJson(name) {
  if (jsonCache.has(name)) return jsonCache.get(name);
  let parsed = null;
  try {
    const data = readData(buf, entries.get(name));
    if (data) parsed = JSON.parse(data.toString("utf8"));
  } catch {
    parsed = null;
  }
  jsonCache.set(name, parsed);
  return parsed;
}

if (existsSync(OUT_DIR)) rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(OUT_DIR, { recursive: true });

const ITEM_DEF = /^assets\/minecraft\/items\/([a-z0-9_]+)\.json$/;
const itemIds = [];
for (const name of entries.keys()) {
  const m = ITEM_DEF.exec(name);
  if (m) itemIds.push(m[1]);
}
itemIds.sort();

let written = 0;
const unresolved = [];

for (const id of itemIds) {
  const def = getJson(`assets/minecraft/items/${id}.json`);
  if (!def) {
    unresolved.push(id);
    continue;
  }
  const modelRef = findModelRef(def);
  if (!modelRef) {
    unresolved.push(id);
    continue;
  }

  // `base` on special renderers already points at a texture, not a model.
  let texture = null;
  const textures = resolveTextures(modelRef, getJson);
  if (Object.keys(textures).length) {
    texture = pickTexture(textures, id);
  }
  if (!texture) {
    // e.g. shield -> base "minecraft:item/shield": try it as a direct texture path.
    const direct = `assets/minecraft/textures/${stripNs(modelRef)}.png`;
    if (entries.has(direct)) texture = stripNs(modelRef);
  }
  if (!texture) {
    unresolved.push(id);
    continue;
  }

  const png = readData(buf, entries.get(`assets/minecraft/textures/${stripNs(texture)}.png`));
  if (!png || png.length === 0) {
    unresolved.push(id);
    continue;
  }
  writeFileSync(join(OUT_DIR, `${id}.png`), png);
  written++;
}

const pct = ((written / itemIds.length) * 100).toFixed(1);
console.log(`Resolved ${written} of ${itemIds.length} items (${pct}%) -> ${OUT_DIR}`);
if (unresolved.length) {
  console.log(`${unresolved.length} items have no flat texture and will show their name instead.`);
  console.log(`  e.g. ${unresolved.slice(0, 12).join(", ")}${unresolved.length > 12 ? " ..." : ""}`);
}
console.log("Textures are keyed by item id, so lookup is exact — no filename guessing.");
