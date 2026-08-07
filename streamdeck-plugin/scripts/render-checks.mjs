// Asserts on the REAL renderer's output. Run `npm run preview` first (or use `npm run check`,
// which does both). Parses preview-keys.html, decodes each key's SVG, and checks the things
// that are easy to break silently: icon vs name fallback, the vanilla-namespace guard, and the
// slot tags.
//
//   npm run check

import { readFileSync } from "node:fs";

const html = readFileSync("preview-keys.html", "utf8");
const keys = [...html.matchAll(/<img src="data:image\/svg\+xml;charset=utf8,([^"]+)"/g)]
  .map((m) => decodeURIComponent(m[1]));
const captions = [...html.matchAll(/<figcaption>([^<]+)<\/figcaption>/g)].map((m) => m[1]);

const byCaption = (needle) => {
  const i = captions.findIndex((c) => c.includes(needle));
  if (i < 0) throw new Error(`no preview case matching "${needle}"`);
  return keys[i];
};
const hasIcon = (svg) => /<image href="data:image\/png;base64,/.test(svg);
const textNodes = (svg) => [...svg.matchAll(/>([^<]+)<\/text>/g)].map((m) => m[1]);
/** Text is wrapped across lines, so compare on the concatenation rather than a literal string. */
const textOf = (svg) => textNodes(svg).join(" ");

let pass = 0;
let fail = 0;
const check = (name, cond) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}`);
  cond ? pass++ : fail++;
};

// --- icons -----------------------------------------------------------------
const sword = byCaption("selected");
check("vanilla item renders its real texture", hasIcon(sword));
check("icon uses pixelated upscaling", sword.includes('image-rendering="pixelated"'));
check("selected slot has the green border", sword.includes("#58aa5a"));
check("enchanted marker shown", sword.includes("✦"));

const cobble = byCaption("full stack");
check("block item resolves a texture", hasIcon(cobble));
check("stack count drawn", textOf(cobble).includes("64"));

const pick = byCaption("low durability");
check("low durability bar is red", pick.includes("#e06c6c"));

// Shield has no flat item texture of its own, but the model graph resolves one — so after the
// model-graph extractor it SHOULD have an icon. This is the regression guard for that work.
check("shield resolves via the model graph", hasIcon(byCaption("no flat texture")));

// --- fallbacks -------------------------------------------------------------
// The important one: a modded id must never borrow vanilla art, even when the path collides.
const collide = byCaption("COLLIDES");
check("modded id colliding with a vanilla path shows NO vanilla art", !hasIcon(collide));
check("...and shows its own name instead", textOf(collide).includes("Alloy"));

const modded = byCaption("modded ->");
check("unknown modded item has no icon", !hasIcon(modded));
check("unknown modded item shows its name (wrapped)", textOf(modded).includes("Fancy"));

// A mod that IS installed should get its own art — this is the mod-compatibility guarantee.
check("installed mod's item renders its own texture", hasIcon(byCaption("INSTALLED mod item")));

const long = byCaption("long name wraps");
check("long name wraps onto multiple lines", textNodes(long).length >= 3);

// --- tags and states -------------------------------------------------------
check("storage key tagged S1", byCaption("storage").includes(">S1<"));
check("armor key tagged Bt", byCaption("armor").includes(">Bt<"));
check("off-hand key tagged OH", byCaption("off-hand").includes(">OH<"));
check("empty slot reads Empty", textOf(byCaption("empty slot")).includes("Empty"));
check("disconnected reads No MC", textOf(byCaption("disconnected")).includes("No MC"));
check("no world reads No World", textOf(byCaption("connected_no_world")).includes("No World"));

console.log(`\n${pass}/${pass + fail} render checks passed`);
process.exit(fail === 0 ? 0 : 1);
