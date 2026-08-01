package com.fluffybacon.deckcraft.hotbar.command;

import com.fluffybacon.deckcraft.hotbar.net.ProtocolJson;
import com.fluffybacon.deckcraft.hotbar.util.DeckCraftLogger;
import com.google.gson.JsonObject;
import net.minecraft.client.MinecraftClient;

import java.util.function.Consumer;

/**
 * Handles messages coming FROM the Stream Deck. Entry point {@link #handle(JsonObject)} runs on
 * the network thread; anything that touches Minecraft state is scheduled onto the client thread
 * via {@code client.execute(...)}.
 *
 * The only state-changing command is {@code select_slot}, which does exactly what pressing 1-9
 * in-game does: set the selected hotbar slot. It is rejected unless the player is in a world and
 * no screen (chat/inventory/menu) is open.
 */
public final class StreamDeckCommandHandler {

    private final Consumer<String> sendJson;
    private final Runnable requestFullState;
    private final java.util.function.Consumer<Boolean> setFullInventory;

    public StreamDeckCommandHandler(Consumer<String> sendJson, Runnable requestFullState,
                                    java.util.function.Consumer<Boolean> setFullInventory) {
        this.sendJson = sendJson;
        this.requestFullState = requestFullState;
        this.setFullInventory = setFullInventory;
    }

    /** Called on the network thread. */
    public void handle(JsonObject msg) {
        String type = ProtocolJson.getString(msg, "type", null);
        if (type == null) {
            return;
        }
        switch (type) {
            case "select_slot" -> handleSelectSlot(msg);
            case "request_full_state" -> {
                DeckCraftLogger.debug("Received request_full_state.");
                requestFullState.run();
            }
            case "set_options" -> handleSetOptions(msg);
            case "hello_from_streamdeck" -> DeckCraftLogger.info("Stream Deck plugin handshake received.");
            default -> DeckCraftLogger.debug("Ignoring unknown message type: " + type);
        }
    }

    /**
     * {@code set_options} lets the Stream Deck say what data it actually needs. Today the only
     * option is {@code sendFullInventory}; unknown options are ignored. Safe on the network
     * thread — it only flips a flag, it never touches Minecraft state.
     */
    private void handleSetOptions(JsonObject msg) {
        if (!msg.has("sendFullInventory") || msg.get("sendFullInventory").isJsonNull()) {
            DeckCraftLogger.debug("set_options had no recognised options; ignoring.");
            return;
        }
        boolean enabled;
        try {
            enabled = msg.get("sendFullInventory").getAsBoolean();
        } catch (RuntimeException e) {
            DeckCraftLogger.warn("Rejected set_options: sendFullInventory was not a boolean.");
            reply("set_options", false, null, "invalid_option");
            return;
        }
        DeckCraftLogger.info("Stream Deck requested full inventory: " + enabled);
        setFullInventory.accept(enabled);
        reply("set_options", true, null, "sendFullInventory=" + enabled);
    }

    private void handleSelectSlot(JsonObject msg) {
        Integer slot = ProtocolJson.getInt(msg, "slot");
        if (slot == null || slot < 0 || slot > 8) {
            DeckCraftLogger.warn("Rejected select_slot: invalid slot " + slot);
            reply("select_slot", false, slot, "invalid_slot");
            return;
        }
        DeckCraftLogger.info("Received select_slot -> " + slot);

        MinecraftClient client = MinecraftClient.getInstance();
        if (client == null) {
            reply("select_slot", false, slot, "client_unavailable");
            return;
        }

        // Hop to the Minecraft client thread for all game-state access.
        client.execute(() -> applySelectSlot(client, slot));
    }

    /** Runs on the Minecraft client thread. */
    private void applySelectSlot(MinecraftClient client, int slot) {
        if (client.player == null || client.world == null) {
            DeckCraftLogger.debug("Rejected select_slot: not in world.");
            reply("select_slot", false, slot, "not_in_world");
            return;
        }
        if (client.currentScreen != null) {
            // Safety rule: don't change slots while chat/inventory/menu is open.
            String screen = client.currentScreen.getClass().getSimpleName();
            DeckCraftLogger.debug("Rejected select_slot: screen open (" + screen + ").");
            reply("select_slot", false, slot, "screen_open");
            return;
        }

        try {
            // ===== VERIFIED (Yarn 1.21.11+build.6): set selected hotbar slot =====
            // PlayerInventory#setSelectedSlot(int) -> public void. This is exactly what vanilla
            // does when you press 1-9. The client auto-syncs the change to the server every tick
            // (ClientPlayerEntity sends UpdateSelectedSlotC2SPacket), so no manual packet is needed.
            // NOTE: the `selectedSlot` field is PRIVATE in 1.21.11 — the setter is the only option.
            client.player.getInventory().setSelectedSlot(slot);
            // If you ever find the server doesn't update the held item, uncomment the manual sync:
            //   if (client.getNetworkHandler() != null) {
            //       client.getNetworkHandler().sendPacket(
            //           new net.minecraft.network.packet.c2s.play.UpdateSelectedSlotC2SPacket(slot));
            //   }
            // ===============================================================

            DeckCraftLogger.debug("Selected slot " + slot + ".");
            reply("select_slot", true, slot, "Selected slot " + slot);
        } catch (Throwable t) {
            DeckCraftLogger.warn("Failed to set selected slot.", t);
            reply("select_slot", false, slot, "error: " + t.getMessage());
        }
    }

    private void reply(String command, boolean success, Integer slot, String message) {
        sendJson.accept(ProtocolJson.buildCommandResult(command, success, slot, message));
    }
}
