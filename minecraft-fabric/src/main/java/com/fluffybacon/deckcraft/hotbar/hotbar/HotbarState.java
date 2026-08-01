package com.fluffybacon.deckcraft.hotbar.hotbar;

import java.util.List;
import java.util.Objects;

/**
 * Snapshot of the player's inventory at one moment. {@code sequence} and {@code timestampMillis}
 * are assigned at send time and are deliberately NOT part of {@link #sameContentAs}, so we
 * only push to the Stream Deck when something the user can see actually changed.
 *
 * <p>{@link #slots} is always the 9 hotbar slots (0-8). {@link #extendedSlots} holds slots 9-40
 * (27 storage + 4 armor + offhand) and is {@code null} unless the Stream Deck asked for the full
 * inventory via {@code set_options}. Keeping them separate preserves the v1 protocol contract
 * that {@code slots} has exactly 9 entries.</p>
 */
public final class HotbarState {

    public boolean inWorld;
    public boolean screenOpen;
    public String screenType;        // simple class name of the open screen, or null
    public String playerName = "Player";
    public int selectedSlot;
    public List<HotbarSlotState> slots;

    /** Slots 9..40, or null when only the hotbar was requested. */
    public List<HotbarSlotState> extendedSlots;

    /** True when the visible content is identical (ignores sequence/timestamp). */
    public boolean sameContentAs(HotbarState other) {
        if (other == null) {
            return false;
        }
        return inWorld == other.inWorld
                && screenOpen == other.screenOpen
                && selectedSlot == other.selectedSlot
                && Objects.equals(screenType, other.screenType)
                && Objects.equals(playerName, other.playerName)
                && Objects.equals(slots, other.slots)
                && Objects.equals(extendedSlots, other.extendedSlots);
    }
}
