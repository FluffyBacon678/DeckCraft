import { EventEmitter } from "node:events";
import { isHotbarSlot, type HotbarSlotState, type HotbarStateMessage } from "../types/protocol";

/** What the keys should reflect at a glance. */
export type LinkStatus = "disconnected" | "connected_no_world" | "in_world";

/**
 * Single source of truth for the latest hotbar snapshot + link status.
 * Emits "change" whenever anything a key might render has changed.
 */
export class HotbarStateStore extends EventEmitter {
  private state?: HotbarStateMessage;
  private link: LinkStatus = "disconnected";

  setDisconnected(): void {
    if (this.link === "disconnected" && !this.state) {
      return;
    }
    this.link = "disconnected";
    this.state = undefined;
    this.emit("change");
  }

  /** Minecraft is connected but we only know lifecycle (e.g. at the main menu). */
  setLifecycle(inWorld: boolean): void {
    this.link = inWorld ? "in_world" : "connected_no_world";
    if (!inWorld) {
      this.state = undefined;
    }
    this.emit("change");
  }

  setHotbarState(state: HotbarStateMessage): void {
    this.state = state;
    this.link = state.inWorld ? "in_world" : "connected_no_world";
    this.emit("change");
  }

  getStatus(): LinkStatus {
    return this.link;
  }

  getState(): HotbarStateMessage | undefined {
    return this.state;
  }

  getSelectedSlot(): number {
    return this.state?.selectedSlot ?? -1;
  }

  /** Looks up any slot 0..40 across the hotbar array and the optional extended array. */
  getSlot(index: number): HotbarSlotState | undefined {
    const state = this.state;
    if (!state) {
      return undefined;
    }
    if (isHotbarSlot(index)) {
      return state.slots?.find((s) => s.slot === index);
    }
    return state.extendedSlots?.find((s) => s.slot === index);
  }

  /** Only the hotbar has a "selected" concept — storage/armor/offhand never highlight. */
  isSelected(index: number): boolean {
    if (!isHotbarSlot(index)) {
      return false;
    }
    return !!this.state?.inWorld && this.state.selectedSlot === index;
  }

  /** True when the mod is currently sending slots 9-40. */
  hasExtendedSlots(): boolean {
    return !!this.state?.extendedSlots?.length;
  }

  isScreenOpen(): boolean {
    return this.state?.screenOpen ?? false;
  }
}
