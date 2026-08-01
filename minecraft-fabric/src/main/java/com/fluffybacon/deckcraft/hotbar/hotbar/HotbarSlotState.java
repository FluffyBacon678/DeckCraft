package com.fluffybacon.deckcraft.hotbar.hotbar;

import java.util.Objects;

/**
 * Immutable-ish snapshot of one hotbar slot. Plain fields keep JSON building trivial.
 * {@code equals}/{@code hashCode} cover all fields so change detection is exact.
 */
public final class HotbarSlotState {

    public int slot;
    public boolean empty;
    public String itemId;          // e.g. "minecraft:diamond_sword", or null when empty
    public String displayName = "";
    public int count;
    public int maxCount;
    public boolean damageable;
    public int damage;
    public int maxDamage;
    public int durabilityRemaining;
    public Integer durabilityPercent; // null when not damageable
    public boolean hasEnchantments;

    @Override
    public boolean equals(Object o) {
        if (this == o) {
            return true;
        }
        if (!(o instanceof HotbarSlotState other)) {
            return false;
        }
        return slot == other.slot
                && empty == other.empty
                && count == other.count
                && maxCount == other.maxCount
                && damageable == other.damageable
                && damage == other.damage
                && maxDamage == other.maxDamage
                && durabilityRemaining == other.durabilityRemaining
                && hasEnchantments == other.hasEnchantments
                && Objects.equals(itemId, other.itemId)
                && Objects.equals(displayName, other.displayName)
                && Objects.equals(durabilityPercent, other.durabilityPercent);
    }

    @Override
    public int hashCode() {
        return Objects.hash(slot, empty, itemId, displayName, count, maxCount,
                damageable, damage, maxDamage, durabilityRemaining, durabilityPercent, hasEnchantments);
    }
}
