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
 * Block items often have no `textures/item/<name>.png`; their block texture is a good flat
 * stand-in, but the file is sometimes suffixed. Try a few common shapes before giving up.
 */
function candidateNames(path: string): string[] {
  return [path, `${path}_top`, `${path}_side`, `${path}_front`, `${path}_still`];
}

/**
 * Resolves the texture file basename for an item id, or undefined if this id must not use the
 * bundled vanilla textures.
 *
 * Vanilla-only by design: a modded item sharing a vanilla path (e.g. "somemod:iron_ingot") would
 * otherwise silently render the WRONG art. Exported for testing.
 */
export function vanillaTexturePath(itemId: string | null | undefined): string | undefined {
  if (!itemId) {
    return undefined;
  }
  const colon = itemId.indexOf(":");
  const namespace = colon >= 0 ? itemId.slice(0, colon) : "minecraft";
  const path = colon >= 0 ? itemId.slice(colon + 1) : itemId;
  if (namespace !== "minecraft" || !/^[a-z0-9_]+$/.test(path)) {
    return undefined;
  }
  return path;
}

export function resolveIcon(itemId: string | null | undefined): string | undefined {
  if (!itemId) {
    return undefined;
  }
  const cached = cache.get(itemId);
  if (cached !== undefined) {
    return cached ?? undefined;
  }

  const path = vanillaTexturePath(itemId);
  if (!path || !existsSync(ITEMS_DIR)) {
    cache.set(itemId, null);
    return undefined;
  }

  for (const name of candidateNames(path)) {
    const file = join(ITEMS_DIR, `${name}.png`);
    try {
      if (existsSync(file)) {
        const uri = `data:image/png;base64,${readFileSync(file).toString("base64")}`;
        cache.set(itemId, uri);
        return uri;
      }
    } catch {
      break; // unreadable file — fall back to the item name
    }
  }

  cache.set(itemId, null);
  return undefined;
}

/** True when the extracted texture folder exists (used for a one-time startup log). */
export function iconsAvailable(): boolean {
  return existsSync(ITEMS_DIR);
}
