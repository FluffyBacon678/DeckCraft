import {
  action,
  SingletonAction,
  type DidReceiveSettingsEvent,
  type KeyDownEvent,
  type WillAppearEvent,
  type WillDisappearEvent,
} from "@elgato/streamdeck";
import type { ConnectionManager } from "../connection/connection-manager";
import type { HotbarStateStore } from "../state/hotbar-state-store";
import { renderSvgDataUri, renderTitle, type RenderInput } from "../render/key-renderer";
import { resolveIcon } from "../render/icon-resolver";
import { isHotbarSlot, OFFHAND_SLOT, TOTAL_SLOTS } from "../types/protocol";
import { logger } from "../util/logger";

type SlotSettings = {
  /** Preferred: raw inventory index 0..40. */
  slotIndex?: number | string;
  /** Legacy (pre-full-inventory): hotbar position 1..9. Still honoured. */
  slotNumber?: number | string;
  /** "icon" = real item art (falls back to the name), "image" = name tile, "title" = plain text. */
  display?: "icon" | "title" | "image";
};

type DisplayMode = "icon" | "title" | "image";

interface VisibleKey {
  action: WillAppearEvent<SlotSettings>["action"];
  slotIndex: number; // 0..40
  display: DisplayMode;
  lastRendered: string; // dedupe so we don't spam setTitle/setImage
}

/**
 * One reusable action covering every inventory slot. The user picks a slot (hotbar 1-9,
 * storage rows, armor, or off-hand) per key.
 *
 * Every key mirrors a single vanilla input and nothing more:
 *   hotbar  -> select that slot (the 1-9 keys)
 *   offhand -> swap off-hand (the F key)
 *   armor / storage -> open the inventory (the E key), where the player moves their own items
 *
 * The mod never moves an item on the player's behalf, so nothing here does something the
 * player could not already do with one keypress.
 */
@action({ UUID: "com.fluffybacon.deckcraft-hotbar.slot" })
export class HotbarSlotAction extends SingletonAction<SlotSettings> {
  private readonly visible = new Map<string, VisibleKey>();

  constructor(
    private readonly store: HotbarStateStore,
    private readonly connection: ConnectionManager,
  ) {
    super();
    this.store.on("change", () => this.renderAll());
  }

  override async onWillAppear(ev: WillAppearEvent<SlotSettings>): Promise<void> {
    if (!ev.action.isKey()) {
      return; // dials/touchscreens not supported yet
    }
    this.visible.set(ev.action.id, {
      action: ev.action,
      slotIndex: toSlotIndex(ev.payload.settings),
      display: ev.payload.settings?.display ?? "icon",
      lastRendered: "",
    });
    this.syncDataNeeds();
    await this.render(ev.action.id);
  }

  override onWillDisappear(ev: WillDisappearEvent<SlotSettings>): void {
    this.visible.delete(ev.action.id);
    this.syncDataNeeds();
  }

  override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<SlotSettings>): Promise<void> {
    const entry = this.visible.get(ev.action.id);
    if (!entry) {
      return;
    }
    entry.slotIndex = toSlotIndex(ev.payload.settings);
    entry.display = ev.payload.settings?.display ?? "icon";
    entry.lastRendered = ""; // force a redraw
    this.syncDataNeeds();
    await this.render(ev.action.id);
  }

  override async onKeyDown(ev: KeyDownEvent<SlotSettings>): Promise<void> {
    const slotIndex = toSlotIndex(ev.payload.settings);

    if (!isHotbarSlot(slotIndex)) {
      // Storage/armor/off-hand have no "selected slot" concept. Rather than doing nothing, map
      // them to the vanilla input a player would reach for next — never to moving items for them.
      if (!this.connection.isConnected() || this.store.getStatus() !== "in_world") {
        await ev.action.showAlert();
        return;
      }
      // Off-hand -> the vanilla F key. Armor and storage -> open the inventory (vanilla E),
      // where the player moves their own items.
      const playerAction = slotIndex === OFFHAND_SLOT ? "swap_offhand" : "open_inventory";
      const sent = this.connection.playerAction(playerAction);
      logger.debug("Key for slot " + slotIndex + " -> " + playerAction + " (ok=" + sent + ").");
      if (!sent) {
        await ev.action.showAlert();
      }
      return;
    }
    if (!this.connection.isConnected()) {
      logger.debug(`Key ${slotIndex + 1} pressed but Minecraft is not connected.`);
      await ev.action.showAlert();
      return;
    }
    if (this.store.getStatus() !== "in_world") {
      logger.debug(`Key ${slotIndex + 1} pressed but player is not in a world.`);
      await ev.action.showAlert();
      return;
    }
    const ok = this.connection.selectSlot(slotIndex);
    logger.debug(`Sent select_slot ${slotIndex} (ok=${ok}).`);
    if (!ok) {
      await ev.action.showAlert();
    }
  }

  /** Ask Minecraft for slots 9-40 only while at least one non-hotbar key is on the deck. */
  private syncDataNeeds(): void {
    const needed = [...this.visible.values()].some((v) => !isHotbarSlot(v.slotIndex));
    this.connection.setNeedsFullInventory(needed);
  }

  private renderAll(): void {
    for (const id of this.visible.keys()) {
      void this.render(id);
    }
  }

  private async render(id: string): Promise<void> {
    const entry = this.visible.get(id);
    if (!entry) {
      return;
    }
    const slot = this.store.getSlot(entry.slotIndex);
    const input: RenderInput = {
      link: this.store.getStatus(),
      slotIndex: entry.slotIndex,
      slot,
      selected: this.store.isSelected(entry.slotIndex),
      // Only look up art in icon mode; resolveIcon returns undefined for anything without a
      // flat texture, and the renderer then falls back to the item's name.
      iconDataUri: entry.display === "icon" ? resolveIcon(slot?.itemId) : undefined,
      // A non-hotbar key with no data yet means the mod hasn't started sending slots 9-40.
      awaitingData:
        !isHotbarSlot(entry.slotIndex) &&
        this.store.getStatus() === "in_world" &&
        !this.store.hasExtendedSlots(),
    };

    try {
      if (entry.display === "image" || entry.display === "icon") {
        const uri = renderSvgDataUri(input);
        if (uri === entry.lastRendered) {
          return;
        }
        entry.lastRendered = uri;
        await entry.action.setTitle("");
        await entry.action.setImage(uri);
      } else {
        const title = renderTitle(input);
        if (title === entry.lastRendered) {
          return;
        }
        entry.lastRendered = title;
        await entry.action.setImage(undefined); // fall back to the manifest key image
        await entry.action.setTitle(title);
      }
    } catch (e) {
      logger.debug(`render failed for ${id}: ${(e as Error)?.message}`);
    }
  }
}

/**
 * Resolves a key's configured slot to an index 0..40.
 * Prefers `slotIndex`; falls back to the legacy 1-9 `slotNumber` so keys configured before
 * full-inventory support keep working untouched.
 */
function toSlotIndex(settings?: SlotSettings): number {
  const raw = settings?.slotIndex;
  if (raw !== undefined && raw !== null && raw !== "") {
    const n = typeof raw === "string" ? parseInt(raw, 10) : raw;
    if (Number.isFinite(n)) {
      return Math.min(TOTAL_SLOTS - 1, Math.max(0, Math.round(n as number)));
    }
  }
  const legacy = settings?.slotNumber;
  const n = typeof legacy === "string" ? parseInt(legacy, 10) : legacy;
  const safe = typeof n === "number" && Number.isFinite(n) ? Math.round(n) : 1;
  return Math.min(9, Math.max(1, safe)) - 1;
}
