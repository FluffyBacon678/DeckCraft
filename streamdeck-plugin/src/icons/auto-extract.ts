import { spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { logger } from "../util/logger";

/**
 * Generates item icons on first launch, so a user who installed the packaged plugin gets real
 * art without ever cloning the repo or opening a terminal.
 *
 * The extractor is shipped as a plain .mjs alongside the bundle and run with the same Node
 * binary Stream Deck is already using (`process.execPath`), in a child process so a slow scan
 * of a large mods folder never blocks the plugin or the Stream Deck UI.
 *
 * It reads the user's own Minecraft installation. Nothing is downloaded, and no game assets
 * ship inside the plugin (see .sdignore).
 */

// bin/plugin.js -> ../imgs/items and ../tools/extract-item-icons.mjs
const PLUGIN_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ITEMS_DIR = join(PLUGIN_ROOT, "imgs", "items");
const EXTRACTOR = join(PLUGIN_ROOT, "tools", "extract-item-icons.mjs");

function hasIcons(): boolean {
  try {
    if (!existsSync(ITEMS_DIR)) return false;
    // A namespace folder with at least one texture in it counts as populated.
    for (const ns of readdirSync(ITEMS_DIR, { withFileTypes: true })) {
      if (!ns.isDirectory()) continue;
      if (readdirSync(join(ITEMS_DIR, ns.name)).some((f) => f.endsWith(".png"))) return true;
    }
    return false;
  } catch {
    return false;
  }
}

let started = false;

/**
 * Kicks off extraction if icons are missing. Safe to call on every launch — it no-ops once the
 * textures exist. Returns immediately; completion is reported through the log.
 *
 * @param onComplete called after a successful run so keys can be refreshed in place.
 */
export function ensureIconsExtracted(onComplete?: () => void): void {
  if (started) return;

  if (hasIcons()) {
    logger.info("Item icons present.");
    return;
  }
  if (!existsSync(EXTRACTOR)) {
    logger.info("No item icons and no extractor bundled — keys will show item names.");
    return;
  }

  started = true;
  logger.info("First run: generating item icons from your Minecraft installation. " +
    "Keys show item names until this finishes (usually under a minute).");

  try {
    const child = spawn(process.execPath, [EXTRACTOR], {
      cwd: PLUGIN_ROOT,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      env: { ...process.env, DECKCRAFT_ITEMS_OUT: ITEMS_DIR },
    });

    child.stdout?.on("data", (d) => {
      const line = String(d).trim();
      if (line) logger.info(`[icons] ${line.split("\n").pop()}`);
    });
    child.stderr?.on("data", (d) => {
      const line = String(d).trim();
      if (line) logger.warn(`[icons] ${line.split("\n").pop()}`);
    });

    child.on("error", (e) => {
      logger.warn(`Could not run the icon extractor: ${e.message}. Keys will show item names.`);
    });

    child.on("close", (code) => {
      if (code === 0 && hasIcons()) {
        logger.info("Item icons ready.");
        onComplete?.();
      } else {
        logger.info(
          "Item icons were not generated (is Minecraft installed for this user?). " +
            "Keys will show item names, which works fine.",
        );
      }
    });
  } catch (e) {
    logger.warn(`Could not start the icon extractor: ${(e as Error).message}`);
  }
}
