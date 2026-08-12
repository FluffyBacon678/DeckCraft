import streamDeck, { LogLevel } from "@elgato/streamdeck";
import { ConnectionManager } from "./connection/connection-manager";
import { HotbarStateStore } from "./state/hotbar-state-store";
import { HotbarSlotAction } from "./actions/hotbar-slot";
import { clearIconCache } from "./render/icon-resolver";
import { ensureIconsExtracted } from "./icons/auto-extract";
import { DEFAULT_HOST, DEFAULT_PORT } from "./types/protocol";
import { logger } from "./util/logger";
import type { HotbarStateMessage, LifecycleStateMessage } from "./types/protocol";

const PLUGIN_VERSION = "0.1.0";

// INFO for releases. Set DECKCRAFT_DEBUG=1 in the environment for verbose logs when
// diagnosing a problem, so debugging never requires editing and rebuilding the plugin.
streamDeck.logger.setLevel(process.env.DECKCRAFT_DEBUG ? LogLevel.DEBUG : LogLevel.INFO);

const store = new HotbarStateStore();
const connection = new ConnectionManager(DEFAULT_HOST, DEFAULT_PORT, PLUGIN_VERSION);

// Wire the bridge into the shared store.
connection.on("status", (status) => {
  if (status === "listening" || status === "error") {
    store.setDisconnected();
  }
});
connection.on("minecraft_connected", () => store.setLifecycle(false)); // connected, world unknown yet
connection.on("minecraft_disconnected", () => store.setDisconnected());
connection.on("hotbar_state", (m: HotbarStateMessage) => store.setHotbarState(m));
connection.on("lifecycle_state", (m: LifecycleStateMessage) => store.setLifecycle(!!m.inWorld));

// Register the reusable action (the user drops it on 9 keys).
streamDeck.actions.registerAction(new HotbarSlotAction(store, connection));

// Connect to the Stream Deck app, then start our local bridge for Minecraft.
streamDeck.connect().then(() => {
  logger.info("DeckCraft Hotbar plugin connected to Stream Deck.");

  // First launch generates icons from the user's own Minecraft install, in the background.
  // Keys render item names until it finishes, then repaint with real art.
  ensureIconsExtracted(() => {
    clearIconCache();
    store.emit("change");
  });

  connection.start();
});
