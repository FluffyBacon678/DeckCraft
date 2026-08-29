/**
 * DeckCraft Hotbar local protocol (v1). Slots are zero-based 0..8 on the wire;
 * the UI shows 1..9. See docs/protocol.md for the full spec.
 */
export const PROTOCOL_VERSION = 1;
export const DEFAULT_PORT = 38191;
export const DEFAULT_HOST = "127.0.0.1";

/** Slot index layout of the Minecraft player inventory (0..40). */
export const HOTBAR_SIZE = 9;
export const MAIN_SIZE = 36; // hotbar (0-8) + 27 storage (9-35)
export const ARMOR_START = 36; // 36-39: feet, legs, chest, head
export const OFFHAND_SLOT = 40;
export const TOTAL_SLOTS = 41;

/** True for slots the player can actually "select" — only the hotbar. */
export function isHotbarSlot(index: number): boolean {
  return index >= 0 && index < HOTBAR_SIZE;
}

/** Short tag shown in the corner of a key, e.g. "3", "S12", "Bt", "OH". */
export function slotShortLabel(index: number): string {
  if (index < HOTBAR_SIZE) return String(index + 1);
  if (index < MAIN_SIZE) return `S${index - HOTBAR_SIZE + 1}`;
  switch (index) {
    case 36: return "Bt";
    case 37: return "Lg";
    case 38: return "Ch";
    case 39: return "He";
    case OFFHAND_SLOT: return "OH";
    default: return "?";
  }
}

export interface HotbarSlotState {
  slot: number;
  empty: boolean;
  itemId: string | null;
  displayName: string;
  count: number;
  maxCount: number;
  damageable: boolean;
  damage: number;
  maxDamage: number;
  durabilityRemaining: number;
  durabilityPercent: number | null;
  hasEnchantments: boolean;
}

export interface HotbarStateMessage {
  type: "hotbar_state";
  protocolVersion: number;
  sequence: number;
  timestampMillis: number;
  minecraftVersion: string;
  modVersion: string;
  inWorld: boolean;
  screenOpen: boolean;
  screenType: string | null;
  playerName: string;
  selectedSlot: number;
  /** Always exactly 9 entries (slots 0-8). */
  slots: HotbarSlotState[];
  /** Slots 9-40 (storage, armor, offhand). Present only when full inventory was requested. */
  extendedSlots?: HotbarSlotState[];
}

export interface LifecycleStateMessage {
  type: "lifecycle_state";
  protocolVersion: number;
  state: string;
  inWorld: boolean;
  message?: string;
}

export interface HelloFromMinecraft {
  type: "hello_from_minecraft";
  protocolVersion: number;
  modVersion: string;
  minecraftVersion: string;
  playerName: string;
  supports: Record<string, boolean>;
}

export interface CommandResult {
  type: "command_result";
  protocolVersion: number;
  command: string;
  success: boolean;
  slot?: number | null;
  message?: string;
}

export interface HelloFromStreamDeck {
  type: "hello_from_streamdeck";
  protocolVersion: number;
  pluginVersion: string;
  supports: { selectSlot: boolean };
}

export interface SelectSlotCommand {
  type: "select_slot";
  protocolVersion: number;
  slot: number;
  source: string;
}

/** Mirrors a single vanilla input. Never moves items on the player's behalf. */
export interface PlayerActionCommand {
  type: 'player_action';
  protocolVersion: number;
  /** swap_offhand = the vanilla F key; open_inventory = the vanilla E key. */
  action: 'swap_offhand' | 'open_inventory';
  source: string;
}

export interface RequestFullState {
  type: "request_full_state";
  protocolVersion: number;
}

/** Tells Minecraft what data this plugin needs, so it can skip work it doesn't have to do. */
export interface SetOptions {
  type: "set_options";
  protocolVersion: number;
  sendFullInventory: boolean;
}

export type IncomingMessage =
  | HotbarStateMessage
  | LifecycleStateMessage
  | HelloFromMinecraft
  | CommandResult;

export type OutgoingMessage =
  | HelloFromStreamDeck
  | SelectSlotCommand
  | PlayerActionCommand
  | RequestFullState
  | SetOptions;
