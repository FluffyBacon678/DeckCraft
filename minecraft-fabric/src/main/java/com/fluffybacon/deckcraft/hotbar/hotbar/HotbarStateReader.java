package com.fluffybacon.deckcraft.hotbar.hotbar;

import com.fluffybacon.deckcraft.hotbar.util.DeckCraftLogger;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.screen.Screen;
import net.minecraft.client.network.ClientPlayerEntity;
import net.minecraft.entity.player.PlayerInventory;
import net.minecraft.item.ItemStack;
import net.minecraft.registry.Registries;
import net.minecraft.util.Identifier;

import java.util.ArrayList;
import java.util.List;

/**
 * Reads the local player's hotbar into a {@link HotbarState}. Must be called on the
 * Minecraft client thread (from a client tick). Never touches the network thread.
 *
 * Several calls here are 1.21.x-mapping-sensitive — each is flagged VERSION-SENSITIVE with the
 * fallback to try if it doesn't compile against your exact Yarn build for 1.21.11.
 */
public final class HotbarStateReader {

    /** Hotbar occupies main-inventory indices 0..8. */
    public static final int HOTBAR_SIZE = 9;
    /** PlayerInventory.MAIN_SIZE — hotbar (0-8) + 27 storage slots (9-35). */
    public static final int MAIN_SIZE = 36;
    /**
     * Armor occupies 36..39, in the order feet, legs, chest, head.
     *
     * <p>VERIFIED against the Yarn 1.21.11+build.6 Minecraft jar: PlayerInventory's static
     * initialiser builds {@code EQUIPMENT_SLOTS} as {@code 36 + slot.getEntitySlotId()} and
     * registers FEET, LEGS, CHEST, HEAD in that order, then OFFHAND at the literal 40. So
     * 36=boots, 37=leggings, 38=chestplate, 39=helmet. This is not an assumption.</p>
     */
    public static final int ARMOR_START = 36;
    /** PlayerInventory.OFF_HAND_SLOT == 40. */
    public static final int OFFHAND_SLOT = 40;
    /**
     * We read slots 0..40 (36 main + 4 armor + offhand).
     *
     * <p>1.21.11's PlayerInventory also defines {@code BODY_SLOT = 41} and
     * {@code SADDLE_SLOT = 42} — these exist because equipment handling is shared with mobs
     * (wolf/horse body armor, saddles). They are not part of a player's inventory screen and are
     * deliberately not mirrored.</p>
     */
    public static final int TOTAL_SLOTS = 41;

    private HotbarStateReader() {
    }

    public static boolean isInWorld(MinecraftClient client) {
        return client != null && client.player != null && client.world != null;
    }

    public static HotbarState readHotbar(MinecraftClient client) {
        return readHotbar(client, false);
    }

    /**
     * @param includeFullInventory when true, also reads slots 9..40 (storage, armor, offhand)
     *                             into {@link HotbarState#extendedSlots}.
     */
    public static HotbarState readHotbar(MinecraftClient client, boolean includeFullInventory) {
        ClientPlayerEntity player = client.player;
        PlayerInventory inventory = player.getInventory();

        // ===== VERIFIED (Yarn 1.21.11+build.6): selected hotbar slot =====
        // PlayerInventory#getSelectedSlot() -> public int. The `selectedSlot` field is PRIVATE
        // in 1.21.11, so the getter is the only way to read it (do NOT try the bare field).
        int selectedSlot = inventory.getSelectedSlot();
        // ================================================================

        List<HotbarSlotState> slots = new ArrayList<>(HOTBAR_SIZE);
        for (int i = 0; i < HOTBAR_SIZE; i++) {
            // Hotbar = main inventory indices 0..8. getStack(int) is from the Inventory interface.
            slots.add(readSlot(i, inventory.getStack(i)));
        }

        List<HotbarSlotState> extended = null;
        if (includeFullInventory) {
            // Slots 9..40: 27 storage, then armor (36-39), then offhand (40).
            // getStack(int) covers the whole 0..40 index space even though 1.21.11 stores armor
            // and offhand in EntityEquipment rather than in the `main` list.
            extended = new ArrayList<>(TOTAL_SLOTS - HOTBAR_SIZE);
            for (int i = HOTBAR_SIZE; i < TOTAL_SLOTS; i++) {
                extended.add(readSlot(i, inventory.getStack(i)));
            }
        }

        Screen screen = client.currentScreen;
        HotbarState state = new HotbarState();
        state.inWorld = true;
        state.screenOpen = screen != null;
        state.screenType = screen != null ? screen.getClass().getSimpleName() : null;
        state.playerName = player.getName().getString();
        state.selectedSlot = selectedSlot;
        state.slots = slots;
        state.extendedSlots = extended;
        return state;
    }

    private static HotbarSlotState readSlot(int index, ItemStack stack) {
        HotbarSlotState s = new HotbarSlotState();
        s.slot = index;

        if (stack == null || stack.isEmpty()) {
            s.empty = true;
            s.itemId = null;
            s.displayName = "";
            s.durabilityPercent = null;
            return s;
        }

        s.empty = false;

        // ===== VERIFIED (Yarn 1.21.11+build.6): item id lookup =====
        // Registries.ITEM is DefaultedRegistry<Item>; Registry#getId(T) is @Nullable Identifier.
        Identifier id = Registries.ITEM.getId(stack.getItem());
        s.itemId = id != null ? id.toString() : "minecraft:unknown";
        // ===========================================================

        s.displayName = stack.getName().getString();
        s.count = stack.getCount();
        s.maxCount = stack.getMaxCount();

        // ===== VERIFIED (Yarn 1.21.11+build.6): durability =====
        // isDamageable()/getDamage()/getMaxDamage() all exist as public int/boolean convenience
        // methods (they wrap DataComponentTypes.DAMAGE / MAX_DAMAGE under the hood).
        boolean damageable = stack.isDamageable();
        s.damageable = damageable;
        if (damageable) {
            int damage = stack.getDamage();
            int maxDamage = stack.getMaxDamage();
            s.damage = damage;
            s.maxDamage = maxDamage;
            int remaining = Math.max(0, maxDamage - damage);
            s.durabilityRemaining = remaining;
            s.durabilityPercent = maxDamage > 0 ? Math.round((remaining / (float) maxDamage) * 100f) : null;
        } else {
            s.durabilityPercent = null;
        }
        // ==================================================

        // ===== VERIFIED (Yarn 1.21.11+build.6): enchantment presence (optional field) =====
        // getEnchantments() -> ItemEnchantmentsComponent, which has public boolean isEmpty().
        // try/catch is kept only as belt-and-suspenders; hasEnchantments is non-critical.
        try {
            s.hasEnchantments = !stack.getEnchantments().isEmpty();
        } catch (Throwable t) {
            s.hasEnchantments = false;
        }
        // ==================================================================================

        return s;
    }

    /** Convenience for logging the current lifecycle phase. */
    public static String describeLifecycle(MinecraftClient client) {
        if (client == null) {
            return "disconnected";
        }
        if (client.world == null || client.player == null) {
            return "main_menu";
        }
        return "in_world";
    }

    static {
        // Touch the logger class so a misconfigured logger fails fast at load, not mid-tick.
        DeckCraftLogger.isDebug();
    }
}
