// Extracts a texture for (almost) every item into
// com.fluffybacon.deckcraft-hotbar.sdPlugin/imgs/items/<namespace>/<item_id>.png
//
// Covers vanilla AND every mod in your mods folder, because Fabric mods ship item definitions,
// models and textures in exactly the same layout as vanilla. Namespacing the output folder means
// a modded item can never be served a vanilla texture by accident.
//
//   npm run icons:extract              # auto-discovers the newest jar + your mods folder
//   npm run icons:extract -- <path>    # or point it at a specific client jar
//   npm run icons:extract -- <path> --no-mods    # vanilla only
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

/**
 * Merge a model's textures with its inherited parent chain. Namespace-aware, because a mod's
 * model almost always inherits from a vanilla one (`minecraft:item/generated`).
 */
function resolveTextures(modelPath, source, defaultNs, depth = 0) {
  if (!modelPath || depth > 12) return {};
  const ns = modelPath.includes(":") ? modelPath.slice(0, modelPath.indexOf(":")) : defaultNs;
  const json = source.getJson(`assets/${ns}/models/${stripNs(modelPath)}.json`);
  if (!json) return {};
  const parentTex = json.parent ? resolveTextures(json.parent, source, ns, depth + 1) : {};
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

// ---- source: one jar, with a fallback chain for cross-jar references ------
/**
 * Mod models routinely inherit from vanilla (`minecraft:item/generated`) and occasionally
 * reference vanilla textures, so every lookup falls back to the vanilla jar.
 */
function makeSource(buf, entries, fallback) {
  const jsonCache = new Map();
  return {
    entries,
    has(name) {
      return entries.has(name) || (fallback ? fallback.has(name) : false);
    },
    getJson(name) {
      if (jsonCache.has(name)) return jsonCache.get(name);
      let parsed = null;
      try {
        const data = readData(buf, entries.get(name));
        if (data) parsed = JSON.parse(data.toString("utf8"));
      } catch {
        parsed = null;
      }
      if (parsed === null && fallback) parsed = fallback.getJson(name);
      jsonCache.set(name, parsed);
      return parsed;
    },
    getBytes(name) {
      let data = null;
      try {
        data = readData(buf, entries.get(name));
      } catch {
        data = null;
      }
      if ((!data || data.length === 0) && fallback) data = fallback.getBytes(name);
      return data;
    },
  };
}

/** Resolve + write every item namespace found in one source. Returns per-namespace counts. */
function extractFrom(source, stats) {
  const ITEM_DEF = /^assets\/([a-z0-9_.-]+)\/items\/([a-z0-9_/]+)\.json$/;
  const found = [];
  for (const name of source.entries.keys()) {
    const m = ITEM_DEF.exec(name);
    if (m) found.push({ ns: m[1], id: m[2], path: name });
  }

  for (const { ns, id, path } of found) {
    const def = source.getJson(path);
    if (!def) {
      stats.unresolved.push(`${ns}:${id}`);
      continue;
    }
    const modelRef = findModelRef(def);
    if (!modelRef) {
      stats.unresolved.push(`${ns}:${id}`);
      continue;
    }

    const modelNs = modelRef.includes(":") ? modelRef.slice(0, modelRef.indexOf(":")) : ns;
    let texture = null;
    const textures = resolveTextures(modelRef, source, ns);
    if (Object.keys(textures).length) texture = pickTexture(textures, id.split("/").pop());

    if (!texture) {
      // Special renderers expose `base` as a texture path rather than a model.
      const direct = `assets/${modelNs}/textures/${stripNs(modelRef)}.png`;
      if (source.has(direct)) texture = modelRef;
    }
    if (!texture) {
      stats.unresolved.push(`${ns}:${id}`);
      continue;
    }

    const texNs = texture.includes(":") ? texture.slice(0, texture.indexOf(":")) : ns;
    const png = source.getBytes(`assets/${texNs}/textures/${stripNs(texture)}.png`);
    if (!png || png.length === 0) {
      stats.unresolved.push(`${ns}:${id}`);
      continue;
    }

    const dir = join(OUT_DIR, ns);
    mkdirSync(dir, { recursive: true });
    // Some ids are nested (a/b) — flatten to keep lookup a single exact path.
    const outFile = join(dir, `${id.replace(/\//g, "_")}.png`);
    writeFileSync(outFile, png);
    // Remember where this texture came from so resource packs can override it later.
    stats.resolved.push({ outFile, assetPath: `assets/${texNs}/textures/${stripNs(texture)}.png` });
    stats.byNs[ns] = (stats.byNs[ns] || 0) + 1;
    stats.written++;
  }
  return found.length;
}

/**
 * Reads the ACTIVE resource packs from options.txt, lowest priority first.
 * Entries look like ["vanilla","file/Some Pack.zip","continuity:default"]; only `file/` entries
 * are real zips on disk — the rest are built-in or supplied by mods.
 */
function activeResourcePacks() {
  if (!process.env.APPDATA) return [];
  const mcDir = join(process.env.APPDATA, ".minecraft");
  const optionsPath = join(mcDir, "options.txt");
  if (!existsSync(optionsPath)) return [];
  const line = readFileSync(optionsPath, "utf8")
    .split(/\r?\n/)
    .find((l) => l.startsWith("resourcePacks:"));
  if (!line) return [];
  let list;
  try {
    list = JSON.parse(line.slice("resourcePacks:".length));
  } catch {
    return [];
  }
  return list
    .filter((e) => typeof e === "string" && e.startsWith("file/"))
    .map((e) => join(mcDir, "resourcepacks", e.slice("file/".length)))
    .filter((p) => existsSync(p) && p.toLowerCase().endsWith(".zip"));
}

/**
 * Overwrite any already-extracted texture that an enabled resource pack replaces, so the deck
 * shows what the player actually sees in game. Packs are applied in options.txt order, so a
 * later pack wins — the same precedence Minecraft uses.
 */
function applyResourcePacks(packs, stats) {
  let overridden = 0;
  const packsUsed = [];
  for (const pack of packs) {
    let hits = 0;
    try {
      const buf = readFileSync(pack);
      const entries = readAllEntries(buf);
      for (const { outFile, assetPath } of stats.resolved) {
        const entry = entries.get(assetPath);
        if (!entry) continue;
        const png = readData(buf, entry);
        if (!png || png.length === 0) continue;
        writeFileSync(outFile, png);
        hits++;
      }
    } catch {
      // A pack that isn't a readable zip is simply skipped.
      continue;
    }
    if (hits) {
      overridden += hits;
      packsUsed.push(`${pack.split(/[\\/]/).pop()} (${hits})`);
    }
  }
  return { overridden, packsUsed };
}

// ---- main ----------------------------------------------------------------
const args = process.argv.slice(2);
const noMods = args.includes("--no-mods");
const jarPath = args.find((a) => !a.startsWith("--")) || discoverJar();

if (!jarPath || !existsSync(jarPath)) {
  console.error("Could not find a Minecraft client jar.");
  console.error('Pass one explicitly:  npm run icons:extract -- "<path to 1.21.11.jar>"');
  console.error("(Launch Minecraft once so the launcher downloads its client jar.)");
  process.exit(1);
}

if (existsSync(OUT_DIR)) rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(OUT_DIR, { recursive: true });

console.log(`Vanilla: ${jarPath}`);
const vanillaBuf = readFileSync(jarPath);
const vanilla = makeSource(vanillaBuf, readAllEntries(vanillaBuf), null);

const stats = { written: 0, byNs: {}, unresolved: [], resolved: [] };
const vanillaTotal = extractFrom(vanilla, stats);
console.log(`  ${stats.byNs.minecraft || 0} / ${vanillaTotal} vanilla items resolved`);

// ---- mods ----------------------------------------------------------------
let modJars = [];
if (!noMods && process.env.APPDATA) {
  const modsDir = join(process.env.APPDATA, ".minecraft", "mods");
  if (existsSync(modsDir)) {
    modJars = readdirSync(modsDir)
      .filter((f) => f.toLowerCase().endsWith(".jar"))
      .map((f) => join(modsDir, f));
  }
}

if (modJars.length) {
  console.log(`Scanning ${modJars.length} mod jars...`);
  let withItems = 0;
  for (const jar of modJars) {
    try {
      const buf = readFileSync(jar);
      const entries = readAllEntries(buf);
      // Cheap skip: no item definitions means nothing for us.
      let hasItems = false;
      for (const n of entries.keys()) {
        if (/^assets\/[a-z0-9_.-]+\/items\/.+\.json$/.test(n)) {
          hasItems = true;
          break;
        }
      }
      if (!hasItems) continue;
      withItems++;
      extractFrom(makeSource(buf, entries, vanilla), stats);
    } catch {
      // A malformed or exotic jar must never abort the whole extraction.
    }
  }
  console.log(`  ${withItems} mods provided items`);
}

// ---- resource packs ------------------------------------------------------
const noPacks = args.includes("--no-resourcepacks");
if (!noPacks) {
  const packs = activeResourcePacks();
  if (packs.length) {
    console.log(`Applying ${packs.length} enabled resource pack(s)...`);
    const { overridden, packsUsed } = applyResourcePacks(packs, stats);
    if (overridden) {
      console.log(`  ${overridden} textures replaced so icons match your game:`);
      for (const p of packsUsed) console.log(`    ${p}`);
    } else {
      console.log("  none of them replace item textures");
    }
  }
}

// ---- report --------------------------------------------------------------
const namespaces = Object.entries(stats.byNs).sort((a, b) => b[1] - a[1]);
console.log(`\nWrote ${stats.written} textures across ${namespaces.length} namespaces -> ${OUT_DIR}`);
for (const [ns, n] of namespaces.slice(0, 12)) console.log(`  ${String(n).padStart(5)}  ${ns}`);
if (namespaces.length > 12) console.log(`  ...and ${namespaces.length - 12} more`);
if (stats.unresolved.length) {
  console.log(`\n${stats.unresolved.length} items have no usable flat texture; those keys show the item name.`);
}
console.log("\nLookup is <namespace>/<id>.png — exact, so a modded item can never borrow vanilla art.");
