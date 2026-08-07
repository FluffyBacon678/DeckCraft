// Renders a preview page of Stream Deck keys using the REAL key-renderer from src/,
// so what you see is exactly what the plugin will draw.
//
//   npm run preview
//
// Compiles src/render/key-renderer.ts + src/types/protocol.ts to a temp dir with tsc, imports
// the compiled module, and writes preview-keys.html. (key-renderer has no Stream Deck SDK
// imports, so it loads standalone.)

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const TMP = ".preview-build";
mkdirSync(TMP, { recursive: true });

console.log("Compiling the real renderer with tsc...");
// Invoke the local tsc through node directly — avoids npx/.cmd spawn quirks on Windows.
execFileSync(
  process.execPath,
  [resolve("node_modules/typescript/bin/tsc"),
   "src/render/key-renderer.ts", "src/render/icon-resolver.ts", "src/types/protocol.ts",
   "--outDir", TMP, "--module", "es2022", "--target", "es2022",
   "--moduleResolution", "bundler", "--skipLibCheck"],
  { stdio: "inherit" },
);

// tsc emits extensionless relative imports; Node's ESM loader needs explicit ".js".
for (const rel of ["render/key-renderer.js", "render/icon-resolver.js"]) {
  const f = resolve(TMP, rel);
  writeFileSync(
    f,
    readFileSync(f, "utf8").replace(/from\s+"(\.[^"]*?)"/g, (m, p) =>
      p.endsWith(".js") ? m : `from "${p}.js"`),
  );
}

// Point the REAL resolver at the extracted textures, so the preview exercises the shipping
// icon logic (including the vanilla-namespace guard) rather than a copy of it.
process.env.DECKCRAFT_ITEMS_DIR = resolve("com.fluffybacon.deckcraft-hotbar.sdPlugin/imgs/items");

const { renderSvgDataUri } = await import(pathToFileURL(resolve(TMP, "render/key-renderer.js")).href);
const { resolveIcon } = await import(pathToFileURL(resolve(TMP, "render/icon-resolver.js")).href);

function slot(i, itemId, displayName, count, maxCount, dmg = 0, maxDmg = 0, ench = false) {
  return {
    slot: i, empty: itemId === null, itemId, displayName, count, maxCount,
    damageable: maxDmg > 0, damage: dmg, maxDamage: maxDmg,
    durabilityRemaining: maxDmg > 0 ? maxDmg - dmg : 0,
    durabilityPercent: maxDmg > 0 ? Math.round(((maxDmg - dmg) / maxDmg) * 100) : null,
    hasEnchantments: ench,
  };
}

// A realistic hotbar + a few edge cases worth eyeballing.
const cases = [
  { label: "selected + enchanted + durability", idx: 0, s: slot(0, "minecraft:diamond_sword", "Diamond Sword", 1, 1, 120, 1561, true), sel: true },
  { label: "stack count", idx: 1, s: slot(1, "minecraft:cooked_beef", "Steak", 32, 64) },
  { label: "low durability", idx: 2, s: slot(2, "minecraft:iron_pickaxe", "Iron Pickaxe", 1, 1, 220, 250) },
  { label: "full stack (block texture)", idx: 3, s: slot(3, "minecraft:cobblestone", "Cobblestone", 64, 64) },
  { label: "block item", idx: 4, s: slot(4, "minecraft:oak_log", "Oak Log", 12, 64) },
  { label: "no flat texture -> name", idx: 5, s: slot(5, "minecraft:shield", "Shield", 1, 1, 3, 336) },
  { label: "modded -> name fallback", idx: 6, s: slot(6, "somemod:fancy_widget", "Fancy Widget", 4, 64) },
  { label: "modded name COLLIDES with vanilla -> must NOT show vanilla art", idx: 6, s: slot(6, "somemod:iron_ingot", "Alloy Ingot", 8, 64) },
  { label: "INSTALLED mod item -> real modded art", idx: 6, s: slot(6, "silkworms:silkworm_spawn_egg", "Silkworm Spawn Egg", 1, 64) },
  { label: "long name wraps when there is no texture", idx: 6, s: slot(6, "somemod:really_long_widget", "Extremely Long Item Name", 1, 64) },
  { label: "empty slot", idx: 7, s: slot(7, null, "", 0, 0) },
  { label: "torch", idx: 8, s: slot(8, "minecraft:torch", "Torch", 16, 64) },
  { label: "storage (read-only tag S1)", idx: 9, s: slot(9, "minecraft:diamond", "Diamond", 9, 64) },
  { label: "armor slot (Bt)", idx: 36, s: slot(36, "minecraft:diamond_boots", "Diamond Boots", 1, 1, 10, 429) },
  { label: "off-hand (OH)", idx: 40, s: slot(40, "minecraft:totem_of_undying", "Totem of Undying", 1, 1) },
];

const keys = cases.map((c) => {
  const uri = renderSvgDataUri({
    link: "in_world", slotIndex: c.idx, slot: c.s, selected: !!c.sel,
    iconDataUri: resolveIcon(c.s.itemId),
  });
  return `<figure><img src="${uri}" width="144" height="144" alt=""><figcaption>${c.label}</figcaption></figure>`;
}).join("\n");

const states = ["disconnected", "connected_no_world"].map((link) => {
  const uri = renderSvgDataUri({ link, slotIndex: 0, slot: undefined, selected: false });
  return `<figure><img src="${uri}" width="144" height="144" alt=""><figcaption>${link}</figcaption></figure>`;
}).join("\n");

writeFileSync("preview-keys.html", `<!doctype html>
<meta charset="utf-8"><title>DeckCraft key preview</title>
<style>
  body{background:#0b0d10;color:#e5e7eb;font:14px "Segoe UI",system-ui,sans-serif;padding:24px}
  h1{font-size:18px} h2{font-size:14px;color:#9ca3af;margin-top:28px;font-weight:600}
  .grid{display:flex;flex-wrap:wrap;gap:18px}
  figure{margin:0;text-align:center}
  img{border-radius:12px;display:block;background:#000}
  figcaption{font-size:11px;color:#9ca3af;margin-top:6px;max-width:144px}
</style>
<h1>DeckCraft Hotbar — key rendering (real renderer output)</h1>
<h2>Items</h2><div class="grid">${keys}</div>
<h2>Link states</h2><div class="grid">${states}</div>
`);

console.log("Wrote preview-keys.html");
