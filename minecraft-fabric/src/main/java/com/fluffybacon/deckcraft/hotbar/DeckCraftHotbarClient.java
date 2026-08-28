package com.fluffybacon.deckcraft.hotbar;

import com.fluffybacon.deckcraft.hotbar.command.StreamDeckCommandHandler;
import com.fluffybacon.deckcraft.hotbar.config.DeckCraftConfig;
import com.fluffybacon.deckcraft.hotbar.hotbar.HotbarStateTracker;
import com.fluffybacon.deckcraft.hotbar.net.DeckCraftConnectionClient;
import com.fluffybacon.deckcraft.hotbar.net.ProtocolJson;
import com.fluffybacon.deckcraft.hotbar.setup.StreamDeckPluginInstaller;
import com.fluffybacon.deckcraft.hotbar.util.DeckCraftLogger;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientLifecycleEvents;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;

/**
 * Client entry point. Wires the connection client, hotbar tracker, and command handler together,
 * then drives everything from the client tick event.
 *
 * The mod is client-only (see fabric.mod.json "environment": "client") and is never required on
 * the server — it only reads the local hotbar and changes the locally selected slot.
 */
public final class DeckCraftHotbarClient implements ClientModInitializer {

    public static final String MOD_ID = "deckcraft_hotbar";
    public static final String MOD_VERSION = "0.1.0";
    // Reported in protocol messages. Kept as a constant so it is correct even if read off-thread.
    public static final String MINECRAFT_VERSION = "1.21.11";

    private DeckCraftConnectionClient connection;
    private HotbarStateTracker tracker;
    private StreamDeckCommandHandler commandHandler;

    @Override
    public void onInitializeClient() {
        DeckCraftConfig config = DeckCraftConfig.load();
        DeckCraftLogger.setDebug(config.debug);
        DeckCraftLogger.info("DeckCraft Hotbar " + MOD_VERSION + " initializing (client-side)...");

        // Hand the player the Stream Deck plugin installer that ships inside this jar, so the
        // Modrinth download is all they need. Never writes into the Stream Deck app itself.
        StreamDeckPluginInstaller.extractIfNeeded();

        connection = new DeckCraftConnectionClient(config.host, config.port);
        tracker = new HotbarStateTracker(connection::send, MOD_VERSION, MINECRAFT_VERSION);
        commandHandler = new StreamDeckCommandHandler(
                connection::send, tracker::forceFullResend, tracker::setSendFullInventory);
        if (config.forceFullInventory) {
            // Debug escape hatch: send all 41 slots without waiting for the Stream Deck to ask.
            tracker.setSendFullInventory(true);
            DeckCraftLogger.info("forceFullInventory=true — sending all 41 inventory slots.");
        }

        connection.setMessageHandler(commandHandler::handle);
        connection.setOnConnected(() -> {
            // Runs on the network thread: send hello (no Minecraft state access here), then ask
            // the tracker to push a full snapshot on the next client tick.
            connection.send(ProtocolJson.buildHello(MOD_VERSION, MINECRAFT_VERSION, "Player"));
            tracker.forceFullResend();
            DeckCraftLogger.debug("Sent hello_from_minecraft.");
        });
        connection.start();

        ClientTickEvents.END_CLIENT_TICK.register(client -> {
            try {
                tracker.tick(client);
                StreamDeckPluginInstaller.maybeNotifyInGame(client, connection.isConnected());
            } catch (Throwable t) {
                // Never let our mod crash the game loop.
                DeckCraftLogger.warn("Error in hotbar tick (continuing).", t);
            }
        });

        ClientLifecycleEvents.CLIENT_STOPPING.register(client -> {
            DeckCraftLogger.info("Closing DeckCraft Hotbar connection.");
            if (connection != null) {
                connection.stop();
            }
        });

        DeckCraftLogger.info("DeckCraft Hotbar initialized. Bridge target: ws://"
                + config.host + ":" + config.port + (config.debug ? " (debug on)" : ""));
    }
}
