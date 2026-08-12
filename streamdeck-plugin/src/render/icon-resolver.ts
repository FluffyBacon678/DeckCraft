import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Maps a Minecraft item id to a base64 PNG data URI, using textures extracted from the local
 * Minecraft install by `npm run icons:extract`.
 *
 * Everything here degrades gracefully: if the textures were never extracted, or an item has no
 * flat texture (shields, spawn eggs and other entity-rendered items), we return undefined and the
 * renderer falls back to showing the item's name.
 *
 * Deliberately has NO Stream Deck SDK imports so it can be exercised standalone by
 * `npm run preview`. Set DECKCRAFT_ITEMS_DIR to point it at a different texture folder.
 */

// bin/plugin.js -> ../imgs/items
const DEFAULT_ITEMS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "imgs", "items");
const ITEMS_DIR = process.env.DECKCRAFT_ITEMS_DIR || DEFAULT_ITEMS_DIR;

/** Cache of itemId -> data URI. `null` marks a known miss so we only hit the disk once. */
const cache = new Map<string, string | null>();

/**
 * Files are named by item id (the extractor walks Minecraft's own model graph), so lookup is a
 * single exact hit — no filename guessing, and no chance of matching the wrong texture.
 */

/**
 * Splits an item id into the namespaced path its texture lives at, or undefined if the id is not
 * a shape we will look up.
 *
 * Textures are stored per namespace (`items/<namespace>/<id>.png`), which is what makes modded
 * items safe: "somemod:iron_ingot" resolves under `items/somemod/`, so it can never be served
 * vanilla's iron ingot. If that mod really is installed and was scanned, it gets its own art.
 * Exported for testing.
 */
export function texturePathFor(itemId: string | null | undefined): string | undefined {
  if (!itemId) {
    return undefined;
  }
  const colon = itemId.indexOf(":");
  const namespace = colon >= 0 ? itemId.slice(0, colon) : "minecraft";
  const path = colon >= 0 ? itemId.slice(colon + 1) : itemId;
  // Guard against anything that could escape the items directory.
  if (!/^[a-z0-9_.-]+$/.test(namespace) || !/^[a-z0-9_]+$/.test(path)) {
    return undefined;
  }
  return `${namespace}/${path}`;
}

export function resolveIcon(itemId: string | null | undefined): string | undefined {
  if (!itemId) {
    return undefined;
  }
  const cached = cache.get(itemId);
  if (cached !== undefined) {
    return cached ?? undefined;
  }

  const path = texturePathFor(itemId);
  if (!path || !existsSync(ITEMS_DIR)) {
    cache.set(itemId, null);
    return undefined;
  }

  const file = join(ITEMS_DIR, `${path}.png`);
  try {
    if (existsSync(file)) {
      const uri = `data:image/png;base64,${readFileSync(file).toString("base64")}`;
      cache.set(itemId, uri);
      return uri;
    }
  } catch {
    // unreadable file — fall through to the item-name fallback
  }

  cache.set(itemId, null);
  return undefined;
}

/** True when the extracted texture folder exists (used for a one-time startup log). */
export function iconsAvailable(): boolean {
  return existsSync(ITEMS_DIR);
}

/**
 * Drop cached lookups. Misses are cached as `null`, so this must be called after icons are
 * generated at runtime — otherwise every key would keep showing the name it resolved to on
 * the very first render.
 */
export function clearIconCache(): void {
  cache.clear();
}
