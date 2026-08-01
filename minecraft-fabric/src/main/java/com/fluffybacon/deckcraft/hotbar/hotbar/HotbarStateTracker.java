package com.fluffybacon.deckcraft.hotbar.hotbar;

import com.fluffybacon.deckcraft.hotbar.net.ProtocolJson;
import com.fluffybacon.deckcraft.hotbar.util.DeckCraftLogger;
import net.minecraft.client.MinecraftClient;

import java.util.function.Consumer;

/**
 * Decides WHAT to send and WHEN. Called every client tick on the Minecraft thread.
 *
 *  - In world: builds the hotbar snapshot, compares to the last one, and sends only on change.
 *  - Not in world: sends a single lifecycle_state on transition (main menu, etc.).
 *  - On (re)connect: {@link #forceFullResend()} makes the next tick push a full snapshot.
 *
 * A small minimum interval coalesces bursts so we never spam the socket.
 */
public final class HotbarStateTracker {

    private static final long MIN_INTERVAL_MS = 50; // at most ~20 sends/sec

    private final Consumer<String> send;
    private final String modVersion;
    private final String mcVersion;

    private HotbarState lastSent;
    private long sequence = 0;
    private long lastSendMillis = 0;
    private boolean lastInWorld = false;
    private String lastLifecycle = null;
    private volatile boolean forceFull = false;
    private volatile boolean sendFullInventory = false;

    public HotbarStateTracker(Consumer<String> send, String modVersion, String mcVersion) {
        this.send = send;
        this.modVersion = modVersion;
        this.mcVersion = mcVersion;
    }

    /** Request a full resend on the next tick (used right after connecting). Thread-safe. */
    public void forceFullResend() {
        forceFull = true;
    }

    /**
     * Turn the full inventory (slots 9-40) on or off. Driven by the Stream Deck's
     * {@code set_options} message, so we only pay for 41 slots when a key needs them.
     * Thread-safe: called from the network thread.
     */
    public void setSendFullInventory(boolean enabled) {
        if (this.sendFullInventory != enabled) {
            this.sendFullInventory = enabled;
            this.forceFull = true; // shape changed — push a fresh snapshot immediately
        }
    }

    public boolean isSendingFullInventory() {
        return sendFullInventory;
    }

    public void tick(MinecraftClient client) {
        long now = System.currentTimeMillis();
        boolean inWorld = HotbarStateReader.isInWorld(client);

        if (!inWorld) {
            boolean transition = lastInWorld || forceFull || !"main_menu".equals(lastLifecycle);
            if (transition) {
                String stateName = (client == null) ? "disconnected" : "main_menu";
                send.accept(ProtocolJson.buildLifecycle(stateName, false, "No world loaded"));
                lastLifecycle = "main_menu";
                lastInWorld = false;
                lastSent = null;
                forceFull = false;
            }
            return;
        }

        HotbarState state = HotbarStateReader.readHotbar(client, sendFullInventory);
        boolean changed = forceFull || lastSent == null || !lastInWorld || !state.sameContentAs(lastSent);
        if (!changed) {
            return;
        }
        if (!forceFull && (now - lastSendMillis) < MIN_INTERVAL_MS) {
            // Throttle: skip this tick. State still differs, so we'll send on a later tick.
            return;
        }

        sequence++;
        send.accept(ProtocolJson.buildHotbarState(state, sequence, modVersion, mcVersion, now));
        if (lastSent == null) {
            DeckCraftLogger.debug("Sent first/full hotbar snapshot (seq " + sequence + ").");
        }
        lastSent = state;
        lastSendMillis = now;
        lastInWorld = true;
        lastLifecycle = "in_world";
        forceFull = false;
    }
}
